/**
 * 浮层片段（JSX）：三个裸标签直接产出引擎认识的东西。
 *
 * 在 index.js 里这样用：
 *   import { buildOverlay } from './overlay.jsx';
 *   const { html, css } = buildOverlay('你好');
 *   Coconut.ui.overlay({ html, css });
 *
 * 转义规则：字符串子节点自动转义；要插现成 HTML 用 `raw()`。
 */
import { h, raw } from '../../plugin-api/jsx.ts';

/**
 * @param {string} title 标题文本（会被自动转义）
 * @param {string[]} [rows] 渲染成列表的文本
 */
export function buildOverlay(title, rows) {
  const list = (rows || []).map((text) => <li class='row'>{text}</li>);

  const html = (
    <html>
      <div class='hello'>
        <b>{title}</b>
        {list.length ? <ul>{list}</ul> : null}
      </div>
    </html>
  );

  const css = (
    <style>
      {`
      .hello { position: absolute; right: 20px; bottom: 20px; min-width: 180px;
        padding: 8px 12px; border-radius: 10px; background: rgba(20,20,22,.88);
        color: #eee; font: 13px/1.6 system-ui; pointer-events: auto; }
      .hello ul { margin: 6px 0 0; padding-left: 18px; }
    `}
    </style>
  );

  return { html, css, list };
}

/** 想拼一段页面脚本时：`<script>` 里是函数体，要自己 return。 */
export function markReady() {
  return <script>{`document.body.dataset.pluginReady = '1'; return true;`}</script>;
}

/** 已有 HTML 字符串（比如旧代码拼的）用 raw 包一下再嵌进 JSX。 */
export function withLegacyHtml(existingHtml) {
  return <html>{raw(existingHtml)}</html>;
}
