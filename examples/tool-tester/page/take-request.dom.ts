// deno-lint-ignore-file no-explicit-any
/**
 * 页面侧脚本：从 `window.__ttQueue` 取走一次调用请求。
 * 队列由 page/panel.dom.ts 创建；没有请求 / 队列不存在都返回 null。
 */
export function takeRequest(): { tool: string; args: Record<string, unknown> } | null {
    const queue = (window as any).__ttQueue
    if (!queue || !queue.length) return null
    return queue.shift()
}
