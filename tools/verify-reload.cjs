// reload 恢复验证：Page.reload 后轮询 early-script 安装结果
//   通过 = applied 置位 + 皮肤痕迹 + 切换按钮全部回来（新文档路径）
// 背景：旧版 10s 引导窗在后台节流渲染下提前放弃（applied=null，
//   皮肤与按钮双双丢失）→ 已改为两阶段退避（250ms×10s + 5s×10min）
const http = require('http');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9335, path }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

const readState = `(() => {
  const host = document.getElementById('ag-theme-toggle-host');
  const btn = host?.shadowRoot?.querySelector('button');
  const root = document.documentElement;
  return JSON.stringify({
    t: Date.now(),
    applied: window.__CODEX_DREAM_SKIN_EARLY_APPLIED__ ?? null,
    skinAttr: root.getAttribute('data-dream-skin'),
    themeId: root.getAttribute('data-dream-theme-id'),
    button: Boolean(host && host.isConnected),
    inBar: Boolean(host?.parentElement?.matches?.('div[class*="_ApplicationMenuTopBar_"]')),
    aria: btn?.getAttribute('aria-checked') ?? null,
  });
})()`;

async function main() {
  const targets = await getJson('/json');
  const pages = targets.filter((t) => t.type === 'page' && !t.url.includes('avatar-overlay'));
  const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
  await new Promise((r, e) => { ws.onopen = r; ws.onerror = e; });

  let msgId = 0;
  function send(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      const onmsg = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.id === id) {
          ws.removeEventListener('message', onmsg);
          if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
        }
      };
      ws.addEventListener('message', onmsg);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }
  const state = async () => {
    const r = await send('Runtime.evaluate', { expression: readState, returnByValue: true });
    return JSON.parse(r.result.value);
  };

  const before = await state();
  console.log('[before reload]', JSON.stringify(before));

  console.log('reloading...');
  const t0 = Date.now();
  await send('Page.reload', { ignoreCache: false });

  let last = null;
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 500));
    try { last = await state(); } catch { continue; } // 文档切换瞬间 evaluate 可能失败
    if (last.applied && last.skinAttr === 'active' && last.button) break;
  }

  console.log('[after reload ]', JSON.stringify(last));
  const dt = ((last.t || Date.now()) - t0) / 1000;
  const pass = last.applied && last.skinAttr === 'active' &&
    last.themeId === 'preset-amethyst-gaze' && last.button && last.aria === 'true';
  console.log('=== RESULT ===', pass ? 'PASS' : 'FAIL',
    '(recover in ' + dt.toFixed(1) + 's, inBar=' + last.inBar + ')');
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
