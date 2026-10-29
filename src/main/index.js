'use strict';

const { app, BrowserWindow, ipcMain, screen, clipboard, globalShortcut, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const { HostRoom, ClientRoom, localIPs, MAX_PLAYERS, BASE_PORT } = require('./net');
const { scanRooms, startAnnounce } = require('./discovery');

const CHAT = { w: 480, h: 64, mini: 56, panelExtra: 248 };
const PET = { SIZE: 96, HIT: 6, TOP: 64, NAME: 26 };
const IS_LINUX = process.platform === 'linux';
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

let setupWin = null;
let overlayWin = null;
let chatWin = null;
let room = null;
let roomMode = null;
let announce = null;
let quitting = false;
let chatCollapsed = false;
let chatPanelOpen = false;
let overlayInteractive = false;
let overlayDragging = false;
let overlayPollTimer = null;
let overlayPollUnavailable = false;
let config = {};

const CONFIG_PATH = () => path.join(app.getPath('userData'), 'config.json');
const DEBUG_LOG_PATH = () => path.join(app.getPath('userData'), 'overlay-debug.log');

function debugLog(tag, data) {
  try {
    fs.appendFileSync(DEBUG_LOG_PATH(), `${new Date().toISOString()} ${tag} ${data === undefined ? '' : JSON.stringify(data)}\n`);
  } catch { /* ignore */ }
}

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
  overlayWin.setIgnoreMouseEvents(true, IS_LINUX ? undefined : { forward: true });
  overlayWin.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'index.html'));
  overlayWin.webContents.on('did-finish-load', () => {
    setOverlayInteractive(false, true);
    sendState();
  });
  overlayWin.on('closed', () => {
    overlayWin = null;
    stopOverlayPolling();
  });
}

function createChatWindow() {
  const area = screen.getPrimaryDisplay().workArea;
  const width = CHAT.w;
  const height = CHAT.h;
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
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      x: p.x,
      y: p.y,
      held: Boolean(p.holder)
    })),
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
  r.on('positions', (msg) => overlayWin?.webContents.send('positions', msg));
  r.on('bump', (msg) => overlayWin?.webContents.send('bump', msg));
  r.on('emote', (msg) => overlayWin?.webContents.send('emote', msg));
  r.on('reconnecting', (n) => toast(`与房主断开，正在重连（${n}/3）…`));
  r.on('reconnected', () => toast('已重新连上'));
  r.on('closed', ({ reason }) => {
    if (room !== r) return;
    leaveRoom();
    toast(reason || '已离开房间');
  });
}

function setOverlayInteractive(on, force = false, source = '?') {
  const next = Boolean(on);
  if (!force && next === overlayInteractive) return;
  overlayInteractive = next;
  debugLog('interactive', {
    next,
    source,
    visible: overlayWin ? overlayWin.isVisible() : null,
    onTop: overlayWin ? overlayWin.isAlwaysOnTop() : null
  });
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setIgnoreMouseEvents(!next, IS_LINUX ? undefined : { forward: true });
  }
}

function pollOverlayHit() {
  if (overlayDragging) return;
  if (!overlayWin || overlayWin.isDestroyed() || !overlayWin.isVisible() || !room) {
    setOverlayInteractive(false, false, 'poll-idle');
    return;
  }
  let point;
  try {
    point = screen.getCursorScreenPoint();
  } catch {
    return;
  }
  const b = overlayWin.getBounds();
  const half = PET.SIZE / 2;
  const radius = half + PET.HIT;
  const x = point.x - b.x;
  const y = point.y - b.y;
  const hit = room.players.some((p) => {
    const cx = clamp(p.x * b.width, half, b.width - half);
    const cy = clamp(p.y * b.height, PET.TOP + half, b.height - PET.NAME - half);
    return Math.abs(x - cx) <= radius && Math.abs(y - cy) <= radius;
  });
  setOverlayInteractive(hit, false, 'poll');
}

function startOverlayPolling() {
  if (overlayPollTimer || overlayPollUnavailable) return;
  if (IS_LINUX && process.env.XDG_SESSION_TYPE === 'wayland' && app.commandLine.getSwitchValue('ozone-platform') !== 'x11') {
    overlayPollUnavailable = true;
    console.warn('[overlay] Wayland 会话下禁用鼠标悬停兜底，建议使用 X11 会话');
    return;
  }
  overlayPollTimer = setInterval(pollOverlayHit, 50);
  overlayPollTimer.unref?.();
}

function stopOverlayPolling() {
  clearInterval(overlayPollTimer);
  overlayPollTimer = null;
  overlayDragging = false;
}

function showOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  debugLog('show', { visible: overlayWin.isVisible(), bounds: overlayWin.getBounds() });
  overlayWin.showInactive();
  overlayWin.setAlwaysOnTop(true, 'screen-saver');
  if (typeof overlayWin.moveTop === 'function') overlayWin.moveTop();
  setOverlayInteractive(false, true, 'show');
  overlayWin.webContents.send('relayout');
  overlayWin.webContents.send('overlay:reset');
  startOverlayPolling();
  debugLog('show-done', { visible: overlayWin.isVisible(), onTop: overlayWin.isAlwaysOnTop() });
}

function hideOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) return;
  debugLog('hide', {});
  stopOverlayPolling();
  overlayWin.webContents.send('overlay:reset');
  setOverlayInteractive(false, true, 'hide');
  overlayWin.hide();
}

function layoutChat() {
  if (!chatWin || chatWin.isDestroyed()) return;
  const b = chatWin.getBounds();
  const area = screen.getDisplayMatching(b).workArea;
  const width = chatCollapsed ? CHAT.mini : CHAT.w;
  const height = chatCollapsed ? CHAT.mini : (chatPanelOpen ? CHAT.h + CHAT.panelExtra : CHAT.h);
  const x = clamp(b.x + b.width - width, area.x, area.x + area.width - width);
  const bottom = b.y + b.height;
  const y = clamp(bottom - height, area.y, area.y + area.height - height);
  chatWin.setBounds({ x, y, width, height });
}

function sendPanelState() {
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.webContents.send('panel-state', { open: chatPanelOpen });
  }
}

function setChatPanel(open) {
  const next = Boolean(open) && Boolean(room) && !chatCollapsed;
  if (chatPanelOpen !== next) {
    chatPanelOpen = next;
    layoutChat();
  }
  sendPanelState();
  return next;
}

function collapseChat(collapsed) {
  if (!chatWin || chatWin.isDestroyed()) return;
  chatCollapsed = collapsed;
  if (collapsed) chatPanelOpen = false;
  layoutChat();
  sendPanelState();
  if (collapsed) {
    hideOverlay();
  } else if (room) {
    showOverlay();
  }
}

function focusChat() {
  if (!chatWin || chatWin.isDestroyed() || !room) return;
  chatCollapsed = false;
  chatPanelOpen = false;
  collapseChat(false);
  chatWin.show();
  chatWin.focus();
  chatWin.webContents.send('focus-input');
}

function enterRoom() {
  chatCollapsed = false;
  chatPanelOpen = false;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const area = display.workArea;
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.setBounds(area);
  }
  if (chatWin && !chatWin.isDestroyed()) {
    chatWin.setBounds({
      x: Math.round(area.x + (area.width - CHAT.w) / 2),
      y: Math.round(area.y + area.height - CHAT.h - 56),
      width: CHAT.w,
      height: CHAT.h
    });
    chatWin.show();
    chatWin.focus();
    chatWin.webContents.send('focus-input');
    sendPanelState();
  }
  if (overlayWin) showOverlay();
  if (setupWin) setupWin.hide();
  sendState();
}

function leaveRoom(opts = {}) {
  const r = room;
  room = null;
  roomMode = null;
  chatPanelOpen = false;
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
    version: app.getVersion(),
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

  ipcMain.handle('pet:grab', (_e, id) => {
    if (typeof id === 'string') room?.grab(id);
    return true;
  });

  ipcMain.handle('pet:release', (_e, payload) => {
    const id = payload && typeof payload.id === 'string' ? payload.id : null;
    if (!id) return true;
    if (Number.isFinite(payload.x) && Number.isFinite(payload.y)) {
      room?.move(payload.x, payload.y, id);
    }
    room?.release(id, payload.vx, payload.vy);
    return true;
  });

  ipcMain.handle('chat:collapse', (_e, collapsed) => {
    collapseChat(Boolean(collapsed));
    return true;
  });

  ipcMain.handle('chat:panel', (_e, open) => setChatPanel(Boolean(open)));

  ipcMain.handle('emote:send', (_e, emote) => {
    if (typeof emote === 'string') room?.sendEmote(emote);
    return true;
  });

  ipcMain.handle('state:get', () => buildState());

  ipcMain.handle('ui:showSetup', () => {
    setChatPanel(false);
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
    setOverlayInteractive(on, false, 'renderer');
    return true;
  });

  ipcMain.handle('overlay:dragging', (_e, on) => {
    overlayDragging = Boolean(on);
    debugLog('dragging', { on: overlayDragging });
    if (overlayDragging) setOverlayInteractive(true, true, 'drag');
    return true;
  });

  ipcMain.handle('overlay:debug', (_e, tag, data) => {
    debugLog('r:' + String(tag), data);
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
  if (IS_LINUX) app.setDesktopName('friends-meet.desktop');
  Menu.setApplicationMenu(null);
  config = loadConfig();
  try { fs.writeFileSync(DEBUG_LOG_PATH(), ''); } catch { /* ignore */ }
  debugLog('start', { version: app.getVersion(), platform: process.platform, e2e: !!process.env.FRIENDS_E2E });
  registerIpc();
  createSetupWindow();
  createOverlayWindow();
  createChatWindow();
  registerGlobalShortcut();

  screen.on('display-metrics-changed', () => {
    layoutChat();
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
  stopOverlayPolling();
  leaveRoom({ keepWindows: true });
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (!quitting) app.quit();
});
