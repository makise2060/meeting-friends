'use strict';

// 桌宠碰撞与惯性：统一在 1920×1080 的虚拟空间里计算，坐标为归一化 0–1。
// 房主端负责物理模拟，渲染层用同一套函数做拖拽预测。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Physics = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const VW = 1920;
  const VH = 1080;

  // 宠物盒子 96×96，可见身体略小，碰撞半径按观感取 36。
  const RADIUS = 36;
  const HALF = 48;
  const TOP_PAD = 64;
  const NAME_SPACE = 26;

  const MIN_X = HALF / VW;
  const MAX_X = 1 - HALF / VW;
  const MIN_Y = (TOP_PAD + HALF) / VH;
  const MAX_Y = 1 - (NAME_SPACE + HALF) / VH;

  const MIN_SPEED = 6;
  const MAX_SPEED = 2800;
  const HALF_LIFE = 1.3;
  const RESTITUTION = 0.6;
  const PUSH_MIN = 680;
  const PUSH_TRANSFER = 1;
  const RELEASE_MIN = 60;
  const RELEASE_GAIN = 1.2;
  const MAX_SAMPLE_DT = 0.25;
  const GRAB_LEASE = 15000;
  const BUMP_COOLDOWN = 200;
  const STEP_PX = 24;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const speedOf = (body) => Math.hypot(Number(body && body.vx) || 0, Number(body && body.vy) || 0);
  const isHeld = (body) => Boolean(body && (body.holder || body.held));

  // 用最后一段有效位移估算速度：加速甩动时不会被更早的慢速样本稀释。
  function estimate(samples, now, limit = true) {
    if (!Array.isArray(samples) || samples.length < 2) return { vx: 0, vy: 0 };
    const t = Number(now) || Date.now();
    const valid = [];
    for (let i = samples.length - 1; i >= 0 && valid.length < 24; i--) {
      const s = samples[i];
      if (!s || !Number.isFinite(s.t) || !Number.isFinite(s.x) || !Number.isFinite(s.y)) continue;
      valid.push(s);
    }
    if (valid.length < 2) return { vx: 0, vy: 0 };
    const last = valid[0];
    for (let i = 1; i < valid.length; i++) {
      const prev = valid[i];
      const dt = (last.t - prev.t) / 1000;
      if (dt < 0.016) continue;
      if (dt > MAX_SAMPLE_DT || t - last.t > MAX_SAMPLE_DT) break;
      let vx = ((last.x - prev.x) * VW) / dt;
      let vy = ((last.y - prev.y) * VH) / dt;
      const sp = Math.hypot(vx, vy);
      if (limit && sp > MAX_SPEED) {
        vx = (vx / sp) * MAX_SPEED;
        vy = (vy / sp) * MAX_SPEED;
      }
      return { vx, vy };
    }
    return { vx: 0, vy: 0 };
  }

  // 把被拖拽的宠物放到目标点，并把挡路的宠物推开。
  // applyPush=false 时只计算拖拽方自己的落点，供渲染层预测。
  // 按 24px 一段细分路径，避免快速甩动时穿过其他宠物。
  function moveHeld(mover, bodies, x, y, applyPush) {
    const id = mover && mover.id;
    const speed = Number(mover && mover.speed) || 0;
    const power = Math.max(PUSH_MIN, speed * PUSH_TRANSFER);
    const targetX = clamp((Number(x) || 0) * VW, HALF, VW - HALF);
    const targetY = clamp((Number(y) || 0) * VH, TOP_PAD + HALF, VH - NAME_SPACE - HALF);
    const rawX = mover && Number.isFinite(Number(mover.x)) ? Number(mover.x) : targetX / VW;
    const rawY = mover && Number.isFinite(Number(mover.y)) ? Number(mover.y) : targetY / VH;
    const startX = clamp(rawX * VW, HALF, VW - HALF);
    const startY = clamp(rawY * VH, TOP_PAD + HALF, VH - NAME_SPACE - HALF);
    const distance = Math.hypot(targetX - startX, targetY - startY);
    const steps = Math.max(1, Math.min(96, Math.ceil(distance / STEP_PX) + 4));
    const pushed = [];
    let blockedBy = null;
    let px = startX;
    let py = startY;

    for (let step = 0; step < steps; step++) {
      const restX = targetX - px;
      const restY = targetY - py;
      const rest = Math.hypot(restX, restY);
      if (rest < 0.001) break;
      const advance = Math.min(STEP_PX, rest);
      px += (restX / rest) * advance;
      py += (restY / rest) * advance;

      for (let iter = 0; iter < 3; iter++) {
        let hit = false;
        for (const other of bodies || []) {
          if (!other || other.id === id) continue;
          const ox = (Number(other.x) || 0) * VW;
          const oy = (Number(other.y) || 0) * VH;
          let dx = px - ox;
          let dy = py - oy;
          let dist = Math.hypot(dx, dy);
          const min = RADIUS * 2;
          if (dist >= min) continue;
          hit = true;
          if (dist < 0.001) {
            // 完全重叠时朝“拖拽起点”方向弹开，避免被挤到障碍物另一侧。
            dx = startX - ox;
            dy = startY - oy;
            dist = Math.hypot(dx, dy);
            if (dist < 0.001) {
              dx = -1;
              dy = 0;
              dist = 1;
            }
          }
          const nx = dx / dist;
          const ny = dy / dist;
          const pen = min - dist;

          // 正被他人拖拽的宠物是不可推动的障碍，把拖拽方挡回去。
          if (isHeld(other)) {
            px = clamp(px + nx * pen, HALF, VW - HALF);
            py = clamp(py + ny * pen, TOP_PAD + HALF, VH - NAME_SPACE - HALF);
            blockedBy = other.id;
            continue;
          }
          if (!applyPush) {
            // 本地预测：对方还能被推开就放行，推不开（贴边/角落）就挡住自己。
            const want = pen + 0.5;
            const tx = clamp(ox - nx * want, HALF, VW - HALF);
            const ty = clamp(oy - ny * want, TOP_PAD + HALF, VH - NAME_SPACE - HALF);
            const pushedDist = Math.hypot(tx - ox, ty - oy);
            const remain = pen - pushedDist;
            if (remain > 0.5) {
              px = clamp(px + nx * remain, HALF, VW - HALF);
              py = clamp(py + ny * remain, TOP_PAD + HALF, VH - NAME_SPACE - HALF);
              blockedBy = other.id;
            }
            continue;
          }

          const beforeX = ox;
          const beforeY = oy;
          const want = pen + 0.5;
          other.x = clamp(ox - nx * want, HALF, VW - HALF) / VW;
          other.y = clamp(oy - ny * want, TOP_PAD + HALF, VH - NAME_SPACE - HALF) / VH;
          const moved = Math.hypot(other.x * VW - beforeX, other.y * VH - beforeY);

          if (moved > 0.5) {
            const along = (Number(other.vx) || 0) * -nx + (Number(other.vy) || 0) * -ny;
            if (along < power) {
              other.vx = -nx * power;
              other.vy = -ny * power;
            }
            if (pushed.indexOf(other.id) < 0) pushed.push(other.id);
          }

          const remain = pen - moved;
          if (remain > 0.5) {
            px = clamp(px + nx * remain, HALF, VW - HALF);
            py = clamp(py + ny * remain, TOP_PAD + HALF, VH - NAME_SPACE - HALF);
            blockedBy = other.id;
          }
        }
        if (!hit) break;
      }
    }

    return { x: px / VW, y: py / VH, blockedBy, pushed };
  }

  // 推进自由状态宠物：阻尼、边缘反弹、互相碰撞。返回发生位移的 id 和碰撞事件。
  function step(bodies, dt) {
    const moved = new Set();
    const bumps = [];
    if (!(dt > 0) || !Array.isArray(bodies)) return { moved: [], bumps };

    const damp = Math.pow(0.5, dt / HALF_LIFE);

    for (const body of bodies) {
      if (!body || isHeld(body)) continue;
      let vx = Number(body.vx) || 0;
      let vy = Number(body.vy) || 0;
      if (!vx && !vy) continue;

      vx *= damp;
      vy *= damp;

      let x = (Number(body.x) || 0) * VW + vx * dt;
      let y = (Number(body.y) || 0) * VH + vy * dt;

      if (x < HALF) {
        x = HALF + (HALF - x);
        vx = Math.abs(vx) * RESTITUTION;
      } else if (x > VW - HALF) {
        x = VW - HALF - (x - (VW - HALF));
        vx = -Math.abs(vx) * RESTITUTION;
      }
      if (y < TOP_PAD + HALF) {
        y = TOP_PAD + HALF + (TOP_PAD + HALF - y);
        vy = Math.abs(vy) * RESTITUTION;
      } else if (y > VH - NAME_SPACE - HALF) {
        y = VH - NAME_SPACE - HALF - (y - (VH - NAME_SPACE - HALF));
        vy = -Math.abs(vy) * RESTITUTION;
      }

      x = clamp(x, HALF, VW - HALF);
      y = clamp(y, TOP_PAD + HALF, VH - NAME_SPACE - HALF);

      if (Math.hypot(vx, vy) < MIN_SPEED) {
        vx = 0;
        vy = 0;
      }

      const nx = x / VW;
      const ny = y / VH;
      if (Math.abs(nx - body.x) > 0.000001 || Math.abs(ny - body.y) > 0.000001) moved.add(body.id);
      body.x = nx;
      body.y = ny;
      body.vx = vx;
      body.vy = vy;
    }

    for (let iter = 0; iter < 3; iter++) {
      let any = false;
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        if (!a) continue;
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          if (!b) continue;
          const ax = (Number(a.x) || 0) * VW;
          const ay = (Number(a.y) || 0) * VH;
          const bx = (Number(b.x) || 0) * VW;
          const by = (Number(b.y) || 0) * VH;
          let dx = bx - ax;
          let dy = by - ay;
          let dist = Math.hypot(dx, dy);
          const min = RADIUS * 2;
          if (dist >= min) continue;
          if (isHeld(a) && isHeld(b)) continue;
          any = true;
          if (dist < 0.001) {
            dx = 1;
            dy = 0;
            dist = 1;
          }
          const nx = dx / dist;
          const ny = dy / dist;
          const pen = min - dist;

          if (isHeld(a) || isHeld(b)) {
            const held = isHeld(a) ? a : b;
            const free = isHeld(a) ? b : a;
            const dirX = isHeld(a) ? nx : -nx;
            const dirY = isHeld(a) ? ny : -ny;
            free.x = clamp(free.x + (dirX * pen) / VW, MIN_X, MAX_X);
            free.y = clamp(free.y + (dirY * pen) / VH, MIN_Y, MAX_Y);
            const along = (Number(free.vx) || 0) * dirX + (Number(free.vy) || 0) * dirY;
            if (along < 0) {
              free.vx = (Number(free.vx) || 0) - along * dirX;
              free.vy = (Number(free.vy) || 0) - along * dirY;
            }
            moved.add(free.id);
            if (speedOf(free) > 120) bumps.push({ a: held.id, b: free.id, power: Math.round(speedOf(free)) });
            continue;
          }

          a.x = clamp(a.x - (nx * pen) / 2 / VW, MIN_X, MAX_X);
          a.y = clamp(a.y - (ny * pen) / 2 / VH, MIN_Y, MAX_Y);
          b.x = clamp(b.x + (nx * pen) / 2 / VW, MIN_X, MAX_X);
          b.y = clamp(b.y + (ny * pen) / 2 / VH, MIN_Y, MAX_Y);

          const rvx = (Number(b.vx) || 0) - (Number(a.vx) || 0);
          const rvy = (Number(b.vy) || 0) - (Number(a.vy) || 0);
          const vn = rvx * nx + rvy * ny;
          if (vn < 0) {
            const impulse = (-(1 + 0.35) * vn) / 2;
            a.vx = (Number(a.vx) || 0) - impulse * nx;
            a.vy = (Number(a.vy) || 0) - impulse * ny;
            b.vx = (Number(b.vx) || 0) + impulse * nx;
            b.vy = (Number(b.vy) || 0) + impulse * ny;
            const power = Math.round(Math.max(speedOf(a), speedOf(b)));
            if (power > 80) bumps.push({ a: a.id, b: b.id, power });
          }
          moved.add(a.id);
          moved.add(b.id);
        }
      }
      if (!any) break;
    }

    return { moved: [...moved], bumps };
  }

  return {
    VW,
    VH,
    RADIUS,
    HALF,
    TOP_PAD,
    NAME_SPACE,
    MIN_X,
    MAX_X,
    MIN_Y,
    MAX_Y,
    MIN_SPEED,
    MAX_SPEED,
    RELEASE_MIN,
    RELEASE_GAIN,
    GRAB_LEASE,
    BUMP_COOLDOWN,
    clamp,
    speedOf,
    isHeld,
    estimate,
    moveHeld,
    step
  };
});
