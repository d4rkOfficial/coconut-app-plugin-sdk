/**
 * 浮层片段（JSX）：一个标签只干一件事。
 *
 *   - JSX 只写 HTML：顶层标签直接产出 `Markup`，给 `ui.overlay({ html })`；
 *     **不用**再包一层 `<html>`；
 *   - 浮层 CSS 用 `css` 标签模板；
 *   - 页面脚本用 `script` 标签模板（内容是函数体，要自己 `return`）。
 *
 * 在 index.js 里这样用：
 *   import { buildOverlay } from './overlay.jsx';
 *   const { html, css } = buildOverlay('你好');
 *   Coconut.ui.overlay({ html, css });
 *
 * 转义规则：JSX 的文本子节点和 `{}` 插值会自动转义；要插现成 HTML 用 `html\`…\`` 或 `raw()`。
 */
// h 是 JSX 工厂（编译器把 `<div>` 变成 h('div', …)），必须导入；不要删。
import { css, h, html, script } from '../../plugin-api/jsx.ts'

/**
 * @param {string} title 标题文本（会被自动转义）
 * @param {string[]} [rows] 渲染成列表的文本
 */
export function buildOverlay(title, rows) {
    const list = (rows || []).map((text) => <li class='row'>{text}</li>)

    const view = (
        <div class='hello'>
            <b>{title}</b>
            {list.length ? <ul>{list}</ul> : null}
        </div>
    )

    const skin = css`
        .hello {
            position: absolute;
            right: 20px;
            bottom: 20px;
            min-width: 180px;
            padding: 8px 12px;
            border-radius: 10px;
            background: rgba(20,20,22,.88);
            color: #eee;
            font: 13px/1.6 system-ui;
            pointer-events: auto;
        }
        .hello ul {
            margin: 6px 0 0;
            padding-left: 18px;
        }
    `

    return { html: view, css: skin, list }
}

/** 想拼一段页面脚本时：内容是函数体，要自己 return。 */
export function markReady() {
    return script`document.body.dataset.pluginReady = '1'; return true;`
}

/** 已有 HTML 字符串（比如旧代码拼的）用 html 标签模板包一下，原样插入、不转义。 */
export function withLegacyHtml(existingHtml) {
    return html`${existingHtml}`
}

/** 已经是 Markup 的片段想再包一层容器：直接嵌进 JSX 即可。 */
export function wrapInCard(view) {
    return <div class='card'>{view}</div>
}
