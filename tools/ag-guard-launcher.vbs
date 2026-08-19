' ag-guard-launcher.vbs — 计划任务隐藏启动器
' 计划任务直接跑 node.exe（控制台程序）会每分钟闪一次黑框；
' wscript 无窗口，Run(..., 0) 再以隐藏方式拉起 node，全程零闪烁。
' 必须保持用户会话运行（guard 会重启用户态 Codex，不能改 SYSTEM 账户）。
Set sh = CreateObject("WScript.Shell")
nodeExe = sh.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\CodexDreamSkin\engine\runtime\node\node.exe"
sh.Run """" & nodeExe & """ """ & Replace(WScript.ScriptFullName, "ag-guard-launcher.vbs", "ag-guard.mjs") & """", 0, False
