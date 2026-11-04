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
//   - 钩子必须是 `async function onXxx() {}` 这种函数声明，不能用 const 箭头函数；
//   - 打包后钩子不在全局作用域里，文件末尾要自己挂到 globalThis（见最后几行）。
// 完整规则与 API 见仓库根目录 AGENTS.md、docs/plugin-api.md。
//
// 想拆多文件（推荐一旦超过 ~150 行就这么做）：
//   state.js       运行期状态（export const st = { … }，只改属性）
//   api.js         Coconut 调用封装 / 日志
//   *.jsx          浮层 / 页面片段（JSX：<script> / <html> / <style> 三个裸标签）
//   page/*.dom.js  注入页面的自包含函数（不 import、不引用模块级常量，数据用参数传）

/** 浮层 id（由引擎分配，1 递增）。@type {number} */
let overlayId = 0;

async function onStart() {
  // 插件线程起来时触发，工具箱页面可能还没打开：这里别调 runJs。
  Coconut.log(`[${Coconut.plugin.id}] v${Coconut.plugin.version} 已加载`);
}

async function onHello() {
  // 工具箱页面就绪。引擎按会话去重，**每个会话只会来一次**；
  // 页面重载后是新会话，会正常再来一次，所以这里可以直接建浮层。
  const title = String(Coconut.toolbox.runJs('return document.title'));
  Coconut.log('页面标题：', title);

  // 页面脚本也可以直接传函数对象（源码送到页面执行，参数走 JSON）：
  // const count = Coconut.toolbox.runJs(
  //   (selector) => document.querySelectorAll(selector).length,
  //   '.card',
  // );

  // 想画浮层就打开下面这段（记得把 @permissions 加上 ui，@mount 改成 overlay）：
  // overlayId = Coconut.ui.overlay({
  //   html: '<div class="hello">你好</div>',
  //   css: '.hello { position: absolute; right: 20px; bottom: 20px; padding: 8px 12px;' +
  //     ' border-radius: 10px; background: rgba(20,20,22,.88); color: #eee; pointer-events: auto; }',
  // });

  // 用 JSX 写的话（文件改成 index.jsx，并 import { h } 自 plugin-api/jsx.ts）：
  //   const view = <html><div class="hello">你好</div></html>;
  //   const skin = <style>{`.hello{position:absolute;right:20px;bottom:20px}`}</style>;
  //   overlayId = Coconut.ui.overlay({ html: view, css: skin });
}

/** 工具箱页面没了（关闭 / 重载 / 回到启动器）：浮层已经跟着消失，收插件侧的就行。 */
async function onBye() {
  overlayId = 0;
}

async function onStop() {
  // 停用 / 重载 / 退出：把浮层、定时器、注入的 CSS 收干净。
  if (overlayId) {
    Coconut.ui.remove(overlayId);
    overlayId = 0;
  }
}

// —— 交给插件宿主 ——
// esbuild 会把整份代码包进 IIFE，函数声明不再落在全局作用域；
// 宿主是在 globalThis 上找钩子的，所以必须显式挂出去。
globalThis.onStart = onStart;
globalThis.onHello = onHello;
globalThis.onBye = onBye;
globalThis.onStop = onStop;
