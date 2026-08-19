# 有栖（Arisu）安装指南

OpenAI Codex 桌面版的紫金玻璃拟态皮肤。本仓库 = 皮肤预设 + 部署工具链 + 自愈守护。

## 前置条件

| 依赖 | 说明 |
|------|------|
| Windows 10/11 | 守护与注入链路仅实现在 Windows |
| Codex 桌面版 | 已登录可用的 Codex Desktop |
| CodexDreamSkin 引擎 | 皮肤的技术载体，须已安装在 `%LOCALAPPDATA%\CodexDreamSkin\engine`（有 `scripts\injector.mjs` 即算就绪） |

> 本仓库不是独立应用：它向已安装的 CodexDreamSkin 引擎部署主题文件。没有引擎时 `install.ps1` 会在第 1 步报错退出。

## 安装（一键）

```powershell
git clone https://github.com/zGuanZhe/youxi.git
cd youxi
powershell -NoProfile -ExecutionPolicy RemoteSigned -File install.ps1
```

安装器依次完成：引擎检查 → 皮肤部署（CSS 三件套 + 页内切换按钮）→ 自愈守护注册 → 以 CDP 模式重启 Codex 生效。

装好后：
- **左上角菜单条的紫晶圆点**是切换按钮：开 = 紫色实心圆点，关 = 灰色空心环
- 皮肤默认自动应用；关掉再开 Codex，约 1~2 分钟内自动恢复

## 升级 / 重装

重复跑 `install.ps1` 即可（全部步骤幂等）。

## 卸载

```powershell
powershell -NoProfile -ExecutionPolicy RemoteSigned -File uninstall.ps1
```

移除守护任务并调引擎 `restore-dream-skin.ps1 -Uninstall` 恢复原生外观。

## 自愈守护（ag-guard）

`CodexDreamSkin AG Guard` 计划任务每分钟静默自检（健康路径纯 Node 约 0.1s，跑完即退）：

- Codex 没跑 → 什么都不做（永不主动启动 Codex）
- Codex 在跑但皮肤掉线 → 自动重拉 injector / 以 CDP 模式重启 Codex（约 2~3 分钟内恢复）
- 电脑重启 / Codex 升级 / CC Switch 切供应商 → 同上自动恢复
- 日志：`%LOCALAPPDATA%\CodexDreamSkin\guard.log`

## 故障排查

**杀软误报**：启动快捷方式或计划任务可能被启发式引擎（如 `HEUR:Trojan/LNK.Agent.b`）误删。把 `%LOCALAPPDATA%\CodexDreamSkin\` 和本仓库目录加入杀软白名单。

**皮肤没生效**：
1. 看 `guard.log` 尾部（最后几行说明守护当前判断）
2. 手动触发守护：`wscript.exe tools\ag-guard-launcher.vbs`，等 30 秒
3. 兜底：`powershell -File "%LOCALAPPDATA%\CodexDreamSkin\engine\scripts\start-dream-skin.ps1" -Port 9335 -RestartExisting`

**spawn 链路诊断**：在 `%LOCALAPPDATA%\CodexDreamSkin\` 下建一个名为 `spawn-probe` 的空文件，等下一次守护运行（1 分钟内），然后看 `spawn-probe-out.log` 是否有 `probe ok`——用于验证 计划任务→wscript→node→wscript→powershell 全链路。

**注入器卡死（start 脚本无输出无动作）**：引擎有全局操作锁，被卡死的旧实例持有时后续调用会静默排队。任务管理器结束所有 `start-dream-skin` 的 powershell 进程即释放。

## 仓库结构

详见 [README.md](README.md)。核心：`preset/` 皮肤源文件、`tools/` 部署与守护链、`HANDOFF.md` 交接文档（含全部踩坑记录）。

## 已知限制

- CC Switch 等第三方工具启动的 Codex 不带 CDP 端口，守护恢复时**会重启一次 Codex**（把 CDP 带上）——这是引擎注入机制的本质约束
- `theme.css`（Track 1）禁止任何 CSS 注释，含注释会让引擎沙箱校验崩溃
- `.ps1` 必须是带 BOM 的 UTF-8；`.vbs` 必须纯 ASCII（编码坑详见 HANDOFF）
