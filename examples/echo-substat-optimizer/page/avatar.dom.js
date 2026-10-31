/**
 * 页面侧脚本：扫描配装页真实渲染的 `<img>`，按最近祖先文本映射到角色名。
 * 返回 JSON 数组：`[{ name, src }]`。
 */
export function collectAvatars() {
  const out = [];
  const seen = {};
  for (const img of document.querySelectorAll('img')) {
    const src = img.getAttribute('src') || '';
    if (!src || seen[src]) continue;
    if (!/\.(webp|png|jpe?g|avif)(\?|$)/i.test(src)) continue;
    let node = img;
    let text = '';
    for (let depth = 0; depth < 6 && node; depth++) {
      const content = String(node.textContent || '').trim();
      if (content && content.length <= 14 && /[\u4e00-\u9fa5]/.test(content)) {
        const cleaned = content.replace(/\s*\(\d{4,5}\)\s*$/, '').trim();
        if (cleaned) {
          text = cleaned;
          break;
        }
      }
      node = node.parentElement;
    }
    if (text) {
      seen[src] = 1;
      out.push({ name: text, src: src });
    }
  }
  return JSON.stringify(out);
}
