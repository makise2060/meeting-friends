'use strict';

const { app, BrowserWindow, ipcMain, screen, clipboard, globalShortcut, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { HostRoom, ClientRoom, localIPs, MAX_PLAYERS, BASE_PORT } = require('./net');
const { scanRooms, startAnnounce } = require('./discovery');

let setupWin = null;
let overlayWin = null;
let chatWin = null;
let room = null;
let roomMode = null;
let announce = null;
let quitting = false;
let chatCollapsed = false;
let config = {};

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH(), 'utf8')); } catch { return {}; }
}

function saveConfig(patch) {
  config = { ...config, ...patch };
  try { fs.writeFileSync(CONFIG_PATH(), JSON.stringify(config, null, 2)); } catch { /* ignore */ }
}

function preload(name) {
  return path.join(__dirname, '..', 'preload', name);
}

function webPreferences(name) {
  return {
    preload: preload(name),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false
  };
}

function createSetupWindow() {
  setupWin = new BrowserWindow({
    width: 760,
    height: 940,
    minWidth: 680,
    minHeight: 640,
    title: '好友见面',
    backgroundColor: '#14161c',
    autoHideMenuBar: true,
    show: false,
    webPreferences: webPreferences('setup.js')
  });
  setupWin.loadFile(path.join(__dirname, '..', 'renderer', 'setup', 'index.html'));
  setupWin.once('ready-to-show', () => setupWin.show());
  setupWin.webContents.on('did-finish-load', () => sendState());
  setupWin.on('close', (e) => {
    if (room) {
      e.preventDefault();
      setupWin.hide();
    }
  });
  setupWin.on('closed', () => {
    setupWin = null;
    if (!quitting) app.quit();
  });
}

function createOverlayWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  overlayWin = new BrowserWindow({
    x: area.x,
    y: area.y,
    width: area.width,
    height: area.height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: webPreferences('overlay.js')
  });
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'index.html'));
  overlayWin.webContents.on('did-finish-load', () => {
    overlayWin.setIgnoreMouseEvents(true, { forward: true });
    sendState();
  });
  overlayWin.on('closed', () => { overlayWin = null; });
}

function createChatWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = 480;
  const height = 64;
  chatWin = new BrowserWindow({
    x: Math.round(area.x + (area.width - width) / 2),
    y: Math.round(area.y + area.height - height - 56),
    width,
    height,
    transparent: true,
    backgroundColor: '#00000000',
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences: webPreferences('chatbar.js')
  });
  chatWin.setAlwaysOnTop(true, 'screen-saver');
  chatWin.loadFile(path.join(__dirname, '..', 'renderer', 'chatbar', 'index.html'));
  chatWin.webContents.on('did-finish-load', () => sendState());
  chatWin.on('closed', () => { chatWin = null; });
}

function buildState() {
  if (!room) return { mode: 'idle' };
  return {
    mode: roomMode,
    selfId: room.selfId,
    players: room.players.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, x: p.x, y: p.y })),
    room: room.info(),
    capacity: MAX_PLAYERS
  };
}

function sendState() {
  const state = buildState();
  for (const w of [setupWin, overlayWin, chatWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('state', state);
  }
}

function toast(text) {
  for (const w of [setupWin, chatWin]) {
    if (w && !w.isDestroyed()) w.webContents.send('toast', text);
  }
}

function wireRoom(r) {
  r.on('state', sendState);
  r.on('chat', (msg) => {
    overlayWin?.webContents.send('chat', msg);
    chatWin?.webContents.send('chat', msg);
  });
  r.on('move', (msg) => overlayWin?.webContents.send('move', msg));
  r.on('reconnecting', (n) => toast(`与房主断开，正在重连（${n}/3）…`));
  r.on('reconnected', () => toast('已重新连上'));
  r.on('closed', ({ reason }) => {
    if (room !== r) return;
    leaveRoom();
    toast(reason || '已离开房间');
  });
}

function showOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.showInactive();
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.webContents.send('relayout');
  overlayWin.webContents.send('overlay:reset');
}

function hideOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  overlayWin.webContents.send('overlay:reset');
  overlayWin.setIgnoreMouseEvents(true, { forward: true });
  overlayWin.hide();
}

function collapseChat(collapsed) {
  if (!chatWin || chatWin.isDestroyed()) return;
  chatCollapsed = collapsed;
  const b = chatWin.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  if (collapsed) {
    const size = 56;
    const x = Math.max(area.x, Math.min(b.x + b.width - size, area.x + area.width - size));
    const y = Math.max(area.y, Math.min(b.y + b.height - size, area.y + area.height - size));
    chatWin.setBounds({ x, y, width: size, height: size });
    hideOverlay();
  } else {
    const width = 480;
    const height = 64;
    const x = Math.max(area.x, Math.min(b.x + b.width - width, area.x + area.width - width));
    const y = Math.max(area.y, Math.min(b.y + b.height - height, area.y + area.height - height));
    chatWin.setBounds({ x, y, width, height });
    if (room) showOverlay();
  }
}

function focusChat() {
  if (!chatWin || chatWin.isDestroyed() || !room) return;
  collapseChat(false);
  chatWin.show();
  chatWin.focus();
  chatWin.webContents.send('focus-input');
}

function enterRoom() {
  chatCollapsed = false;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setBounds(area);
  }
  if (chatWin && !chatWin.isDestroyed()) {
    const width = 480;
    const height = 64;
    chatWin.setBounds({
      x: Math.round(area.x + (area.width - width) / 2),
      y: Math.round(area.y + area.height - height - 56),
      width,
      height
    });
    chatWin.show();
    chatWin.focus();
    chatWin.webContents.send('focus-input');
  }
  if (overlayWin) showOverlay();
  if (setupWin) setupWin.hide();
  sendState();
}

function leaveRoom(opts = {}) {
  const r = room;
  room = null;
  roomMode = null;
  if (announce) {
    announce.stop();
    announce = null;
  }
  if (r) {
    r.removeAllListeners();
    try { r.stop(); } catch { /* ignore */ }
  }
  if (opts.keepWindows) return;
  hideOverlay();
  if (chatWin && !chatWin.isDestroyed()) chatWin.hide();
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.show();
    setupWin.focus();
  }
  sendState();
}

function testTcp(ip, port) {
  return new Promise((resolve) => {
    const sock = net.connect({ host: ip, port });
    let done = false;
    const finish = (ok, error) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve({ ok, error });
    };
    sock.setTimeout(3000);
    sock.on('connect', () => finish(true));
    sock.on('timeout', () => finish(false, '超时'));
    sock.on('error', (err) => finish(false, err.code || err.message));
  });
}

function registerIpc() {
  ipcMain.handle('config:get', () => ({
    name: config.name || '',
    avatar: config.avatar || 'dog',
    lastIp: config.lastIp || '',
    lastPort: config.lastPort || BASE_PORT
  }));

  ipcMain.handle('config:set', (_e, patch) => {
    if (patch && typeof patch === 'object') {
      const clean = {};
      if (typeof patch.name === 'string') clean.name = patch.name.slice(0, 12);
      if (typeof patch.avatar === 'string') clean.avatar = patch.avatar;
      if (typeof patch.lastIp === 'string') clean.lastIp = patch.lastIp;
      if (Number.isFinite(patch.lastPort)) clean.lastPort = patch.lastPort;
      saveConfig(clean);
    }
    return true;
  });

  ipcMain.handle('net:listRooms', () => scanRooms(3200));

  ipcMain.handle('net:localIPs', () => localIPs());

  ipcMain.handle('net:host', async (_e, payload) => {
    try {
      leaveRoom({ keepWindows: true });
      const r = new HostRoom({
        name: payload?.name,
        avatar: payload?.avatar,
        code: payload?.code
      });
      await r.start();
      room = r;
      roomMode = 'host';
      announce = startAnnounce(() => ({
        name: r.roomName,
        port: r.port,
        players: r.players.length,
        capacity: MAX_PLAYERS
      }));
      wireRoom(r);
      saveConfig({ name: r.selfPlayer.name, avatar: r.selfPlayer.avatar });
      enterRoom();
      return { ok: true, state: buildState() };
    } catch (err) {
      if (room) leaveRoom({ keepWindows: true });
      return { ok: false, error: '开房间失败：' + (err?.message || '端口无法监听') };
    }
  });

  ipcMain.handle('net:join', async (_e, payload) => {
    try {
      leaveRoom({ keepWindows: true });
      const r = new ClientRoom({
        ip: payload?.ip,
        port: payload?.port,
        code: payload?.code,
        name: payload?.name,
        avatar: payload?.avatar
      });
      await r.connect();
      room = r;
      roomMode = 'client';
      wireRoom(r);
      saveConfig({ name: r.name, avatar: r.avatar, lastIp: r.ip, lastPort: r.port });
      enterRoom();
      return { ok: true, state: buildState() };
    } catch (err) {
      if (room) leaveRoom({ keepWindows: true });
      return { ok: false, error: err?.message || '加入失败' };
    }
  });

  ipcMain.handle('net:leave', () => {
    leaveRoom();
    return true;
  });

  ipcMain.handle('net:kick', (_e, id) => {
    if (roomMode === 'host' && room && typeof id === 'string') room.kick(id);
    return true;
  });

  ipcMain.handle('chat:send', (_e, text) => {
    room?.sendChat(text);
    return true;
  });

  ipcMain.handle('pet:move', (_e, pos) => {
    room?.move(pos?.x, pos?.y, pos?.id);
    return true;
  });

  ipcMain.handle('chat:collapse', (_e, collapsed) => {
    collapseChat(Boolean(collapsed));
    return true;
  });

  ipcMain.handle('state:get', () => buildState());

  ipcMain.handle('ui:showSetup', () => {
    if (setupWin && !setupWin.isDestroyed()) {
      setupWin.show();
      setupWin.focus();
    }
    return true;
  });

  ipcMain.handle('ui:hideSetup', () => {
    if (room && setupWin && !setupWin.isDestroyed()) setupWin.hide();
    return true;
  });

  ipcMain.handle('ui:focusChat', () => {
    focusChat();
    return true;
  });

  ipcMain.handle('overlay:interactive', (_e, on) => {
    if (overlayWin && !overlayWin.isDestroyed()) {
      overlayWin.setIgnoreMouseEvents(!on, { forward: true });
    }
    return true;
  });

  ipcMain.handle('clipboard:write', (_e, text) => {
    clipboard.writeText(String(text ?? ''));
    return true;
  });

  ipcMain.handle('diag:run', async () => {
    const rooms = await scanRooms(3200);
    return { ips: localIPs(), rooms, discoveryPort: 47802 };
  });

  ipcMain.handle('diag:port', async (_e, ip, port) => {
    if (typeof ip !== 'string' || !ip.trim()) return { ok: false, error: '请输入 IP' };
    return testTcp(ip.trim(), Number(port) || BASE_PORT);
  });
}

function registerGlobalShortcut() {
  try {
    globalShortcut.register('Control+Alt+Space', () => {
      focusChat();
    });
  } catch { /* ignore */ }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (setupWin && !setupWin.isDestroyed()) {
    setupWin.show();
    setupWin.focus();
  }
});

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  Menu.setApplicationMenu(null);
  config = loadConfig();
  registerIpc();
  createSetupWindow();
  createOverlayWindow();
  createChatWindow();
  registerGlobalShortcut();

  screen.on('display-metrics-changed', () => {
    if (!overlayWin || overlayWin.isDestroyed()) return;
    const area = screen.getPrimaryDisplay().workArea;
    overlayWin.setBounds(area);
    overlayWin.webContents.send('relayout');
    sendState();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createSetupWindow();
  });
});

app.on('before-quit', () => {
  quitting = true;
  leaveRoom({ keepWindows: true });
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (!quitting) app.quit();
});
