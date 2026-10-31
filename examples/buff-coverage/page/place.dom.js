/**
 * 页面侧脚本：把浮层摆到时间轴沟槽的位置上（纯写 style，不读工具箱状态）。
 * @param {{ l: number, t: number, w: number, h: number }} geo 视口坐标
 */
export function placeOverlay(geo) {
  const root = document.querySelector('.cov-root');
  if (root && geo.h > 20 && geo.w > 20) {
    root.style.left = geo.l + 'px';
    root.style.top = geo.t + 'px';
    root.style.width = geo.w + 'px';
    root.style.height = geo.h + 'px';
  }
  return 'ok';
}
