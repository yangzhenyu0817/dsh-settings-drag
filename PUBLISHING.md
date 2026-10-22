# 发布到插件市场 —— 操作清单（已按官方 contributing.md 校正）

> 官方规则来源：awesome-dsh-plugin/awesome-dsh-plugin 的 `contributing.md`。
> 当前状态：npm 已发布 `dsh-settings-drag@0.3.0` ✅；GitHub 仓库已建、待推送；市场 PR 待提。

## 1. 发布到 npm（已完成）

```sh
cd tools/dsh-settings-drag
npm publish --access public
```

- 已发版：`dsh-settings-drag@0.3.0`（`npm view dsh-settings-drag version` 可核验）；
- 桌面端只能安装 npm 上发布的插件，所以这一步是硬前提；
- Windows/PowerShell 若报 `npm.ps1` 执行策略错误：用 `npm.cmd` 或
  `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`（重开终端生效）。

## 2. GitHub 仓库（待推送）

```sh
cd tools/dsh-settings-drag
git remote add origin https://github.com/yangzhenyu0817/dsh-settings-drag.git
git push -u origin master
```

推送后别忘了在仓库 About 处加 **`dsh-plugin`** topic（CI 要求）。

## 3. 提交市场收录（官方流程）

**方式：一个 PR 只加一个文件**，路径 `data/plugins/<owner>__<repo>.yml`：

```
data/plugins/yangzhenyu0817__dsh-settings-drag.yml
```

内容（同目录 `MARKET-ENTRY.yml`）：

```yaml
url: https://github.com/yangzhenyu0817/dsh-settings-drag
name: yangzhenyu0817/dsh-settings-drag
category: ui
description:
  en: Moves and resizes the DeepSeek Harness settings panel; its position and size are remembered per browser.
  zh: 让 DeepSeek Harness 的设置面板可以自由拖动与缩放，位置与尺寸按浏览器记忆。
```

**硬性要求（CI 自动检查）：**

| 检查项 | 状态 |
|---|---|
| `package.json` 声明 `dsh.bundle`（不是只有 `dsh.client`） | ✅ 已有 |
| 仓库有真实可用代码 | ✅ |
| **仓库创建满 1 天** | ⏳ 仓库 2026-10-22 建，**10-23 之后才能提 PR** |
| 仓库加 `dsh-plugin` topic | ⏳ 待做 |
| PR 最多 3 条 | ✅（就 1 条） |

**重要：yml 里不要写 `npm:` 字段**（手写会被校验拒绝，npm 映射由 registry 自动采集）。
描述里若含 `: `（冒号+空格）必须给整行加引号——本条没有。

**描述必须属实、不带营销词**——维护者会对着代码核对。

提 PR 的最快路径（网页）：

1. 打开 `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`；
2. 点 **Add file → Create new file**，文件名填 `data/plugins/yangzhenyu0817__dsh-settings-drag.yml`；
3. 粘贴上面的 YAML → Commit（GitHub 会自动 fork 并引导你提 PR）。

（可选）截图：在自己仓库根放 `screenshots.json`：

```jsonc
["assets/screenshot-1.png"]
```

路径相对该文件、不能跳出插件目录；市场会自动展示。

## 4. 发布检查清单

- [x] `npm pack --dry-run` 文件列表正确（6 个文件 / 10 KB，无本机路径）
- [x] npm 已发布，且 `repository` 指回 GitHub 仓库（registry 据此关联）
- [x] `engines.dsh` 声明与验证版本一致（`>=0.2.0-rc.2 <0.3.0-0`）
- [ ] GitHub 仓库已推送、已加 `dsh-plugin` topic
- [ ] 仓库满 1 天后提 PR（`data/plugins/yangzhenyu0817__dsh-settings-drag.yml`）
- [ ] 收录后在内置市场搜 `dsh-settings-drag` 验证一键安装
