# 有栖 · Arisu

OpenAI Codex 桌面版自定义皮肤：紫金配色的全窗玻璃拟态（glassmorphism）视觉系统，带页内主题切换按钮与自愈守护。

前身 Amethyst Gaze（紫晶凝视），v3.12 起更名「有栖」。基于 CodexDreamSkin 引擎的 Track 2 高阶视觉方案，适配 Codex 26.814。

## 特性

- **全窗画布**：整幅背景画布（含顶部菜单条净空带），轻模糊 + 暖夜墨底色
- **统一玻璃配方**：侧栏 / 顶栏 / 输入栏（整栏）/ 右面板 / 弹层 / 用户消息泡同族 `--ag-glass-*` token，明暗双模式
- **紫金相间**：金箔标题、紫金渐变强调线、AI 回复左缘紫金身份线、紫→金发送按钮、全屋 hover 金光反馈
- **页内切换按钮**：左上角菜单条紫晶圆点（开）/ 空心环（关），一键切换自定义与原版主题
- **自愈守护**：`ag-guard` 计划任务与 Codex 同生共死——CC Switch 切供应商、Codex 升级、电脑重启后皮肤自动恢复；Codex 关闭时零动作零常驻
- **性能优先**：常驻动画清零（背景漂移 / 铭牌流光已移除），backdrop-filter 稳态零成本

## 目录结构

```
├── preset/                    皮肤源文件
│   ├── amethyst-gaze-v3.css   主样式（Track 2，部署到引擎 dream-skin.css）
│   ├── theme-cropped.css      沙箱安全样式（Track 1，部署到 active-theme/theme.css）
│   ├── ag-toggle.js           页内主题切换按钮（注入 renderer-inject.js）
│   ├── theme.json             主题元数据 + 明暗色板
│   └── background.jpg         背景画布
├── tools/
│   ├── deploy.cjs             一键部署（CSS 三件套 → 引擎目录）
│   ├── ag-guard.mjs           自愈守护（一次性进程，计划任务每分钟调用）
│   ├── ag-guard-launcher.vbs  守护隐藏启动器（防终端闪黑框）
│   ├── install-guard.ps1      注册/更新守护计划任务
│   ├── verify-reload.cjs      回归：reload 后皮肤恢复验证
│   └── test-toggle.cjs        回归：切换按钮开↔关闭环验证
├── backup/                    引擎改造前备份（本地保留，不入库——含供应商配置）
└── HANDOFF.md / DESIGN.md / RESEARCH.md / RESTORE.md
```

## 部署

```powershell
# 1. 部署皮肤（需已安装 CodexDreamSkin 引擎）
node tools/deploy.cjs

# 2. 安装自愈守护计划任务（幂等）
powershell -NoProfile -ExecutionPolicy RemoteSigned -File tools/install-guard.ps1

# 3. 重启注入器或直接 reload Codex 生效
```

## 回归验证

```powershell
node tools/verify-reload.cjs   # reload 后皮肤 + 切换按钮自动恢复
node tools/test-toggle.cjs     # 切换闭环：剥离 → 不自修复 → 还原
```

## 文档

- [HANDOFF.md](HANDOFF.md) — 交接文档：版本历史、架构决策、踩坑记录（含 CDP 注入 / drag region / PS 编码等深坑）
- [DESIGN.md](DESIGN.md) — 设计规范
- [RESEARCH.md](RESEARCH.md) — CodexDreamSkin 引擎调研笔记
- [RESTORE.md](RESTORE.md) — 卸载与恢复原版指引
