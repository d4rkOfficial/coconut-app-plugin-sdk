/**
 * 页面侧脚本：色块位置变化时做平滑过渡（旧位置 → 新位置），新色块淡入。
 *
 * @param {Record<string, { left: string, width: string }>} oldGeo 上一轮的色块位置
 * @param {Array<{ key: string, left: string, width: string }>} fresh 这一轮的色块位置
 * @return {string} 这一轮的 key→位置 映射（JSON）
 */
export function animateBars(oldGeo, fresh) {
  const freshMap = {};
  for (const geo of fresh) freshMap[geo.key] = { left: geo.left, width: geo.width };
  const bars = Array.prototype.slice.call(document.querySelectorAll('.cov-root .cov-bar'));
  const move = [];
  for (const el of bars) {
    const key = el.getAttribute('data-k');
    const target = freshMap[key];
    if (!target) continue;
    const previous = oldGeo[key];
    if (previous) {
      el.style.transition = 'none';
      el.style.left = previous.left + '%';
      el.style.width = previous.width + '%';
      move.push({ el: el, to: target });
    } else {
      el.classList.add('cov-pop');
    }
  }
  void document.body.offsetWidth; // 强制回流，让上面的起始位置生效
  for (const item of move) {
    const el = item.el;
    el.style.transition = 'left .35s ease, width .35s ease';
    el.style.left = item.to.left + '%';
    el.style.width = item.to.width + '%';
  }
  return JSON.stringify(freshMap);
}
