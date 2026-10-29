'use strict';

const Sprites = window.Sprites;
const Emotes = window.Emotes;
const Physics = window.Physics;
const stage = document.getElementById('stage');

const SIZE = 96;
const HALF = SIZE / 2;
const NAME_SPACE = 26;
const HIT_PAD = 6;
const TOP_PAD = 64;
const EMOTE_MAX = 3;
const EMOTE_TTL = 5000;
const FOLLOW_TAU = 0.08;

let state = { mode: 'idle', selfId: null, players: [] };
const pets = new Map();
const bubbleTimers = new Map();
const talkTimers = new Map();
const bumpTimers = new Map();

let dragging = null;
let interactive = false;
let lastSent = 0;
let lastBumpAt = 0;
let dragCursor = { x: 0, y: 0 };
let dragRaf = 0;
let dragLast = 0;
let cursorHistory = [];

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

function createPet(p) {
  const el = document.createElement('div');
  el.className = 'pet';
  el.dataset.id = p.id;

  const wrap = document.createElement('div');
  wrap.className = 'sprite-wrap';
  const canvas = document.createElement('canvas');
  Sprites.draw(canvas, Sprites.byId[p.avatar] || Sprites.list[0], 6);
  wrap.appendChild(canvas);

  const nameEl = document.createElement('div');
  nameEl.className = 'name';
  nameEl.textContent = p.name;

  const bubbleEl = document.createElement('div');
  bubbleEl.className = 'bubble';

  const emoteRow = document.createElement('div');
  emoteRow.className = 'emote-row';

  const stack = document.createElement('div');
  stack.className = 'stack';
  stack.append(emoteRow, bubbleEl);

  el.append(wrap, nameEl, stack);
  stage.appendChild(el);

  const pet = {
    id: p.id,
    el,
    nameEl,
    bubbleEl,
    emoteRow,
    emotes: [],
    x: p.x,
    y: p.y,
    held: Boolean(p.held),
    placed: false
  };
  pets.set(p.id, pet);
  return pet;
}

function dropEmote(pet, id) {
  const index = pet.emotes.findIndex((item) => item.id === id);
  if (index < 0) return;
  const [item] = pet.emotes.splice(index, 1);
  clearTimeout(item.timer);
  item.el.remove();
}

function clearEmotes(pet) {
  for (const item of pet.emotes) {
    clearTimeout(item.timer);
    item.el.remove();
  }
  pet.emotes.length = 0;
}

function destroyPet(pet) {
  clearTimeout(bubbleTimers.get(pet.id));
  clearTimeout(talkTimers.get(pet.id));
  clearTimeout(bumpTimers.get(pet.id));
  bubbleTimers.delete(pet.id);
  talkTimers.delete(pet.id);
  bumpTimers.delete(pet.id);
  clearEmotes(pet);
  pet.el.remove();
}

function onEmote(msg) {
  const pet = pets.get(msg.id);
  const emote = Emotes.byId[msg.emote];
  if (!pet || !emote) return;

  let item = pet.emotes.find((it) => it.id === msg.emote);
  if (!item) {
    if (pet.emotes.length >= EMOTE_MAX) dropEmote(pet, pet.emotes[0].id);
    const img = new Image();
    img.src = Emotes.url(emote);
    img.alt = emote.nameZh;
    img.dataset.emote = msg.emote;
    img.decoding = 'async';
    pet.emoteRow.appendChild(img);
    item = { id: msg.emote, el: img, timer: 0 };
    pet.emotes.push(item);
  }

  clearTimeout(item.timer);
  item.timer = setTimeout(() => dropEmote(pet, item.id), EMOTE_TTL);
  item.el.classList.remove('pop');
  void item.el.offsetWidth;
  item.el.classList.add('pop');
}

function place(el, x, y, animate) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const left = clamp(x * W - HALF, 0, W - SIZE);
  const top = clamp(y * H - HALF, TOP_PAD, H - SIZE - NAME_SPACE);
  el.style.transition = animate ? 'left .07s linear, top .07s linear' : 'none';
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function sync() {
  if (state.mode === 'idle') {
    if (dragging) resetInteraction();
    for (const pet of pets.values()) destroyPet(pet);
    pets.clear();
    return;
  }
  const seen = new Set();
  for (const p of state.players) {
    seen.add(p.id);
    let pet = pets.get(p.id);
    if (!pet) pet = createPet(p);
    const isSelf = p.id === state.selfId;
    const isDragging = Boolean(dragging && dragging.id === p.id);
    pet.el.classList.toggle('self', isSelf);
    pet.nameEl.textContent = p.name;
    pet.held = Boolean(p.held);
    if (!isDragging) {
      const changed = !pet.placed || Math.abs(pet.x - p.x) > 0.001 || Math.abs(pet.y - p.y) > 0.001;
      pet.x = p.x;
      pet.y = p.y;
      if (changed) {
        place(pet.el, p.x, p.y, false);
        pet.placed = true;
      }
    }
  }
  for (const [id, pet] of [...pets]) {
    if (!seen.has(id)) {
      destroyPet(pet);
      pets.delete(id);
    }
  }
  if (dragging && !pets.has(dragging.id)) resetInteraction();
}

function onMove(msg) {
  const pet = pets.get(msg.id);
  if (!pet) return;
  if (dragging && dragging.id === msg.id) return;
  pet.x = msg.x;
  pet.y = msg.y;
  pet.placed = true;
  place(pet.el, msg.x, msg.y, true);
}

function onPositions(msg) {
  if (!msg || !Array.isArray(msg.list)) return;
  for (const item of msg.list) {
    const pet = pets.get(item.id);
    if (!pet) continue;
    if (dragging && dragging.id === item.id) continue;
    const dx = Math.abs(pet.x - item.x);
    const dy = Math.abs(pet.y - item.y);
    pet.x = item.x;
    pet.y = item.y;
    if (!pet.placed || dx > 0.0004 || dy > 0.0004) {
      place(pet.el, item.x, item.y, true);
      pet.placed = true;
    }
  }
}

function bumpPets(a, b) {
  const now = performance.now();
  if (now - lastBumpAt < 120) return;
  lastBumpAt = now;
  for (const id of [a, b]) {
    const pet = pets.get(id);
    if (!pet) continue;
    clearTimeout(bumpTimers.get(id));
    pet.el.classList.remove('bump');
    void pet.el.offsetWidth;
    pet.el.classList.add('bump');
    bumpTimers.set(id, setTimeout(() => pet.el.classList.remove('bump'), 320));
  }
}

function onChat(msg) {
  const pet = pets.get(msg.id);
  if (!pet) return;
  pet.bubbleEl.textContent = msg.text;
  pet.bubbleEl.classList.add('show');
  clearTimeout(bubbleTimers.get(msg.id));
  bubbleTimers.set(
    msg.id,
    setTimeout(() => pet.bubbleEl.classList.remove('show'), 6000)
  );
  pet.el.classList.add('talking');
  clearTimeout(talkTimers.get(msg.id));
  talkTimers.set(
    msg.id,
    setTimeout(() => pet.el.classList.remove('talking'), 760)
  );
}

function hitTest(x, y) {
  for (const pet of pets.values()) {
    const r = pet.el.getBoundingClientRect();
    if (x >= r.left - HIT_PAD && x <= r.right + HIT_PAD && y >= r.top - HIT_PAD && y <= r.bottom + HIT_PAD) {
      return pet;
    }
  }
  return null;
}

// 甩出方向取鼠标真实轨迹，而不是宠物的跟随轨迹，避免角度被延迟和碰撞带偏。
function releaseVelocity() {
  return Physics.estimate(cursorHistory, performance.now(), false);
}

// 拖拽时宠物不直接吸在鼠标上，而是带阻尼地跟过去；松手时把当前跟随速度交给房主。
function stepDrag(now) {
  if (!dragging) return;
  const pet = dragging.pet;
  const dt = Math.min(0.05, Math.max(0.001, (now - dragLast) / 1000));
  dragLast = now;

  const alpha = 1 - Math.exp(-dt / FOLLOW_TAU);
  const wantX = pet.x + (dragCursor.x - pet.x) * alpha;
  const wantY = pet.y + (dragCursor.y - pet.y) * alpha;

  const bodies = [];
  for (const p of pets.values()) {
    bodies.push({ id: p.id, x: p.x, y: p.y, held: p.held });
  }
  const res = Physics.moveHeld(
    { id: dragging.id, speed: 0, x: pet.x, y: pet.y },
    bodies,
    wantX,
    wantY,
    false
  );

  pet.x = res.x;
  pet.y = res.y;
  pet.placed = true;

  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = clamp(res.x * W, HALF, W - HALF);
  const cy = clamp(res.y * H, HALF + TOP_PAD, H - HALF);
  pet.el.style.transition = 'none';
  pet.el.style.left = (cx - HALF) + 'px';
  pet.el.style.top = (cy - HALF) + 'px';

  if (res.blockedBy) bumpPets(dragging.id, res.blockedBy);

  if (now - lastSent > 60) {
    lastSent = now;
    api.movePet(dragging.id, res.x, res.y);
  }

  dragRaf = requestAnimationFrame(stepDrag);
}

function resetInteraction() {
  if (dragging) {
    cancelAnimationFrame(dragRaf);
    dragRaf = 0;
    api.releasePet(dragging.id, dragging.pet.x, dragging.pet.y, 0, 0);
  }
  dragging = null;
  cursorHistory = [];
  document.body.classList.remove('dragging');
  api.setDragging(false);
  for (const pet of pets.values()) clearEmotes(pet);
  if (interactive) {
    interactive = false;
    api.setInteractive(false);
  }
  document.body.classList.remove('interactive');
}

window.addEventListener('mousemove', (e) => {
  if (dragging) return;
  const hit = !!hitTest(e.clientX, e.clientY);
  if (hit !== interactive) {
    interactive = hit;
    api.setInteractive(hit);
    api.debugLog('hover', { hit, x: Math.round(e.clientX), y: Math.round(e.clientY) });
    document.body.classList.toggle('interactive', hit);
  }
});

stage.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const petEl = e.target instanceof Element ? e.target.closest('.pet') : null;
  api.debugLog('down', {
    x: Math.round(e.clientX),
    y: Math.round(e.clientY),
    target: (e.target && (e.target.className || e.target.tagName)) || '?',
    hit: !!petEl
  });
  if (!petEl) return;
  const id = petEl.dataset.id;
  const pet = pets.get(id);
  if (!pet) return;

  e.preventDefault();
  const rect = petEl.getBoundingClientRect();
  dragging = {
    id,
    pet,
    offX: e.clientX - (rect.left + HALF),
    offY: e.clientY - (rect.top + HALF)
  };
  const W = window.innerWidth;
  const H = window.innerHeight;
  dragCursor = {
    x: clamp(e.clientX - dragging.offX, HALF, W - HALF) / W,
    y: clamp(e.clientY - dragging.offY, HALF + TOP_PAD, H - HALF) / H
  };
  dragLast = performance.now();
  cursorHistory = [{ t: dragLast, x: e.clientX / W, y: e.clientY / H }];
  lastSent = 0;
  dragRaf = requestAnimationFrame(stepDrag);

  document.body.classList.add('dragging');
  interactive = true;
  api.setInteractive(true);
  api.setDragging(true);
  api.grabPet(id);
  api.debugLog('drag-start', { id });
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  dragCursor.x = clamp(e.clientX - dragging.offX, HALF, W - HALF) / W;
  dragCursor.y = clamp(e.clientY - dragging.offY, HALF + TOP_PAD, H - HALF) / H;
  cursorHistory.push({ t: performance.now(), x: e.clientX / W, y: e.clientY / H });
  while (cursorHistory.length > 64) cursorHistory.shift();
});

window.addEventListener('mouseup', () => {
  api.debugLog('up', { dragging: !!dragging });
  if (!dragging) return;
  const id = dragging.id;
  const pet = dragging.pet;
  const vel = releaseVelocity();
  cancelAnimationFrame(dragRaf);
  dragRaf = 0;
  cursorHistory = [];
  api.releasePet(id, pet.x, pet.y, vel.vx, vel.vy);
  dragging = null;
  document.body.classList.remove('dragging');
  api.setDragging(false);
});

window.addEventListener('error', (ev) => {
  api.debugLog('error', { message: ev.message, source: ev.filename, line: ev.lineno });
});
window.addEventListener('unhandledrejection', (ev) => {
  api.debugLog('rejection', { reason: String(ev.reason && (ev.reason.stack || ev.reason.message || ev.reason)) });
});

window.addEventListener('resize', () => {
  for (const pet of pets.values()) place(pet.el, pet.x, pet.y, false);
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

api.onState((s) => {
  state = s;
  sync();
});
api.onMove(onMove);
api.onPositions(onPositions);
api.onBump((msg) => bumpPets(msg.a, msg.b));
api.onChat(onChat);
api.onEmote(onEmote);
api.onRelayout(() => {
  for (const pet of pets.values()) place(pet.el, pet.x, pet.y, false);
});
api.onReset(resetInteraction);
