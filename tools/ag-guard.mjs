// ag-guard.mjs — 有栖皮肤自愈守护（一次性进程 + 快捷方式协同）
// ============================================================
// 由计划任务每 1 分钟调用，跑完即退：零常驻内存、零后台 CPU。
// 日常主路径（2026-08-20 v3.14 起）：用户从开始菜单「Codex 有栖」
// 快捷方式启动 → 冷启动首帧即皮肤（launch-codex-youxi.ps1 一条龙），
// guard 不参与。guard 只兜底两条路径：
//   1) Codex 在跑但皮肤掉线（injector 死 / browser-id 变化）→ 快速重拉
//   2) 用户绕过快捷方式裸开 Codex（Store 入口 / CC Switch 直接拉起）→
//      无 CDP → 单周期即接管重启（原为 2 周期 + 3 分钟冷却，已提速）
// 额外自愈：injector.mjs 两阶段退避补丁、renderer-inject.js 的
//   ag-toggle 切换按钮块（引擎被上游更新覆盖时自动重打）。
//
// 接管防冲突三闸门（v3.14）：
//   - launch-in-progress 标记（快捷方式启动进行中 → 让路）
//   - lastStartAt 90s 冷却（防验证失败循环）
//   - 8s 进程稳定性复检（Codex 正在退出时 pids 会缩水 → 不接管，
//     杜绝"用户刚关 Codex 又被拉起来"的僵尸复活）
//
// 性能设计（v2 重构）：健康路径（最常见分支）只做 fetch 探 CDP +
// process.kill(pid, 0) 探活——全程纯 Node 零子进程；PowerShell/WMI
// 全进程扫描是重量级操作（300-800ms 磁盘/CPU 尖峰），只在异常
// 分支（pid 死 / 身份失配 / CDP 死）才花这个钱。
//
// 日志：LOCALAPPDATA\CodexDreamSkin\guard.log（256KB 截断）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';

const STATE_ROOT = path.join(process.env.LOCALAPPDATA, 'CodexDreamSkin');
const STATE_PATH = path.join(STATE_ROOT, 'state.json');
const GUARD_STATE_PATH = path.join(STATE_ROOT, 'guard-state.json');
const LOG_PATH = path.join(STATE_ROOT, 'guard.log');
const LAUNCH_FLAG = path.join(STATE_ROOT, 'launch-in-progress');
const INJECTOR_MJS = path.join(STATE_ROOT, 'engine', 'scripts', 'injector.mjs');
const RENDERER_JS = path.join(STATE_ROOT, 'engine', 'assets', 'renderer-inject.js');
const NODE_EXE = path.join(STATE_ROOT, 'engine', 'runtime', 'node', 'node.exe');
// 仓库内 deploy.cjs（本文件同目录），项目挪位置不断链
const DEPLOY_CJS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'deploy.cjs');
const LOG_MAX = 256 * 1024;

const log = (msg) => {
  const line = `[ag-guard] ${new Date().toISOString()} ${msg}\n`;
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > LOG_MAX) {
      const tail = fs.readFileSync(LOG_PATH, 'utf8').slice(-LOG_MAX / 2);
      fs.writeFileSync(LOG_PATH, tail);
    }
    fs.appendFileSync(LOG_PATH, line);
  } catch { /* 日志失败不阻断自愈 */ }
};

const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };

// 快捷方式启动标记年龄（秒）；Infinity = 无标记
const launchFlagAgeMs = () => {
  try { return Date.now() - fs.statSync(LAUNCH_FLAG).mtimeMs; } catch { return Infinity; }
};

// ---------- 1. 引擎补丁自愈 ----------

// 两阶段退避补丁（幂等；详见 HANDOFF.md「引擎热修」节）
const PATCH_ANCHOR = [
  '    if (install()) return;',
  '    document.addEventListener?.("DOMContentLoaded", install, { once: true });',
  '    bootstrapTimer = setInterval(install, 250);',
  '    timeout = setTimeout(stop, 10000);',
].join('\n');
const PATCH_REPLACEMENT = [
  '    if (install()) return;',
  '    document.addEventListener?.("DOMContentLoaded", install, { once: true });',
  '    // Two-phase bootstrap: 250ms polling for the first 10s covers foreground',
  '    // loads; then a 5s backoff keeps watching for another 10 minutes because',
  '    // background-throttled shells can take 30s+ to commit their DOM. Hard stop',
  '    // afterwards so idle documents never retain a timer.',
  '    bootstrapTimer = setInterval(install, 250);',
  '    timeout = setTimeout(() => {',
  '      stop();',
  '      bootstrapTimer = setInterval(install, 5000);',
  '      timeout = setTimeout(stop, 600000);',
  '    }, 10000);',
].join('\n');

function healInjectorPatch() {
  try {
    let src = fs.readFileSync(INJECTOR_MJS, 'utf8');
    if (src.includes('backoff keeps watching for another 10 minutes')) return false; // 已打
    if (!src.includes(PATCH_ANCHOR)) { log('patch anchor missing (engine updated upstream?), skip'); return false; }
    src = src.replace(PATCH_ANCHOR, () => PATCH_REPLACEMENT);
    fs.writeFileSync(INJECTOR_MJS, src, 'utf8');
    log('injector.mjs two-phase patch re-applied');
    return true;
  } catch (e) { log('patch heal failed: ' + e.message); return false; }
}

// ag-toggle 块自愈（缺失 → 重跑 deploy.cjs，幂等）
function healToggleBlock() {
  try {
    const js = fs.readFileSync(RENDERER_JS, 'utf8');
    if (js.includes('__AG_TOGGLE_REGISTRY__')) return false; // 已在
    if (!fs.existsSync(DEPLOY_CJS)) { log('deploy.cjs missing, cannot heal toggle'); return false; }
    log('ag-toggle block missing (engine updated?), re-deploying');
    execFileSync(NODE_EXE, [DEPLOY_CJS], { timeout: 60000, stdio: 'pipe' });
    return true;
  } catch (e) { log('toggle heal failed: ' + e.message); return false; }
}

// ---------- 2. 环境探测 ----------

async function probeCdp(port) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const version = await res.json();
    const m = (version.webSocketDebuggerUrl || '').match(/\/devtools\/browser\/([A-Za-z0-9._-]+)$/);
    return m ? m[1] : null;
  } catch { return null; }
}

// 零成本进程探活：signal 0 不发信号只校验权限/存在性
const pidAlive = (pid) => {
  if (!pid || typeof pid !== 'number') return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
};

// 重量级全进程扫描（PowerShell+WMI，300-800ms）——仅异常分支使用
function probeProcesses() {
  try {
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command',
      `Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'ChatGPT.exe' -or ($_.Name -eq 'node.exe' -and $_.CommandLine -like '*injector.mjs*') } | Select-Object ProcessId, CommandLine | ConvertTo-Json -Compress`,
    ], { timeout: 15000, encoding: 'utf8', windowsHide: true });
    const parsed = out.trim() ? JSON.parse(out) : [];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const isInjector = (p) => String(p.CommandLine || '').includes('injector.mjs');
    return {
      injectorPids: list.filter(isInjector).map((p) => p.ProcessId),
      codexPids: list.filter((p) => !isInjector(p)).map((p) => p.ProcessId),
    };
  } catch (e) {
    log('process probe failed: ' + e.message);
    return { injectorPids: [], codexPids: [] };
  }
}

// ---------- 3. 自愈动作 ----------

function pullInjector(state, browserId) {
  try {
    const out = fs.openSync(path.join(STATE_ROOT, 'injector.log'), 'a');
    const err = fs.openSync(path.join(STATE_ROOT, 'injector-error.log'), 'a');
    const child = spawn(NODE_EXE, [
      state.injectorPath, '--watch', '--port', String(state.port),
      '--browser-id', browserId, '--theme-dir', state.themeDir,
      '--pause-file', state.pauseFile,
    ], { detached: true, stdio: ['ignore', out, err], windowsHide: true });
    child.unref();
    // 等 800ms 确认没秒退
    return new Promise((resolve) => {
      setTimeout(() => {
        const alive = !child.exitCode && child.pid;
        if (alive) {
          state.browserId = browserId;
          state.injectorPid = child.pid;
          state.injectorStartedAt = new Date().toISOString();
          state.createdAt = new Date().toISOString();
          try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 4), 'utf8'); } catch {}
        }
        resolve(alive);
      }, 800);
    });
  } catch (e) { log('pull injector failed: ' + e.message); return Promise.resolve(false); }
}

function callStartScript(port) {
  try {
    // 启动走 wscript 中介链（ag-start-launcher.vbs）：detached 直启
    // powershell 会因 DETACHED_PROCESS 失去控制台秒死；非 detached 则
    // 随父进程退出被杀（均经 2026-08-20 矩阵实验实测）。wscript 是 GUI
    // 应用可安然 detached，其 Run(0, False) 再拉起完全解耦的隐藏
    // powershell。-RestartExisting：Codex 无 CDP 运行时脚本要求显式
    // 授权才会杀进程重启，guard 的职责就是无人值守接管，天然持有该
    // 授权。输出由 VBS 内 *>> 重定向到 guard-start.log，失败可诊断。
    const launcher = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-start-launcher.vbs');
    if (!fs.existsSync(launcher)) { log('FATAL: ag-start-launcher.vbs missing at ' + launcher); return false; }
    const child = spawn('wscript.exe', [launcher, String(port)],
      { detached: true, windowsHide: true, stdio: 'ignore' });
    child.on('error', (e) => log('start launcher spawn ERROR (async): ' + e.message));
    child.unref();
    return true;
  } catch (e) { log('start launcher failed: ' + e.message); return false; }
}

// spawn 链路探针：STATE_ROOT 下放一个 spawn-probe 文件（内容随意），
// 下次 guard 运行时经 wscript 中介链做一次隐藏 powershell 实验并写
// spawn-probe-out.log，然后删除探针文件恢复正常流程。用于验证
// 「计划任务→wscript→node→wscript→powershell」链路存活性。
function runSpawnProbe() {
  const probeFlag = path.join(STATE_ROOT, 'spawn-probe');
  if (!fs.existsSync(probeFlag)) return false;
  try { fs.unlinkSync(probeFlag); } catch {}
  log('spawn probe: launching via wscript chain');
  try {
    const launcher = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ag-probe-launcher.vbs');
    const child = spawn('wscript.exe', [launcher],
      { detached: true, windowsHide: true, stdio: 'ignore' });
    child.on('error', (e) => log('spawn probe ERROR (async): ' + e.message));
    child.unref();
  } catch (e) { log('spawn probe throw: ' + e.message); }
  return true;
}

// ---------- 4. 主流程 ----------
// 同步语义铁律（用户指定：与 Codex 同启动同关闭，其他时间不动作）：
//   - Codex 没跑 → 永不主动启动 Codex、不拉 injector，静默退出
//   - Codex 在跑 → 保证皮肤在线（快速重拉 injector，或 start 接管）
//   - Codex 关闭 → injector 随身份锚点断开自行退出，guard 本身
//     是一次性进程，跑完即走——系统中不留任何常驻皮肤组件

async function main() {
  // spawn 链路探针（诊断模式，探针文件存在时仅做实验）
  if (runSpawnProbe()) return;

  // 引擎补丁自愈（文件级，无条件先做；纯字符串检查，~1ms）
  healInjectorPatch();
  healToggleBlock();

  const state = readJson(STATE_PATH);
  const guardState = readJson(GUARD_STATE_PATH) || { lastStartAt: 0 };

  // 无 state：托盘从未 Apply 过，或上次回滚删除——完整 start
  // （快捷方式启动进行中时让路，避免与引擎脚本双重接管）
  if (!state || !state.port) {
    if (launchFlagAgeMs() < 150 * 1000) {
      log('no state but shortcut launch in flight — standing by');
      return;
    }
    const procs = probeProcesses();
    if (procs.codexPids.length > 0) {
      log('no state.json but Codex is running — full start');
      guardState.lastStartAt = Date.now();
      writeGuardState(guardState);
      callStartScript(9335);
    }
    return;
  }

  const browserId = await probeCdp(state.port);

  if (browserId) {
    const idMatches = state.browserId === browserId;

    // ★ 健康快路径（最常见）：CDP 活 + state 记录的 injector pid
    //   活 + 身份匹配 → 纯 Node 零子进程，直接静默退出。
    //   只有 pid 探活失败才落到重量级全进程扫描兜底。
    if (idMatches && pidAlive(state.injectorPid)) {
      const now = Date.now();
      if (now - (guardState.lastHealthyLogAt || 0) > 60 * 60 * 1000) {
        guardState.lastHealthyLogAt = now;
        log('healthy (skin active, injector alive, browser-id match)');
      }
      writeGuardState(guardState);
      return;
    }

    // 异常路径：才花 PowerShell+WMI 的钱查全进程
    const procs = probeProcesses();
    const injectorAlive = procs.injectorPids.length > 0;

    if (injectorAlive && idMatches) {
      // state 的 pid 旧了但 injector 其实活着（如手动重启过）→ 只修 state
      if (!procs.injectorPids.includes(state.injectorPid)) {
        state.injectorPid = procs.injectorPids[0];
        try { fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 4), 'utf8'); } catch {}
      }
      writeGuardState(guardState);
      return;
    }

    if (injectorAlive && !idMatches) {
      // 有 injector 但身份旧（Codex 已换实例）→ 杀旧拉新
      log('stale injector (browser-id changed) — recycling');
      for (const pid of procs.injectorPids) {
        try { process.kill(pid); } catch {}
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    log(`pulling injector (alive=${injectorAlive}, idMatch=${idMatches})`);
    const ok = await pullInjector(state, browserId);
    if (!ok) {
      log('quick pull failed — falling back to full start');
      guardState.lastStartAt = Date.now();
      callStartScript(state.port);
    }
    writeGuardState(guardState);
    return;
  }

  // CDP 死：Codex 在跑吗？（此处无法零成本判断，值得花一次扫描）
  const procs = probeProcesses();
  if (procs.codexPids.length === 0) {
    writeGuardState(guardState); // Codex 没开：无事可做（等用户打开）
    return;
  }

  // Codex 在跑但无 CDP（绕过快捷方式的裸启动 / CC Switch 直接拉起 /
  // 升级后首启）。v3.14 提速：单周期接管 + 三闸门防冲突。
  if (launchFlagAgeMs() < 150 * 1000) {
    log('Codex without CDP but shortcut launch in flight — standing by');
    writeGuardState(guardState);
    return;
  }
  const sinceLastStart = Date.now() - (guardState.lastStartAt || 0);
  if (sinceLastStart < 90 * 1000) {
    log(`Codex without CDP but start cooldown ${Math.round(sinceLastStart / 1000)}s — standing by`);
    writeGuardState(guardState);
    return;
  }
  // 进程稳定性复检：全部 pid 8 秒后仍在才算稳定会话。
  // 正在退出的 Codex（用户主动关闭）renderer 子进程会先消失 → 不接管，
  // 杜绝"刚关掉又被拉起来"的僵尸复活。
  const allAliveNow = procs.codexPids.every((pid) => pidAlive(pid));
  if (!allAliveNow) {
    log('Codex processes churning (closing?) — standing by');
    writeGuardState(guardState);
    return;
  }
  await new Promise((r) => setTimeout(r, 8000));
  const allAliveAfter = procs.codexPids.every((pid) => pidAlive(pid));
  if (!allAliveAfter) {
    log('Codex exited during stability check — standing by (user closed it)');
    writeGuardState(guardState);
    return;
  }

  log('Codex running without CDP (stable) — invoking start-dream-skin');
  guardState.lastStartAt = Date.now();
  callStartScript(state.port);
  writeGuardState(guardState);
}

function writeGuardState(guardState) {
  try { fs.writeFileSync(GUARD_STATE_PATH, JSON.stringify(guardState, null, 2), 'utf8'); } catch {}
}

main().catch((e) => { log('fatal: ' + (e && e.message)); process.exit(1); });
