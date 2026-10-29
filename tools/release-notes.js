'use strict';

const fs = require('node:fs');
const path = require('node:path');

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : null;
}

function fail(message) {
  console.error('release-notes: ' + message);
  process.exit(1);
}

const version = process.argv[2];
if (!version || version.startsWith('--')) {
  console.error('usage: node tools/release-notes.js <version> [--notes-out file] [--title-out file]');
  console.error('       [--repo owner/repo --tag vX.Y.Z --win-name file --win-sha sha256 --linux-name file --linux-sha sha256]');
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

const repo = argValue('--repo');
const tag = argValue('--tag');
const winName = argValue('--win-name');
const winSha = argValue('--win-sha');
const linuxName = argValue('--linux-name');
const linuxSha = argValue('--linux-sha');
const downloadArgs = [repo, tag, winName, winSha, linuxName, linuxSha];
const downloadFlags = ['--repo', '--tag', '--win-name', '--win-sha', '--linux-name', '--linux-sha'];
const hasDownloadArgs = downloadFlags.some((flag) => process.argv.includes(flag));

let notesBody = body;
if (hasDownloadArgs) {
  if (downloadArgs.some((v) => v == null)) {
    fail('--repo/--tag/--win-name/--win-sha/--linux-name/--linux-sha 必须全部提供');
  }
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) fail('非法 repo：' + repo);
  if (!/^v[0-9A-Za-z._-]+$/.test(tag)) fail('非法 tag：' + tag);
  for (const [label, value] of [['win-name', winName], ['linux-name', linuxName]]) {
    if (!/^[A-Za-z0-9._-]+$/.test(value)) fail(`非法 ${label}：${value}`);
  }
  for (const [label, value] of [['win-sha', winSha], ['linux-sha', linuxSha]]) {
    if (!/^[a-f0-9]{64}$/.test(value)) fail(`非法 ${label}：${value}`);
  }

  const base = `https://github.com/${repo}/releases/download/${tag}`;
  const shaBadge = '<img src="https://img.shields.io/badge/SHA256-verify-4CAF50?style=flat-square&labelColor=222222" alt="SHA-256">';
  notesBody = [
    '### ⬇️ Download / 下载链接',
    '',
    '<div align="left">',
    '',
    '| **OS/ 系统** | **Requirements / 版本要求** | **Direct Links / 点击直链下载** |',
    '|:---:|:---|:---|',
    `| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons/windows11/windows11-original.svg" alt="Windows" width="28"/> | Windows 10/11<br/>*(x64 · portable)* | <a href="${base}/${winName}"><img src="https://img.shields.io/badge/Portable-x64-0078D7?logo=windows&logoColor=white&style=flat-square&labelColor=222222" alt="Portable x64"></a> <a href="${base}/${winName}.sha256">${shaBadge}</a> |`,
    `| <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/linux/linux-original.svg" alt="Ubuntu" width="28"/> | Ubuntu 22.04+<br/>*(amd64 · X11 recommended)* | <a href="${base}/${linuxName}"><img src="https://img.shields.io/badge/DEB-amd64-A81D33?logo=debian&logoColor=white&style=flat-square&labelColor=222222" alt="DEB amd64"></a> <a href="${base}/${linuxName}.sha256">${shaBadge}</a> |`,
    '',
    '</div>',
    '',
    '> **Note / 提示**：Windows 为便携版，未签名；Ubuntu 建议 X11 会话，Wayland 下置顶、鼠标穿透与全局快捷键可能受限。',
    '',
    '### 📦 Install / 安装',
    '',
    '**Windows**：双击运行，无需安装；首次启动 SmartScreen 选择「更多信息 → 仍要运行」。',
    '',
    '**Ubuntu / Debian**：',
    '',
    '```bash',
    `sudo apt install ./${linuxName}`,
    '```',
    '',
    '从应用菜单「好友见面」或终端 `friends-meet` 启动；防火墙放行 TCP 47800–47819 与 UDP 47802。',
    '',
    '<details>',
    '<summary>SHA-256 / 校验值</summary>',
    '',
    '| File | SHA-256 |',
    '| --- | --- |',
    `| \`${winName}\` | \`${winSha}\` |`,
    `| \`${linuxName}\` | \`${linuxSha}\` |`,
    '',
    '</details>',
    '',
    '## 更新内容 / Changes',
    '',
    body
  ].join('\n');
}

const title = theme ? `v${version} · ${theme}` : `v${version}`;
const notesOut = argValue('--notes-out') || path.join(root, 'dist', 'release-notes.md');
const titleOut = argValue('--title-out') || path.join(root, 'dist', 'release-title.txt');

fs.mkdirSync(path.dirname(notesOut), { recursive: true });
fs.writeFileSync(notesOut, notesBody + '\n');
fs.mkdirSync(path.dirname(titleOut), { recursive: true });
fs.writeFileSync(titleOut, title + '\n');

console.log(`title: ${title}`);
console.log(`notes: ${notesOut}`);
