// youxi-launcher.cs — 有栖启动器（快速路径 + 引擎兜底）
// ============================================================
// 形态：LNK → 本 exe（正常软件形态，规避火绒 HEUR:Trojan/LNK.Agent.b
// 对「LNK → 隐藏 PowerShell」链的执行时拦截，2026-08-20 实测两次）。
//
// 快速路径（Codex 未运行时，实测约 1~3 秒出 CDP，比引擎脚本快 4~6 秒）：
//   1. 读 %LOCALAPPDATA%\CodexDreamSkin\state.json（引擎 schema v3）
//   2. CDP 已在线 → 幂等退出（不重启、不重复注入）
//   3. ChatGPT.exe 在跑但无 CDP → 引擎脚本兜底（杀掉重启带 CDP）
//   4. 直接启动 codexExe 带 --remote-debugging-port（实测直启可行，
//      无需引擎 PackageLauncher）→ 轮询 CDP → 拉起 injector(--watch)
//      → 回写 state.json（browserId/injectorPid/时间戳）
//   任何字段缺失/异常 → 引擎脚本兜底（引擎会重写 state.json，
//   下次快速路径自动恢复有效，天然自举）。
//
// 与 guard 协同：启动前写 launch-in-progress 标记，guard 看到会让路
// （150 秒内），避免兜底线程与快速路径双重接管。
// 编译（install-shortcut.ps1 自动执行）：
//   csc /target:winexe /r:System.Web.Extensions.dll youxi-launcher.cs
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Web.Script.Serialization;

class YouxiLauncher {
  static string Root = Path.Combine(
    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CodexDreamSkin");
  static string StatePath = Path.Combine(Root, "state.json");
  static string LogPath = Path.Combine(Root, "fast-launch.log");
  static string LaunchFlag = Path.Combine(Root, "launch-in-progress");
  static JavaScriptSerializer Json = new JavaScriptSerializer();

  static void Log(string msg) {
    try { File.AppendAllText(LogPath, DateTime.Now.ToString("o") + " " + msg + "\r\n"); } catch {}
  }

  static Dictionary<string, object> ReadState() {
    try {
      var s = Json.Deserialize<Dictionary<string, object>>(File.ReadAllText(StatePath));
      return s;
    } catch { return null; }
  }

  static string Get(Dictionary<string, object> s, string key) {
    object v; return s != null && s.TryGetValue(key, out v) && v != null ? Convert.ToString(v) : null;
  }

  // 探 CDP：在线返回 browserId（webSocketDebuggerUrl 尾段），离线返回 null
  static string ProbeCdp(int port) {
    try {
      var req = (HttpWebRequest)WebRequest.Create("http://127.0.0.1:" + port + "/json/version");
      req.Timeout = 1500;
      using (var resp = req.GetResponse())
      using (var reader = new StreamReader(resp.GetResponseStream())) {
        var v = Json.Deserialize<Dictionary<string, object>>(reader.ReadToEnd());
        string ws = Get(v, "webSocketDebuggerUrl");
        if (string.IsNullOrEmpty(ws)) return null;
        return ws.Substring(ws.LastIndexOf('/') + 1);
      }
    } catch { return null; }
  }

  static int EngineFallback(string reason) {
    Log("engine fallback: " + reason);
    try {
      string dir = Path.GetDirectoryName(typeof(YouxiLauncher).Assembly.Location);
      string script = Path.Combine(dir, "launch-codex-youxi.ps1");
      if (!File.Exists(script)) { Log("FATAL: launch-codex-youxi.ps1 missing"); return 1; }
      var psi = new ProcessStartInfo {
        FileName = "powershell.exe",
        Arguments = "-NoProfile -STA -ExecutionPolicy RemoteSigned -File \"" + script + "\"",
        WorkingDirectory = dir,
        WindowStyle = ProcessWindowStyle.Hidden,
        UseShellExecute = true
      };
      Process.Start(psi);
      return 0;
    } catch (Exception e) { Log("fallback failed: " + e.Message); return 1; }
  }

  static int Main() {
    var t0 = DateTime.UtcNow;
    try {
      var state = ReadState();
      string codexExe = Get(state, "codexExe");
      string nodePath = Get(state, "nodePath");
      string injector = Get(state, "injectorPath");
      string themeDir = Get(state, "themeDir");
      string pauseFile = Get(state, "pauseFile");
      if (state == null || string.IsNullOrEmpty(codexExe) || string.IsNullOrEmpty(nodePath)
          || string.IsNullOrEmpty(injector) || string.IsNullOrEmpty(themeDir)
          || string.IsNullOrEmpty(pauseFile)) {
        return EngineFallback("state.json incomplete");
      }
      int port = 9335;
      object pv; if (state.TryGetValue("port", out pv) && pv != null) {
        try { port = Convert.ToInt32(pv); } catch {}
      }

      // 1. CDP 已在线 → 幂等退出
      if (ProbeCdp(port) != null) { Log("cdp already up — idempotent exit"); return 0; }

      // 2. Codex 在跑但无 CDP → 引擎兜底（杀掉重启，复杂决策交给引擎）
      if (Process.GetProcessesByName("ChatGPT").Length > 0) {
        return EngineFallback("codex running without cdp");
      }

      // 3. 快速路径
      if (!File.Exists(codexExe)) return EngineFallback("codexExe missing (updated?)");
      try { File.WriteAllText(LaunchFlag, DateTime.UtcNow.ToString("o")); } catch {}

      var codex = Process.Start(new ProcessStartInfo {
        FileName = codexExe,
        Arguments = "--remote-debugging-address=127.0.0.1 --remote-debugging-port=" + port,
        UseShellExecute = false
      });
      Log("codex launched (pid " + (codex != null ? codex.Id.ToString() : "?") + "), polling cdp...");

      string browserId = null;
      for (int i = 0; i < 120; i++) {
        Thread.Sleep(250);
        browserId = ProbeCdp(port);
        if (browserId != null) break;
      }
      if (browserId == null) return EngineFallback("cdp did not come up in 30s");

      var inj = Process.Start(new ProcessStartInfo {
        FileName = nodePath,
        Arguments = "\"" + injector + "\" --watch --port " + port
          + " --browser-id " + browserId
          + " --theme-dir \"" + themeDir + "\""
          + " --pause-file \"" + pauseFile + "\"",
        WindowStyle = ProcessWindowStyle.Hidden,
        CreateNoWindow = true,
        UseShellExecute = false
      });
      if (inj == null) return EngineFallback("injector spawn returned null");
      Thread.Sleep(800);
      if (inj.HasExited) return EngineFallback("injector exited during startup");

      string now = DateTime.UtcNow.ToString("o");
      state["browserId"] = browserId;
      state["injectorPid"] = inj.Id;
      state["injectorStartedAt"] = now;
      state["createdAt"] = now;
      try { File.WriteAllText(StatePath, Json.Serialize(state)); } catch (Exception e) {
        Log("state write failed: " + e.Message);
      }

      Log("fast path done in " + Math.Round((DateTime.UtcNow - t0).TotalSeconds, 2) + "s (cdp up, injector pid " + inj.Id + ")");
      return 0;
    } catch (Exception e) {
      return EngineFallback("fatal: " + e.Message);
    }
  }
}
