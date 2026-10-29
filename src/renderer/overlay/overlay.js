'use strict';

const Sprites = window.Sprites;
const stage = document.getElementById('stage');

const SIZE = 96;
const HALF = SIZE / 2;
const NAME_SPACE = 26;
const HIT_PAD = 6;

let state = { mode: 'idle', selfId: null, players: [] };
const pets = new Map();
const bubbleTimers = new Map();
const talkTimers = new Map();

let dragging = null;
let interactive = false;
let lastSent = 0;

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

  el.append(wrap, nameEl, bubbleEl);
  stage.appendChild(el);

  const pet = { id: p.id, el, nameEl, bubbleEl, x: p.x, y: p.y };
  pets.set(p.id, pet);
  return pet;
}

function place(el, x, y, animate) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const left = clamp(x * W - HALF, 0, W - SIZE);
  const top = clamp(y * H - HALF, 0, H - SIZE - NAME_SPACE);
  el.style.transition = animate ? 'left .12s linear, top .12s linear' : 'none';
  el.style.left = left + 'px';
  el.style.top = top + 'px';
}

function sync() {
  if (state.mode === 'idle') {
    for (const pet of pets.values()) pet.el.remove();
    pets.clear();
    return;
  }
  const seen = new Set();
  for (const p of state.players) {
    seen.add(p.id);
    let pet = pets.get(p.id);
    if (!pet) pet = createPet(p);
    const isSelf = p.id === state.selfId;
    pet.el.classList.toggle('self', isSelf);
    pet.nameEl.textContent = p.name;
    pet.x = p.x;
    pet.y = p.y;
    if (!dragging || dragging.id !== p.id) {
      place(pet.el, p.x, p.y, !isSelf);
    }
  }
  for (const [id, pet] of [...pets]) {
    if (!seen.has(id)) {
      pet.el.remove();
      pets.delete(id);
      clearTimeout(bubbleTimers.get(id));
      clearTimeout(talkTimers.get(id));
      bubbleTimers.delete(id);
      talkTimers.delete(id);
    }
  }
}

function onMove(msg) {
  const pet = pets.get(msg.id);
  if (!pet) return;
  pet.x = msg.x;
  pet.y = msg.y;
  if (dragging && dragging.id === msg.id) return;
  place(pet.el, msg.x, msg.y, msg.id !== state.selfId);
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

function resetInteraction() {
  dragging = null;
  document.body.classList.remove('dragging');
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
    document.body.classList.toggle('interactive', hit);
  }
});

stage.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  const petEl = e.target instanceof Element ? e.target.closest('.pet') : null;
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
  document.body.classList.add('dragging');
  interactive = true;
  api.setInteractive(true);
});

window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = clamp(e.clientX - dragging.offX, HALF, W - HALF);
  const cy = clamp(e.clientY - dragging.offY, HALF, H - HALF);
  dragging.pet.el.style.transition = 'none';
  dragging.pet.el.style.left = (cx - HALF) + 'px';
  dragging.pet.el.style.top = (cy - HALF) + 'px';
  const now = performance.now();
  if (now - lastSent > 60) {
    lastSent = now;
    api.movePet(dragging.id, cx / W, cy / H);
  }
});

window.addEventListener('mouseup', () => {
  if (!dragging) return;
  const pet = dragging.pet;
  const W = window.innerWidth;
  const H = window.innerHeight;
  const cx = clamp(parseFloat(pet.el.style.left) + HALF, HALF, W - HALF);
  const cy = clamp(parseFloat(pet.el.style.top) + HALF, HALF, H - HALF);
  api.movePet(dragging.id, cx / W, cy / H);
  dragging = null;
  document.body.classList.remove('dragging');
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
api.onChat(onChat);
api.onRelayout(() => {
  for (const pet of pets.values()) place(pet.el, pet.x, pet.y, false);
});
api.onReset(resetInteraction);
