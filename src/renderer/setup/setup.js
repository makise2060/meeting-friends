'use strict';

const $ = (id) => document.getElementById(id);
const Sprites = window.Sprites;

let state = { mode: 'idle' };
let selectedAvatar = 'dog';
let hostCode = '';
let scanning = false;
let toastTimer = null;
let saveTimer = null;
let scanTimer = null;

function toast(text, ms = 2800) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

function randomCode() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function drawInto(canvas, sprite, scale) {
  Sprites.draw(canvas, sprite, scale);
}

function buildHero() {
  const wrap = $('heroPets');
  for (const sprite of Sprites.list) {
    const c = document.createElement('canvas');
    drawInto(c, sprite, 2);
    wrap.appendChild(c);
  }
}

function buildAvatars() {
  const wrap = $('avatars');
  wrap.innerHTML = '';
  for (const sprite of Sprites.list) {
    const item = document.createElement('div');
    item.className = 'avatar' + (sprite.id === selectedAvatar ? ' selected' : '');
    item.dataset.id = sprite.id;
    const c = document.createElement('canvas');
    drawInto(c, sprite, 4);
    const label = document.createElement('span');
    label.textContent = sprite.name;
    item.append(c, label);
    item.addEventListener('click', () => selectAvatar(sprite.id));
    wrap.appendChild(item);
  }
}

function selectAvatar(id) {
  selectedAvatar = id;
  for (const el of document.querySelectorAll('.avatar')) {
    el.classList.toggle('selected', el.dataset.id === id);
  }
  scheduleSave();
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveConfig({ name: $('name').value.trim(), avatar: selectedAvatar });
  }, 400);
}

function readIdentity() {
  const name = $('name').value.trim();
  if (!name) {
    toast('先给自己起个昵称');
    $('name').focus();
    return null;
  }
  return { name, avatar: selectedAvatar };
}

async function refreshRooms() {
  if (scanning || state.mode !== 'idle') return;
  scanning = true;
  $('refreshRooms').disabled = true;
  try {
    const rooms = await api.listRooms();
    renderRooms(rooms);
  } catch {
    renderRooms([]);
  } finally {
    scanning = false;
    $('refreshRooms').disabled = false;
  }
}

function renderRooms(rooms) {
  const wrap = $('rooms');
  wrap.innerHTML = '';
  if (!rooms.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '没搜到房间。可能还没人开房、防火墙拦了广播，或网络开了设备隔离——试试手动填 IP。';
    wrap.appendChild(empty);
    return;
  }
  for (const r of rooms) {
    const item = document.createElement('div');
    item.className = 'room-item';

    const main = document.createElement('div');
    main.className = 'room-item-main';
    const nm = document.createElement('b');
    nm.textContent = r.name;
    const addr = document.createElement('span');
    addr.textContent = `${r.ip}:${r.port}`;
    main.append(nm, addr);

    const count = document.createElement('div');
    count.className = 'count';
    count.textContent = `${r.players}/${r.capacity} 人`;

    const btn = document.createElement('button');
    btn.className = 'ghost small';
    btn.textContent = '加入';
    btn.addEventListener('click', () => {
      $('ip').value = r.ip;
      $('port').value = String(r.port);
      $('code').value = '';
      $('code').focus();
      toast('已填入房主地址，输入房间码后点“加入”');
    });

    item.append(main, count, btn);
    wrap.appendChild(item);
  }
}

async function doHost() {
  const id = readIdentity();
  if (!id) return;
  const btn = $('hostBtn');
  btn.disabled = true;
  btn.textContent = '正在开…';
  try {
    const res = await api.host({ ...id, code: hostCode });
    if (!res.ok) toast(res.error || '开房间失败');
  } finally {
    btn.disabled = false;
    btn.textContent = '开房间';
  }
}

async function doJoin() {
  const id = readIdentity();
  if (!id) return;
  const ip = $('ip').value.trim();
  const port = Number($('port').value.trim());
  const code = $('code').value.trim();
  if (!ip) {
    toast('填一下房主 IP');
    $('ip').focus();
    return;
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    toast('端口不对，默认是 47800');
    $('port').focus();
    return;
  }
  if (!/^\d{4}$/.test(code)) {
    toast('房间码是 4 位数字');
    $('code').focus();
    return;
  }
  const btn = $('joinBtn');
  btn.disabled = true;
  btn.textContent = '连接中…';
  try {
    const res = await api.join({ ...id, ip, port, code });
    if (!res.ok) toast(res.error || '加入失败');
  } finally {
    btn.disabled = false;
    btn.textContent = '加入';
  }
}

function renderState() {
  const inRoom = state.mode !== 'idle';
  $('lobby').hidden = inRoom;
  $('roomView').hidden = !inRoom;
  if (!inRoom) return;

  const room = state.room || {};
  $('roomName').textContent = room.name || '房间';
  $('roomMode').textContent = state.mode === 'host' ? '房主' : '成员';
  $('roomCode').textContent = room.code || '----';

  const ipsWrap = $('roomIPs');
  ipsWrap.innerHTML = '';
  const ips = Array.isArray(room.ips) && room.ips.length ? room.ips : [{ address: room.ip || '?' }];
  for (const entry of ips) {
    const b = document.createElement('button');
    b.className = 'ip-chip';
    b.textContent = entry.address;
    b.title = '点击复制 IP';
    b.addEventListener('click', async () => {
      await api.copy(entry.address);
      toast(`已复制 ${entry.address}`);
    });
    ipsWrap.appendChild(b);
  }
  const hint = document.querySelector('.room-info .hint');
  if (hint) {
    hint.textContent = state.mode === 'host'
      ? `把 IP、端口 ${room.port} 和房间码发给朋友，他们在“或手动加入”里填上就能进来。`
      : `端口 ${room.port}。房主关掉软件，房间就结束了。`;
  }

  $('peopleCount').textContent = `${state.players.length} / ${state.capacity || 8} 人`;
  const list = $('members');
  list.innerHTML = '';
  for (const p of state.players) {
    const li = document.createElement('li');
    const c = document.createElement('canvas');
    const sprite = Sprites.byId[p.avatar] || Sprites.list[0];
    drawInto(c, sprite, 2);
    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = p.name;
    if (p.id === state.selfId) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = '你';
      who.appendChild(tag);
    }
    li.append(c, who);
    if (state.mode === 'host' && p.id !== state.selfId) {
      const kick = document.createElement('button');
      kick.className = 'ghost small danger';
      kick.textContent = '请出';
      kick.addEventListener('click', () => api.kick(p.id));
      li.appendChild(kick);
    }
    list.appendChild(li);
  }
}

function diagLine(text, className) {
  const div = document.createElement('div');
  div.textContent = text;
  if (className) div.className = className;
  return div;
}

async function runDiag() {
  const box = $('diagResult');
  box.innerHTML = '';
  box.appendChild(diagLine('正在扫描（约 3 秒）…'));
  const r = await api.diagRun();
  box.innerHTML = '';
  const ips = r.ips.length ? r.ips.map((i) => `${i.address}（${i.iface}）`).join('、') : '没找到局域网 IP';
  box.appendChild(diagLine(`本机 IP：${ips}`));
  box.appendChild(diagLine(`广播端口：UDP ${r.discoveryPort}`));
  box.appendChild(diagLine(`收到房间广播：${r.rooms.length} 个`));
  if (!r.rooms.length) {
    box.appendChild(diagLine('没收到广播：可能没人开房、防火墙拦了 UDP，或网络开了设备隔离。手动输 IP 也可能连不上。', 'warn'));
  } else {
    for (const room of r.rooms) {
      box.appendChild(diagLine(`· ${room.name} — ${room.ip}:${room.port}（${room.players} 人）`));
    }
  }
}

async function runPortTest() {
  const ip = $('diagIp').value.trim();
  const port = Number($('diagPort').value.trim()) || 47800;
  if (!ip) {
    toast('先填对方 IP');
    return;
  }
  const box = $('diagResult');
  box.innerHTML = '';
  box.appendChild(diagLine(`正在测试 ${ip}:${port}…`));
  const r = await api.diagPort(ip, port);
  box.innerHTML = '';
  if (r.ok) {
    box.appendChild(diagLine(`${ip}:${port} 能连上。`, ''));
  } else {
    box.appendChild(diagLine(`${ip}:${port} 连不上（${r.error || '未知原因'}）。检查防火墙和是否同一网段。`, 'warn'));
  }
}

async function init() {
  api.onState((s) => {
    const wasIdle = state.mode === 'idle';
    state = s;
    renderState();
    if (wasIdle && s.mode !== 'idle') {
      $('code').value = '';
    }
  });
  api.onToast(toast);

  const cfg = await api.getConfig();
  $('appVersion').textContent = `v${cfg.version || 'dev'}`;
  $('name').value = cfg.name || '';
  $('ip').value = cfg.lastIp || '';
  $('port').value = String(cfg.lastPort || 47800);
  selectedAvatar = Sprites.byId[cfg.avatar] ? cfg.avatar : 'dog';

  hostCode = randomCode();
  $('hostCode').textContent = hostCode;

  buildHero();
  buildAvatars();
  renderState();

  state = await api.getState();
  renderState();

  $('name').addEventListener('input', scheduleSave);
  $('refreshRooms').addEventListener('click', refreshRooms);
  $('hostBtn').addEventListener('click', doHost);
  $('joinBtn').addEventListener('click', doJoin);
  $('regenCode').addEventListener('click', () => {
    hostCode = randomCode();
    $('hostCode').textContent = hostCode;
  });
  $('copyCode').addEventListener('click', async () => {
    const room = state.room || {};
    if (!room.code) return;
    await api.copy(room.code);
    toast('房间码已复制');
  });
  $('backToChat').addEventListener('click', () => api.hideSetup());
  $('leaveBtn').addEventListener('click', () => api.leave());

  $('diagToggle').addEventListener('click', () => {
    const panel = $('diagPanel');
    panel.hidden = !panel.hidden;
    $('diagToggle').textContent = panel.hidden ? '展开' : '收起';
  });
  $('diagRun').addEventListener('click', runDiag);
  $('diagTest').addEventListener('click', runPortTest);

  for (const id of ['ip', 'port', 'code']) {
    $(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doJoin();
    });
  }
  $('name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('ip').focus();
  });

  refreshRooms();
  scanTimer = setInterval(() => {
    if (!document.hidden && state.mode === 'idle' && !$('lobby').hidden) refreshRooms();
  }, 7000);
}

init();
