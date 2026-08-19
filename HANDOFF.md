# 有栖 · Codex 皮肤交接文档

下一个人接手必读。这份文档把项目背景、已完成工作、设计决策、待定项一次性讲清楚。

## ★ 最新状态（2026-08-20 深夜，v3.13 · CC Switch 失效根治 + 开源化收尾）

**CC Switch 切换后皮肤失效的真正根因**（连环排查两小时，矩阵实验实锤）：guard 的 `callStartScript` 用 `spawn('powershell.exe', { detached: true })` 拉起引擎 start 脚本——本机上这个组合**必然无声死亡**：
- `detached: true` → Windows `DETACHED_PROCESS` 让控制台程序 powershell 启动即死（node.exe 不依赖控制台所以 injector 活得好好的，掩盖了问题）
- 非 detached → powershell 随 guard 父进程退出被杀（实验 4：父进程保活 12s 则活、立即退出则死）
- 表现为：guard.log 有 "invoking start-dream-skin"、但零进程、零日志、零效果——21:36 的接管就是这样消失的

**修复：wscript 中介链**。`ag-start-launcher.vbs`：guard detached 启动 wscript.exe（GUI 应用不依赖控制台，可安然 detached）→ wscript `Run(cmd, 0, False)` 拉起完全解耦的隐藏 powershell。经完整生产链路（计划任务→wscript→node→wscript→powershell）端到端验证通过。**这是本机 Windows 进程模型的硬约束，别再尝试直启 powershell。**

其他：
- `ag-probe-launcher.vbs` + guard 内置探针：STATE_ROOT 放 `spawn-probe` 空文件即可诊断全链路（详见 INSTALL.md）
- spawn 的异步 error 事件必须监听（否则失败被静默吞掉）
- 开源化收尾：`install.ps1` / `uninstall.ps1` 一键安装卸载（引擎存在性检查 + deploy + guard 注册 + start-dream-skin 生效）、`INSTALL.md` 完整指南（前置条件、AV 白名单建议、故障排查）、删除 QA 残留 PNG
- 设置页美化：用户明确取消（「不用加了，这步去了」）

## ★ v3.12（2026-08-20 凌晨，更名「有栖」+ 杀软误报事件）

**项目更名**：Amethyst Gaze（紫晶凝视）→ **有栖（Arisu）**。展示层全部更名（铭牌 `content: "有栖"`、theme.json name/brandSubtitle/tagline/statusText、ag-toggle 提示语、文档标题、仓库名）；**技术标识保留不动**（theme-id `preset-amethyst-gaze`、CSS 变量前缀 `--ag-`、`__AG_TOGGLE_REGISTRY__` 键——改名纯风险无收益）。deploy.cjs 块头定位双兼容（新「有栖 v3」优先，旧 "Amethyst Gaze v3" 兜底，引擎现存旧块可平滑过渡）。theme.json 现在也随 deploy 部署（此前只部署 CSS，元数据不跟随）。

**杀软误报事件**：杀软把 Startup 的 `Codex Dream Skin.lnk`（托盘自启快捷方式）报 `HEUR:Trojan/LNK.Agent.b` 删除——LNK 指向脚本的典型启发式误报。**皮肤不依赖该快捷方式**（持久化由 ag-guard 计划任务承担），Codex 手动冷启后 guard 照常接管恢复（实测走通）。遗留问题：start-dream-skin 的操作锁 Mutex 若被卡死的旧实例持有，后续实例全部静默排队——表现为 start 无输出无动作。处理：杀掉 `powershell.exe -File ...start-dream-skin.ps1` 残留进程即释放锁（注意过滤进程时别匹配到自己的命令行字面量，会自杀）。

## ★ v3.11（2026-08-20 凌晨，批判审查轮）

以批判视角复查自己的工作，发现并修复四类真问题：

1. **健康路径性能**（最大批判点）：guard 每分钟健康检查竟然跑 PowerShell + WMI 全进程扫描（300-800ms 磁盘/CPU 尖峰）——这是"还稍微有点卡"的残留源。重构为健康快路径纯 Node（fetch 探 CDP + `process.kill(pid, 0)` 探活，**零子进程**），实测 0.6s → **0.1s**；PowerShell/WMI 只在异常分支（pid 死/身份失配/CDP 死）才花这个钱。
2. **路径硬编码**：deploy.cjs 写死 `C:/Users/观/...` 和 `d:/Test/work1/...`（别人没法用、项目挪位置断链）——全部改 `LOCALAPPDATA` + `__dirname`/`import.meta.url` 相对解析。
3. **公有化隐私**：backup/ 含供应商配置（base_url、代理拓扑）与引擎源码副本——`.gitignore` 排除 + `git rm --cached`（本地保留作恢复保险，仓库不再含）。
4. **死代码**：`@keyframes ag-drift` 引用已删但定义残留，且 deploy.cjs 的 marker 检查还在验证它存在（检查器锁死死代码的双重屎山）——keyframes 已删，marker 检查改为 gold accent；头注释 SIGNATURES 段同步纠正。

## ★ v3.11（2026-08-20 凌晨，收尾轮）

**当前 Codex 26.814 运行 v3.11**，源文件 `preset/amethyst-gaze-v3.css`。收尾三件事：

1. **弹终端修复**：计划任务直接跑 node.exe（控制台程序）每分钟闪黑框——改走 `tools/ag-guard-launcher.vbs`（wscript 无窗口 + Run 隐藏拉起 node），`install-guard.ps1` 已更新并重注册。**两个编码坑方向相反，都已踩过**：ps1 必须带 BOM 的 UTF-8（否则 PS 5.1 当 ANSI 读中文注释，语法错乱 $action 为 null）；vbs 必须纯 ASCII（否则 wscript 按 ANSI 解析 UTF-8 中文注释直接弹"缺少对象"运行时错误——用户实机报过）。
2. **性能扫尾（v3.11）**：移除铭牌 ag-shimmer 5s 流光——background-position 动画非合成器友好，每帧重绘（常驻卡顿源）。金箔渐变文字静态保留。至此常驻动画清零：ag-drift（v3.10 已移除）、ag-shimmer（本轮）、ag-icon 仅 hover、ag-pulse 仅聚焦。
3. **目录清理**：删除全部一次性探针/截图/旧架构文件（probe-*/measure-*/shot-*/crop-*/sample-*、amethyst-gaze-advanced.css、theme.css 源、INSTALL.md、.preflight/、pages/、assets/、colors_and_type.css）。现存 17 个文件：preset 5（皮肤源全套）+ tools 6（部署链 + 守护 + 2 回归验证）+ backup 2（恢复保险）+ 文档 4。

## ★ v3.10（2026-08-19 深夜，输入栏/紫金/性能/持久化）

1. **输入栏整栏覆盖**：玻璃从 ComposerLayoutFooter（h=85）上移到 ComposerLayoutRoot（h=109 整栏，radius 25px）——v3.9 顶部 16px 工具区裸奔即"上下变窄"真身；Body 残留 blur(16px)（与 Root 18px 叠双层）一并清除。聚焦光环/亮色/reduced-motion 三处引用同步挂 Root。
2. **紫金全屋化**（GOLD ACCENT 段，8a2）：thread 标题金箔+紫金渐变底线、strong 金/em 亮紫相间、助手消息左缘紫金身份线、activity 小标题金箔、全屋 hover 金光（侧栏同款，排除发送按钮等专属 hover）。发送按钮紫→金渐变（`#8a5ab0`→`#e8c878`）+ 深色图标 + 双色光晕，禁用态暗玻璃。
3. **性能**：移除 ag-drift 44s 背景漂移（0.4% 幅度肉眼不可见，却让三层 backdrop-filter(18px) 每帧对全屏动态背景重采样——卡顿主因）。背景静态化后稳态零成本。
4. **持久化守护 ag-guard**（详见下节）。

### ag-guard 自愈守护（用户指定语义：与 Codex 同启动同关闭，其他时间不动作）

- `tools/ag-guard.mjs`（一次性进程，计划任务 **CodexDreamSkin AG Guard** 每 1 分钟 + 登录触发；安装：`tools/install-guard.ps1`，卸载：`schtasks /Delete /TN "CodexDreamSkin AG Guard" /F`）
- 铁律：Codex 没跑 → 永不主动启动 Codex、不拉 injector，静默退出；Codex 在跑 → 保证皮肤在线；guard 本身跑完即走，零常驻
- 三层自愈：
  - **快速路径**（CDP 活 + injector 死/browser-id 失配）：直接重拉 injector + 更新 state.json——已两次实机演练（杀 injector → 秒级重拉）；覆盖 CC Switch 切供应商后 Codex 重启场景
  - **完整接管**（Codex 在跑但无 CDP，冷却 2 周期 + 3 分钟间隔防抖）：spawn `start-dream-skin.ps1 -Port 9335 -RestartExisting`（重启 Codex 带 CDP）；覆盖手动开 Codex/升级后首启
    - ⚠ **必须带 `-RestartExisting`**（2026-08-19 用户"退出重进后皮肤丢失"的根因）：脚本在"Codex 无 CDP 运行"时无此开关会直接 throw（L176: 'Codex is open without a verified Dream Skin CDP endpoint...'），guard 无人值守天然持有接管授权；输出重定向 `guard-start.log`/`guard-start-error.log` 便于诊断
  - **引擎补丁自愈**：injector.mjs 两阶段退避补丁 + renderer-inject.js 的 ag-toggle 块，被上游更新覆盖时自动重打/重部署
- 实测闭环：用户退出重进 Codex（无 CDP 启动）→ guard 2 周期冷却后接管 → 杀 Codex 带 CDP 重启 → 新 browserId + injector 写入 state.json → 皮肤+切换按钮全量恢复（composer 整栏玻璃/紫金规则/切换闭环全绿）
- 日志：`%LOCALAPPDATA%\CodexDreamSkin\guard.log`（256KB 截断；健康态每小时 1 行心跳）；计数状态：`guard-state.json`
- Codex 升级不碰皮肤文件（皮肤在 LOCALAPPDATA，注入走 CDP 端口 + 实测 browser-id，不依赖版本化包路径）

## ★ 历史版本（2026-08-19 晚，v3.3）

### v3.3 关键改动（相对 v3.2）

- 画布 `::before` 从壳层容器（y≥40px）上移到全窗容器：`div:has(> div[class*="_ApplicationMenuTopBar_"])`，顶部 40px 菜单条不再露出 body 实心底色
- 菜单条 `position:relative; z-index:1` 提升到画布之上 + 按钮文字投影
- 背景定位 `-14.4% 53.4%`（容器变高后按新几何重算）
- 顶栏玻璃 alpha .52/.40 → .38/.28
- 三色强调线 160px → min(58%, 380px)

### 引擎热修：early-script 引导窗两阶段退避（2026-08-19 深夜，主题切换按钮里程碑）

主题切换按钮（`preset/ag-toggle.js`，由 `tools/deploy.cjs` 注入引擎 `renderer-inject.js`）上线后用户报"变回原主题了，但没有切到自定义主题的按键"。根因不在按钮，在引擎 `injector.mjs` 的 early script：原引导窗仅 10s，Codex 窗口后台/失焦时 Electron 节流，shell DOM 实测 38.8s 才提交——10s 后轮询放弃，payload（皮肤+按钮一体）永不安装。

热修（`tools/patch-early-window.cjs`，幂等可重跑）：`earlyPayloadFor` 引导窗改为两阶段——前 10s 每 250ms 轮询（前台路径），随后每 5s 退避轮询再守 10 分钟，之后硬停不留定时器。实测后台节流场景 38.8s 完整恢复（皮肤 active + 按钮挂回菜单条）。

- ⚠ `injector.mjs` 属引擎文件，上游更新会覆盖——覆盖后重跑 `node tools\patch-early-window.cjs` 再重启注入器即可
- 按钮点击修复（v3 根因）：菜单条是 `-webkit-app-region: drag` 拖拽区，且 **Shadow DOM 内 style 声明的 `-webkit-app-region` 不会被应用**（计算值实测 `none` 而非 `no-drag`）——必须用 JS inline style 在 document tree 的 host 元素上声明（`host.style.setProperty("-webkit-app-region", "no-drag")`）。注意 `tryMount` 里 `host.style.cssText = ""` 会清掉它，挂载时须重设。CDP `Input.dispatchMouseEvent` 注入点击**不经过** browser process 的 drag region 判断，故 CDP 测试通过 ≠ 真实鼠标可用；判定标准是 `getComputedStyle(host).getPropertyValue('-webkit-app-region')` 必须为 `no-drag`
- 按钮视觉（v3 扁平化）：开=纯色紫圆点 `#a86fd6`，关=灰空心环 `#8b95a5`，无 box-shadow 光晕、无 radial-gradient 立体感（像素验证：圆心精确 rgb(168,111,214)，边缘外零紫色污染）
- 验证工具：`tools/probe-click.cjs`（hit-test + 祖先链 app-region + 输入注入点击）、`tools/verify-reload.cjs`（reload 恢复）、`tools/test-toggle.cjs`（开↔关闭环：剥离→不自修复→还原；注意其假设初始态为 ON）

### ⚠ 两个会咬人的坑（当天踩过）

1. **active-theme/theme.css 里绝对不能有 CSS 注释**——safe-css-validator 会抛 `syntax/comment` 拒绝启动，注入器直接崩溃，现象是"样式全部没生效"。`preset/theme-cropped.css` 已去注释，部署脚本 `tools/deploy-v32.cjs` 直接复制它。
2. **引擎的 dream-skin.css watcher 不可靠**——改文件后热重载经常不触发。可靠流程：`node tools\deploy-v32.cjs` 部署 → 杀掉 node 进程 → 手动重启注入器（命令见下）。

### 注入器手动重启（官方脚本验证不过时的替代方案）

官方 `start-dream-skin.ps1 -RestartExisting` 在 Codex 窗口最小化/后台时会因 `documentHidden` 验证失败而回滚。手动拉起：

```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
$node = "C:\Users\观\AppData\Local\CodexDreamSkin\engine\runtime\node\node.exe"
Start-Process -FilePath $node -ArgumentList @(
  "C:\Users\观\AppData\Local\CodexDreamSkin\engine\scripts\injector.mjs",
  '--watch', '--port', '9335',
  '--browser-id', 'a4f4347b-6f13-4827-b757-976950336e05',
  '--theme-dir', 'C:\Users\观\AppData\Local\CodexDreamSkin\active-theme',
  '--pause-file', 'C:\Users\观\AppData\Local\CodexDreamSkin\paused'
) -WindowStyle Hidden
```

### 验证工具链（tools/ 目录）

- `probe-v32.cjs` — 关键指标探针（artSize/artFilter/sideBlur/compBlur）
- `shot-current.cjs` — DOM 状态 + 截图（已改用 v3.3 全窗画布选择器）
- `probe-topbar.cjs` / `probe-solid.cjs` — 顶部条带 / 实心元素扫描
- `sample-png.cjs` / `crop-png.cjs` — PNG 像素采样与裁剪（DPR=1.5，CSS 坐标×1.5=像素坐标）
- 视觉 QA 教训：**全图直接给视觉代理容易误判**（把模糊的深色头发误报成"实心块"）；先裁局部再问，结论可靠得多

### 待办

- 线程页（会话页）视觉验证：当前侧栏显示"无聊天"，没有可打开的线程；v3.2 的线程规则（透明阅读轨/玻璃泡/composer 全局门控）已部署但未截图验收
- 亮色模式未实机验收
- 第三层设计（人物动起来/背景 3D 化）未开始

## 项目背景

用户要为 Codex（OpenAI 的桌面编码客户端）做一套专属皮肤。技术路线已定：

1. **基于 CodexDreamSkin 做单皮肤二次开发**（不直接改 Codex app.asar，保留 CDP 注入核心）
2. **视觉目标分三层**：
   - 第一层：背景 + 换色组件（已完成，是当前大多数 Codex 皮肤的水平）
   - 第二层：每个组件单独设计、专属图案、独立动效、沉浸背景（**当前做到这里**）
   - 第三层：背景拆解、人物独立动起来、背景物体 3D 化、组件融入一体（未做）
3. **参考角色**：《欢迎来到实力至上主义的教室》的角色，带病娇气质，用户喜欢紫色
4. **明暗双模式**：白天/夜晚都要可用
5. **无安全隐患**：皮肤文件必须通过 safe-css-validator，不能破坏 Codex

## 用户偏好（来自记忆）

- 通信语言：中文
- UI 一致性优先于功能
- 偏好简洁，讨厌冗余
- 喜欢紫色
- 喜欢边看边修，不要每次重新构建

## 当前完成度

### 已完成

- **第二层设计**：5 个签名动效分布在 5 个组件 + 背景，每组件独立造型
- **HTML 预览**（`pages/index.html`，1082 行）：浏览器可看效果，明暗切换、hover 态全验证通过（9/9 PASS）
- **皮肤文件**（`preset/` 目录）：
  - `theme.json` — 元数据 + 明暗双模式色板
  - `theme.css` — 沙箱安全，**已通过 safe-css-validator**（22 规则 / 95 声明 / 4396 字节）
  - `background.jpg` — 参考背景图（用户刚换的新图，328KB）
  - `amethyst-gaze-advanced.css` — 629 行第二层高阶视觉，由主题 ID 严格门控
- **文档**：
  - `DESIGN.md` — 设计立意
  - `INSTALL.md` — 两档安装说明（A 基础安全 / B 完整视觉）
  - `RESEARCH.md` — CodexDreamSkin 源码调研结论（★ 下一个人必读，避免重复调研）
  - `HANDOFF.md` — 本文档

### 未完成 / 待定

1. **背景图刚换，焦点未调**：用户最后上传的新图（高俯视角、角色靠椅、床左桌右、暖色调），focusX/focusY 仍沿用旧图的 0.62/0.42，需要实际在 Codex 里看效果再调
2. **调色板可能要调暖**：当前调色板偏冷紫（深茄紫 #14101c + 紫水晶 #b079e0），新图整体偏暖（珊瑚粉/桃色/苔青）。如果用户觉得色调不匹配，需要把 `--amethyst-*-rgb` 往暖色靠
3. **未在真实 Codex 里验证**：只在浏览器 HTML 预览里验证过，没在 Codex 26.727+ 真实 renderer 里跑过。 selectors.json 标注了 Windows 26.727 仍需真实 renderer 验收
4. **运行器裁剪未做**：用户技术路线第 2–3 步（裁剪成单皮肤运行器、做成自动附着的 watcher）完全没动
5. **第三层设计未做**：用户说"先做到第二层"，第三层（人物动起来、背景 3D 化）是后续目标

## 文件清单

```
d:\Test\work1\amethyst-gaze-skin\
├── HANDOFF.md                       ★ 本文档（先读这个）
├── RESEARCH.md                      ★ 源码调研结论（第二读这个）
├── DESIGN.md                        设计立意说明
├── colors_and_type.css              调色板 token（hex + RGB triple 双形）
├── pages/
│   └── index.html                   HTML 预览（1082 行，浏览器打开看效果）
├── preset/                          ★ 皮肤文件（应用到 Codex 的部分）
│   ├── INSTALL.md                   两档安装说明
│   ├── theme.json                   皮肤元数据 + 明暗色板
│   ├── theme.css                    沙箱安全 CSS（Track 1）
│   ├── amethyst-gaze-advanced.css   高阶视觉 CSS（Track 2，gated base）
│   └── background.jpg               参考背景图（328KB，用户最后换的新图）
├── assets/
│   └── background.jpg               预览页用的背景图（同 preset 版本）
└── .preflight/
    └── preflight.html               HEAD 结构验证页
```

## 设计决策

### 立意

紫晶凝视——紫色主导的精英凝视感，表面优雅深处浓烈。

- 精英感 = 编辑式排版 + 金箔描边 + 衬线标题
- 病娇感 = 紫晶凝视的呼吸点 + 玫瑰暖色暗流 + 苔青冷色对位
- "被凝视"氛围 = 5 个签名动效分布在 5 个组件上

### 调色板（暗色 / 亮色）

| 语义 | 暗色 | 亮色 |
|---|---|---|
| background | `#14101c` 深茄紫 | `#f3e9f7` 淡紫雾 |
| panel | `#1c1428` | `#f5edf8` |
| panelAlt | `#2a1d3a` | `#ede0ee` |
| accent (紫晶) | `#b079e0` | `#7b3fb0` |
| accentAlt (玫瑰) | `#d98fb0` | `#c97a9a` |
| secondary (苔青) | `#6ba89a` | `#3a7a6e` |
| highlight (金箔) | `#c9a857` | `#a8884a` |
| text | `#f0e6f5` | `#2a1828` |

调色板设计：深茄紫做"浓"（低疲劳暗面），紫水晶做"亮"（焦点+呼吸点），玫瑰做"暖暗流"（藏在渐变末段），苔青做"冷对位"（平衡紫偏色），金箔做"prestige trim"（描边/指示条/缎带）。

### 5 个签名动效

| keyframe | 组件 | 周期 | 效果 |
|---|---|---|---|
| `amethyst-gaze-glow` | 侧栏活跃项指示条 | 3.2s | 紫晶光晕呼吸 |
| `amethyst-gaze-pulse` | 顶栏状态点 | 2.4s | 苔青脉冲 |
| `amethyst-gaze-breathe` | 标题牌右上紫晶点 | 4.2s | 紫晶凝视呼吸（opacity + box-shadow） |
| `amethyst-gaze-icon-breathe` | 建议卡图标 hover | 4s | 微缩放 1→1.06 |
| `amethyst-gaze-drift` | 首页背景 | 24s | 极慢漂移 62%42%→64%44% |

全部由 `@media (prefers-reduced-motion: reduce)` 关闭。

### 每组件独立造型（第二层 craft）

| 组件 | 专属图案 |
|---|---|
| 侧栏 | 木纹渐变（repeating-linear-gradient 38px 间隔金线）+ 金箔右沿 + 切面紫晶 brand mark |
| 顶栏 | 阅读灯暖晕（vertical gradient + blur+saturate）+ 底部金线 + 苔青状态药丸 |
| 标题牌 | 编辑式牌匾（左 3px 金边）+ 多层渐变玻璃 + 凝视 radial + 呼吸紫晶点 |
| 建议卡 | 四色语义（紫/玫/青/金，nth-child 注入 `--amethyst-card-accent-rgb`）+ 各自 SVG |
| 输入框 | 缎带顶（金→紫→金）+ 紫雾玻璃 + focus 扩散环 |
| 背景 | 参考图 + 双向暖紫纱（vertical depth + horizontal left-bleed）+ radial 暖点 + vignette |

## 双轨技术模型

皮肤视觉分两轨（沿用 Orchid Concourse 范本）：

- **Track 1 `theme.css`（沙箱安全）**：底色/边框/阴影/玻璃模糊/过渡。通过 safe-css-validator，22 规则 95 声明 4396 字节。不含 animation/transform/background-image/伪元素。
- **Track 2 `amethyst-gaze-advanced.css`（gated base）**：所有渐变/动效/图案/伪元素。由 `html[data-dream-skin="active"][data-dream-theme-id="preset-amethyst-gaze"]` 严格门控，只在本主题激活时生效，不影响其他主题。

详见 `RESEARCH.md` 的"核心技術模型：双轨制"章节。

## 验证状态

| 验证项 | 结果 |
|---|---|
| safe-css-validator（theme.css） | ✅ 通过，22 规则 / 95 声明 / 4396 字节 |
| 浏览器 HTML 预览渲染 | ✅ 9/9 PASS（明暗双模式 + hover 态） |
| 真实 Codex renderer 验证 | ❌ 未做（selectors.json 标注 Windows 26.727 仍需真实 renderer 验收） |

## 下一步建议（给下一个人）

### 如果用户要继续第二层

1. **先在真实 Codex 里装一次**：按 `preset/INSTALL.md` 档位 B 安装，看高阶视觉在 Codex 26.727+ 里的实际效果
2. **调背景焦点**：用户刚换的新图（高俯视角、角色靠椅、床左桌右），`theme.json` 的 `art.focusX/focusY` 可能要调。建议先在 Codex 里看背景图实际显示位置，再决定
3. **调色板可能要调暖**：新图整体偏暖（珊瑚粉/桃色/苔青枕），当前调色板偏冷紫。如果用户觉得不搭，把 `amethyst-gaze-advanced.css` 顶部的 `--amethyst-*-rgb` 往暖色靠（参考 RESEARCH.md 的色板逻辑）
4. **selectors.json 复核**：装上后用 Codex 的 DevTools 检查 L1/L2 锚点是否还在（Codex 升级后可能变）

### 如果用户要继续第三层

第三层目标：背景拆解、人物独立动起来、背景物体 3D 化、组件融入一体。

技术路径（需要超出 CodexDreamSkin 的能力）：
1. **人物独立动画**：把背景里的人物抠出来（需要 AI 抠图或手工 mask），做成独立 PNG 序列或 Lottie，用 CSS animation 做呼吸/眨眼/微微摆动
2. **背景物体 3D 化**：用 CSS 3D transform 或 Three.js 把背景里的物体（床/桌/巧克力盒）做成可交互的 3D 元素
3. **视差**：用 `pointer-events` + `transform: translate3d` 做鼠标视差，让背景有深度感
4. **组件融入**：把 Codex 的 sidebar/header/composer 重新设计成场景的一部分（例如 sidebar 做成书架、header 做成画框）

这需要：
- 美术资产（抠图、3D 模型）
- 可能要突破 CDP 注入的限制（用更深的 DOM 操作或 WebGL canvas 叠加）
- 性能优化（避免影响编码体验）

## 用户沟通要点

- 用户在另一个 AI 应用里已经做过详细调研，技术路线已定，不要重新质疑
- 用户偏好简洁，回答不要啰嗦
- 用户喜欢边看边修，不要每次重新构建
- 用户用中文沟通
- 用户最后说"我要换人做"——所以这份文档要让下一个人能完全接手，不依赖对话历史

## 关键文件路径速查

| 用途 | 路径 |
|---|---|
| CodexDreamSkin 源码 | `D:\yingyong\CodexDreamSkin` |
| 系统级 base CSS（高阶视觉追加到这里） | `D:\yingyong\CodexDreamSkin\payload\assets\dream-skin.css` |
| 沙箱安全契约 | `D:\yingyong\CodexDreamSkin\payload\assets\safe-css-policy.json` |
| Codex 真实 DOM 锚点 | `D:\yingyong\CodexDreamSkin\payload\assets\selectors.json` |
| 校验器 | `D:\yingyong\CodexDreamSkin\payload\assets\safe-css-validator.mjs` |
| Orchid Concourse 范本 | `D:\yingyong\CodexDreamSkin\payload\presets\preset-orchid-concourse\` |
| 本项目根目录 | `d:\Test\work1\amethyst-gaze-skin\` |
| HTML 预览 | `d:\Test\work1\amethyst-gaze-skin\pages\index.html` |
| 皮肤文件 | `d:\Test\work1\amethyst-gaze-skin\preset\` |
| 校验命令 | `& 'D:\yingyong\CodexDreamSkin\payload\runtime\node\node.exe' 'D:\yingyong\CodexDreamSkin\payload\scripts\validate-safe-css-file.mjs' '<theme.css>'` |
