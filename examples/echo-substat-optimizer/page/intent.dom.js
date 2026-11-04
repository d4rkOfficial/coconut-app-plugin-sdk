/**
 * 页面侧脚本：读取浮窗交互意图（按钮/胶囊点击写进 body.dataset），
 * 顺便把浮窗的按钮事件只绑定一次（用 dataset.h 标记）。
 *
 * 返回 JSON：`{ run, char, n, pos }`，读完即清空 `esoRun`。
 */
export function readOverlayIntent() {
  const run = document.body.dataset.esoRun || '';
  document.body.dataset.esoRun = '';
  const char = document.body.dataset.esoChar || '';
  const n = document.body.dataset.esoN || '';
  const pos = document.body.dataset.esoPos || '';

  const runBtn = document.querySelector('.eso-run');
  if (runBtn && !runBtn.dataset.h) {
    runBtn.dataset.h = '1';
    runBtn.addEventListener('click', function () {
      const input = document.querySelector('.eso-n');
      document.body.dataset.esoN = input ? String(input.value) : '';
      document.body.dataset.esoRun = '1';
    });
  }

  const caps = document.querySelectorAll('.eso-cap');
  for (const cap of caps) {
    if (cap.dataset.h) continue;
    cap.dataset.h = '1';
    cap.addEventListener('click', function () {
      document.body.dataset.esoChar = cap.getAttribute('data-name') || '';
    });
  }

  // Material 涟漪：按钮/胶囊点击处扩散一圈
  const ripple = function (el) {
    if (!el || el.dataset.rp) return;
    el.dataset.rp = '1';
    el.addEventListener('pointerdown', function (e) {
      const rect = el.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height) * 2.2;
      const span = document.createElement('span');
      span.className = 'eso-ripple';
      span.style.width = size + 'px';
      span.style.height = size + 'px';
      span.style.left = (e.clientX - rect.left - size / 2) + 'px';
      span.style.top = (e.clientY - rect.top - size / 2) + 'px';
      el.appendChild(span);
      setTimeout(function () {
        span.remove();
      }, 460);
    });
  };
  for (const selector of ['.eso-run', '.eso-btn', '.eso-cap']) {
    for (const el of document.querySelectorAll(selector)) ripple(el);
  }

  return { run: run, char: char, n: n, pos: pos };
}
