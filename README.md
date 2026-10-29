# 好友见面（friends-meet）

局域网桌面宠物聊天：同一局域网内开房间，朋友的像素桌宠会跑到你的桌面上，配一条随处可呼出的聊天条。无账号、无服务器、无公网依赖。

## 功能

- **附近房间**：UDP 广播自动发现局域网的房间，也可手动填 IP / 端口 / 4 位房间码加入
- **开房间**：房主即为服务端，最多 8 人，可移出成员；房主关闭软件房间即结束
- **桌面宠物层**：透明置顶覆盖层，像素小人（狗 / 猫 / 兔等）在桌面上移动、带名字和聊天气泡
- **表情互动**：内置 58 个猛兽派对表情，聊天条按分类选择；桌宠上方最多并排展示 3 个不同表情，相同表情只保留一个
- **聊天条**：屏幕底部悬浮输入条，可折叠成小头像；`Ctrl + Alt + Space` 随时呼出输入
- **断线重连**：客户端与房主断开后自动重连（最多 3 次）
- **网络自检**：内置广播扫描与端口连通性测试，方便排查防火墙问题
- **双平台打包**：Windows 单文件便携 exe + Ubuntu/Debian `deb`

## 下载与安装

在 [Releases](https://github.com/makise2060/meeting-friends/releases/latest) 下载对应平台的安装包：

| 平台 | 安装方式 |
| --- | --- |
| Windows 10/11 x64 | 下载 `friends-meet-<version>-win-x64-portable.exe`，双击运行（便携版，未签名，SmartScreen 需选择「更多信息 → 仍要运行」） |
| Ubuntu 22.04+ amd64 | 下载 `.deb` 后执行 `sudo apt install ./friends-meet-<version>-linux-amd64.deb`，从应用菜单「好友见面」启动 |

Release 页面同时提供 SHA-256 校验文件。Ubuntu 建议使用 X11 会话；Wayland 下置顶、鼠标穿透与全局快捷键可能受限。Linux 防火墙需放行 TCP 47800–47819 与 UDP 47802。

## 技术栈

Electron 45 + Node.js 原生 `net` / `dgram` + `ws`（WebSocket）。渲染层为原生 HTML / CSS / JavaScript，无前端框架。

## 目录结构

```text
src/main/        主进程：窗口管理、IPC、房间服务端 / 客户端、UDP 发现
src/preload/     setup / overlay / chatbar 三个窗口的 preload 桥接
src/renderer/    setup（大厅）、overlay（桌宠层）、chatbar（聊天条）界面
src/shared/      sprites.js 像素精灵；emotes.js 生成的 58 条表情清单
src/assets/      emotes/：内置表情原图、静态缩略图与 NOTICE
tools/           make-icon.js 生成图标；import-emotes.js 导入表情；release-notes.js 生成 Release 元数据
docs/            RELEASING.md：发布规范
.github/         release.yml：tag 触发的双平台构建与 Draft 发布 workflow
build/           打包用图标资源
dist/            打包产物（不入库）
CHANGELOG.md     更新日志，Release Notes 的唯一来源
```

## 开发

```bash
npm install
npm start
```

## 打包

### Windows

```bash
npm run dist
```

产物为 `dist/friends-meet-<version>-win-x64-portable.exe`（portable 便携版，版本取自 `package.json`）。界面显示名仍为「好友见面」。

### Ubuntu / Debian

```bash
npm run dist:linux
```

产物为 `dist/friends-meet-<version>-linux-amd64.deb`。deb 只能在 Ubuntu/Debian 或 CI 中构建，Windows 不能交叉构建；本机无 Linux 环境时使用 GitHub Actions 的手动构建。

## 版本与发布

完整规范见 [docs/RELEASING.md](docs/RELEASING.md)，要点：

- 版本唯一来源是 `package.json`（SemVer），`package-lock.json` 与 `CHANGELOG.md` 需同步更新。
- Release 标题固定为 `vX.Y.Z · 主题`，主题写在 `CHANGELOG.md` 的版本标题里。
- Release Notes 自动取自 `CHANGELOG.md`，并附「OS / 系统 · 版本要求 · 直链下载」表、SHA-256 与安装说明。
- 发版：更新版本与 CHANGELOG → 提交推送 `main` → 手动 workflow 验证双平台 → 打 `vX.Y.Z` tag，Actions 创建 **Draft Release**；确认后在 GitHub 手动 Publish。
- 资产为 Windows exe、Ubuntu deb 与各自 `.sha256` 校验文件。
- 产物未签名；Windows 首次运行需在 SmartScreen 选择「更多信息 → 仍要运行」。

## 表情素材与版权

内置表情来自 Party Animals（猛兽派对）官方论坛帖《分享一些猛兽表情》的粉丝整理，共 58 个。素材版权归 Recreate Games / Source Technology 所有，仅限个人、非商业使用，与本项目无隶属关系；如权利方要求请立即移除。

来源、整理与去重说明见 `src/assets/emotes/NOTICE.md`；重新导入素材使用 `node tools/import-emotes.js <素材目录>`。

## 网络与端口

| 用途 | 端口 |
| --- | --- |
| WebSocket 房间服务 | 47800 起，依次尝试 20 个端口 |
| UDP 房间广播发现 | 47802 |

- 首次开房间时 Windows 会弹防火墙提示，需允许访问并只勾选「专用网络」，否则其他设备连不进来。
- Ubuntu 需在防火墙放行 TCP 47800–47819 与 UDP 47802。
- 仅支持同一局域网直连，没有公网穿透和中继。
- 房间码是 4 位数字，只用于防止朋友误入，不构成安全认证；请只在信任的局域网内使用。

## 数据

昵称、头像与最近一次连接信息保存在 Electron 的 `userData` 目录（`config.json`），房间与聊天记录不做持久化。
