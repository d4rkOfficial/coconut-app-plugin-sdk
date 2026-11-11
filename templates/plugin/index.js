// @name        __NAME__
// @version     0.1.0
// @description 一句话说明这个插件做什么
// @permissions __PERMISSIONS__
// @mount       none
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />
// @ts-check

// 插件跑在启动器进程内的 QuickJS 里（独立线程）：
//   - 没有 import/export/require，也没有 window/document（页面上的事只能用
//     Coconut.toolbox.runJs 间接做）；
//   - 生命周期用 `Coconut.addEventListener('start' | 'hello' | 'event' | 'bye' | 'stop', fn)`
//     注册：和全局钩子 `async function onHello() {}` 等价，但不用挂 globalThis，
//     可以叠加多个监听、也能用 removeEventListener 摘掉；
//   - 监听器可以是 async；单个回调同样受 10 秒上限约束。
// 完整规则与 API 见仓库根目录 AGENTS.md、docs/plugin-api.md。
//
// 想拆多文件（推荐一旦超过 ~150 行就这么做）：
//   state.js       运行期状态（export const st = { … }，只改属性）
//   api.js         Coconut 调用封装 / 日志
//   *.jsx          浮层 HTML（普通标签）+ css / script 标签模板
//   page/*.dom.js  注入页面的自包含函数（不 import、不引用模块级常量，数据用参数传）
//
// 本目录的 deno.json 只干一件事：把 plugin-api 的类型和 JSX 配置接上，
// 让编辑器在 index.js / *.jsx 里有补全（`deno task new` 会把它一起复制过去）。

/** 浮层 id（由引擎分配，1 递增）。@type {number} */
let overlayId = 0

Coconut.addEventListener('start', async () => {
    // 插件线程起来时触发，工具箱页面可能还没打开：这里别调 runJs。
    Coconut.log(`[${Coconut.plugin.id}] v${Coconut.plugin.version} 已加载`)
})

Coconut.addEventListener('hello', async (event) => {
    // 工具箱页面就绪。引擎按会话去重，**每个会话只会来一次**；
    // 页面重载后是新会话，会正常再来一次，所以这里可以直接建浮层。
    // 注意：监听器参数是事件对象，数据在 event.detail（例如 event.detail.tools）；
    // 全局钩子 onHello(info) 才直接拿 info。
    const title = String(Coconut.toolbox.runJs('return document.title'))
    Coconut.log('页面标题：', title)

    // 页面脚本也可以直接传函数对象（源码送到页面执行，参数走 JSON）：
    // const count = Coconut.toolbox.runJs(
    //   (selector) => document.querySelectorAll(selector).length,
    //   '.card',
    // );

    // 想画浮层就打开下面两段（记得把 @permissions 加上 ui，@mount 改成 overlay）：
    // 顶部：import { buildOverlay } from './overlay.jsx';
    // 这里：const { html, css } = buildOverlay('你好', ['第一行', '第二行']);
    //       overlayId = Coconut.ui.overlay({ html, css });
})

Coconut.addEventListener('bye', async () => {
    // 工具箱页面没了（关闭 / 重载 / 回到启动器）：浮层已经跟着消失，收插件侧的就行。
    overlayId = 0
})

Coconut.addEventListener('stop', async () => {
    // 停用 / 重载 / 退出：把浮层、定时器、注入的 CSS 收干净。
    if (overlayId) {
        Coconut.ui.remove(overlayId)
        overlayId = 0
    }
})
