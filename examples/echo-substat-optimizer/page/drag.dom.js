/**
 * 页面侧脚本：给悬浮窗标题栏装拖动（pointer 事件），位置写进 body.dataset.esoPos。
 * 返回 `'noroot'` / `'nohandle'` / `'done'`（已经装过）/ `'ok'`。
 */
export function installDrag() {
  const root = document.querySelector('.eso-root');
  if (!root) return 'noroot';
  const handle = root.querySelector('.eso-title');
  if (!handle) return 'nohandle';
  if (root.dataset.drag === '1') return 'done';
  root.dataset.drag = '1';
  let sx = 0;
  let sy = 0;
  let sl = 0;
  let st = 0;
  let dragging = false;
  handle.style.cursor = 'move';
  handle.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    sl = root.offsetLeft;
    st = root.offsetTop;
    try {
      handle.setPointerCapture(e.pointerId);
    } catch (_) {
      // 某些环境不支持 pointer capture，忽略即可
    }
  });
  handle.addEventListener('pointermove', function (e) {
    if (!dragging) return;
    root.style.left = (sl + e.clientX - sx) + 'px';
    root.style.top = (st + e.clientY - sy) + 'px';
    root.style.right = 'auto';
    document.body.dataset.esoPos = root.style.left.replace('px', '') + ',' +
      root.style.top.replace('px', '');
  });
  const up = function () {
    dragging = false;
    document.body.dataset.esoPos = root.style.left.replace('px', '') + ',' +
      root.style.top.replace('px', '');
  };
  handle.addEventListener('pointerup', up);
  handle.addEventListener('pointercancel', up);
  return 'ok';
}
