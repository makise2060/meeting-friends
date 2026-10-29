# 发布规范

> 适用范围：`meeting-friends` 的版本号、CHANGELOG、Release 标题与 Notes、打包资产和 GitHub Actions 发布流程。
> 本文是唯一权威；README 只保留摘要。

## 1. 版本号

- 遵循 [语义化版本（SemVer）](https://semver.org/lang/zh-CN/)：`MAJOR.MINOR.PATCH`。
- `0.x` 阶段表示功能和交互仍可能调整；`1.0.0` 起视为稳定。
- 版本唯一来源是 `package.json` 的 `version`，`package-lock.json` 根部的 `version` 必须同步；`CHANGELOG.md` 中必须有对应版本段落。
- Git tag 与 Release 标题使用 `v` 前缀；`package.json` 不带 `v`。
- 递增规则：新增功能升 MINOR，修复/优化升 PATCH；`1.0.0` 后的不兼容变更升 MAJOR。

## 2. 版本主题

- 每个版本定义一个 2–6 个汉字的主题，概括本版重点，例如 `初见`。
- 主题写在 CHANGELOG 版本标题中：`## [0.1.0] - 2026-10-29 · 初见`。
- 主题不参与版本比较；未定义主题时标题退化为 `vX.Y.Z`，不推荐。

## 3. Release 标题

- 固定格式：`vX.Y.Z · 主题`，由 workflow 自动从 CHANGELOG 生成。
- 标题不重复产品名，仓库名已表明产品。
- 不在 GitHub 上手工改标题；需要修正时先改 CHANGELOG，再按第 8 节处理。

## 4. CHANGELOG 规范

- 采用 [Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，文件位于仓库根目录 `CHANGELOG.md`。
- 新版本在上，`## [Unreleased]` 常驻。
- 版本标题必须精确匹配：`## [X.Y.Z] - YYYY-MM-DD · 主题`，日期为发布日。
- 变更分组只使用：`### 新增`、`### 修复`、`### 优化`、`### 安全`；没有内容的分组不写。
- 每条变更面向用户描述结果，动词开头；不写内部重构、调试过程、提交号等噪声。
- 文件末尾维护 Keep a Changelog 约定的链接引用。

示例：

```markdown
## [0.2.0] - 2026-11-15 · 同行

### 新增

- 房间内支持发送表情
- 设置页选择桌宠大小

### 修复

- 修复副屏下桌宠位置偏移
```

## 5. Release Notes 规范

- 正文先放「下载 / Downloads」三列表：`OS / 系统`、`Requirements / 版本要求`、`Direct Links / 点击直链下载`；当前只列 Windows 与 Ubuntu 两行，直链指向 `releases/download/<tag>/<asset>`。
- 随后是 SHA-256 校验表、`.sha256` 链接与安装说明；最后是「更新内容 / Changes」加 CHANGELOG 段落。
- 由 `tools/release-notes.js` 用 `--repo`、`--tag`、`--win-name`、`--win-sha`、`--linux-name`、`--linux-sha` 生成；CHANGELOG 段落缺失或为空时失败，禁止发布空 Notes。
- 不在 GitHub 上手工维护 Notes；笔误可临时编辑，但必须回写 CHANGELOG，保持来源一致。
- Release 默认创建为 **Draft**，确认标题、下载表、资产与校验后才手动 Publish；workflow 不得自动公开。

## 6. 打包资产

| 项目 | 规范 |
| --- | --- |
| Windows 资产 | `friends-meet-<version>-win-x64-portable.exe`（Windows 10/11 x64，便携版） |
| Ubuntu 资产 | `friends-meet-<version>-linux-amd64.deb`（Ubuntu 22.04+ amd64） |
| 校验文件 | 两个资产各配同名 `.sha256`（`sha256sum` 格式），随 Release 一起发布 |
| 签名 | Windows 未签名，首次运行需在 SmartScreen 选择「更多信息 → 仍要运行」 |
| Linux 安装 | `sudo apt install ./friends-meet-<version>-linux-amd64.deb`；从菜单「好友见面」启动，安装目录 `/opt/好友见面` |
| Linux 会话 | 建议 X11；Wayland 下置顶、鼠标穿透与全局快捷键可能受限 |
| CI | Windows + Ubuntu matrix 构建；Windows runner 2 倍计费；Artifact 保留 14 天 |
| 构建限制 | deb 只能在 Ubuntu/Debian 或 CI 构建，Windows 不能交叉构建 |

## 7. 发布流程

1. 更新 `CHANGELOG.md`：把 `[Unreleased]` 内容归入新版本标题，补充日期与主题。
2. 同步版本号：`package.json` 与 `package-lock.json`。
3. 提交并推送 `main`。
4. 可选：本地 `npm run dist` 验证 Windows；Linux `npm run dist:linux` 仅在 Ubuntu/Debian 或 CI 执行。
5. 在 Actions → Release 手动运行一次，确认 Windows 与 Ubuntu 两个构建、Artifact 与 `.sha256`（手动运行不发布 Release）。
6. 打 tag 并推送：

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z · 主题"
   git push origin vX.Y.Z
   ```

7. workflow 自动完成：校验 tag 与 `package.json` 一致 → 双平台构建与校验 → 生成下载表/Notes → 创建或更新 **Draft Release**，上传两个资产与校验文件。
8. 核对 Draft 标题、下载表、Notes、4 个资产与 SHA-256；确认后由人工在 GitHub 点击 **Publish release**。workflow 不会自动发布。
9. 发布后再验证直链可访问；发布前 Draft 直链 404 属预期。

## 8. 失败与修正

- **tag 与版本不一致**：workflow 在安装依赖前失败。未发布时可删除本地/远端 tag 重打；已发布不移动 tag，改发 patch。
- **CHANGELOG 缺段落或为空**：workflow 失败。补齐后重打未发布 tag，或发 patch。
- **Linux 构建/安装校验失败**：看 `dpkg-deb -f/-c` 与 `apt-get install` 日志，修正依赖或打包配置后重跑手动 workflow；不要带错打 tag。
- **Draft 已存在**：重跑 workflow 会更新标题/Notes 并覆盖资产；**已发布 Release 会被 fail-fast 拒绝修改**，请发 patch。
- **Draft 内容有误**：未发布可删除 Draft 或删除 tag 重打；已发布不移动 tag。
- **Release 步骤 403**：检查仓库 Settings → Actions → General 的 Workflow permissions；workflow 本身已声明 `contents: write`。
- **计费**：私有仓库的 Windows runner 按 2 倍时长计费，避免频繁手动触发。

## 9. 发布检查清单

- [ ] CHANGELOG 版本标题格式正确且主题为 2–6 个汉字
- [ ] `package.json` 与 `package-lock.json` 版本一致
- [ ] tag 名 `vX.Y.Z` 与版本号一致
- [ ] Release 标题为 `vX.Y.Z · 主题`
- [ ] Notes 含「下载 / Downloads」三列表、SHA-256 与安装说明
- [ ] 资产含 Windows exe、Ubuntu deb 与各自 `.sha256`
- [ ] deb 在 Ubuntu CI 中可安装（`dpkg -s` 正常）
- [ ] Release 为 Draft，人工确认后才 Publish
- [ ] Windows 与 Ubuntu 下载运行后设置页版本号正确
