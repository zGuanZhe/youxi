' ag-guard-launcher.vbs - hidden launcher for the scheduled task
' Runs node ag-guard.mjs with window style 0 (hidden) so the
' per-minute guard never flashes a console window.
Set sh = CreateObject("WScript.Shell")
nodeExe = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CodexDreamSkin\engine\runtime\node\node.exe"
guardMjs = Replace(WScript.ScriptFullName, "ag-guard-launcher.vbs", "ag-guard.mjs")
sh.Run """" & nodeExe & """ """ & guardMjs & """", 0, False
