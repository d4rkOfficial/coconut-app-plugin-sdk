/**
 * 页面侧工具：把「自包含函数」序列化成 Coconut.runJs 能吃的代码。
 *
 * runJs 传的是**函数体**（工具箱包成 `return (async () => { ... })()`），
 * 所以这里统一 `return (...)`；参数用 JSON 传，页面里拿到的就是普通对象。
 */
export function pageCall(fn, ...args) {
  const list = args.length ? args.map((arg) => JSON.stringify(arg)).join(', ') : '';
  return `return (${String(fn).trim()})(${list});`;
}
