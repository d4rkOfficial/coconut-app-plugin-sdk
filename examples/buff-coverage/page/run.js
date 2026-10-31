/**
 * 页面侧工具：把「自包含函数」序列化成 Coconut.runJs 能吃的代码（支持 JSON 参数）。
 *
 * 页面脚本不能引用模块作用域里的任何东西，需要的数据一律用参数传入。
 */
export function pageCall(fn, ...args) {
  const list = args.length ? args.map((arg) => JSON.stringify(arg)).join(', ') : '';
  return `return (${String(fn).trim()})(${list});`;
}
