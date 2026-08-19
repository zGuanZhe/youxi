# install-guard.ps1 — 注册 ag-guard 自愈守护计划任务
# 语义：与 Codex 同启动同关闭——只在 Codex 运行期间自愈皮肤，
#       Codex 关闭时不做任何动作（绝不主动拉起 Codex）。
# 任务形态：每 1 分钟瞬时执行（零常驻内存），登录时也触发一次。
# 幂等：重复运行会覆盖旧任务定义。
# 卸载：schtasks /Delete /TN "CodexDreamSkin AG Guard" /F
$ErrorActionPreference = 'Stop'

$taskName = 'CodexDreamSkin AG Guard'
$launcher = Join-Path $PSScriptRoot 'ag-guard-launcher.vbs'
$guardScript = Join-Path $PSScriptRoot 'ag-guard.mjs'

if (-not (Test-Path $launcher)) { throw "launcher not found: $launcher" }
if (-not (Test-Path $guardScript)) { throw "guard script not found: $guardScript" }

# 直接跑 node.exe（控制台程序）会每分钟闪黑框——wscript 无窗口，
# VBS 内再以隐藏方式拉起 node，全程零闪烁。
$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$launcher`"" -WorkingDirectory $PSScriptRoot

# 每 1 分钟重复（10 年时长——MaxValue 会溢出任务 XML）+ 登录触发
$timeTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes 1) `
  -RepetitionDuration (New-TimeSpan -Days 3650)
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $taskName `
  -Action $action `
  -Trigger @($timeTrigger, $logonTrigger) `
  -Settings $settings `
  -Description 'Amethyst Gaze skin self-healing: keeps the skin alive only while Codex runs; never launches Codex by itself.' `
  -Force | Out-Null

Write-Host "installed: $taskName (every 1 min + at logon)"
Write-Host 'log: %LOCALAPPDATA%\CodexDreamSkin\guard.log'
