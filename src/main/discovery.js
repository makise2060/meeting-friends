'use strict';

const dgram = require('node:dgram');
const os = require('node:os');

const DISCOVERY_PORT = 47802;
const TAG = 'friends-meet/1';
const ANNOUNCE_INTERVAL = 1500;

function calcBroadcast(address, netmask) {
  const a = address.split('.').map(Number);
  const m = netmask.split('.').map(Number);
  if (a.length !== 4 || m.length !== 4 || a.some(Number.isNaN) || m.some(Number.isNaN)) return null;
  return a.map((v, i) => (v & m[i]) | (~m[i] & 255)).join('.');
}

function broadcastTargets() {
  const out = new Set(['255.255.255.255']);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' || i.internal) continue;
      const b = calcBroadcast(i.address, i.netmask);
      if (b) out.add(b);
    }
  }
  return [...out];
}

function scanRooms(timeout = 3500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    const rooms = new Map();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      try { sock.close(); } catch { /* ignore */ }
      resolve([...rooms.values()]);
    };
    const timer = setTimeout(finish, timeout);

    sock.on('message', (buf, rinfo) => {
      if (buf.length > 4096) return;
      let msg;
      try { msg = JSON.parse(buf.toString()); } catch { return; }
      if (!msg || msg.tag !== TAG || msg.t !== 'room') return;
      const port = Number(msg.port);
      if (!port) return;
      const key = `${rinfo.address}:${port}`;
      rooms.set(key, {
        name: String(msg.name || '房间').slice(0, 40),
        ip: rinfo.address,
        port,
        players: Number(msg.players) || 0,
        capacity: Number(msg.capacity) || 8
      });
    });
    sock.on('error', finish);
    try {
      sock.bind(DISCOVERY_PORT, () => {
        try { sock.setBroadcast(true); } catch { /* ignore */ }
      });
    } catch {
      clearTimeout(timer);
      finish();
    }
  });
}

function startAnnounce(getInfo) {
  const sock = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  let timer = null;
  let stopped = false;

  sock.on('error', () => {});
  sock.bind(() => {
    if (stopped) return;
    try { sock.setBroadcast(true); } catch { /* ignore */ }
    const tick = () => {
      const info = getInfo();
      if (!info) return;
      const payload = Buffer.from(JSON.stringify({
        tag: TAG,
        t: 'room',
        name: info.name,
        port: info.port,
        players: info.players,
        capacity: info.capacity
      }));
      for (const addr of broadcastTargets()) {
        try { sock.send(payload, 0, payload.length, DISCOVERY_PORT, addr); } catch { /* ignore */ }
      }
    };
    tick();
    timer = setInterval(tick, ANNOUNCE_INTERVAL);
  });

  return {
    stop() {
      stopped = true;
      clearInterval(timer);
      try { sock.close(); } catch { /* ignore */ }
    }
  };
}

module.exports = { scanRooms, startAnnounce, DISCOVERY_PORT };
