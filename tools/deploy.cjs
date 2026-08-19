// 部署 Amethyst Gaze 皮肤：
//   1) 裁剪版 theme.css → active-theme（Track 1，沙箱安全）
//   2) 替换引擎 dream-skin.css 皮肤块（Track 2，高阶视觉）
//   3) 把页内主题切换按钮（ag-toggle）注入引擎 renderer-inject.js
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

// 1) theme.css 裁剪（去实心背景；注意：此文件禁止任何 CSS 注释，否则沙箱校验崩溃）
const cropped = fs.readFileSync(THEME_CROPPED, 'utf8');
fs.writeFileSync(THEME_TARGET, cropped, 'utf8');
console.log('theme.css deployed (solid backgrounds removed).');

// 2) dream-skin.css：截断旧皮肤块（定位 "Amethyst Gaze v3" 注释头）并注入当前源
const css = fs.readFileSync(ENGINE_CSS, 'utf8');
const lines = css.split('\n');
let cutIdx = -1;
for (let i = 0; i < lines.length; i++) {
  if (/Amethyst Gaze v3/.test(lines[i])) { cutIdx = i; break; }
}
if (cutIdx < 0) { console.error('FATAL: skin block header not found'); process.exit(1); }
// 回退到块注释开始（/* ==== 行）
let blockStart = cutIdx;
while (blockStart > 0 && !/\/\* =+/.test(lines[blockStart])) blockStart--;
while (blockStart > 0 && /^\s*$/.test(lines[blockStart - 1])) blockStart--;

const head = lines.slice(0, blockStart).join('\n');
const skin = fs.readFileSync(SKIN_SRC, 'utf8');
const next = head.replace(/\s+$/, '') + '\n\n\n' + skin.trim() + '\n';
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
