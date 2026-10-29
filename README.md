# 好友见面（friends-meet）

局域网桌面宠物聊天：同一局域网内开房间，朋友的像素桌宠会跑到你的桌面上，配一条随处可呼出的聊天条。无账号、无服务器、无公网依赖。

## 功能

- **附近房间**：UDP 广播自动发现局域网的房间，也可手动填 IP / 端口 / 4 位房间码加入
- **开房间**：房主即为服务端，最多 8 人，可移出成员；房主关闭软件房间即结束
- **桌面宠物层**：透明置顶覆盖层，像素小人（狗 / 猫 / 兔等）在桌面上移动、带名字和聊天气泡
- **聊天条**：屏幕底部悬浮输入条，可折叠成小头像；`Ctrl + Alt + Space` 随时呼出输入
- **断线重连**：客户端与房主断开后自动重连（最多 3 次）
- **网络自检**：内置广播扫描与端口连通性测试，方便排查防火墙问题
- **便携打包**：electron-builder 输出 Windows 单文件便携 exe

## 技术栈

Electron 45 + Node.js 原生 `net` / `dgram` + `ws`（WebSocket）。渲染层为原生 HTML / CSS / JavaScript，无前端框架。

## 目录结构

```text
src/main/        主进程：窗口管理、IPC、房间服务端 / 客户端、UDP 发现
src/preload/     setup / overlay / chatbar 三个窗口的 preload 桥接
src/renderer/    setup（大厅）、overlay（桌宠层）、chatbar（聊天条）界面
src/shared/      像素精灵定义与绘制
tools/           make-icon.js：生成应用图标
build/           打包用图标资源
dist/            打包产物（不入库）
```

## 开发

```bash
npm install
npm start
```

## 打包（Windows）

```bash
npm run dist
```

产物为 `dist/friends-meet-<version>-win-x64-portable.exe`（portable 便携版，版本取自 `package.json`）。界面显示名仍为「好友见面」。

## 版本与发布

- 采用 SemVer，版本唯一来源是 `package.json`；修改版本时需同步 `package-lock.json` 的 `version`。
- 发布流程：
  1. 修改两处版本号，提交并推送 `main`；
  2. 在 Actions → Release 手动运行一次，从 Artifacts 下载产物验证；
  3. `git tag -a vX.Y.Z -m "好友见面 vX.Y.Z"` 并推送 tag；
  4. workflow 自动构建并创建 GitHub Release，资产为 `friends-meet-X.Y.Z-win-x64-portable.exe`。
- 手动运行只上传 Artifacts（保留 14 天），不创建 Release；推送 `v*` tag 才会发布。
- 当前仅支持 Windows x64，产物未签名，首次运行需在 SmartScreen 提示里选择「更多信息 → 仍要运行」。
- 私有仓库的 Windows runner 按 2 倍时长计费，避免频繁触发。

## 网络与端口

| 用途 | 端口 |
| --- | --- |
| WebSocket 房间服务 | 47800 起，依次尝试 20 个端口 |
| UDP 房间广播发现 | 47802 |

- 首次开房间时 Windows 会弹防火墙提示，需允许访问并只勾选「专用网络」，否则其他设备连不进来。
- 仅支持同一局域网直连，没有公网穿透和中继。
- 房间码是 4 位数字，只用于防止朋友误入，不构成安全认证；请只在信任的局域网内使用。

## 数据

昵称、头像与最近一次连接信息保存在 Electron 的 `userData` 目录（`config.json`），房间与聊天记录不做持久化。
