# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

## [0.4.2] - 2026-10-29

### 修复

- 桌面层重新显示时重新置顶（`setAlwaysOnTop` + `moveTop`），避免收起/展开后落在其他置顶窗口之下、点击被截走

### 诊断

- 新增 `overlay-debug.log`：记录交互状态切换及来源、悬停、鼠标按下/松开、拖拽开始和渲染层异常，用于定位 Windows 点击失效

## [0.4.1] - 2026-10-29

### 修复

- Windows 下桌面层新增光标命中轮询兜底：收起/展开后即使渲染层转发事件没有恢复，主进程也会在光标落到桌宠上时解除鼠标穿透，修复「小人可见但点不到、拖不动」

## [0.4.0] - 2026-10-29 · 灵动

### 新增

- 桌宠碰撞：拖动时会把其他桌宠挤开，撞到屏幕边缘反弹并逐渐减速
- 松手后保留甩动惯性，碰撞力度随时间衰减
- 同一只桌宠被多人拖动时由后来者接管

### 优化

- 拖拽改为带阻尼的跟随，松手时按鼠标甩动方向滑出，静止松手不会甩出

## [0.3.0] - 2026-10-29 · 双栖

### 新增

- 新增 Ubuntu/Debian `.deb` 安装包（amd64），可从应用菜单「好友见面」启动
- Linux X11 会话下补充桌宠悬停/拖动兜底，并对齐 app_id 与 `.desktop`
- Release Notes 增加 Windows / Ubuntu 系统下载表、直链与 SHA-256 校验

### 优化

- CI 改为 Windows + Ubuntu 双平台构建，Release 默认创建 Draft，人工确认后发布

## [0.2.0] - 2026-10-29 · 同乐

> 内置表情素材版权归 Recreate Games / Source Technology 所有，仅限个人、非商业使用。

### 新增

- 内置 58 个猛兽派对粉丝整理表情：角色 22、UI 24、梗图 9、道具 3
- 聊天条表情面板：按分类浏览、静态缩略图、支持连续点击发送
- 表情通过房间 WebSocket 广播，所有成员在对应玩家桌宠上方看到动图
- 同一玩家最多并排展示 3 个不同表情，超出时替换最早的一个
- 相同表情重复点击只保留一个，并刷新 5 秒展示时间

### 优化

- 表情面板展开时聊天条窗口底边锚定，输入框不会被遮挡
- 桌宠顶部预留表情空间，避免贴顶时动图出屏

## [0.1.0] - 2026-10-29 · 初见

### 新增

- 局域网房间发现：UDP 广播自动扫描，也可手动填写 IP、端口与 4 位房间码加入
- 房主开房，最多 8 人，可移出成员；客户端断线自动重连
- 透明置顶桌宠层：像素角色在桌面移动，带昵称与聊天气泡
- 可折叠聊天条，`Ctrl + Alt + Space` 全局呼出输入
- 网络自检：广播扫描与端口连通性测试
- 设置页显示应用版本号

### 修复

- 修复聊天条收起/展开后桌宠无法拖动的问题

### 优化

- 打包产物统一命名为 `friends-meet-<version>-win-x64-portable.exe`
- 建立 SemVer 版本体系与 GitHub Actions 自动发布流程

[Unreleased]: https://github.com/makise2060/meeting-friends/compare/v0.4.2...HEAD
[0.4.2]: https://github.com/makise2060/meeting-friends/releases/tag/v0.4.2
[0.4.1]: https://github.com/makise2060/meeting-friends/releases/tag/v0.4.1
[0.4.0]: https://github.com/makise2060/meeting-friends/releases/tag/v0.4.0
[0.3.0]: https://github.com/makise2060/meeting-friends/releases/tag/v0.3.0
[0.2.0]: https://github.com/makise2060/meeting-friends/releases/tag/v0.2.0
[0.1.0]: https://github.com/makise2060/meeting-friends/releases/tag/v0.1.0
