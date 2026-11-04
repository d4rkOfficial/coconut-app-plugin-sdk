/** 主题：从工具箱设置里找 theme_mode。 */

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

/** 读工具箱当前是否深色主题（读不到时按深色处理）。 */
export async function readDark() {
  let dark = true;
  try {
    let state = (await Coconut.tools.call('get_settings_state', {})) || {};
    if (state && state.data && !state.items) state = state.data;
    dark = findThemeMode(state) !== 'light';
  } catch {
    // 读不到设置就用默认值，别让浮层挂掉
  }
  return dark;
}
