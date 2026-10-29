'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const Sprites = require('../src/shared/sprites');

const W = 512;
const H = 512;
const RADIUS = 96;
const SCALE = 24;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

function hex(color) {
  const s = color.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), 255];
}

function inRoundRect(x, y) {
  const dx = Math.max(RADIUS - x, 0, x - (W - 1 - RADIUS));
  const dy = Math.max(RADIUS - y, 0, y - (H - 1 - RADIUS));
  return dx * dx + dy * dy <= RADIUS * RADIUS;
}

const rgba = Buffer.alloc(W * H * 4);

function setPixel(x, y, color) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  rgba[i] = color[0];
  rgba[i + 1] = color[1];
  rgba[i + 2] = color[2];
  rgba[i + 3] = color[3];
}

const bg = hex('#f8c657');
const bgShade = hex('#e0a126');

function mixColor(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
    255
  ];
}

for (let y = 0; y < H; y++) {
  const color = mixColor(bg, bgShade, y / (H - 1));
  for (let x = 0; x < W; x++) {
    if (!inRoundRect(x, y)) continue;
    setPixel(x, y, color);
  }
}

const sprite = Sprites.byId.mouse;
const offX = Math.floor((W - 16 * SCALE) / 2);
const offY = 88;

for (let sy = 0; sy < 16; sy++) {
  const row = sprite.rows[sy];
  for (let sx = 0; sx < 16; sx++) {
    const ch = row[sx];
    if (ch === '.') continue;
    const color = hex(sprite.palette[ch]);
    for (let dy = 0; dy < SCALE; dy++) {
      for (let dx = 0; dx < SCALE; dx++) {
        const x = offX + sx * SCALE + dx;
        const y = offY + sy * SCALE + dy;
        if (inRoundRect(x, y)) setPixel(x, y, color);
      }
    }
  }
}

const outDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, 'icon.png');
fs.writeFileSync(out, encodePng(W, H, rgba));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
