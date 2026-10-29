'use strict';

const Sprites = window.Sprites;
const Emotes = window.Emotes;
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const mini = document.getElementById('mini');
const miniAvatar = document.getElementById('miniAvatar');
const emoteBtn = document.getElementById('emoteBtn');
const emoteClose = document.getElementById('emoteClose');
const emoteTabs = document.getElementById('emoteTabs');
const emoteGrids = document.getElementById('emoteGrids');

let composing = false;
let collapsed = false;
let panelOpen = false;
let panelOpenedAt = 0;
let miniAvatarId = '';
let activeCategory = Emotes.categories.length ? Emotes.categories[0].key : '';
const tabEls = new Map();
const gridEls = new Map();

function updatePlaceholder(state) {
  const n = state.mode === 'idle' ? 0 : (state.players ? state.players.length : 0);
  if (!n) {
    input.placeholder = '说点什么…（Enter 发送）';
  } else if (n === 1) {
    input.placeholder = '房间里目前只有你…';
  } else {
    input.placeholder = `和另外 ${n - 1} 个人在一起 · Enter 发送`;
  }
}

function updateMini(state) {
  const me = state.players ? state.players.find((p) => p.id === state.selfId) : null;
  if (!me || me.avatar === miniAvatarId) return;
  const sprite = Sprites.byId[me.avatar] || Sprites.list[0];
  miniAvatarId = me.avatar;
  Sprites.draw(miniAvatar, sprite, 2);
}

function selectCategory(key) {
  if (!gridEls.has(key)) return;
  activeCategory = key;
  for (const [k, tab] of tabEls) tab.classList.toggle('active', k === key);
  for (const [k, grid] of gridEls) grid.hidden = k !== key;
}

function buildEmotePanel() {
  for (const cat of Emotes.categories) {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = 'tab';
    tab.dataset.cat = cat.key;
    tab.title = `${cat.label}（${cat.count}）`;
    tab.append(document.createTextNode(cat.label));
    const count = document.createElement('span');
    count.className = 'tab-count';
    count.textContent = String(cat.count);
    tab.appendChild(count);
    tab.addEventListener('click', () => selectCategory(cat.key));
    emoteTabs.appendChild(tab);
    tabEls.set(cat.key, tab);

    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.dataset.cat = cat.key;
    for (const e of Emotes.list.filter((item) => item.category === cat.key)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'emote-item';
      btn.dataset.id = e.id;
      btn.title = e.nameZh;
      const img = new Image();
      img.src = Emotes.thumbUrl(e);
      img.alt = e.nameZh;
      img.loading = 'lazy';
      img.decoding = 'async';
      btn.appendChild(img);
      btn.addEventListener('click', () => sendEmote(e.id, btn));
      grid.appendChild(btn);
    }
    emoteGrids.appendChild(grid);
    gridEls.set(cat.key, grid);
  }
  selectCategory(activeCategory);
}

function sendEmote(id, btn) {
  api.sendEmote(id);
  if (!btn) return;
  btn.classList.remove('sent');
  void btn.offsetWidth;
  btn.classList.add('sent');
  setTimeout(() => btn.classList.remove('sent'), 300);
}

function setPanel(open, notify = true) {
  const next = Boolean(open);
  if (next && !panelOpen) panelOpenedAt = Date.now();
  panelOpen = next;
  document.body.classList.toggle('panel-open', next);
  emoteBtn.classList.toggle('active', next);
  if (next) input.blur();
  if (notify) api.setPanel(next);
}

function applyCollapsed(next, notify) {
  if (collapsed === next) {
    if (!next && !panelOpen) input.focus();
    return;
  }
  if (next) setPanel(false);
  collapsed = next;
  document.body.classList.toggle('collapsed', next);
  if (!next) mini.classList.remove('has-dot');
  if (notify) api.setCollapsed(next);
  if (!next) setTimeout(() => { if (!panelOpen) input.focus(); }, 80);
}

function send() {
  const text = input.value.trim();
  if (!text) return;
  api.send(text);
  input.value = '';
  input.focus();
}

sendBtn.addEventListener('click', send);

input.addEventListener('compositionstart', () => { composing = true; });
input.addEventListener('compositionend', () => { composing = false; });

input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !composing && !e.isComposing) {
    e.preventDefault();
    send();
  }
});

input.addEventListener('focus', () => {
  if (panelOpen) setPanel(false);
});
input.addEventListener('pointerdown', () => {
  if (panelOpen) setPanel(false);
});
sendBtn.addEventListener('pointerdown', () => {
  if (panelOpen) setPanel(false);
});

document.getElementById('collapse').addEventListener('click', () => applyCollapsed(true, true));
mini.addEventListener('click', () => applyCollapsed(false, true));

document.getElementById('gear').addEventListener('click', () => {
  setPanel(false);
  api.showSetup();
});
document.getElementById('close').addEventListener('click', () => {
  setPanel(false);
  input.value = '';
  api.leave();
});

emoteBtn.addEventListener('click', () => setPanel(!panelOpen));
emoteClose.addEventListener('click', () => setPanel(false));

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && panelOpen) {
    e.preventDefault();
    setPanel(false);
  }
});

window.addEventListener('blur', () => {
  if (panelOpen && Date.now() - panelOpenedAt > 400) setPanel(false);
});

window.addEventListener('focus', () => {
  if (!collapsed && !panelOpen) input.focus();
});

api.onState((state) => {
  updatePlaceholder(state);
  updateMini(state);
  if (state.mode === 'idle') setPanel(false);
});
api.onChat(() => {
  if (collapsed) mini.classList.add('has-dot');
});
api.onPanel(({ open }) => setPanel(open, false));
api.onFocusInput(() => {
  setPanel(false);
  applyCollapsed(false, false);
  setTimeout(() => { if (!panelOpen) input.focus(); }, 60);
});

buildEmotePanel();
