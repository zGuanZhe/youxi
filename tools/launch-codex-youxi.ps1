# launch-codex-youxi.ps1 — 有栖皮肤启动入口
# 由开始菜单快捷方式「Codex 有栖」调用（powershell -WindowStyle Hidden）。
# 语义：
#   Codex 未运行       → 带 CDP + injector + 皮肤冷启动（首帧即皮肤）
#   Codex 运行且无皮肤 → -RestartExisting 杀掉重启接管
#   Codex 运行且有皮肤 → 引擎幂等校验，不重启
# 日志：%LOCALAPPDATA%\CodexDreamSkin\skin-launch.log
$ErrorActionPreference = 'Continue'
$root   = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$engine = Join-Path $root 'engine\scripts\start-dream-skin.ps1'
$log    = Join-Path $root 'skin-launch.log'
$launchFlag = Join-Path $root 'launch-in-progress'

"=== $(Get-Date -Format o) shortcut launch ===" | Out-File -FilePath $log -Append -Encoding utf8
if (-not (Test-Path $engine)) {
  "FATAL: engine start script missing: $engine" | Out-File $log -Append -Encoding utf8
  exit 1
}

# 启动标记：guard 看到它会知道一次快捷方式启动正在进行中，
# 避免兜底路径在此窗口内重复接管（进程稳定但 CDP 尚未就绪的瞬间）
Set-Content -Path $launchFlag -Value (Get-Date -Format o) -Encoding ASCII

& powershell.exe -NoProfile -STA -ExecutionPolicy RemoteSigned -File $engine -Port 9335 -RestartExisting *>> $log
$code = $LASTEXITCODE
"=== exit $code ===" | Out-File $log -Append -Encoding utf8
exit $code
