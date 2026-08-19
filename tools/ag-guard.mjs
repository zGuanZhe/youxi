// ag-guard.mjs — Amethyst Gaze 皮肤自愈守护（一次性进程）
// ============================================================
// 由计划任务每 1 分钟调用，跑完即退：零常驻内存、零后台 CPU。
// 解决三大持久化场景（皮肤与 Codex 生命周期解耦）：
//   1) CC Switch 切换供应商 → Codex 重启 → browser-id 变化 →
//      旧 injector 身份锚点断开自杀 → guard 快速路径重拉 injector
//   2) Codex 升级/手动重启 → Codex 无 CDP 端口启动 → guard 调
//      start-dream-skin.ps1 重启 Codex 带 CDP（冷却 2 周期防抖）
//   3) 电脑重启 → 计划任务登录触发 + 每分钟重复 → 用户开 Codex
//      后 1 分钟内自动接管
// 额外自愈：injector.mjs 两阶段退避补丁、renderer-inject.js 的
//   ag-toggle 切换按钮块（引擎被上游更新覆盖时自动重打）。
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
const INJECTOR_MJS = path.join(STATE_ROOT, 'engine', 'scripts', 'injector.mjs');
const RENDERER_JS = path.join(STATE_ROOT, 'engine', 'assets', 'renderer-inject.js');
const START_PS1 = path.join(STATE_ROOT, 'engine', 'scripts', 'start-dream-skin.ps1');
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
    // -RestartExisting：Codex 无 CDP 运行时脚本要求显式授权才会杀进程
    // 重启（否则 throw 'Codex is open without...' 静默失败——2026-08-19
    // 用户退出重进后皮肤丢失的根因）。guard 的职责就是无人值守接管，
    // 天然持有该授权。输出重定向到文件，失败可诊断。
    const out = fs.openSync(path.join(STATE_ROOT, 'guard-start.log'), 'a');
    const err = fs.openSync(path.join(STATE_ROOT, 'guard-start-error.log'), 'a');
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'RemoteSigned',
      '-File', START_PS1, '-Port', String(port), '-RestartExisting'],
      { detached: true, stdio: ['ignore', out, err], windowsHide: true });
    child.unref();
    return true;
  } catch (e) { log('start script spawn failed: ' + e.message); return false; }
}

// ---------- 4. 主流程 ----------
// 同步语义铁律（用户指定：与 Codex 同启动同关闭，其他时间不动作）：
//   - Codex 没跑 → 永不主动启动 Codex、不拉 injector，静默退出
//   - Codex 在跑 → 保证皮肤在线（快速重拉 injector，或 start 接管）
//   - Codex 关闭 → injector 随身份锚点断开自行退出，guard 本身
//     是一次性进程，跑完即走——系统中不留任何常驻皮肤组件

async function main() {
  // 引擎补丁自愈（文件级，无条件先做；纯字符串检查，~1ms）
  healInjectorPatch();
  healToggleBlock();

  const state = readJson(STATE_PATH);
  const guardState = readJson(GUARD_STATE_PATH) || { noCdpCount: 0, lastStartAt: 0 };

  // 无 state：托盘从未 Apply 过，或上次回滚删除——完整 start
  if (!state || !state.port) {
    const procs = probeProcesses();
    if (procs.codexPids.length > 0) {
      log('no state.json but Codex is running — full start');
      callStartScript(9335);
    }
    return;
  }

  const browserId = await probeCdp(state.port);

  if (browserId) {
    guardState.noCdpCount = 0;
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
      callStartScript(state.port);
    }
    writeGuardState(guardState);
    return;
  }

  // CDP 死：Codex 在跑吗？（此处无法零成本判断，值得花一次扫描）
  const procs = probeProcesses();
  if (procs.codexPids.length === 0) {
    guardState.noCdpCount = 0; // Codex 没开：无事可做（等用户打开）
    writeGuardState(guardState);
    return;
  }

  // Codex 在跑但无 CDP（CC Switch 重启 / 用户手动开 / 升级后首启）
  guardState.noCdpCount += 1;
  // 冷却：连续 2 个周期（约 2 分钟）才动手——避开 CC Switch 切换中间态
  // 与 Codex 启动窗口；且距上次 start 至少 3 分钟（防验证失败循环）
  const sinceLastStart = Date.now() - (guardState.lastStartAt || 0);
  if (guardState.noCdpCount >= 2 && sinceLastStart > 3 * 60 * 1000) {
    log('Codex running without CDP — invoking start-dream-skin (restarts Codex with CDP)');
    guardState.noCdpCount = 0;
    guardState.lastStartAt = Date.now();
    callStartScript(state.port);
  } else {
    log(`Codex running without CDP (count=${guardState.noCdpCount}, cooldown ${Math.round(sinceLastStart / 1000)}s)`);
  }
  writeGuardState(guardState);
}

function writeGuardState(guardState) {
  try { fs.writeFileSync(GUARD_STATE_PATH, JSON.stringify(guardState, null, 2), 'utf8'); } catch {}
}

main().catch((e) => { log('fatal: ' + (e && e.message)); process.exit(1); });
