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

- Notes 正文唯一来源是 CHANGELOG 对应版本段落，由 `tools/release-notes.js` 提取。
- workflow 自动追加「安装与校验」：下载文件名、SHA-256、平台、未签名提示、更新日志链接。
- CHANGELOG 段落缺失或为空时 workflow 直接失败，禁止发布空 Notes。
- 不在 GitHub 上手工维护 Notes；笔误可临时编辑，但必须回写 CHANGELOG，保持来源一致。

## 6. 打包资产

| 项目 | 规范 |
| --- | --- |
| 文件名 | `friends-meet-<version>-win-x64-portable.exe` |
| 校验文件 | 同名 `.sha256`（`sha256sum` 格式），随 Release 一起发布 |
| 平台 | Windows x64，便携版，无需安装 |
| 签名 | 未签名，首次运行需在 SmartScreen 选择「更多信息 → 仍要运行」 |
| Actions Artifact | 保留 14 天；Release 资产长期保留 |

## 7. 发布流程

1. 更新 `CHANGELOG.md`：把 `[Unreleased]` 内容归入新版本标题，补充日期与主题。
2. 同步版本号：`package.json` 与 `package-lock.json`。
3. 提交并推送 `main`。
4. 可选：本地 `npm run dist` 自测。
5. 在 Actions → Release 手动运行一次，确认构建、Artifact 与 `.sha256`（手动运行不发布 Release）。
6. 打 tag 并推送：

   ```bash
   git tag -a vX.Y.Z -m "vX.Y.Z · 主题"
   git push origin vX.Y.Z
   ```

7. workflow 自动完成：校验 tag 与 `package.json` 一致 → 构建 → 生成标题与 Notes → 创建或更新 Release → 上传 exe 与 `.sha256`。
8. 核对 Release 标题、Notes 完整性、资产名与 SHA-256。

## 8. 失败与修正

- **tag 与版本不一致**：workflow 在安装依赖前失败。未发布时可删除本地/远端 tag 重打；已发布不移动 tag，改发 patch。
- **CHANGELOG 缺段落或为空**：workflow 失败。补齐后重打未发布 tag，或发 patch。
- **Release 已存在**：重跑 workflow 会用 `gh release edit` 更新标题与 Notes，并用 `upload --clobber` 覆盖资产。
- **已发布内容有误**：不移动 tag，修订 CHANGELOG 后发下一个 patch 版本。
- **Release 步骤 403**：检查仓库 Settings → Actions → General 的 Workflow permissions；workflow 本身已声明 `contents: write`。
- **计费**：私有仓库的 Windows runner 按 2 倍时长计费，避免频繁手动触发。

## 9. 发布检查清单

- [ ] CHANGELOG 版本标题格式正确且主题为 2–6 个汉字
- [ ] `package.json` 与 `package-lock.json` 版本一致
- [ ] tag 名 `vX.Y.Z` 与版本号一致
- [ ] Release 标题为 `vX.Y.Z · 主题`
- [ ] Notes 含实际变更分组与「安装与校验」
- [ ] 资产含 exe 与 `.sha256`
- [ ] 下载运行后设置页版本号正确
