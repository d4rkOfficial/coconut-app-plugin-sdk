/**
 * 页面侧脚本：读工具箱根节点上生效的主题 CSS 变量。
 * 返回 JSON：`{ ab, at, sr }`（accent 背景 / accent 文字 / 圆角）。
 */
export function readThemeVars() {
  const cs = getComputedStyle(document.documentElement);
  return JSON.stringify({
    ab: (cs.getPropertyValue('--theme-accent-bg') || '').trim(),
    at: (cs.getPropertyValue('--theme-accent-text') || '').trim(),
    sr: (cs.getPropertyValue('--theme-surface-radius') || '').trim(),
  });
}
