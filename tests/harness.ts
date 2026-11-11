/**
 * 插件测试沙箱：用「假 Coconut 宿主 + 假页面」把 `dist/<id>.js` 真跑一遍。
 *
 * 谁在用：
 *   - `tests/examples.test.ts`：官方示例的回归测试（deno task test:examples）；
 *   - `dev/<id>/test.js`：用户自己的插件测试（deno task test [id]），
 *     直接从模板复制，`import { runPluginTests } from '../../tests/harness.ts'`。
 *
 * 这里提供：
 *   - {@link FakePage} / {@link FakeNode}：够用的假 DOM（runJs、dataset、querySelector…）；
 *   - {@link loadPlugin}：在干净作用域里加载打包产物，拿到钩子 / 监听器 / 日志 / 浮层；
 *   - {@link dispatchLifecycle}：按引擎语义触发 start / hello / event / bye / stop；
 *   - {@link runPluginTests} + {@link check}：跑一个测试文件并输出结果。
 */
import { dim, distDir, exists, fail, green, join, log, red } from '../scripts/lib.ts'

/* ───────────────────────── 假 DOM ───────────────────────── */

export type Listener = (event: unknown) => void

export class FakeNode {
    tagName: string
    nodeType = 1
    className = ''
    id = ''
    children: FakeNode[] = []
    parentElement: FakeNode | null = null
    attrs: Record<string, string> = {}
    dataset: Record<string, string> = {}
    style: Record<string, unknown> = {}
    styleVars: Record<string, string> = {}
    listeners: Record<string, Listener[]> = {}
    rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }
    text = ''
    value = ''
    offsetLeft = 0
    offsetTop = 0
    offsetWidth = 0

    constructor(tagName: string) {
        this.tagName = tagName.toUpperCase()
    }

    get childNodes(): FakeNode[] {
        return this.children
    }

    get textContent(): string {
        if (this.nodeType === 3) return this.text
        return this.text + this.children.map((child) => child.textContent).join('')
    }

    set textContent(value: string) {
        if (this.nodeType === 3) this.text = String(value)
        else this.text = String(value)
    }

    get classList() {
        return classListOf(this)
    }

    appendChild(node: FakeNode): FakeNode {
        node.parentElement = this
        this.children.push(node)
        return node
    }

    remove(): void {
        if (!this.parentElement) return
        this.parentElement.children = this.parentElement.children.filter((item) => item !== this)
        this.parentElement = null
    }

    getAttribute(name: string): string | null {
        if (name === 'class') return this.className || null
        if (name === 'style') return this.attrs.style ?? null
        return this.attrs[name] ?? null
    }

    setAttribute(name: string, value: string): void {
        this.attrs[name] = String(value)
        if (name === 'class') this.className = String(value)
    }

    hasAttribute(name: string): boolean {
        return this.getAttribute(name) != null
    }

    addEventListener(type: string, handler: Listener): void {
        ;(this.listeners[type] ||= []).push(handler)
    }

    dispatch(type: string, event: unknown): void {
        for (const handler of this.listeners[type] || []) handler(event)
    }

    click(): void {
        this.dispatch('click', { type: 'click' })
    }

    getBoundingClientRect() {
        return this.rect
    }

    setPointerCapture(): void {}

    querySelectorAll(selector: string): FakeNode[] {
        return collect(this).filter((node) => node !== this && matches(node, selector))
    }

    querySelector(selector: string): FakeNode | null {
        return this.querySelectorAll(selector)[0] ?? null
    }
}

/** 极简 classList（用外部函数避免 `this` 别名）。 */
function classListOf(node: FakeNode) {
    return {
        add(name: string) {
            node.className = `${node.className} ${name}`.trim()
        },
        remove(name: string) {
            node.className = node.className
                .split(/\s+/)
                .filter((item) => item && item !== name)
                .join(' ')
        },
        contains(name: string) {
            return node.className.split(/\s+/).includes(name)
        },
    }
}

export function textNode(value: string): FakeNode {
    const node = new FakeNode('#text')
    node.nodeType = 3
    node.text = value
    return node
}

function collect(root: FakeNode, out: FakeNode[] = []): FakeNode[] {
    for (const child of root.children) {
        if (child.nodeType === 1) {
            out.push(child)
            collect(child, out)
        }
    }
    return out
}

/** 极简选择器：支持 `tag` / `.cls` / `#id` / `[attr]` / `[attr="v"]` / `[attr*="v"]` / `[attr^="v"]`，空格=后代。 */
function matches(node: FakeNode, selector: string): boolean {
    return selector.split(',').some((part) => matchComplex(node, part.trim()))
}

function matchSimple(node: FakeNode, token: string): boolean {
    const rest = token
    const classMatch = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(rest)
    if (classMatch) {
        const tag = classMatch[1]
        if (tag && node.tagName !== tag.toUpperCase()) return false
        for (const cls of classMatch[2].split('.').filter(Boolean)) {
            if (!node.className.split(/\s+/).includes(cls)) return false
        }
        for (const attr of classMatch[3].match(/\[[^\]]+\]/g) || []) {
            const body = attr.slice(1, -1)
            const eq = /^([\w-]+)\s*([*^]?)=\s*["']?([^"']*)["']?$/.exec(body)
            if (!eq) {
                if (node.getAttribute(body) == null) return false
                continue
            }
            const value = node.getAttribute(eq[1]) ?? ''
            if (eq[2] === '*' && !value.includes(eq[3])) return false
            if (eq[2] === '^' && !value.startsWith(eq[3])) return false
            if (!eq[2] && value !== eq[3]) return false
        }
        return true
    }
    if (token.startsWith('#')) return node.id === token.slice(1)
    if (token.startsWith('.')) return node.classList.contains(token.slice(1))
    return node.tagName === token.toUpperCase()
}

function matchComplex(node: FakeNode, selector: string): boolean {
    const tokens = selector.split(/\s+/).filter(Boolean)
    if (!tokens.length) return false
    if (!matchSimple(node, tokens[tokens.length - 1])) return false
    let current: FakeNode | null = node.parentElement
    for (let i = tokens.length - 2; i >= 0; i--) {
        let found = false
        while (current) {
            if (matchSimple(current, tokens[i])) {
                found = true
                current = current.parentElement
                break
            }
            current = current.parentElement
        }
        if (!found) return false
    }
    return true
}

/* ───────────────────────── 假页面 ───────────────────────── */

export class FakePage {
    window: Record<string, unknown> = {}
    observations: FakeObserver[] = []
    document: Record<string, unknown>
    documentElement = new FakeNode('html')
    body = new FakeNode('body')

    constructor(dbData: Record<string, unknown> = {}) {
        this.body.parentElement = null
        this.documentElement.appendChild(this.body)
        this.document = {
            body: this.body,
            documentElement: this.documentElement,
            querySelector: (selector: string) =>
                collect(this.documentElement).find((node) => matches(node, selector)) ?? null,
            querySelectorAll: (selector: string) =>
                collect(this.documentElement).filter((node) => matches(node, selector)),
            createElement: (tag: string) => new FakeNode(tag),
            title: '椰果工具箱',
        }
        this.db = dbData
    }

    db: Record<string, unknown>

    /** 造一个元素挂到 body（或指定父节点）下。 */
    add(node: FakeNode, parent: FakeNode = this.body): FakeNode {
        parent.appendChild(node)
        return node
    }

    /**
     * 执行页面脚本：模拟宿主的 `run_js`（工具箱那边会包成 async 函数）。
     * 返回**真实值**；页面脚本是异步的就返回 Promise，插件侧 `await` 一下即可。
     */
    run(code: string): unknown {
        const names = [
            'document',
            'window',
            'indexedDB',
            'MutationObserver',
            'Node',
            'getComputedStyle',
            'innerWidth',
            'innerHeight',
            'setTimeout',
            'clearTimeout',
            'console',
        ]
        const values = [
            this.document,
            this.window,
            this.makeIndexedDB(),
            FakeObserver,
            { TEXT_NODE: 3, ELEMENT_NODE: 1 },
            (el: FakeNode) => ({ getPropertyValue: (name: string) => el.styleVars[name] ?? '' }),
            1600,
            900,
            setTimeout,
            clearTimeout,
            console,
        ]
        const fn = new Function(...names, `return (async () => {${code}\n})()`)
        return fn(...values)
    }

    private makeIndexedDB() {
        const data = this.db
        return {
            open(_name: string) {
                const request: Record<string, unknown> = {}
                setTimeout(() => {
                    request.result = {
                        objectStoreNames: { contains: () => true },
                        transaction: () => ({
                            objectStore: () => ({
                                get: (key: string) => {
                                    const get: Record<string, unknown> = {}
                                    setTimeout(() => {
                                        get.result = data[key]
                                        ;(get.onsuccess as (() => void) | undefined)?.()
                                    }, 0)
                                    return get
                                },
                            }),
                        }),
                    }
                    ;(request.onsuccess as (() => void) | undefined)?.()
                }, 0)
                return request
            },
        }
    }
}

export class FakeObserver {
    static instances: FakeObserver[] = []
    callback: (records: unknown[]) => void
    target: FakeNode | null = null
    options: Record<string, unknown> | null = null
    disconnected = false
    constructor(callback: (records: unknown[]) => void) {
        this.callback = callback
        FakeObserver.instances.push(this)
    }
    observe(target: FakeNode, options: Record<string, unknown>) {
        this.target = target
        this.options = options
    }
    disconnect() {
        this.disconnected = true
    }
}

/* ───────────────────────── 假 Coconut 宿主 ───────────────────────── */

export interface Engine {
    callTool(name: string, args: Record<string, unknown>): unknown
    fetch(url: string, options?: unknown): unknown
}

export interface Loaded {
    hooks: Record<string, (...args: unknown[]) => unknown>
    /** `Coconut.addEventListener('lifecycle', …)` 注册的监听器。 */
    lifecycle: Map<string, Array<(...args: unknown[]) => unknown>>
    logs: string[]
    overlays: Array<{ html?: string; css?: string }>
    removedOverlays: number[]
    intervals: Map<number, () => void>
    stored: Record<string, unknown>
    runJsCodes: string[]
    page: FakePage
}

export function loadPlugin(id: string, engine: Engine, page: FakePage): Loaded {
    const file = join(distDir, `${id}.js`)
    if (!exists(file)) {
        fail(`缺少产物 dist/${id}.js，先跑 deno task build（deno task test <id> 会自动打包）`)
        Deno.exit(1)
    }
    const code = Deno.readTextFileSync(file)
    const logs: string[] = []
    const overlays: Array<{ html?: string; css?: string }> = []
    const removedOverlays: number[] = []
    const intervals = new Map<number, () => void>()
    const stored: Record<string, unknown> = {}
    const runJsCodes: string[] = []
    const lifecycle = new Map<string, Array<(...args: unknown[]) => unknown>>()
    let overlaySeq = 0
    let timerSeq = 0

    const coconut: Record<string, any> = {
        plugin: { id, name: id, version: 'test', mount: 'none', permissions: [] },
        log: (...args: unknown[]) => logs.push(args.map((item) => String(item)).join(' ')),
        callTool: (name: string, args: Record<string, unknown>) =>
            engine.callTool(name, args || {}),
        fetch: (url: string, options: unknown) => engine.fetch(url, options),
        addEventListener: (type: string, listener: (...args: unknown[]) => unknown) => {
            const list = lifecycle.get(type) || []
            list.push(listener)
            lifecycle.set(type, list)
            return coconut
        },
        removeEventListener: (type: string, listener: (...args: unknown[]) => unknown) => {
            const list = lifecycle.get(type) || []
            lifecycle.set(type, list.filter((item) => item !== listener))
            return coconut
        },
        storage: {
            get: (key: string, fallback: unknown) =>
                key in stored ? stored[key] : (fallback === undefined ? null : fallback),
            set: (key: string, value: unknown) => {
                stored[key] = value
                return true
            },
            delete: (key: string) => {
                delete stored[key]
                return true
            },
            all: () => ({ ...stored }),
        },
        ui: {
            overlay: (options: { html?: unknown; css?: unknown }) => {
                const text = (value: unknown) =>
                    value && typeof value === 'object' && 'text' in value
                        ? String((value as { text?: string }).text ?? '')
                        : (value as string | undefined)
                overlays.push({ html: text(options?.html), css: text(options?.css) })
                overlaySeq += 1
                return overlaySeq
            },
            remove: (target: number) => {
                removedOverlays.push(target)
                return true
            },
            show: () => true,
            hide: () => true,
            visible: () => true,
            injectCss: () => true,
        },
        http: {
            createServer: (options?: { port?: number }) => {
                const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>()
                const server = {
                    id: 1,
                    port: Number(options?.port || 47830),
                    close: () => true,
                    addEventListener: (type: string, listener: (...args: unknown[]) => unknown) => {
                        const list = listeners.get(type) || []
                        list.push(listener)
                        listeners.set(type, list)
                        return server
                    },
                    __listeners: (type: string) => listeners.get(type) || [],
                }
                return server
            },
        },
        webSocket: () => {
            throw new Error('测试宿主没有 WebSocket 客户端')
        },
        launcher: { lang: 'zh-Hans', toolboxVersion: 'test', gameVersion: 'test' },
        src: {
            toolbox: { dir: '', url: 'http://toolbox.local/' },
            static: { dir: '', url: 'http://toolbox.local/icons/' },
        },
        runJs: (codeText: string) => {
            runJsCodes.push(codeText)
            return page.run(codeText)
        },
        toolbox: {
            runJs: (target: unknown, ...args: unknown[]) => {
                let code: string
                if (typeof target === 'function') {
                    const source = Function.prototype.toString.call(target)
                    if (source.includes('[native code]')) throw new TypeError('不能执行原生函数')
                    code = `return (${source}).apply(undefined, ${JSON.stringify(args)});`
                } else if (typeof target === 'string') {
                    code = args.length
                        ? `return (${target}).apply(undefined, ${JSON.stringify(args)});`
                        : target
                } else if (target && typeof target === 'object' && '__coconut' in target) {
                    code = String((target as { text?: string }).text ?? '')
                } else {
                    throw new TypeError('runJs 需要字符串、函数或 <script> 片段')
                }
                runJsCodes.push(code)
                return page.run(code)
            },
            exit: () => true,
        },
        tools: {
            call: (name: string, args?: Record<string, unknown>) =>
                Promise.resolve(engine.callTool(name, args || {})),
            addEventListener: () => {},
            removeEventListener: () => {},
        },
        sleep: () => Promise.resolve(),
        setTimeout: () => {
            timerSeq += 1
            return timerSeq
        },
        clearTimeout: () => {},
        setInterval: (handler: () => void) => {
            timerSeq += 1
            intervals.set(timerSeq, handler)
            return timerSeq
        },
        clearInterval: (target: number) => intervals.delete(target),
    }

    const hooks: Record<string, (...args: unknown[]) => unknown> = {}
    const names = ['onStart', 'onHello', 'onEvent', 'onStop']
    for (const name of names) delete (globalThis as Record<string, unknown>)[name]
    const factory = new Function('Coconut', 'console', code)
    factory(coconut, console)
    for (const name of names) {
        const fn = (globalThis as Record<string, unknown>)[name]
        if (typeof fn === 'function') hooks[name] = fn as (...args: unknown[]) => unknown
        delete (globalThis as Record<string, unknown>)[name]
    }
    return {
        hooks,
        lifecycle,
        logs,
        overlays,
        removedOverlays,
        intervals,
        stored,
        runJsCodes,
        page,
    }
}

/** 等所有微任务/定时器排空。 */
export async function settle(rounds = 12) {
    for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 1))
}

/* ───────────────────────── 断言 ───────────────────────── */

let failures = 0
let passes = 0
export function check(name: string, condition: boolean, detail = '') {
    if (condition) {
        passes += 1
        log(`   ${green('✔')} ${name}`)
    } else {
        failures += 1
        log(`   ${red('✗')} ${name}${detail ? dim(`  ${detail}`) : ''}`)
    }
}

/** 当前断言计数（`runPluginTests` 每次开始时清零）。 */
export function stats(): { passes: number; failures: number } {
    return { passes, failures }
}

/** 打印汇总并设置退出码；测试文件末尾调用（`runPluginTests` 会自动调）。 */
export function finish(): void {
    log('')
    if (failures) {
        fail(`${failures} 项失败（成功 ${passes} 项）`)
        Deno.exitCode = 1
        return
    }
    log(green(`全部通过：${passes} 项`))
    Deno.exitCode = 0
}

export type LifecycleName = 'start' | 'hello' | 'event' | 'bye' | 'stop'

/**
 * 按引擎语义触发一次生命周期：全局钩子（`onHello(info)`）直接拿 info，
 * `Coconut.addEventListener('hello', …)` 的监听器拿**事件对象**（数据在 `event.detail`）。
 * 两者都会执行；返回值会 await。
 */
export async function dispatchLifecycle(
    loaded: Loaded,
    type: LifecycleName,
    info?: unknown,
): Promise<void> {
    const hookName = `on${type.charAt(0).toUpperCase()}${type.slice(1)}`
    const hook = loaded.hooks[hookName]
    if (hook) await hook(info)
    const event = {
        type,
        detail: info === undefined ? null : info,
        target: null,
        currentTarget: null,
    }
    for (const listener of loaded.lifecycle.get(type) || []) await listener(event)
}

/** `runPluginTests` 给测试体的上下文。 */
export interface PluginTestContext {
    page: FakePage
    loaded: Loaded
    check: typeof check
    settle: typeof settle
    /** 触发 start / hello / event / bye / stop（钩子 + 监听器都跑）。 */
    lifecycle: (type: LifecycleName, info?: unknown) => Promise<void>
}

const defaultEngine: Engine = {
    callTool: () => ({}),
    fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
}

/**
 * 一个插件测试文件的标准入口：
 *
 * ```js
 * // dev/<id>/test.js
 * import { runPluginTests } from '../../tests/harness.ts';
 * const id = import.meta.dirname.replace(/[\\/]/g, '/').split('/').pop();
 *
 * await runPluginTests(id, async (t, plugin) => {
 *   await t.lifecycle('start');
 *   t.check('start 写了日志', plugin.logs.length > 0);
 * });
 * ```
 *
 * 第二个参数是加载后的插件（`Loaded`）；需要假工具箱 / 假网络时传第三个参数：
 * `{ engine: { callTool, fetch } }`。
 */
export async function runPluginTests(
    id: string,
    body: (t: PluginTestContext, plugin: Loaded) => void | Promise<void>,
    options: { engine?: Engine; page?: FakePage } = {},
): Promise<void> {
    passes = 0
    failures = 0
    const page = options.page ?? new FakePage()
    const loaded = loadPlugin(id, options.engine ?? defaultEngine, page)
    const context: PluginTestContext = {
        page,
        loaded,
        check,
        settle,
        lifecycle: (type, info) => dispatchLifecycle(loaded, type, info),
    }
    try {
        await body(context, loaded)
    } catch (error) {
        failures += 1
        log(`   ${red('✗')} 测试抛错：${(error as Error)?.stack || String(error)}`)
    }
    finish()
}
