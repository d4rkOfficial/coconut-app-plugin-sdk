/**
 * 主题：读工具箱的深浅色设置 + 根节点主题 CSS 变量，算出浮层配色。
 */
import { call } from './api.js';
import { readThemeVars } from './page/theme.dom.js';
import { pageCall } from './page/run.js';
import { st } from './state.js';

/** 在任意嵌套的设置对象里找 dark / light。 */
export function findThemeMode(value) {
  if (!value || typeof value !== 'object') return null;
  for (const key of Object.keys(value)) {
    const inner = value[key];
    const lowered = String(key).toLowerCase();
    if (
      lowered === 'theme_mode' || lowered === 'theme' || lowered === 'mode' ||
      lowered.indexOf('theme') >= 0 || lowered.indexOf('appearance') >= 0
    ) {
      if (typeof inner === 'string') {
        const text = inner.toLowerCase();
        if (text === 'dark' || text === 'light') return text;
      }
      const found = findThemeMode(inner);
      if (found) return found;
    }
    const found = findThemeMode(inner);
    if (found) return found;
  }
  return null;
}

/** 根据 accent 背景色算可读的其上文字色（hex 亮度或 oklch 明度）。 */
export function textOn(background) {
  if (typeof background !== 'string' || !background) return '#ffffff';
  let luminance = null;
  if (/^#([0-9a-f]{6})$/i.test(background)) {
    const r = parseInt(background.slice(1, 3), 16) / 255;
    const g = parseInt(background.slice(3, 5), 16) / 255;
    const b = parseInt(background.slice(5, 7), 16) / 255;
    luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  } else {
    const match = background.match(/oklch\(\s*([\d.]+)%/);
    if (match) luminance = parseFloat(match[1]) / 100;
  }
  if (luminance == null) return '#ffffff';
  return luminance > 0.55 ? '#000000' : '#ffffff';
}

/** 读工具箱主题：深色开关 + accent 颜色 + 表面圆角。 */
export async function loadTheme() {
  try {
    const settings = await call('get_settings_state', {});
    st.dark = findThemeMode(settings) !== 'light';
  } catch {
    // 读不到设置就沿用上次的主题
  }
  try {
    const pending = Coconut.runJs(pageCall(readThemeVars));
    const raw = pending && typeof pending.then === 'function' ? await pending : pending;
    if (!raw) return;
    const vars = JSON.parse(raw);
    if (vars.ab) st.accentBg = vars.ab;
    if (vars.at) st.accentText = vars.at;
    if (vars.sr !== '' && vars.sr != null) {
      const radius = parseFloat(vars.sr);
      if (isFinite(radius)) st.surfaceRadius = Math.max(0, Math.min(20, Math.round(radius)));
    }
  } catch {
    // 主题变量读不到就用默认配色
  }
}
