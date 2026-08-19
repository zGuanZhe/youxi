# uninstall.ps1 — 有栖（Arisu）卸载
# 移除守护计划任务 + 调引擎自带 restore-dream-skin 恢复原生外观
# 用法：powershell -NoProfile -ExecutionPolicy RemoteSigned -File uninstall.ps1
$ErrorActionPreference = 'Stop'
$engineDir = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin\engine'
$restorePs1 = Join-Path $engineDir 'scripts\restore-dream-skin.ps1'

Write-Host '== 有栖 (Arisu) 卸载 ==' -ForegroundColor Magenta

# 1. 移除守护计划任务
schtasks /Delete /TN 'CodexDreamSkin AG Guard' /F 2>$null
Write-Host '[1/2] 自愈守护计划任务已移除' -ForegroundColor Green

# 2. 引擎恢复原生主题（含 -Uninstall 完整清理）
if (Test-Path $restorePs1) {
  & powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -File $restorePs1 -Uninstall -ForceRestart
  Write-Host '[2/2] 引擎已恢复原生外观（Codex 将重启一次）' -ForegroundColor Green
} else {
  Write-Host '[2/2] 未找到引擎恢复脚本，跳过（可手动运行 restore-dream-skin.ps1）' -ForegroundColor Yellow
}

Write-Host '卸载完成。仓库目录可安全删除。' -ForegroundColor Magenta
