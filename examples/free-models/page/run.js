/**
 * 页面侧工具：把「自包含函数」序列化成 Coconut.runJs 能吃的代码。
 *
 * 工具箱的 run_js 会把代码包成 `return (async () => { ... })()`，
 * 所以这里统一 `return (...)`，函数返回 Promise 也没问题。
 */
export function pageCall(fn) {
  return `return (${String(fn).trim()})();`;
}
