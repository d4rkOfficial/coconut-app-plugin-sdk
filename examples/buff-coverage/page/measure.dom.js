/**
 * 页面侧脚本：一次性量出浮层需要的几何信息。
 *
 * 返回 JSON 字符串：`{ onTimeline, sideRight, gutterTop, barTop, iw, ih, samples[], posById }`。
 * 数据来源：页面几何（视野内）+ IndexedDB 里 opBlocks 的 id→pos（只读）。
 */
export function measureTimeline() {
  return new Promise(function (resolve) {
    try {
      const out = {
        onTimeline: false,
        sideRight: 0,
        gutterTop: 0,
        barTop: null,
        iw: innerWidth,
        ih: innerHeight,
        samples: [],
      };
      let gutter = null;
      for (const el of document.querySelectorAll('[style*="dashed"]')) {
        if ((el.textContent || '').indexOf('伤害绑定') >= 0) {
          gutter = el;
          break;
        }
      }
      if (!gutter) {
        resolve(JSON.stringify(out));
        return;
      }
      out.onTimeline = true;
      const gutterRect = gutter.getBoundingClientRect();
      let sideRight = 0;
      for (const el of document.querySelectorAll('aside')) {
        const cls = String(el.className || '');
        if (cls.indexOf('theme-glass-surface') >= 0 && cls.indexOf('border-r') >= 0) {
          sideRight = el.getBoundingClientRect().right;
          break;
        }
      }
      let barTop = null;
      const btn = document.querySelector('[title="快速排轴"]');
      if (btn) {
        let cur = btn;
        let last = btn;
        let guard = 0;
        while (cur && cur.parentElement && guard++ < 12) {
          const rect = cur.parentElement.getBoundingClientRect();
          if (
            rect.bottom < innerHeight - 140 || rect.width < innerWidth * 0.4 || rect.height > 120
          ) break;
          cur = cur.parentElement;
          last = cur;
        }
        barTop = last.getBoundingClientRect().top;
      }
      out.sideRight = sideRight;
      out.gutterTop = Math.round(gutterRect.top);
      out.barTop = barTop == null ? null : Math.round(barTop);
      for (const el of document.querySelectorAll('[data-block]')) {
        const id = el.getAttribute('data-block') || '';
        if (!id) continue;
        const rect = el.getBoundingClientRect();
        out.samples.push({ id: id, left: rect.left, width: rect.width });
      }
      const open = indexedDB.open('wuwa-v1');
      open.onerror = function () {
        resolve(JSON.stringify(out));
      };
      open.onsuccess = function () {
        try {
          const tx = open.result.transaction('cache', 'readonly');
          const g1 = tx.objectStore('cache').get('projects');
          const g2 = tx.objectStore('cache').get('project-active');
          let projects = null;
          let active = null;
          let left = 2;
          const done = function () {
            try {
              const unwrap = function (raw) {
                return raw && typeof raw === 'object' && raw.data !== undefined ? raw.data : raw;
              };
              const listValue = unwrap(projects);
              const activeValue = unwrap(active);
              const list = Array.isArray(listValue) ? listValue : Object.values(listValue || {});
              const activeId = typeof activeValue === 'string'
                ? activeValue
                : ((activeValue && activeValue.id) || '');
              const project = list.find(function (item) {
                return item && item.id === activeId;
              }) || list[0] || null;
              const timeline = (project && project.encounter && project.encounter.timeline &&
                project.encounter.timeline.data) || {};
              const posById = {};
              for (const block of (timeline.opBlocks || [])) {
                posById[String(block.id)] = Number(block.pos) || 0;
              }
              out.posById = posById;
              resolve(JSON.stringify(out));
            } catch (e) {
              resolve(JSON.stringify(out));
            }
          };
          g1.onsuccess = function () {
            projects = g1.result;
            if (--left === 0) done();
          };
          g1.onerror = function () {
            if (--left === 0) done();
          };
          g2.onsuccess = function () {
            active = g2.result;
            if (--left === 0) done();
          };
          g2.onerror = function () {
            if (--left === 0) done();
          };
        } catch (e) {
          resolve(JSON.stringify(out));
        }
      };
    } catch (e) {
      resolve(JSON.stringify({ onTimeline: false }));
    }
  });
}
