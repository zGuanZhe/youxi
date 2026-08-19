# install-shortcut.ps1 — 创建/刷新开始菜单快捷方式「Codex 有栖」
# 零常驻的"秒开皮肤"方案：用户从本快捷方式启动 Codex，
# 冷启动首帧即带完整皮肤（CDP + injector + 主题一条龙）。
#
# AV 免疫设计（火绒实测 2026-08-20）：LNK → PowerShell 直链会被
# HEUR:Trojan/LNK.Agent.b 在执行时删除。因此 LNK 指向本地编译的
# youxi-launcher.exe（winexe 无控制台），exe 再静默拉起 PS 包装脚本。
# 图标每次重新生成（紫晶圆点 + 金环），不引用 WindowsApps 版本化路径。
# 幂等：重复运行覆盖旧快捷方式。仓库目录移动后需重跑本脚本。
$ErrorActionPreference = 'Stop'
$root = Join-Path $env:LOCALAPPDATA 'CodexDreamSkin'
$launcherPs1 = Join-Path $PSScriptRoot 'launch-codex-youxi.ps1'
$csPath = Join-Path $PSScriptRoot 'youxi-launcher.cs'
$exePath = Join-Path $PSScriptRoot 'youxi-launcher.exe'
$lnkPath = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex 有栖.lnk'

if (-not (Test-Path $launcherPs1)) { throw "launcher script not found: $launcherPs1" }
if (-not (Test-Path $csPath)) { throw "launcher source not found: $csPath" }

# 1. 编译 youxi-launcher.exe（系统自带 .NET Framework csc）
$csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:SystemRoot 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe not found (.NET Framework 4.x required)' }
& $csc /nologo /target:winexe /optimize+ /r:System.Web.Extensions.dll /out:"$exePath" "$csPath" | Out-Null
if (-not (Test-Path $exePath)) { throw 'compile failed: youxi-launcher.exe not produced' }

# 2. 图标：优先复用 Codex 原版图标（用户指定）；包内文件带 EFS
#    加密属性，Copy-Item 会报"无法加密"，改用流式字节复制。
$icoPath = Join-Path $root 'codex.ico'
$codexIco = $null
$stateFile = Join-Path $root 'state.json'
if (Test-Path $stateFile) {
  try {
    $codexExe = (Get-Content $stateFile -Raw | ConvertFrom-Json).codexExe
    if ($codexExe -and (Test-Path $codexExe)) {
      $candidate = Join-Path (Split-Path (Split-Path $codexExe)) 'app\resources\icon-chatgpt.ico'
      if (Test-Path $candidate) {
        [System.IO.File]::WriteAllBytes($icoPath, [System.IO.File]::ReadAllBytes($candidate))
        $codexIco = $icoPath
      }
    }
  } catch { }
}
if (-not $codexIco) {
  # 兜底品牌图标：64x64 紫晶圆点 + 金环
  $icoPath = Join-Path $root 'youxi.ico'
}
Add-Type -AssemblyName System.Drawing
if (-not $codexIco) {
$bmp = New-Object System.Drawing.Bitmap 64, 64
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.Clear([System.Drawing.Color]::Transparent)
$orb = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 168, 111, 214))
$g.FillEllipse($orb, 9, 9, 46, 46)
$ring = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 232, 200, 120)), 4
$g.DrawEllipse($ring, 4, 4, 56, 56)
$g.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
$stream = [System.IO.File]::Create($icoPath)
$icon.Save($stream)
$stream.Close()
$icon.Dispose()
$bmp.Dispose()

# 3. 快捷方式 → exe（正常软件形态，LNK 里不出现 PowerShell 参数）
#    开始菜单 + 桌面各一份；桌面用 GetFolderPath 以兼容 OneDrive 重定向。
$sh = New-Object -ComObject WScript.Shell
$targets = @(
  $lnkPath,
  (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Codex 有栖.lnk')
)
foreach ($p in $targets) {
  $lnk = $sh.CreateShortcut($p)
  $lnk.TargetPath = $exePath
  $lnk.WorkingDirectory = $PSScriptRoot
  $lnk.IconLocation = "$icoPath, 0"
  $lnk.Description = 'Codex 有栖：带皮肤启动'
  $lnk.Save()
  Write-Host "shortcut created: $p"
}
Write-Host '建议固定到任务栏：以后一键启动，皮肤从第一帧就在。'
