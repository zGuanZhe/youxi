' ag-start-launcher.vbs - hidden launcher for start-dream-skin.ps1
' Invoked by ag-guard.mjs as a detached wscript spawn.
' WHY THIS EXISTS (measured 2026-08-20):
'   - detached powershell.exe dies instantly (DETACHED_PROCESS strips
'     the console a console-app needs at startup)
'   - non-detached powershell.exe dies when the parent node exits
'   - wscript.exe is a GUI app: it survives detached spawn, and its
'     Run(..., 0, False) launches powershell fully decoupled + hidden.
' Usage: wscript.exe ag-start-launcher.vbs <port>
Dim sh, port, root, cmd
Set sh = CreateObject("WScript.Shell")
port = WScript.Arguments(0)
root = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CodexDreamSkin"
cmd = "powershell.exe -NoProfile -ExecutionPolicy RemoteSigned -Command " & _
      """& '" & root & "\engine\scripts\start-dream-skin.ps1' -Port " & port & _
      " -RestartExisting *>> '" & root & "\guard-start.log'"""
sh.Run cmd, 0, False
