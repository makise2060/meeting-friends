# 更新日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 规范。

## [Unreleased]

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

[Unreleased]: https://github.com/makise2060/meeting-friends/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/makise2060/meeting-friends/releases/tag/v0.1.0
