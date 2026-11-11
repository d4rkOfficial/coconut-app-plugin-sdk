// @name        工具测试台
// @version     0.2.0
// @description 列出工具箱注册的全部工具：搜索、按参数结构填表调用，结果实时追加到右侧只读日志
// @permissions toolbox, ui, dom
// @mount       overlay
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />
// @ts-check

// 生命周期 / 调用流程在插件侧，交互和表单在浮层页面脚本里：
//   - hello 只给工具名；页面用 Coconut.src.toolbox.url 去 fetch 工具箱 chunk，
//     按 generate-tools.ts 的规则解析出 JSON Schema，再生成参数表单；
//   - 页面「执行调用」把请求塞进 window.__ttQueue，插件轮询取走 → Coconut.tools.call；
//   - 结果通过页面函数 window.__ttAppend 追加到右侧只读日志。
import { appendLog } from './page/append-log.dom.ts'
import { mountPanel } from './page/panel.dom.ts'
import { setTools } from './page/set-tools.dom.ts'
import { takeRequest } from './page/take-request.dom.ts'
import { normalizeTools, type ToolDef } from './tools.ts'
import { buildPanel } from './ui.tsx'

/** 浮层 id（引擎分配）。 */
let overlayId = 0
/** 轮询定时器 id。 */
let pollTimer = 0
/** 上一次调用还没结束时跳过本轮轮询。 */
let polling = false
/** 本会话的工具定义（含 JSON Schema）。 */
let tools: ToolDef[] = []
/** 工具箱静态资源根地址，页面侧用它 fetch 出工具 Schema。 */
let toolboxUrl = ''
/** 工具定义是否已经推给页面（页面脚本可能比 hello 晚一点就绪）。 */
let toolsSent = false

function stopPolling() {
    if (pollTimer) {
        Coconut.clearInterval(pollTimer)
        pollTimer = 0
    }
}

/** 把工具名 + 工具箱静态资源地址推给页面；页面脚本还没挂好就下一轮重试。 */
function sendTools() {
    if (toolsSent) return
    try {
        const payload = {
            tools: tools.map((tool) => tool.name),
            baseUrl: toolboxUrl,
        }
        const applied = Coconut.toolbox.runJs(setTools, payload)
        // setTools 在面板还没挂好时返回 false：下一轮轮询继续试。
        toolsSent = applied !== false
    } catch (error) {
        // 浮层脚本还没执行完 / 页面正在重载：下一轮再试。
    }
}

/** 把一行文本追加到页面日志；页面已关闭时静默忽略。 */
function appendLine(text: string) {
    try {
        Coconut.toolbox.runJs(appendLog, text)
    } catch (error) {
        // 页面正在关闭 / 还没就绪：结果丢了就算了，别让定时器抛错。
    }
}

/** 把工具返回值转成适合贴进日志的文本。 */
function formatResult(value: unknown): string {
    try {
        const text = JSON.stringify(value, null, 2)
        return text === undefined ? String(value) : text
    } catch (error) {
        return String(value)
    }
}

/** 取一次页面侧请求；没有就立刻返回。 */
async function pollOnce() {
    if (!toolsSent) sendTools()
    if (polling) return

    let raw: any
    try {
        raw = Coconut.toolbox.runJs(takeRequest)
    } catch (error) {
        return // 页面没就绪或已关闭，下一轮再试
    }
    if (!raw || typeof raw.tool !== 'string') return

    polling = true
    const started = Date.now()
    try {
        const result = await Coconut.tools.call(raw.tool, raw.args || {})
        const ms = Date.now() - started
        appendLine(`[←] ${raw.tool} (${ms}ms)\n${formatResult(result)}`)
    } catch (error) {
        appendLine(`[✗] ${raw.tool} — ${String(error)}`)
    } finally {
        polling = false
    }
}

Coconut.addEventListener('start', async () => {
    Coconut.log(`[${Coconut.plugin.id}] v${Coconut.plugin.version} 已加载`)
})

Coconut.addEventListener('hello', async (event) => {
    // addEventListener 的监听器拿的是事件对象，hello 数据在 event.detail。
    const raw = event as any
    const info = raw && raw.detail && typeof raw.detail === 'object' ? raw.detail : raw
    tools = normalizeTools(info?.tools)
    toolboxUrl = Coconut.src.toolbox.url
    toolsSent = false

    const { html, css } = buildPanel()
    overlayId = Coconut.ui.overlay({ html, css, script: mountPanel })
    Coconut.log(`工具测试台已挂载：${tools.length} 个工具，浮层 id=${overlayId}`)

    stopPolling()
    pollTimer = Coconut.setInterval(() => {
        pollOnce()
    }, 150)
    sendTools()
})

Coconut.addEventListener('bye', async () => {
    // 页面会话结束：浮层已经跟着消失，收插件侧的定时器就行。
    stopPolling()
    overlayId = 0
    toolsSent = false
})

Coconut.addEventListener('stop', async () => {
    stopPolling()
    if (overlayId) {
        Coconut.ui.remove(overlayId)
        overlayId = 0
    }
    toolsSent = false
})
