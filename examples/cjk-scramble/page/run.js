/**
 * 页面侧工具：把「自包含函数」序列化成 Coconut.runJs 能吃的代码。
 *
 * 页面脚本必须完全自包含：不能引用模块作用域里的任何东西（`import` 的绑定、
 * 模块级 const 都不行），需要的外部数据一律用参数传进去。
 */
export function pageCall(fn, ...args) {
  const list = args.length ? args.map((arg) => JSON.stringify(arg)).join(', ') : '';
  return `return (${String(fn).trim()})(${list});`;
}
