/**
 * 悬浮窗：CSS、渲染、结果卡片、进度文案。
 * 只做「把状态画出来」，不碰工具箱配装。
 */
import { installDrag } from './page/drag.dom.js';
import { st, UI } from './state.js';
import { textOn } from './theme.js';

export function fmt(value) {
  if (!isFinite(value)) return '-';
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`;
  return String(Math.round(value));
}

export function pct(value) {
  return isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '-';
}

export function esc(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 百分比类词条（决定徽章要不要加 %）。 */
export const isPctType = (type) =>
  type.indexOf('%') >= 0 || type === '暴击率' || type === '暴击伤害' ||
  type === '共鸣效率' || type.indexOf('伤害加成') >= 0;

/* ───────────────────────── 进度文案 ───────────────────────── */

export function setProg(label, done, total, curTotal) {
  let text = String(label || '');
  if (typeof done === 'number' && total > 0) {
    text += ` · ${done}/${total}（剩 ${Math.max(0, total - done)}）`;
  }
  if (st.running) {
    if (isFinite(st.runBest)) text += ` · 已找到最大总伤 ${fmt(st.runBest)}`;
    if (st.runStart) {
      text += ` · 已用 ${
        Math.round((Date.now() - st.runStart) / 1000)
      }s / ${st.searchCalls} 次计算`;
    }
  } else if (isFinite(curTotal)) {
    text += ` · 当前全队总伤 ${fmt(curTotal)}`;
  }
  UI.prog = text;
  const now = Date.now();
  if (now - st.lastRenderT > 450) {
    st.lastRenderT = now;
    renderOverlay();
  }
}

/* ───────────────────────── 结果卡片 ───────────────────────── */

const SUB_COLORS = [
  '#ef5350',
  '#ab47bc',
  '#5c6bc0',
  '#29b6f6',
  '#26a69a',
  '#ffa726',
  '#ec407a',
  '#9ccc65',
  '#8d6e63',
  '#78909c',
  '#d4e157',
  '#ff7043',
  '#7cb342',
  '#42a5f5',
  '#66bb6a',
  '#f06292',
  '#ba68c8',
  '#ffb74d',
  '#4dd0e1',
  '#a1887f',
];

function typeColor(name) {
  let hash = 0;
  const text = String(name || '');
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  return SUB_COLORS[hash % SUB_COLORS.length];
}

function badgeStyle(color) {
  return st.dark
    ? `background:${color}26;border:1px solid ${color}99;color:${color};`
    : `background:${color}1a;border:1px solid ${color}77;color:${color};`;
}

/**
 * 结果卡片 HTML。
 * @param {string} char 角色名
 * @param {string} profName cost 搭配名
 * @param {number[]} slotCosts 每槽 cost
 * @param {string[]} bestMains 每槽主词条
 * @param {unknown} _assigned 预留（未使用）
 * @param {Array<{ substats?: Array<{ type: string, value: number }> }>} echoes 真实配装
 * @param {number} base 原配装总伤
 * @param {number} ft 优化后总伤
 */
export function buildResult(char, profName, slotCosts, bestMains, _assigned, echoes, base, ft) {
  const costName = ['', '1cost', '', '3cost', '4cost'];
  let html = `<div class="eso-rs-title">${esc(char)} · 最优（cost 搭配 ${esc(profName)}）</div>`;
  html += `<div class="eso-rs-line">当前全队总伤害 <b>${fmt(base)}</b> → 优化后 <b>${fmt(ft)}</b>` +
    `（${pct(((ft - base) / base) * 100)}）</div>`;
  html += '<div class="eso-rs-sub">主词条（每槽）</div><div class="eso-bdgs">';
  for (let i = 0; i < 5; i++) {
    const color = typeColor(bestMains[i] || '主');
    html += `<span class="eso-bdg" style="${badgeStyle(color)}">槽${i + 1} · ` +
      `${costName[slotCosts[i]]} ${esc(bestMains[i] || '-')}</span>`;
  }
  html += '</div>';

  if (echoes && echoes.length) {
    const aggCount = {};
    const aggValue = {};
    for (const echo of echoes) {
      for (const sub of (echo.substats || [])) {
        const value = Number(sub.value);
        if (!(isFinite(value) && value > 0)) continue; // 忽略非法 0 值
        const key = `${sub.type}|${value}`;
        aggCount[key] = (aggCount[key] || 0) + 1;
        aggValue[key] = value;
      }
    }
    const keys = Object.keys(aggCount).sort(
      (a, b) => (aggCount[b] - aggCount[a]) || (a < b ? -1 : 1),
    );
    if (keys.length) {
      html += '<div class="eso-rs-sub">副词条（按词条·档位，条数）</div><div class="eso-bdgs">';
      for (const key of keys) {
        const type = key.split('|')[0];
        const color = typeColor(type);
        html += `<span class="eso-bdg" style="${badgeStyle(color)}">${esc(type)} ` +
          `${aggValue[key]}${isPctType(type) ? '%' : ''} ×${aggCount[key]}</span>`;
      }
      html += '</div>';
    }
  }
  return html;
}

/* ───────────────────────── 浮层样式 ───────────────────────── */

function overlayCss() {
  const fg = st.dark ? '#e8eaed' : '#1f1f1f';
  const muted = st.dark ? '#9aa0a6' : '#5f6368';
  const surface = st.dark ? 'rgba(20,20,24,.62)' : 'rgba(255,255,255,.66)';
  const border = st.dark ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.12)';
  const accent = st.accentBg || (st.dark ? '#8ab4f8' : '#1a73e8');
  const accentText = textOn(accent);
  const chipBg = st.dark ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.04)';
  const chipHover = st.dark ? 'rgba(255,255,255,.12)' : 'rgba(0,0,0,.07)';
  const inputBg = st.dark ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.04)';
  const radius = (typeof st.surfaceRadius === 'number' && st.surfaceRadius > 0)
    ? Math.min(20, Math.round(st.surfaceRadius))
    : 10;
  const rad = `${radius}px`;
  const rippleColor = 'rgba(255,255,255,.5)';
  const pos = UI.pos
    ? `left:${UI.pos[0]}px;top:${UI.pos[1]}px;right:auto;bottom:auto;`
    : 'bottom:14px;right:14px;top:auto;';
  const focusRing = st.dark ? 'rgba(138,180,248,.25)' : 'rgba(26,115,232,.25)';
  const focusShadow = st.dark ? 'rgba(138,180,248,.30)' : 'rgba(26,115,232,.28)';

  return '.eso-root{position:fixed;' + pos +
    'z-index:2147483000;width:480px;height:auto;max-height:calc(100vh - 40px);' +
    'box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden;' +
    `background:${surface};-webkit-backdrop-filter:blur(18px) saturate(150%);` +
    `backdrop-filter:blur(18px) saturate(150%);color:${fg};border:1px solid ${border};` +
    `border-radius:${rad};` +
    'box-shadow:0 8px 24px rgba(0,0,0,.28),0 1px 2px rgba(0,0,0,.12);padding:16px 16px 12px;' +
    'font:12px/1.5 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;pointer-events:auto;}' +
    '.eso-head{margin-bottom:10px;cursor:move;user-select:none;-webkit-user-select:none;flex:0 0 auto;}' +
    `.eso-title{font-weight:800;font-size:15px;letter-spacing:.3px;color:${fg};}` +
    `.eso-sub{font-size:11px;color:${muted};margin-top:3px;}` +
    '.eso-scroll{flex:0 1 auto;min-height:0;overflow-y:auto;padding-right:2px;scrollbar-width:thin;}' +
    '.eso-scroll::-webkit-scrollbar{width:8px;}' +
    `.eso-scroll::-webkit-scrollbar-thumb{background:${border};border-radius:999px;}` +
    '.eso-caps{display:flex;gap:8px;margin-bottom:10px;}' +
    `.eso-cap{position:relative;overflow:hidden;flex:1;min-width:0;display:flex;align-items:center;` +
    `gap:7px;padding:6px 9px;border:1px solid ${border};` +
    `border-radius:999px;background:${chipBg};color:${fg};cursor:pointer;font:600 11px/1 inherit;` +
    'text-align:left;' +
    'transition:background .22s ease,border-color .22s ease,box-shadow .22s ease,color .22s ease,transform .12s ease;-webkit-tap-highlight-color:transparent;}' +
    `.eso-cap:hover{background:${chipHover};}` +
    '.eso-cap:active{transform:scale(.97);}' +
    '.eso-cap:disabled{opacity:.5;cursor:default;transform:none;pointer-events:none;}' +
    `.eso-cap-on{border-color:${accent};background:${accent};color:${accentText};` +
    `box-shadow:0 2px 10px ${focusShadow};}` +
    `.eso-cap-on:hover{background:${accent};}` +
    '.eso-cap-av{width:24px;height:24px;border-radius:50%;object-fit:cover;flex:0 0 auto;}' +
    `.eso-cap-ph{display:inline-flex;align-items:center;justify-content:center;` +
    `background:${st.dark ? '#3c4043' : '#e8eaed'};color:${muted};font-weight:700;}` +
    '.eso-cap-t{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}' +
    '.eso-ctrl{display:flex;align-items:center;gap:10px;margin-bottom:6px;}' +
    `.eso-ctrl label{flex:0 0 auto;font-size:11px;color:${muted};font-weight:700;}` +
    `.eso-n{position:relative;flex:0 0 64px;min-width:0;background:${inputBg};color:${fg};` +
    `border:1px solid ${border};border-radius:${rad};padding:7px 10px;font:12px inherit;` +
    'outline:none;transition:border-color .18s ease,box-shadow .18s ease;}' +
    `.eso-n:focus{border-color:${accent};box-shadow:0 0 0 2px ${focusRing};}` +
    '.eso-run,.eso-btn{position:relative;overflow:hidden;flex:1;border:none;' +
    `border-radius:${rad};padding:9px 10px;font:700 12px/1 inherit;cursor:pointer;` +
    `background:${accent};color:${accentText};` +
    'transition:background .18s ease,transform .1s ease,box-shadow .18s ease;-webkit-tap-highlight-color:transparent;}' +
    `.eso-run:hover,.eso-btn:hover{box-shadow:0 2px 8px ${focusShadow};}` +
    '.eso-run:active,.eso-btn:active{transform:scale(.96);}' +
    '.eso-run:disabled{opacity:.5;cursor:default;transform:none;box-shadow:none;}' +
    `.eso-ripple{position:absolute;border-radius:50%;background:${rippleColor};` +
    'transform:scale(0);animation:eso-rp .46s ease-out forwards;pointer-events:none;}' +
    '@keyframes eso-rp{to{transform:scale(1);opacity:0;}}' +
    `.eso-prog{font-size:11px;color:${accent};min-height:16px;margin:8px 0;}` +
    '.eso-msg{font-size:11px;color:#d93025;margin:4px 0;}' +
    `.eso-res{margin-top:6px;border-top:1px solid ${border};padding-top:10px;}` +
    `.eso-rs-title{font-weight:800;margin-bottom:6px;font-size:12.5px;color:${fg};}` +
    '.eso-rs-line{font-size:11px;margin:3px 0;}' +
    `.eso-rs-sub{font-size:10px;color:${muted};margin:8px 0 4px;font-weight:800;letter-spacing:.5px;}` +
    '.eso-bdgs{display:flex;flex-wrap:wrap;gap:5px;margin:2px 0;}' +
    '.eso-bdg{display:inline-block;padding:3px 9px;border-radius:999px;' +
    'font:700 10.5px/1.3 inherit;white-space:nowrap;}' +
    `.eso-foot{flex:0 0 auto;display:flex;gap:8px;margin-top:10px;padding-top:10px;` +
    `border-top:1px solid ${border};}` +
    '.eso-busy{opacity:.94;}';
}

/* ───────────────────────── 渲染 ───────────────────────── */

export function renderOverlay() {
  if (!st.overlayShow) return;
  let caps = '';
  for (let i = 0; i < st.teamChars.length; i++) {
    const name = st.teamChars[i];
    const avatar = st.avatars[name] || '';
    const on = i === UI.charIdx ? ' eso-cap-on' : '';
    const disabled = UI.busy ? ' disabled' : '';
    caps += `<button class="eso-cap${on}"${disabled} data-name="${esc(name)}">` +
      (avatar
        ? `<img class="eso-cap-av" src="${esc(avatar)}" alt="">`
        : `<span class="eso-cap-av eso-cap-ph">${esc(name.charAt(0) || '')}</span>`) +
      `<span class="eso-cap-t">${esc(name)}</span></button>`;
  }
  const curChar = st.teamChars[UI.charIdx] || '';
  const runBtn = (UI.busy || UI.done)
    ? (UI.busy ? '<button class="eso-run" disabled>计算最优…</button>' : '')
    : '<button class="eso-run">计算最优</button>';
  const foot = (UI.done && !UI.busy) ? '<button class="eso-btn eso-run">再次计算</button>' : '';

  const html = '<div class="eso-root' + (UI.busy ? ' eso-busy' : '') + '">' +
    '<div class="eso-head"><div class="eso-title">最优声骸词条</div>' +
    `<div class="eso-sub">${esc(curChar)} · 全队总伤害最大 · 副词条取中档值</div></div>` +
    '<div class="eso-scroll">' +
    `<div class="eso-caps">${caps}</div>` +
    `<div class="eso-ctrl"><label>副词条数</label>` +
    `<input class="eso-n" type="number" min="0" max="25" value="${UI.N | 0}">${runBtn}</div>` +
    `<div class="eso-prog">${esc(UI.prog)}</div>` +
    (UI.msg ? `<div class="eso-msg">${esc(UI.msg)}</div>` : '') +
    (UI.resultHtml ? `<div class="eso-res">${UI.resultHtml}</div>` : '') +
    '</div>' +
    (foot ? `<div class="eso-foot">${foot}</div>` : '') +
    '</div>';
  const css = overlayCss();
  if (html === st.lastHtml && css === st.lastCss) return;
  if (st.ovId) Coconut.ui.remove(st.ovId);
  st.ovId = Coconut.ui.overlay({ html, css });
  st.lastHtml = html;
  st.lastCss = css;
  // 每次重渲染后重新装拖动（浮层是新的 DOM）
  try {
    Coconut.toolbox.runJs(installDrag);
  } catch {
    // 页面还没打开时忽略
  }
}
