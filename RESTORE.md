# Amethyst Gaze 恢复指南

> 目的：任何时候你想撤销这个皮肤、回到原版 Codex 或换别的主题，照本文档操作即可。
> 最后更新：2026-08-19

---

## 0. 核心原理（为什么这是零风险定制）

**皮肤是"会话级注入"，不是永久修改。**

- Codex 程序本体（`C:\Program Files\WindowsApps\OpenAI.Codex_...`）**从未被改动**，没有改 app.asar、没有改安装目录里任何文件。
- 皮肤通过 CDP（Chrome DevTools Protocol）在 Codex 启动那一刻注入到内存里。关掉 Codex，皮肤就消失了。
- **从开始菜单正常启动 Codex = 100% 原版界面**。这一条本身就是终极恢复手段。
- 唯一落盘的东西全在 CodexDreamSkin 自己的目录里（见下），随时可删可还原。

---

## 1. 本次定制动过的文件（完整清单）

| 文件 | 改动 | 恢复源 |
|---|---|---|
| `C:\Users\观\AppData\Local\CodexDreamSkin\active-theme\theme.json` | 替换为 Amethyst Gaze 元数据 | `d:\Test\work1\amethyst-gaze-skin\preset\theme.json`（本体）；或 Gothic 预设 |
| `C:\Users\观\AppData\Local\CodexDreamSkin\active-theme\theme.css` | 替换为 Amethyst Track 1 | 同上 preset 目录；或 `payload\presets\preset-orchid-concourse\theme.css` |
| `C:\Users\观\AppData\Local\CodexDreamSkin\active-theme\background.jpg` | 替换为有栖.jpg | `d:\Test\work1\amethyst-gaze-skin\preset\background.jpg` |
| `C:\Users\观\AppData\Local\CodexDreamSkin\engine\assets\dream-skin.css` | 末尾追加了 Amethyst Track 2（约 43KB） | **备份就在旁边**：`dream-skin.css.bak-amethyst` |
| `C:\Users\观\.codex\config.toml` | 仅 `[desktop]` 下 `appearanceLightCodeThemeId` 会被脚本改为 `"codex"`（你当前是暗色模式，此键只在亮色模式生效，无可见影响）；其余键不动 | Dream Skin 自带备份 `config.before-dream-skin.toml` + 本项目快照 `backup\config-2026-08-19-pre-apply.toml` |

**没动过的东西**：Codex 安装目录、`~/.codex/sessions`（会话记录）、CC Switch 及其路由、你的模型/供应商配置、Gothic 主题（完好）。

---

## 2. 分级恢复方案

### Level 0：只是想要回原版 Codex（最常用）

**什么都不用做。** 关闭 Codex，从开始菜单重新打开 → 无任何皮肤。

> 注意：通过 Dream Skin 启动的 Codex 才带皮肤；只要不运行启动脚本，皮肤就不存在。

### Level 1：撤销本次追加的高级 CSS（保留 Dream Skin 框架）

```powershell
# 先关闭 Codex，然后：
Copy-Item "C:\Users\观\AppData\Local\CodexDreamSkin\engine\assets\dream-skin.css.bak-amethyst" `
          "C:\Users\观\AppData\Local\CodexDreamSkin\engine\assets\dream-skin.css" -Force
```

### Level 2：换回官方主题（Gothic Void Crusade / Orchid Concourse）

```powershell
# 先关闭 Codex，然后（以 Gothic 为例）：
$src = "D:\yingyong\CodexDreamSkin\payload\presets\preset-gothic-void-crusade"
$dst = "C:\Users\观\AppData\Local\CodexDreamSkin\active-theme"
Copy-Item "$src\theme.json" $dst -Force
Copy-Item "$src\background.jpg" $dst -Force
# Gothic 无 theme.css，需删除旧的：
Remove-Item "$dst\theme.css" -Force -ErrorAction SilentlyContinue
# 同时执行 Level 1 恢复 dream-skin.css（否则 Amethyst 的门控 CSS 仍在，但因为
# data-dream-theme-id 变了，不会生效——留不留都不影响正确性）
```

换回 Orchid 同理，源目录换成 `preset-orchid-concourse`（注意：它的背景图早已被你换成有栖.jpg，那是你自己的选择，不是本次定制改的）。

### Level 3：完全卸载 Dream Skin

```powershell
# 1. 关闭 Codex
# 2. 删除 Dream Skin 全部状态（皮肤数据、引擎副本、注入器日志）：
Remove-Item "C:\Users\观\AppData\Local\CodexDreamSkin" -Recurse -Force
# 3. （可选）恢复 config.toml 外观键——用本项目快照：
#    把 backup\config-2026-08-19-pre-apply.toml 里 [desktop] 段的
#    appearanceLightCodeThemeId = "vercel" 等值抄回 C:\Users\观\.codex\config.toml
# 4. 源码目录 D:\yingyong\CodexDreamSkin 想留就留（它只是个文件夹，不自启、不常驻）
```

卸载后 Codex 完全是原版（本来就没人动过它）。

---

## 3. CC Switch 共存说明（重要）

你用 CC Switch 切换渠道会重写 `C:\Users\观\.codex\config.toml`。与皮肤的关系：

**不会破坏皮肤。** 皮肤注入走 CDP，与 config.toml 零依赖。切渠道后皮肤照常工作。

**互不侵犯的键空间。**
- CC Switch 改的是：`model`、`model_provider`、`[model_providers.*]` 等供应商段
- Dream Skin 管的仅是：`[desktop]` 段的 `appearanceTheme`、`appearanceLightCodeThemeId`、`appearanceLightChromeTheme` 三个外观键（且有备份+三方恢复机制，外部改动会被识别为"用户的新改动"而保留）

**建议操作顺序**（避免极小概率的写入竞态）：
1. 关闭 Codex（此时皮肤会话已结束）
2. 在 CC Switch 里切换渠道
3. 需要皮肤时用启动脚本开 Codex；不需要就从开始菜单开

如果忘了顺序、在 Codex 运行中切了渠道：无实质风险，最坏情况是下次 Dream Skin 启动时多一次外观键同步。你的渠道配置永远以 CC Switch 的最后写入为准。

**本项目额外保险**：`backup\config-2026-08-19-pre-apply.toml` 是应用皮肤前的完整 config 快照。任何怀疑配置被弄乱的时刻，都可以对照它手工恢复 `[desktop]` 段。

---

## 4. 皮肤本体的权威副本

所有 Amethyst Gaze 源文件都在（删除引擎目录也不会丢失设计）：

```
d:\Test\work1\amethyst-gaze-skin\
├── preset\
│   ├── theme.json                 # 主题元数据 + 明暗双配色
│   ├── theme.css                  # Track 1（沙箱安全层）
│   ├── amethyst-gaze-advanced.css # Track 2（第二层设计：组件造型+签名动效）
│   ├── background.jpg             # 有栖.jpg（1727×1128）
│   └── INSTALL.md                 # 安装说明
├── backup\
│   └── config-2026-08-19-pre-apply.toml
├── HANDOFF.md / RESEARCH.md / DESIGN.md
└── pages\index.html               # 浏览器预览
```

---

## 5. 快速判断当前状态

```powershell
# Codex 是否带皮肤运行？（有输出 = 注入器在跑，皮肤生效中）
Get-NetTCPConnection -State Listen -LocalPort 9335 -ErrorAction SilentlyContinue

# 当前激活的主题 id（应为 preset-amethyst-gaze）
(Get-Content "C:\Users\观\AppData\Local\CodexDreamSkin\active-theme\theme.json" -Raw | ConvertFrom-Json).id
```
