'use strict';

const EventEmitter = require('node:events');
const crypto = require('node:crypto');
const os = require('node:os');
const { WebSocketServer, WebSocket } = require('ws');
const Sprites = require('../shared/sprites');
const Emotes = require('../shared/emotes');

const BASE_PORT = 47800;
const PORT_TRIES = 20;
const MAX_PLAYERS = 8;
const MAX_TEXT = 200;
const MAX_FRAME = 16 * 1024;
const RATE_WINDOW = 5000;
const RATE_MAX = 8;
const EMOTE_RATE_MAX = 12;
const DEFAULT_Y = 0.84;

const AVATAR_IDS = new Set(Sprites.list.map((s) => s.id));
const EMOTE_IDS = new Set(Emotes.ids);

function localIPs() {
  const out = [];
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      if (i.address.startsWith('169.254.')) continue;
      out.push({ iface, address: i.address });
    }
  }
  return out;
}

function primaryIP() {
  const ips = localIPs();
  return ips.length ? ips[0].address : '127.0.0.1';
}

function sanitizeName(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 12);
}

function sanitizeText(v) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
}

function sanitizeCode(v) {
  const s = String(v == null ? '' : v).trim();
  return /^\d{4}$/.test(s) ? s : null;
}

function sanitizeAvatar(v) {
  return AVATAR_IDS.has(v) ? v : 'dog';
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(1, Math.max(0, n));
}

function safeJson(buf) {
  try {
    const v = JSON.parse(buf.toString());
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

class HostRoom extends EventEmitter {
  constructor({ name, avatar, code }) {
    super();
    this.code = sanitizeCode(code) || '0000';
    this.selfId = 'p' + crypto.randomBytes(3).toString('hex');
    this.selfPlayer = { id: this.selfId, name: sanitizeName(name) || '房主', avatar: sanitizeAvatar(avatar), x: 0.5, y: DEFAULT_Y };
    this.players = [this.selfPlayer];
    this.roomName = `${this.selfPlayer.name} 的房间`;
    this.clients = new Map();
    this.port = null;
    this.wss = null;
    this.stopped = false;
    this.heartbeat = null;
  }

  async start() {
    let lastErr = null;
    for (let port = BASE_PORT; port < BASE_PORT + PORT_TRIES; port++) {
      try {
        await this._listen(port);
        this.port = port;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!this.port) throw lastErr || new Error('无法监听端口');
    this.heartbeat = setInterval(() => this._sweep(), 10000);
    this.heartbeat.unref?.();
  }

  _listen(port) {
    return new Promise((resolve, reject) => {
      const wss = new WebSocketServer({ port, host: '0.0.0.0', maxPayload: MAX_FRAME });
      const onError = (err) => {
        wss.removeListener('listening', onListening);
        try { wss.close(); } catch { /* ignore */ }
        reject(err);
      };
      const onListening = () => {
        wss.removeListener('error', onError);
        wss.on('error', () => {});
        wss.on('connection', (ws) => this._onConnection(ws));
        this.wss = wss;
        resolve();
      };
      wss.once('error', onError);
      wss.once('listening', onListening);
    });
  }

  info() {
    return {
      name: this.roomName,
      code: this.code,
      ip: primaryIP(),
      ips: localIPs(),
      port: this.port,
      capacity: MAX_PLAYERS
    };
  }

  _defaultX() {
    const xs = this.players.map((p) => p.x).sort((a, b) => a - b);
    const bounds = [0.08, ...xs, 0.92];
    let best = 0.5;
    let bestGap = -1;
    for (let i = 0; i < bounds.length - 1; i++) {
      const gap = bounds[i + 1] - bounds[i];
      if (gap > bestGap) {
        bestGap = gap;
        best = (bounds[i] + bounds[i + 1]) / 2;
      }
    }
    return Math.min(0.92, Math.max(0.08, best));
  }

  _send(ws, obj) {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify(obj)); } catch { /* ignore */ }
    }
  }

  _broadcast(obj, exceptId) {
    const data = JSON.stringify(obj);
    for (const [id, c] of this.clients) {
      if (id === exceptId) continue;
      if (c.ws.readyState === WebSocket.OPEN) {
        try { c.ws.send(data); } catch { /* ignore */ }
      }
    }
  }

  _rateOk(id) {
    const c = this.clients.get(id);
    if (!c) return false;
    const now = Date.now();
    c.times = c.times.filter((t) => now - t < RATE_WINDOW);
    if (c.times.length >= RATE_MAX) return false;
    c.times.push(now);
    return true;
  }

  _emoteRateOk(id) {
    const c = this.clients.get(id);
    if (!c) return false;
    const now = Date.now();
    c.emoteTimes = c.emoteTimes.filter((t) => now - t < RATE_WINDOW);
    if (c.emoteTimes.length >= EMOTE_RATE_MAX) return false;
    c.emoteTimes.push(now);
    return true;
  }

  _onConnection(ws) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    let joined = false;
    let player = null;
    const joinTimer = setTimeout(() => { if (!joined) ws.close(); }, 6000);

    ws.on('message', (buf) => {
      if (buf.length > MAX_FRAME) return;
      const msg = safeJson(buf);
      if (!msg) return;

      if (!joined) {
        if (msg.t !== 'join') return;
        clearTimeout(joinTimer);
        if (String(msg.code) !== this.code) {
          this._send(ws, { t: 'denied', reason: '房间码不对' });
          setTimeout(() => ws.close(), 50);
          return;
        }
        if (this.players.length >= MAX_PLAYERS) {
          this._send(ws, { t: 'denied', reason: `房间满了（最多 ${MAX_PLAYERS} 人）` });
          setTimeout(() => ws.close(), 50);
          return;
        }
        const id = 'p' + crypto.randomBytes(3).toString('hex');
        const name = sanitizeName(msg.name) || '匿名';
        player = { id, name, avatar: sanitizeAvatar(msg.avatar), x: this._defaultX(), y: DEFAULT_Y };
        this.players.push(player);
        this.clients.set(id, { ws, times: [], emoteTimes: [] });
        joined = true;
        this._send(ws, {
          t: 'welcome',
          selfId: id,
          players: this.players,
          room: { name: this.roomName, code: this.code, ip: primaryIP(), port: this.port, capacity: MAX_PLAYERS }
        });
        this._broadcast({ t: 'players', players: this.players });
        this.emit('state');
        return;
      }

      if (msg.t === 'chat') {
        if (!this._rateOk(player.id)) return;
        const text = sanitizeText(msg.text);
        if (!text) return;
        const out = { t: 'chat', id: player.id, name: player.name, avatar: player.avatar, text, ts: Date.now() };
        this._broadcast(out);
        this.emit('chat', out);
      } else if (msg.t === 'emote') {
        if (!EMOTE_IDS.has(msg.emote)) return;
        if (!this._emoteRateOk(player.id)) return;
        const out = { t: 'emote', id: player.id, emote: msg.emote, ts: Date.now() };
        this._broadcast(out);
        this.emit('emote', out);
      } else if (msg.t === 'move') {
        const x = clamp01(msg.x);
        const y = clamp01(msg.y);
        if (x === null || y === null) return;
        const target = typeof msg.id === 'string' ? this.players.find((p) => p.id === msg.id) : player;
        if (!target) return;
        target.x = x;
        target.y = y;
        this._broadcast({ t: 'move', id: target.id, x, y });
        this.emit('move', { id: target.id, x, y });
      }
    });

    ws.on('close', () => {
      clearTimeout(joinTimer);
      if (!joined || !player) return;
      this.clients.delete(player.id);
      this.players = this.players.filter((p) => p.id !== player.id);
      this._broadcast({ t: 'players', players: this.players });
      this.emit('state');
    });

    ws.on('error', () => {});
  }

  _sweep() {
    for (const [id, c] of this.clients) {
      if (!c.ws.isAlive) {
        try { c.ws.terminate(); } catch { /* ignore */ }
        continue;
      }
      c.ws.isAlive = false;
      try { c.ws.ping(); } catch { /* ignore */ }
    }
  }

  sendChat(text) {
    if (this.stopped) return;
    const t = sanitizeText(text);
    if (!t) return;
    const out = { t: 'chat', id: this.selfId, name: this.selfPlayer.name, avatar: this.selfPlayer.avatar, text: t, ts: Date.now() };
    this._broadcast(out);
    this.emit('chat', out);
  }

  sendEmote(emote) {
    if (this.stopped || !EMOTE_IDS.has(emote)) return;
    const out = { t: 'emote', id: this.selfId, emote, ts: Date.now() };
    this._broadcast(out);
    this.emit('emote', out);
  }

  move(x, y, targetId) {
    if (this.stopped) return;
    const nx = clamp01(x);
    const ny = clamp01(y);
    if (nx === null || ny === null) return;
    const target = targetId ? this.players.find((p) => p.id === targetId) : this.selfPlayer;
    if (!target) return;
    target.x = nx;
    target.y = ny;
    this._broadcast({ t: 'move', id: target.id, x: nx, y: ny });
    this.emit('move', { id: target.id, x: nx, y: ny });
  }

  kick(id) {
    const c = this.clients.get(id);
    if (!c) return;
    this._send(c.ws, { t: 'kicked' });
    setTimeout(() => { try { c.ws.close(); } catch { /* ignore */ } }, 50);
    this.clients.delete(id);
    this.players = this.players.filter((p) => p.id !== id);
    this._broadcast({ t: 'players', players: this.players });
    this.emit('state');
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearInterval(this.heartbeat);
    for (const c of this.clients.values()) {
      try {
        if (c.ws.readyState === WebSocket.OPEN) {
          c.ws.send(JSON.stringify({ t: 'closed', reason: '房主关闭了房间' }));
        }
        c.ws.close();
      } catch { /* ignore */ }
    }
    this.clients.clear();
    try { this.wss?.close(); } catch { /* ignore */ }
  }
}

class ClientRoom extends EventEmitter {
  constructor({ ip, port, code, name, avatar }) {
    super();
    this.ip = String(ip || '').trim();
    this.port = Number(port) || BASE_PORT;
    this.code = sanitizeCode(code) || '';
    this.name = sanitizeName(name) || '匿名';
    this.avatar = sanitizeAvatar(avatar);
    this.ws = null;
    this.selfId = null;
    this.players = [];
    this.roomInfo = null;
    this.stopped = false;
    this.connected = false;
    this.retries = 0;
    this.retryTimer = null;
  }

  async connect() {
    const welcome = await this._open();
    this.connected = true;
    this.retries = 0;
    return welcome;
  }

  _open() {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(`ws://${this.ip}:${this.port}`, { maxPayload: MAX_FRAME });
      } catch (err) {
        reject(new Error('地址无效：' + err.message));
        return;
      }
      this.ws = ws;
      let settled = false;
      let timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.terminate(); } catch { /* ignore */ }
        reject(new Error('连接超时，检查 IP、端口和防火墙'));
      }, 6000);

      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      };

      ws.on('open', () => {
        try {
          ws.send(JSON.stringify({ t: 'join', code: this.code, name: this.name, avatar: this.avatar }));
        } catch { /* ignore */ }
      });

      ws.on('message', (buf) => {
        if (buf.length > MAX_FRAME) return;
        const msg = safeJson(buf);
        if (!msg) return;
        if (!settled) {
          if (msg.t === 'welcome') {
            settled = true;
            clearTimeout(timer);
            this.selfId = msg.selfId;
            this.players = Array.isArray(msg.players) ? msg.players : [];
            this.roomInfo = msg.room || {};
            resolve(msg);
          } else if (msg.t === 'denied') {
            settled = true;
            clearTimeout(timer);
            try { ws.close(); } catch { /* ignore */ }
            reject(new Error(msg.reason || '被拒绝加入'));
          }
          return;
        }
        this._handle(msg);
      });

      ws.on('close', () => {
        if (!settled) {
          fail(new Error('连接不上，检查 IP、端口和防火墙'));
          return;
        }
        this._onClose();
      });

      ws.on('error', (err) => {
        if (!settled) fail(new Error('连接失败：' + (err.message || '网络错误')));
      });
    });
  }

  _handle(msg) {
    if (msg.t === 'players') {
      if (Array.isArray(msg.players)) {
        this.players = msg.players;
        this.emit('state');
      }
    } else if (msg.t === 'chat') {
      this.emit('chat', msg);
    } else if (msg.t === 'emote') {
      if (typeof msg.id !== 'string' || !EMOTE_IDS.has(msg.emote)) return;
      this.emit('emote', msg);
    } else if (msg.t === 'move') {
      const x = clamp01(msg.x);
      const y = clamp01(msg.y);
      if (x === null || y === null) return;
      const p = this.players.find((it) => it.id === msg.id);
      if (p) { p.x = x; p.y = y; }
      this.emit('move', { id: msg.id, x, y });
    } else if (msg.t === 'kicked') {
      this.stopped = true;
      this.emit('closed', { reason: '你被房主移出了房间' });
    } else if (msg.t === 'closed') {
      this.stopped = true;
      this.emit('closed', { reason: msg.reason || '房主关闭了房间' });
    }
  }

  _onClose() {
    if (this.stopped) return;
    if (!this.connected) return;
    if (this.retries >= 3) {
      this.stopped = true;
      this.emit('closed', { reason: '与房主断开了连接' });
      return;
    }
    this.retries++;
    this.emit('reconnecting', this.retries);
    this.retryTimer = setTimeout(() => {
      if (this.stopped) return;
      this._open()
        .then((welcome) => {
          this.selfId = welcome.selfId;
          this.players = welcome.players;
          this.roomInfo = welcome.room;
          this.retries = 0;
          this.emit('state');
          this.emit('reconnected');
        })
        .catch(() => this._onClose());
    }, 2000);
  }

  sendChat(text) {
    if (this.stopped || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const t = sanitizeText(text);
    if (!t) return;
    try { this.ws.send(JSON.stringify({ t: 'chat', text: t })); } catch { /* ignore */ }
  }

  sendEmote(emote) {
    if (this.stopped || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (!EMOTE_IDS.has(emote)) return;
    try { this.ws.send(JSON.stringify({ t: 'emote', emote })); } catch { /* ignore */ }
  }

  move(x, y, targetId) {
    if (this.stopped || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const nx = clamp01(x);
    const ny = clamp01(y);
    if (nx === null || ny === null) return;
    const payload = { t: 'move', x: nx, y: ny };
    if (targetId) payload.id = targetId;
    try { this.ws.send(JSON.stringify(payload)); } catch { /* ignore */ }
  }

  info() {
    return {
      name: this.roomInfo?.name || '房间',
      code: this.code,
      ip: this.ip,
      ips: [{ iface: 'remote', address: this.ip }],
      port: this.port,
      capacity: this.roomInfo?.capacity || MAX_PLAYERS
    };
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    clearTimeout(this.retryTimer);
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }
}

module.exports = {
  HostRoom,
  ClientRoom,
  localIPs,
  primaryIP,
  sanitizeName,
  sanitizeText,
  sanitizeCode,
  sanitizeAvatar,
  BASE_PORT,
  MAX_PLAYERS
};
