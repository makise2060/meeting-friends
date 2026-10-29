'use strict';

const fs = require('node:fs');
const path = require('node:path');

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

const version = process.argv[2];
if (!version || version.startsWith('--')) {
  console.error('usage: node tools/release-notes.js <version> [--notes-out file] [--title-out file]');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const changelogPath = path.join(root, 'CHANGELOG.md');
const lines = fs.readFileSync(changelogPath, 'utf8').replace(/\r\n/g, '\n').split('\n');

const escaped = version.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const headerRe = new RegExp(`^## \\[${escaped}\\] - (\\d{4}-\\d{2}-\\d{2})(?: · (.+))?$`);

let start = -1;
let theme = '';
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(headerRe);
  if (m) {
    start = i;
    theme = (m[2] || '').trim();
    break;
  }
}

if (start < 0) {
  console.error(`CHANGELOG.md 缺少版本段落：## [${version}] - YYYY-MM-DD · 主题`);
  process.exit(1);
}

let end = lines.length;
for (let i = start + 1; i < lines.length; i++) {
  if (/^## \[/.test(lines[i]) || /^\[[^\]]+\]:\s/.test(lines[i])) {
    end = i;
    break;
  }
}

const body = lines.slice(start + 1, end).join('\n').trim();
if (!body) {
  console.error(`CHANGELOG.md 中 ${version} 的段落为空`);
  process.exit(1);
}

const title = theme ? `v${version} · ${theme}` : `v${version}`;
const notesOut = argValue('--notes-out') || path.join(root, 'dist', 'release-notes.md');
const titleOut = argValue('--title-out') || path.join(root, 'dist', 'release-title.txt');

fs.mkdirSync(path.dirname(notesOut), { recursive: true });
fs.writeFileSync(notesOut, body + '\n');
fs.mkdirSync(path.dirname(titleOut), { recursive: true });
fs.writeFileSync(titleOut, title + '\n');

console.log(`title: ${title}`);
console.log(`notes: ${notesOut}`);
