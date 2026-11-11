// deno-lint-ignore-file no-explicit-any
/**
 * 页面侧脚本：把插件侧归一化后的工具定义（含 JSON Schema）交给面板。
 * 面板还没挂好就返回 false，插件下一轮轮询会重试。
 * @param tools
 */
export function setTools(tools: unknown): boolean {
    const target = (window as any).__ttSetTools
    if (typeof target !== 'function') return false
    target(tools)
    return true
}
