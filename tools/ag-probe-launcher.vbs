' ag-probe-launcher.vbs - spawn-chain diagnostic probe
' Writes one timestamped line to spawn-probe-out.log through a hidden,
' fully decoupled powershell. Used by ag-guard.mjs when the file
' <LOCALAPPDATA>\CodexDreamSkin\spawn-probe exists.
Dim sh, root
Set sh = CreateObject("WScript.Shell")
root = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CodexDreamSkin"
cmd = "powershell.exe -NoProfile -Command " & _
      """Write-Output ('probe ok ' + (Get-Date -Format o)) *>> '" & root & "\spawn-probe-out.log'"""
sh.Run cmd, 0, False
