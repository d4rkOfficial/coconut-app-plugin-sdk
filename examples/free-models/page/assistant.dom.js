/**
 * 页面侧脚本：打开工具箱的 AI 悬浮窗（已经开着就不动）。
 * 返回 `'already'` / `'missing'` / `'opened'`。
 */
export function openAssistant() {
  const root = document.querySelector('.ai-assistant');
  if (root && root.getBoundingClientRect().width > 100) return 'already';
  const btn = document.querySelector('.ai-assistant [role="button"][aria-label^="AI 助手"]');
  if (!btn) return 'missing';
  btn.click();
  return 'opened';
}
