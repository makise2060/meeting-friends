'use strict';

const Sprites = window.Sprites;
const input = document.getElementById('msg');
const sendBtn = document.getElementById('send');
const mini = document.getElementById('mini');
const miniAvatar = document.getElementById('miniAvatar');

let composing = false;
let collapsed = false;
let miniAvatarId = '';

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

function applyCollapsed(next, notify) {
  if (collapsed === next) {
    if (!next) input.focus();
    return;
  }
  collapsed = next;
  document.body.classList.toggle('collapsed', next);
  if (!next) mini.classList.remove('has-dot');
  if (notify) api.setCollapsed(next);
  if (!next) setTimeout(() => input.focus(), 80);
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

document.getElementById('collapse').addEventListener('click', () => applyCollapsed(true, true));
mini.addEventListener('click', () => applyCollapsed(false, true));

document.getElementById('gear').addEventListener('click', () => api.showSetup());
document.getElementById('close').addEventListener('click', () => {
  input.value = '';
  api.leave();
});

window.addEventListener('focus', () => {
  if (!collapsed) input.focus();
});

api.onState((state) => {
  updatePlaceholder(state);
  updateMini(state);
});
api.onChat(() => {
  if (collapsed) mini.classList.add('has-dot');
});
api.onFocusInput(() => {
  applyCollapsed(false, false);
  setTimeout(() => input.focus(), 60);
});
