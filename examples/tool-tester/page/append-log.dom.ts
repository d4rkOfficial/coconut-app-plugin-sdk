// deno-lint-ignore-file no-explicit-any
/**
 * 页面侧脚本：把一行结果追加到浮层里的只读日志（找不到就静默忽略）。
 * @param text
 */
export function appendLog(text: unknown): boolean {
    const target = (window as any).__ttAppend
    if (typeof target === 'function') target(text)
    return true
}
