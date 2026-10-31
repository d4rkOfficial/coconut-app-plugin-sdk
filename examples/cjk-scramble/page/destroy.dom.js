// deno-lint-ignore-file no-window
/**
 * 页面侧脚本：断开观察器并清掉页面上的引用（不会复原已经被打乱的文字）。
 */
export function destroyScramble() {
  if (window.__simpleTranslate && window.__simpleTranslate.destroy) {
    window.__simpleTranslate.destroy();
  }
  window.__simpleTranslate = null;
  return 'destroyed';
}
