# CodexDreamSkin 源码调研结论

下一个人接手前必读。这份文档把 CodexDreamSkin 项目的关键技术约束倾倒清楚，避免重复调研。

## 项目位置

用户已下载到 `D:\yingyong\CodexDreamSkin`。目录结构：

```
D:\yingyong\CodexDreamSkin\
├── payload/
│   ├── assets/                      系统级资源（base CSS + 校验器 + 选择器契约）
│   │   ├── dream-skin.css           ★ 系统 base CSS（112KB，所有主题的高阶视觉都追加到这里）
│   │   ├── safe-css-policy.json     ★ 沙箱安全 CSS 白名单契约
│   │   ├── safe-css-validator.mjs   ★ 沙箱 CSS 校验器
│   │   ├── selectors.json           ★ Codex 真实 DOM 锚点契约（双端实测）
│   │   ├── theme.json               默认主题元数据
│   │   ├── theme-package-validator.mjs  主题包校验器
│   │   ├── renderer-inject.js       CDP 注入器
│   │   ├── background.jpg           默认背景
│   │   └── codex-dream-skin.ico
│   ├── presets/                     预设皮肤目录
│   │   ├── preset-gothic-void-crusade/   只有 theme.json + background.jpg（无 theme.css）
│   │   └── preset-orchid-concourse/      ★ 双轨范本：theme.json + theme.css + background.jpg
│   ├── runtime/node/node.exe        内置 Node 22.23.1（用于跑校验脚本）
│   └── scripts/                     PowerShell + mjs 脚本
│       ├── validate-safe-css-file.mjs   ★ 校验单个 theme.css
│       ├── injector.mjs                 CDP 注入逻辑
│       ├── apply-community-theme.ps1
│       ├── install-dream-skin.ps1
│       └── ...
├── Apply-Orchid-Concourse.ps1       应用 Orchid 主题的快捷脚本
├── Arm-Orchid-Concourse.ps1         武装（启用）Orchid 主题
├── PRODUCT.md
├── setup-bootstrap.ps1
└── VERSION
```

## 核心技术模型：双轨制（最重要）

CodexDreamSkin 把皮肤视觉分成两轨，下一个人必须理解这个分工：

### Track 1：`theme.css`（沙箱安全）

- 位置：`payload/presets/<preset-id>/theme.css`
- 约束：由 `safe-css-policy.json` 白名单严格限制
- 选择器：只能用 `[data-ds-part="..."]` + `:hover` / `:focus-visible`
- 属性：只能用 `background-color` / `border-*` / `box-shadow` / `color` / `gap` / `font-*` / `letter-spacing` / `line-height` / `opacity` / `backdrop-filter` / `transition-*`
- 变量：只能用 `--ds-theme-color-*` 家族（见下方完整列表）
- **禁止**：`animation` / `transform` / `background-image` / 伪元素（`::before`/`::after`）/ `position` / `z-index` / `mask` / `clip-path` / `filter`（除 `backdrop-filter`）
- 数值上限：262144 字节、128 规则、512 声明、单值 512 字符
- 校验：`node payload/scripts/validate-safe-css-file.mjs <theme.css>`

### Track 2：base CSS gated 段（高阶视觉）

- 位置：`payload/assets/dream-skin.css` 末尾追加，用主题 ID 门控
- 门控前缀：`html[data-dream-skin="active"][data-dream-theme-id="<preset-id>"]`
- 能做：渐变（`background-image: linear-gradient(...)`）、`@keyframes` 动画、伪元素、`transform`、`position`、`z-index`、`mask`、`clip-path`、`filter`
- 范本：Orchid Concourse 在 `dream-skin.css` L1321–2000 的整段
- 光模式门控：`[data-dream-shell="light"]`
- 背景图变量：`var(--dream-skin-art)`（Codex 运行时从 theme.json `image` 字段注入）

## safe-css-policy.json 完整约束

文件位置：`D:\yingyong\CodexDreamSkin\payload\assets\safe-css-policy.json`

### 允许的 parts（选择器只能用这些）

```
root, sidebar, main, header, home, home-hero, project-list,
thread, message, composer, composer-toolbar, dialog
```

### 允许的 states

```
hover, focus-visible
```

### 允许的 variables（`--ds-theme-color-*` 家族）

```
--ds-theme-color-background
--ds-theme-color-panel
--ds-theme-color-panel-alt
--ds-theme-color-accent
--ds-theme-color-accent-alt
--ds-theme-color-secondary
--ds-theme-color-highlight
--ds-theme-color-text
--ds-theme-color-muted
--ds-theme-color-line
--ds-theme-font-family
--ds-theme-font-scale
--ds-theme-surface-opacity
--ds-theme-surface-blur
--ds-theme-surface-radius
--ds-theme-surface-border-alpha
--ds-theme-surface-shadow
--ds-theme-image-focus-x
--ds-theme-image-focus-y
--ds-theme-image-zoom
--ds-theme-image-dim
--ds-theme-image-task-intensity
--ds-theme-density-scale
--ds-theme-motion-level
```

### 允许的 properties

```
backdrop-filter, background-color, border-*-color, border-*-style, border-*-width,
border-color, border-radius, border-style, border-width, box-shadow, color,
column-gap, font-family, font-size, font-weight, gap, letter-spacing, line-height,
opacity, row-gap, transition-duration, transition-property
```

### 数值边界（校验器源码 safe-css-validator.mjs 实测）

- `box-shadow`：最多 2 层；offset x/y ∈ [-32, 32]px；blur ∈ [0, 48]px；spread ∈ [-8, 16]px；0 也允许
- `backdrop-filter`：必须含 `blur`（且 blur 在第一位，0–30px 或 `var(--ds-theme-surface-blur)`）；可选 `saturate` 0.5–2（**小数，不是百分比**）、`brightness`/`contrast` 0.8–1.5
- `border-radius`：0–28px 或 `var(--ds-theme-surface-radius)`
- `gap`/`row-gap`/`column-gap`：0–24px
- `border-*-width`：0–4px
- `opacity`：0.65–1 或 `var(--ds-theme-surface-opacity)`
- `font-size`：12–20px
- `font-weight`：400/500/600/700/normal/bold
- `line-height`：1.1–1.8
- `letter-spacing`：0–2px
- `transition-duration`：0–400ms 或 0–0.4s
- `transition-property`：必须是 TRANSITION_TARGETS 集合内的属性
- `font-family`：只能用系统字体族关键字（system-ui / -apple-system / sans-serif / serif / monospace 等），最多 4 个，**不能用具名字体如 "Segoe UI"**（这是 Track 1 的硬限制，Track 2 不受此限）

### 常见校验失败原因

1. CSS 注释（`/* */`）——Track 1 完全禁止
2. `saturate(128%)`——必须写成 `saturate(1.28)`
3. `box-shadow: 0 22px 54px ...`——blur 超 48px
4. 用了 `::before`/`::after`——Track 1 禁止伪元素
5. 用了具名字体——Track 1 只允许系统字体族关键字

## selectors.json：Codex 真实 DOM 锚点

文件位置：`D:\yingyong\CodexDreamSkin\payload\assets\selectors.json`

实测版本：Codex 26.727.40816（macOS 真实 renderer 复核）+ Windows 版本错位。

### 外观信号（明暗判定）

- 暗：`html.electron-dark`
- 亮：`html.electron-light`
- 警告：`html.electron-opaque` 随窗口聚焦/毛玻璃闪动，**禁止用作外观信号**
- Track 2 光模式门控用 `[data-dream-shell="light"]`（这是 Dream Skin 自己的属性，不是 Codex 原生）

### L1 必需锚点（缺失 = 皮肤主行为受损）

| key | selector | scope |
|---|---|---|
| shell-main | `main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])` | all |
| left-panel | `aside.app-shell-left-panel` | all |
| header-tint | `header:is(.app-header-tint, [data-app-shell-header-edge-scroll], [class*="_Header_"])` | all |
| home-icon | `[data-testid="home-icon"]` | home |
| home-route | `[role="main"]:has([data-testid="home-icon"])` | home |
| home-route-css | `[role="main"]`（CSS 别名，不含 :has()，因为 CSS 禁 :has() 嵌套） | home |

### L2 可选锚点（缺失 = 精修静默降级）

| key | selector | scope |
|---|---|---|
| main-content-top-fade | `:is(.app-shell-main-content-top-fade, [data-app-shell-main-content-top-fade], [class*="_MainContentTopFade_"])` | all |
| home-banners | `.home-banners` | home |
| composer-chrome | `.composer-surface-chrome` | home+thread |
| composer-toolbar | `.composer-surface-chrome [class*="_footer_"]` | home+thread |
| home-utility | `[class*="_homeUtilityBar_"]` | home |
| home-suggestions | `.group\/home-suggestions` | home |
| project-selector | `.group\/project-selector` | home config |
| markdown | `[class*="_markdown"]` | thread |
| thread-surface | `.thread-scroll-container` | thread |
| message | `:is([data-message-author-role], [data-local-conversation-user-anchor], [data-local-conversation-final-assistant])` | thread |
| settings-panel | `[data-settings-panel-slug="general-settings"]` | settings |
| overlay-menu | `[role="menu"]` | overlay |
| overlay-dialog | `[role="dialog"]` | overlay |
| overlay-popper | `[data-radix-popper-content-wrapper]` | overlay |

### 重要注意

- **CSS 禁 `:has()` 嵌套**：`home-route` 原选择器一旦写进 `:has()`/`:not(:has())` 整条规则会被解析器丢弃。Track 2 用 `home-route-css`（不含 :has()）的别名。但 Track 2（gated base CSS）**可以**用 `:has()`，因为不受 safe-css-policy 约束。
- 首页渐进渲染：`home-icon` 先出现，utility bar 可晚 1–2 秒。L2 锚点必须容忍晚到。
- 设置页 mac 26.715.61943 会替换整个 shell（main/侧栏/header 全消失），win 保留。皮肤不得假设二者其一。
- `suggestion-item` 选择器已从 selectors.json 移除（双端 22 个实测状态命中 0 次，是化石）。

## theme.json schema

字段（来自 `theme-package-validator.mjs` THEME_REQUIRED + THEME_COPY_KEYS）：

```json
{
  "schemaVersion": 1,              // 必需
  "id": "preset-amethyst-gaze",    // 必需，必须等于目录名
  "name": "Amethyst Gaze",         // 必需
  "brandSubtitle": "CODEX · AMETHYST GAZE",
  "tagline": "紫晶凝视的工作面",
  "projectPrefix": "PROJECT · ",
  "projectLabel": "◌  SELECT PROJECT",
  "statusText": "AMETHYST GAZE / READY",
  "quote": "MAKE SOMETHING UNFORGETTABLE",
  "image": "background.jpg",       // 必需，相对路径
  "appearance": "auto",            // auto/light/dark
  "art": {
    "focusX": 0.62,                 // 0–1，背景图焦点 X
    "focusY": 0.42,                // 0–1，背景图焦点 Y
    "safeArea": "left",            // left/right/center/none，主内容区安全边
    "taskMode": "ambient"          // ambient/focus，任务页背景模式
  },
  "colors": {                      // 顶层 = 默认（auto 时跟随系统前的兜底）
    "background": "#14101c",
    "panel": "#1c1428",
    "panelAlt": "#2a1d3a",
    "accent": "#b079e0",
    "accentAlt": "#d98fb0",
    "secondary": "#6ba89a",
    "highlight": "#c9a857",
    "text": "#f0e6f5",
    "muted": "#9a8aa8",
    "line": "rgba(176, 121, 224, .28)"
  },
  "colorModes": {                  // 明暗双模式
    "dark": { ... 同 colors },
    "light": { ... 同 colors }
  }
}
```

Codex 运行时把 `colors` 映射到 `--ds-theme-color-*` 变量：
- `background` → `--ds-theme-color-background`
- `panel` → `--ds-theme-color-panel`
- `panelAlt` → `--ds-theme-color-panel-alt`
- `accent` → `--ds-theme-color-accent`
- `accentAlt` → `--ds-theme-color-accent-alt`
- `secondary` → `--ds-theme-color-secondary`
- `highlight` → `--ds-theme-color-highlight`
- `text` → `--ds-theme-color-text`
- `muted` → `--ds-theme-color-muted`
- `line` → `--ds-theme-color-line`

## 校验工具

### 校验单个 theme.css（Track 1）

```powershell
& 'D:\yingyong\CodexDreamSkin\payload\runtime\node\node.exe' `
  'D:\yingyong\CodexDreamSkin\payload\scripts\validate-safe-css-file.mjs' `
  '<path-to-theme.css>'
```

期望输出：`{"contract":"dreamskin-safe-css/1","status":"validated","bytes":N,"ruleCount":N,"declarationCount":N}`

### 校验整个主题包

```powershell
& 'D:\yingyong\CodexDreamSkin\payload\runtime\node\node.exe' `
  'D:\yingyong\CodexDreamSkin\payload\assets\theme-package-validator.mjs' `
  '<preset-dir>'
```

（需要 manifest.json 等更多文件，当前 Amethyst Gaze 还没做成完整主题包，只是 preset 目录）

## Orchid Concourse 范本位置

`dream-skin.css` L1321–2000 是 Orchid Concourse 的完整 Track 2 实现，包含：

- L1321 token 块（`--orchid-*-rgb` 暗 + 亮）
- L1348 主表面沉浸背景（`main:is(...)` 选择器 + 三层 background-image + `var(--dream-skin-art)`）
- L1366 home-route 容器 + `::before` 漂移背景
- L1414 `.heading-xl` 编辑式标题牌（border-left 3px 金 + 多层渐变 + backdrop-filter）
- L1446 `.heading-xl::before` / `::after`（kicker + 凝视点）
- 后续：composer / message / thread 等组件的高阶造型

**下一个人做新主题时，直接复制 Orchid Concourse 的 Track 2 段，改 token 和选择器即可。**

## CDP 注入机制（用户关心的"启动器"问题）

- `payload/assets/renderer-inject.js` 是 CDP 注入器，通过 Chrome DevTools Protocol 连接到 Codex 的 Electron renderer
- `payload/scripts/injector.mjs` 是注入逻辑
- 用户之前说"不太想每次都启动它那个程序"——这指的是 Dream Skin 的 tray 程序。如果要做成"Codex 启动后自动附着"，需要写一个 watcher 脚本监听 Codex 进程启动事件然后自动注入。这部分**当前 Amethyst Gaze 皮肤项目没有涉及**，只是做了皮肤文件本身。

## 用户的技术路线选择（来自上一段对话）

用户在另一个 AI 应用里已经选定路线：
1. 保留 Dream Skin 的 CDP 注入核心（不改 Codex app.asar）
2. 裁剪成单皮肤运行器（删除主题库、在线 Studio、社区主题、更新检查）
3. 做成专用启动方式，或研究"Codex 启动后自动附着"的轻量 watcher
4. 不采用直接修改 Codex 安装包（WindowsApps 权限、Codex 更新覆盖、签名校验风险）

**当前 Amethyst Gaze 项目只完成了第 1 步的皮肤文件本身，第 2–3 步的运行器裁剪和 watcher 都没做。**

## Dream Skin 的核心脚本

| 脚本 | 作用 |
|---|---|
| `install-dream-skin.ps1` | 安装 Dream Skin 到系统 |
| `start-dream-skin.ps1` | 启动 Dream Skin tray |
| `apply-community-theme.ps1` | 应用社区主题 |
| `injector.mjs` | CDP 注入核心逻辑 |
| `validate-safe-css-file.mjs` | 校验 theme.css |
| `restore-dream-skin.ps1` | 恢复（卸载皮肤） |
| `verify-dream-skin.ps1` | 验证安装完整性 |
| `check-update.ps1` | 检查更新 |
| `tray-dream-skin.ps1` | tray 图标逻辑 |
| `theme-windows.ps1` | Windows 主题应用 |
| `image-metadata.mjs` | 提取背景图元数据 |
