# install.ps1 — 有栖（Arisu）一键安装
# 前置条件：CodexDreamSkin 引擎已安装（%LOCALAPPDATA%\CodexDreamSkin\engine）
# 用法：powershell -NoProfile -ExecutionPolicy RemoteSigned -File install.ps1
$ErrorActionPreference = 'Stop'
$engineDir = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine'
$nodeExe = Join-Path $engineDir 'runtime\node\node.exe'
$deployCjs = Join-Path $PSScriptRoot 'tools\deploy.cjs'
$startPs1 = Join-Path $engineDir 'scripts\start-dream-skin.ps1'

Write-Host '== 有栖 (Arisu) 安装 ==' -ForegroundColor Magenta

# 1. 前置检查
if (-not (Test-Path (Join-Path $engineDir 'scripts\injector.mjs'))) {
  throw '未找到 CodexDreamSkin 引擎（%LOCALAPPDATA%\CodexDreamSkin\engine）。请先安装引擎，本仓库是皮肤预设 + 工具链，不是独立应用。'
}
if (-not (Test-Path $nodeExe)) { throw "引擎 node 运行时缺失：$nodeExe" }
Write-Host '[1/4] 引擎检查通过' -ForegroundColor Green

# 2. 部署皮肤（CSS 三件套 + 切换按钮）
& $nodeExe $deployCjs
if ($LASTEXITCODE -ne 0) { throw 'deploy.cjs 失败，见上方输出' }
Write-Host '[2/4] 皮肤文件已部署' -ForegroundColor Green

# 3. 注册自愈守护计划任务（幂等）
& powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File (Join-Path $PSScriptRoot 'tools\install-guard.ps1')
if ($LASTEXITCODE -ne 0) { throw 'install-guard.ps1 失败' }
Write-Host '[3/4] 自愈守护已注册（每分钟静默自检，Codex 关闭时零动作）' -ForegroundColor Green

# 4. 重启 Codex 带 CDP 并应用皮肤（引擎脚本：未运行则启动，运行中则重启）
Write-Host '[4/4] 正在以 CDP 模式启动 Codex（约 1 分钟）...' -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $startPs1 -Port 9335 -RestartExisting

Write-Host ''
Write-Host '安装完成。左上角菜单条的紫晶圆点 = 皮肤切换按钮（开=紫点，关=空心环）。' -ForegroundColor Magenta
Write-Host '建议：把 %LOCALAPPDATA%\CodexDreamSkin 加入杀软白名单，避免启动组件被误删（详见 INSTALL.md 故障排查）。' -ForegroundColor Yellow
