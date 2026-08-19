// ag-toggle 闭环测试：模拟点击按钮 → 验证皮肤开/关状态与自恢复 → 截图
const http = require('http');
const fs = require('fs');

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9335, path }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

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

  const readState = `(() => {
    const host = document.getElementById('ag-theme-toggle-host');
    const btn = host?.shadowRoot?.querySelector('button');
    const root = document.documentElement;
    const sheets = window.__CODEX_DREAM_SKIN_STYLE_SHEETS__;
    const adopted = [...document.adoptedStyleSheets];
    return JSON.stringify({
      buttonMounted: Boolean(host && host.isConnected),
      inBar: Boolean(host?.parentElement?.matches?.('div[class*="_ApplicationMenuTopBar_"]')),
      ariaChecked: btn?.getAttribute('aria-checked') ?? null,
      disabled: window.__CODEX_DREAM_SKIN_DISABLED__ === true,
      hasState: Boolean(window.__CODEX_DREAM_SKIN_STATE__),
      skinAttr: root.getAttribute('data-dream-skin'),
      themeIdAttr: root.getAttribute('data-dream-theme-id'),
      dsParts: document.querySelectorAll('[data-ds-part]').length,
      dsVars: [...root.style].filter((p) => p.startsWith('--ds-') || p.startsWith('--dream-')).length,
      skinSheetActive: Boolean(sheets && [...sheets].some((s) => adopted.includes(s))),
      styleNode: Boolean(document.getElementById('codex-dream-skin-style')),
    });
  })()`;

  const clickExpr = `(() => {
    document.getElementById('ag-theme-toggle-host')?.shadowRoot?.querySelector('button')?.click();
    return true;
  })()`;

  const shot = async (name) => {
    await send('Runtime.evaluate', { expression:
      '(async () => { for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); ' +
      'await new Promise((r) => setTimeout(r, 500)); })()', returnByValue: true }).catch(() => {});
    try {
      const png = await send('Page.captureScreenshot', { format: 'png' });
      const file = 'd:\\Test\\work1\\amethyst-gaze-skin\\tools\\' + name;
      fs.writeFileSync(file, Buffer.from(png.data, 'base64'));
      console.log('screenshot:', name);
    } catch {
      console.log('screenshot skipped (background throttling):', name);
    }
  };

  const state = async (label) => {
    const r = await send('Runtime.evaluate', { expression: readState, returnByValue: true });
    const s = JSON.parse(r.result.value);
    console.log('[' + label + ']', JSON.stringify(s));
    return s;
  };

  console.log('=== ag-toggle closed-loop test ===');
  await state('initial');
  await shot('toggle-on.png');

  console.log('--- click #1: skin OFF ---');
  await send('Runtime.evaluate', { expression: clickExpr, returnByValue: true });
  await new Promise((r) => setTimeout(r, 700));
  const off = await state('after OFF');
  await shot('toggle-off.png');

  console.log('--- wait 2s: engine must NOT self-repair ---');
  await new Promise((r) => setTimeout(r, 2000));
  const offLate = await state('OFF +2s');

  console.log('--- click #2: skin ON ---');
  await send('Runtime.evaluate', { expression: clickExpr, returnByValue: true });
  await new Promise((r) => setTimeout(r, 700));
  const on = await state('after ON');
  await shot('toggle-on-2.png');

  const pass = (s, expect) => Object.entries(expect).every(([k, v]) => s[k] === v);
  const results = {
    offClean: pass(off, { disabled: true, skinAttr: null, dsParts: 0, dsVars: 0, skinSheetActive: false,
      styleNode: false, ariaChecked: 'false' }),
    offStable: pass(offLate, { disabled: true, skinAttr: null, dsParts: 0 }),
    onRestored: !on.disabled && on.skinAttr === 'active' && on.dsParts > 0 && on.dsVars > 0 &&
      on.skinSheetActive === true && on.ariaChecked === 'true' && on.themeIdAttr === 'preset-amethyst-gaze',
  };
  console.log('=== RESULT ===', JSON.stringify(results));
  process.exit(Object.values(results).every(Boolean) ? 0 : 1);
}

main().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
