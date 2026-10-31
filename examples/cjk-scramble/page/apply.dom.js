// deno-lint-ignore-file no-window
/**
 * 页面侧脚本：把整页文字按字符打乱成随机中日韩字符。
 *
 * 约束（见 AGENTS.md）：函数必须**完全自包含**——不引用模块作用域的任何变量，
 * 字符池通过参数 `pool` 传进来；返回值会经 JSON 化回传给插件。
 */
export function applyScramble(pool) {
  const CHAR_POOL = String(pool);
  const SKIP_NAMES = ['SCRIPT', 'STYLE', 'IFRAME', 'NOSCRIPT', 'CANVAS', 'VIDEO'];
  const KEEP = /[\s0-9a-zA-Z.,;:!?()[\]{}"'，。；：？！、【】《》]/;
  const DONE = Symbol('trans_done');

  function randomChar() {
    return CHAR_POOL[Math.floor(Math.random() * CHAR_POOL.length)];
  }

  function scrambleText(str) {
    return [...str]
      .map((ch) => (KEEP.test(ch) ? ch : randomChar()))
      .join('');
  }

  function walk(root) {
    for (const node of Array.from(root.childNodes)) {
      if (SKIP_NAMES.includes(node.nodeName)) continue;
      if (node[DONE]) continue;
      if (node.nodeType === Node.TEXT_NODE) {
        const origin = node.textContent;
        const scrambled = scrambleText(origin);
        if (scrambled !== origin) {
          node.textContent = scrambled;
          node[DONE] = true;
        }
        continue;
      }
      if (node.nodeType === Node.ELEMENT_NODE) {
        for (const attr of ['title', 'alt', 'placeholder']) {
          if (!node.hasAttribute(attr)) continue;
          const value = node.getAttribute(attr);
          const scrambled = scrambleText(value);
          if (scrambled !== value) node.setAttribute(attr, scrambled);
        }
        walk(node);
      }
    }
  }

  // 重复执行时先拆掉上一轮的观察器，避免叠加
  if (window.__simpleTranslate && window.__simpleTranslate.destroy) {
    window.__simpleTranslate.destroy();
  }
  walk(document.body);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const added of mutation.addedNodes) walk(added);
    }
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: false });
  window.__simpleTranslate = {
    run: () => walk(document.body),
    destroy: () => observer.disconnect(),
  };
  return 'ok';
}
