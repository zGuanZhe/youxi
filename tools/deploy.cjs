// 部署 Amethyst Gaze 皮肤：
//   1) 裁剪版 theme.css → active-theme（Track 1，沙箱安全）
//   2) 替换引擎 dream-skin.css 皮肤块（Track 2，高阶视觉）
//      2a) 引擎 head 路由级 :has() → data-ag-* 属性选择器（v3.16 性能工程）
//   3) 把页内主题切换按钮（ag-toggle）注入引擎 renderer-inject.js
//      3a) 引擎 partObserver 双档调度补丁（流式 12.5Hz → 3.6Hz）
// 用法：node tools/deploy.cjs  （部署后重启注入器或 reload Codex 生效）
const fs = require('fs');
const path = require('path');

// 路径零硬编码：引擎目录走 LOCALAPPDATA，皮肤源走仓库相对路径
const STATE_ROOT = path.join(process.env.LOCALAPPDATA, 'CodexDreamSkin');
const PRESET_DIR = path.join(__dirname, '..', 'preset');
const ENGINE_CSS = path.join(STATE_ROOT, 'engine', 'assets', 'dream-skin.css');
const ENGINE_JS = path.join(STATE_ROOT, 'engine', 'assets', 'renderer-inject.js');
const SKIN_SRC = path.join(PRESET_DIR, 'amethyst-gaze-v3.css');
const THEME_CROPPED = path.join(PRESET_DIR, 'theme-cropped.css');
const TOGGLE_SRC = path.join(PRESET_DIR, 'ag-toggle.js');
const THEME_TARGET = path.join(STATE_ROOT, 'active-theme', 'theme.css');

// 1) theme.css 裁剪 + theme.json 元数据（去实心背景；注意：theme.css
//    禁止任何 CSS 注释，否则沙箱校验崩溃）
const cropped = fs.readFileSync(THEME_CROPPED, 'utf8');
fs.writeFileSync(THEME_TARGET, cropped, 'utf8');
const themeMetaSrc = path.join(PRESET_DIR, 'theme.json');
const themeMetaTarget = path.join(STATE_ROOT, 'active-theme', 'theme.json');
fs.copyFileSync(themeMetaSrc, themeMetaTarget);
console.log('theme.css + theme.json deployed (solid backgrounds removed).');

// 2) dream-skin.css：截断旧皮肤块并注入当前源
//    块头定位双兼容：优先新名「有栖 v3」，兜底旧名 "Amethyst Gaze v3"
//    （引擎现存块可能是改名前部署的旧头）
const css = fs.readFileSync(ENGINE_CSS, 'utf8');
const lines = css.split('\n');
let cutIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (/有栖 v3/.test(lines[i]) || /Amethyst Gaze v3/.test(lines[i])) { cutIdx = i; break; }
}
if (cutIdx < 0) { console.error('FATAL: skin block header not found'); process.exit(1); }
// 回退到块注释开始（/* ==== 行）
let blockStart = cutIdx;
while (blockStart > 0 && !/\/\* =+/.test(lines[blockStart])) blockStart--;
while (blockStart > 0 && /^\s*$/.test(lines[blockStart - 1])) blockStart--;

const head = lines.slice(0, blockStart).join('\n');

// 2a) 引擎 head 路由级 :has() → data-ag-* 属性选择器（v3.16 性能工程）
//     语义由 ag-toggle.js 的 AG-ROUTE 标注器保证（主题无关，随引擎注入）：
//       data-ag-home    ≡ [role="main"]:has([data-testid="home-icon"])
//       data-ag-bare    ≡ main:is(...):not(:has([role="main"]))
//       data-ag-surface ≡ html:has(main:is(...))（html 级门控，正/负共用）
//     流式输出时每个 token 的 childList 变更都会触发挂在这些选择器上的
//     :has() 失效重算；替换为属性选择器后重算成本归零。
//     有意保留（流式期间零成本）：[data-ds-part] 作用域 :has()（属性写
//     罕见）、子代组合器 :has(>)、首页静态门控内层 :has()、thread 头部
//     div.sticky:has(input)。
const MAIN_IS = 'main:is\\(\\.main-surface,\\s*\\[data-app-shell-main-surface\\],\\s*\\[class\\*="_MainContentSurface_"\\]\\)';
const MAIN_IS_LITERAL = 'main:is(.main-surface, [data-app-shell-main-surface], [class*="_MainContentSurface_"])';

// 主体断言：:has(main:is(...)) 的每一处都必须直接挂在 html 复合选择器上
// （html 级门控语义）。逐匹配回溯：从行首到匹配点剥离平衡 ()/[] 内容，
// 剩余顶层文本去掉伪类名后，最后一个逗号段必须恰好是 "html"——允许
// 属性选择器与 :is()/:not() 夹杂（引擎真实形态）。
// 其他主体出现 = 引擎结构变化，必须人工复核。
const surfaceHasCount = (head.match(new RegExp('(:not\\()?:has\\(' + MAIN_IS, 'g')) || []).length;
const findSubjectOffenders = (text) => {
  const offenders = [];
  const generic = new RegExp('(:not\\()?:has\\(' + MAIN_IS, 'g');
  for (const m of text.matchAll(generic)) {
    const before = text.slice(0, m.index);
    const lineStart = before.lastIndexOf('\n') + 1;
    const seg = before.slice(lineStart);
    let depth = 0, flat = '';
    for (const ch of seg) {
      if (ch === '(' || ch === '[') depth++;
      else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
      else if (depth === 0) flat += ch;
    }
    flat = flat.replace(/:(not|is|has|where)/g, '');
    const lastSeg = flat.split(',').pop().trim();
    if (lastSeg !== 'html') {
      offenders.push(text.slice(lineStart, m.index + 48).replace(/\n/g, ' ').trim());
    }
  }
  return offenders;
};
const subjectOffenders = findSubjectOffenders(head);
if (subjectOffenders.length) {
  console.error('FATAL: :has(main:is(...)) on non-html subject — engine shape changed, manual review required:');
  subjectOffenders.slice(0, 5).forEach((l) => console.error('  offender: ' + l.slice(0, 200)));
  process.exit(1);
}

const headReplacements = [
  // P4a 负向 html 门控（先行：其文本包含 P4b 模式）
  [new RegExp(':not\\(:has\\(' + MAIN_IS + '\\)', 'g'), ':not([data-ag-surface])'],
  // P4b 正向 html 门控
  [new RegExp(':has\\(' + MAIN_IS + '\\)', 'g'), '[data-ag-surface]'],
  // P5 负向 home 门控（surface 存在但不含 role=main = thread 页）；
  // 先行于 P6（其文本包含 P6 模式）
  [new RegExp(':not\\(:has\\(' + MAIN_IS + '\\s+\\[role="main"\\]\\)\\)', 'g'), ':not([data-ag-homeshell])'],
  // P6 正向 home 门控（surface 包裹 role=main）
  [new RegExp(':has\\(' + MAIN_IS + '\\s+\\[role="main"\\]\\)', 'g'), '[data-ag-homeshell]'],
  // P1 首页路由门控（role=main 含 home-icon）
  [/\[role="main"\]:has\(\[data-testid="home-icon"\]\)/g, '[data-ag-home]'],
  // P2 thread 表面（main 表面无嵌套 role=main）
  [new RegExp(MAIN_IS + ':not\\(:has\\(\\[role="main"\\]\\)\\)', 'g'), '[data-ag-bare]'],
  // P3 home 包裹表面（main 表面含嵌套 role=main ≡ 表面无 data-ag-bare）
  [new RegExp(MAIN_IS + ':has\\(\\[role="main"\\]\\)', 'g'), MAIN_IS_LITERAL + ':not([data-ag-bare])'],
];
let headPatched = head;
const replaceReport = [];
for (const [re, to] of headReplacements) {
  const n = (headPatched.match(re) || []).length;
  headPatched = headPatched.replace(re, () => to);
  replaceReport.push(n);
}
// 完整性守卫：替换后 head 不得残留任何 main:is 族 :has() 前缀
// （子代组合器 :has(> ...) 等非 main:is 开头参数的形态不受此限）。
const leftoverRe = new RegExp('(:not\\()?:has\\(' + MAIN_IS, 'g');
const leftoverCount = (headPatched.match(leftoverRe) || []).length;
if (leftoverCount > 0) {
  console.error('FATAL: ' + leftoverCount + ' unhandled :has(main:is(...)) variant(s) remain — extend replacement set:');
  const lineScan = new RegExp('(:not\\()?:has\\(' + MAIN_IS);
  headPatched.split('\n').forEach((line, i) => {
    if (lineScan.test(line)) console.error('  L' + i + ': ' + line.trim().slice(0, 200));
  });
  process.exit(1);
}
if (surfaceHasCount > 0 || replaceReport.some(n => n > 0)) {
  console.log('head :has() → data-ag-* replaced:',
    'surface-neg=' + replaceReport[0], 'surface-pos=' + replaceReport[1],
    'homeshell-neg=' + replaceReport[2], 'homeshell-pos=' + replaceReport[3],
    'home=' + replaceReport[4], 'bare=' + replaceReport[5], 'shell=' + replaceReport[6]);
}

const skin = fs.readFileSync(SKIN_SRC, 'utf8');
const next = headPatched.replace(/\s+$/, '') + '\n\n\n' + skin.trim() + '\n';
fs.writeFileSync(ENGINE_CSS, next, 'utf8');

console.log('dream-skin.css deployed. lines:', lines.length, '->', next.split('\n').length);
console.log('  markers: glass token =', /--ag-glass-blur/.test(next),
  ', gold accent =', /--ag-gold-rgb/.test(next),
  ', gate count =', (next.match(/preset-amethyst-gaze/g) || []).length);

// 3) renderer-inject.js：注入/刷新 ag-toggle 按钮块（幂等，标记定位）
const TOGGLE_BEGIN = '/* ==== AG-TOGGLE-BEGIN ==== */';
const TOGGLE_END = '/* ==== AG-TOGGLE-END ==== */';
const ANCHOR = '\n  return {\n    installed: true,';

let engineJs = fs.readFileSync(ENGINE_JS, 'utf8');

// 3a) 引擎 partObserver 双档调度补丁（v3.16 性能工程）
//     原状：任何 childList 变更 → 80ms 后 ensure({scope,parts}) —— 流式
//     输出期间引擎以 12.5Hz 持续全文档扫描（refreshParts ~12 个
//     querySelectorAll + message 节点全量枚举，长会话 100+ 节点）。
//     补丁：单批 ≥8 节点（路由切换/新消息块/壳层重建）保持 80ms 快档
//     并抢占已排队的慢档；小批量（流式 token，1~3 节点）走 280ms 慢档
//     —— 流式期间扫描频率 12.5Hz → 3.6Hz（-71%），稳态行为不变。
const PERF_MARKER = 'AG-PERF-PATCH v1';
const OBSERVER_SRC = '    partObserver = new MutationObserver(() => scheduleEnsure({ scope: true, parts: true }, 80));';
const OBSERVER_PATCH = [
  '    partObserver = new MutationObserver((records) => {',
  '      // ' + PERF_MARKER + ': 流式 token 批量小（1~3 节点）走 280ms 慢档；',
  '      // 结构性批量（≥8 节点：路由切换/新消息块/壳层重建）走 80ms 快档，',
  '      // 并抢占已排队的慢档刷新。流式期间引擎 DOM 扫描 12.5Hz → 3.6Hz。',
  '      let bulk = false;',
  '      for (const record of records) {',
  '        if (record.addedNodes.length + record.removedNodes.length >= 8) { bulk = true; break; }',
  '      }',
  '      if (bulk && scheduler.timeout) { clearTimeout(scheduler.timeout); scheduler.timeout = null; }',
  '      scheduleEnsure({ scope: true, parts: true }, bulk ? 80 : 280);',
  '    });',
].join('\n');
if (engineJs.includes(PERF_MARKER)) {
  console.log('partObserver perf patch: already present (skip)');
} else if (engineJs.includes(OBSERVER_SRC)) {
  engineJs = engineJs.replace(OBSERVER_SRC, () => OBSERVER_PATCH);
  console.log('partObserver perf patch: applied (dual-rate 80/280ms + bulk preemption)');
} else {
  console.error('FATAL: partObserver source pattern not found — engine updated?');
  process.exit(1);
}
const hadBlock = engineJs.includes(TOGGLE_BEGIN);
// 剥离旧块（吃掉标记两侧各一个换行，保证多次部署不累积空行）
engineJs = engineJs.replace(
  new RegExp('\\n?' + TOGGLE_BEGIN.replace(/[*/]/g, '\\$&') + '[\\s\\S]*?' + TOGGLE_END.replace(/[*/]/g, '\\$&') + '\\n?'),
  '',
);
const anchorCount = engineJs.split(ANCHOR).length - 1;
if (anchorCount !== 1) {
  console.error('FATAL: renderer-inject.js anchor count = ' + anchorCount + ' (expect 1) — engine updated?');
  process.exit(1);
}
const toggleBlock = '\n' + TOGGLE_BEGIN + '\n' +
  fs.readFileSync(TOGGLE_SRC, 'utf8').trim() + '\n' + TOGGLE_END + '\n';
// 函数替换：避免 toggleBlock 中潜在 $ 序列被 String.replace 解释
engineJs = engineJs.replace(ANCHOR, () => toggleBlock + ANCHOR);
fs.writeFileSync(ENGINE_JS, engineJs, 'utf8');

console.log('renderer-inject.js deployed. ag-toggle block:', hadBlock ? 'refreshed' : 'injected',
  ', size:', engineJs.length);
console.log('  sanity: registry key =', engineJs.includes('__AG_TOGGLE_REGISTRY__'),
  ', theme gate =', engineJs.includes('preset-amethyst-gaze'),
  ', no placeholder leak =', !/__DREAM_SKIN_[A-Z_]+__/.test(
    engineJs.slice(engineJs.indexOf(TOGGLE_BEGIN), engineJs.indexOf(TOGGLE_END))));
