// deno-lint-ignore-file no-window no-explicit-any
/**
 * 页面侧脚本：接管浮层的全部交互。
 *
 *   - 工具列表 / 搜索过滤 / 参数表单（按工具箱的 JSON Schema 生成）
 *   - 只读日志、清空
 *   - 窗口拖动（标题栏展开时、悬浮球收起时都能拖）
 *   - 收成悬浮球 / 展开
 *
 * 「执行调用」只把请求塞进 `window.__ttQueue`；插件轮询取走后调工具，
 * 再把结果通过 `window.__ttAppend` 写回日志。
 *
 * 注意：这个函数会被序列化进页面执行，不能引用模块作用域里的任何东西。
 * 返回清理函数（浮层移除 / 插件停用时由引擎调用）。
 */
export function mountPanel(root: HTMLElement | null): (() => void) | void {
    if (!root) return

    const panel = root.querySelector<HTMLElement>('.tt-root')!
    const head = root.querySelector<HTMLElement>('.tt-head')!
    const minBtn = root.querySelector<HTMLElement>('.tt-min')!
    const ball = root.querySelector<HTMLElement>('.tt-ball')!
    const countEl = root.querySelector<HTMLElement>('.tt-count')!
    const search = root.querySelector<HTMLInputElement>('.tt-search')!
    const list = root.querySelector<HTMLElement>('.tt-list')!
    const dialog = root.querySelector<HTMLElement>('.tt-dialog')!
    const dialogTitle = root.querySelector<HTMLElement>('.tt-dialog-title')!
    const dialogDesc = root.querySelector<HTMLElement>('.tt-dialog-desc')!
    const dialogError = root.querySelector<HTMLElement>('.tt-dialog-error')!
    const form = root.querySelector<HTMLElement>('.tt-form')!
    const confirmBtn = root.querySelector<HTMLElement>('.tt-confirm')!
    const cancelBtn = root.querySelector<HTMLElement>('.tt-cancel')!
    const log = root.querySelector<HTMLTextAreaElement>('.tt-log')!
    const clearBtn = root.querySelector<HTMLElement>('.tt-clear')!

    type FieldKind = 'string' | 'number' | 'enum' | 'boolean' | 'json'
    interface FieldSpec {
        key: string
        kind: FieldKind
        schema: any
        required: boolean
        input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    }
    interface DragState {
        id: number
        sx: number
        sy: number
        left: number
        top: number
        width: number
        height: number
        moved: boolean
        handle: HTMLElement
    }

    const toolByName = new Map<string, any>()
    /** 从工具箱打包产物里解析出来的参数 Schema（按工具名）。 */
    const schemaByName = new Map<string, any>()
    const queue: Array<{ tool: string; args: Record<string, unknown> }> = []
    const lastRaw: Record<string, Record<string, string>> = Object.create(null)
    let fields: FieldSpec[] = []
    let activeTool = ''
    let jsonFallback: HTMLTextAreaElement | null = null
    let drag: DragState | null = null
    let schemasLoading = false

    function pushLog(text: unknown) {
        const line = String(text == null ? '' : text)
        log.value = (log.value ? log.value + '\n' : '') + line
        log.scrollTop = log.scrollHeight
    }

    function closeDialog() {
        dialog.classList.remove('open')
        activeTool = ''
    }

    function clamp(value: number, min: number, max: number) {
        return Math.max(min, Math.min(max, value))
    }

    /* ───────────────────── 工具列表 ───────────────────── */

    function filterRows() {
        const query = String(search.value || '').trim().toLowerCase()
        const rows = list.querySelectorAll<HTMLElement>('.tt-tool')
        for (let index = 0; index < rows.length; index++) {
            const row = rows[index]
            const name = String(row.dataset.tool || '').toLowerCase()
            row.style.display = !query || name.indexOf(query) >= 0 ? '' : 'none'
        }
    }

    function renderList() {
        list.textContent = ''
        if (countEl) countEl.textContent = `${toolByName.size} TOOLS`
        if (!toolByName.size) {
            const empty = document.createElement('div')
            empty.className = 'tt-empty'
            empty.textContent = '工具箱没有注册工具'
            list.appendChild(empty)
            return
        }
        for (const tool of toolByName.values()) {
            const row = document.createElement('button')
            row.type = 'button'
            row.className = 'tt-tool'
            row.setAttribute('data-tool', tool.name)
            if (tool.description) row.title = tool.description
            const dot = document.createElement('span')
            dot.className = 'tt-tool-dot'
            const name = document.createElement('span')
            name.className = 'tt-tool-name'
            name.textContent = tool.name
            row.appendChild(dot)
            row.appendChild(name)
            list.appendChild(row)
        }
        filterRows()
    }

    /** 从 `{` 起点截一段括号配平的源码（和 generate-tools.ts 同一套）。 */
    function balancedObject(text: string, start: number): string | null {
        let depth = 0
        let quote = ''
        for (let index = start; index < text.length; index++) {
            const char = text[index]
            if (quote) {
                if (char === '\\') index++
                else if (char === quote) quote = ''
                continue
            }
            if (char === '`' || char === '"' || char === "'") {
                quote = char
                continue
            }
            if (char === '{') depth++
            else if (char === '}') {
                depth--
                if (depth === 0) return text.slice(start, index + 1)
            }
        }
        return null
    }

    /** 兜住未定义标识符的 Proxy：把参数表当字面量求值时用。 */
    function looseValue(): any {
        const target = function loose() {}
        const handler = {
            get: (_target: any, key: string | symbol) => {
                if (key === Symbol.toPrimitive) return () => ''
                if (key === Symbol.iterator) return function* empty() {}
                if (key === 'toString' || key === 'valueOf') return () => ''
                if (key === 'length') return 0
                return proxy
            },
            apply: () => proxy,
            construct: () => proxy,
            has: () => true,
        }
        const proxy: any = new Proxy(target, handler)
        return proxy
    }

    function evaluateLiteral(source: string): any {
        const loose = looseValue()
        const scope = new Proxy({}, {
            has: () => true,
            get: (_target, key) => key === Symbol.unscopables ? undefined : loose,
            set: () => true,
        })
        const fn = new Function('scope', 'with (scope) { return (' + source + '); }')
        return fn(scope)
    }

    /** 从工具箱打包 chunk 里抠出工具参数表（generate-tools.ts 的页面版）。 */
    function collectSchemas(text: string, out: Map<string, any>) {
        const re = /[A-Za-z_$][\w$]*\(`([a-z][a-z0-9_]*)`,\{description:/g
        let match: RegExpExecArray | null
        while ((match = re.exec(text))) {
            const name = match[1]
            const braceAt = text.indexOf('{', match.index + name.length + 3)
            if (braceAt < 0) continue
            const body = balancedObject(text, braceAt)
            if (!body) continue
            const paramAt = body.indexOf('parameters:')
            if (paramAt < 0) continue
            const paramBrace = body.indexOf('{', paramAt)
            const paramText = paramBrace >= 0 ? balancedObject(body, paramBrace) : '{}'
            if (!paramText) continue
            try {
                const schema = evaluateLiteral(paramText)
                if (schema && typeof schema === 'object') out.set(name, schema)
            } catch (_) {
                // 个别参数表求值失败就跳过，该工具用 JSON 兜底
            }
        }
    }

    function refreshDialog() {
        if (!activeTool) return
        const name = activeTool
        const live: Record<string, string> = {}
        for (const field of fields) live[field.key] = field.input.value
        if (Object.keys(live).length) lastRaw[name] = live
        else if (jsonFallback) lastRaw[name] = { __json__: jsonFallback.value }
        openDialog(name)
    }

    async function loadSchemas(baseUrl: string) {
        if (schemasLoading || !baseUrl) return
        schemasLoading = true
        try {
            const found = new Map<string, any>()
            const urls = new Set<string>()
            const base = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/'
            const indexUrl = new URL('index.html', base).href
            const indexResponse = await fetch(indexUrl)
            const html = await indexResponse.text()
            const re = /(?:src|href)="([^"]+\.js)"/g
            let match: RegExpExecArray | null
            while ((match = re.exec(html))) {
                try {
                    urls.add(new URL(match[1], indexUrl).href)
                } catch (_) {
                    // 忽略坏地址
                }
            }
            try {
                const entries = performance.getEntriesByType(
                    'resource',
                ) as PerformanceResourceTiming[]
                for (const entry of entries) {
                    if (/\.js(\?|$)/.test(entry.name)) urls.add(entry.name)
                }
            } catch (_) {
                // 老环境没有 performance，忽略
            }
            const targets = [...urls].slice(0, 40)
            await Promise.all(targets.map(async (url) => {
                try {
                    const response = await fetch(url)
                    collectSchemas(await response.text(), found)
                } catch (_) {
                    // 某个 chunk 拉不到就算了
                }
            }))
            for (const [name, schema] of found) {
                if (toolByName.has(name)) schemaByName.set(name, schema)
            }
            if (activeTool) refreshDialog()
        } catch (_) {
            // 拿不到 Schema 就保持 JSON 兜底
        } finally {
            schemasLoading = false
        }
    }

    function applyTools(raw: unknown) {
        toolByName.clear()
        schemaByName.clear()
        let list: any[] = []
        let baseUrl = ''
        if (Array.isArray(raw)) {
            list = raw
        } else if (raw && typeof raw === 'object') {
            const payload = raw as { tools?: unknown; baseUrl?: unknown }
            if (Array.isArray(payload.tools)) list = payload.tools
            if (typeof payload.baseUrl === 'string') baseUrl = payload.baseUrl
        }
        for (const tool of list) {
            if (typeof tool === 'string') toolByName.set(tool, { name: tool })
            else if (tool && typeof tool.name === 'string') toolByName.set(tool.name, tool)
        }
        renderList()
        if (baseUrl) void loadSchemas(baseUrl)
    }

    /* ───────────────────── 参数表单 ───────────────────── */

    function option(value: string, label: string) {
        const item = document.createElement('option')
        item.value = value
        item.textContent = label
        return item
    }

    function buildField(
        key: string,
        rawSchema: unknown,
        required: boolean,
        saved: string | undefined,
    ): { spec: FieldSpec; node: HTMLElement } | null {
        const schema = rawSchema && typeof rawSchema === 'object' ? rawSchema as any : {}
        const rawType = Array.isArray(schema.type)
            ? schema.type.filter((item: unknown) => item !== 'null')[0]
            : schema.type
        const type = typeof rawType === 'string' ? rawType : ''

        let kind: FieldKind = 'string'
        if (Array.isArray(schema.enum) && schema.enum.length) kind = 'enum'
        else if (type === 'boolean') kind = 'boolean'
        else if (type === 'number' || type === 'integer') kind = 'number'
        else if (type === 'array' || type === 'object' || schema.properties) kind = 'json'

        const wrap = document.createElement('div')
        wrap.className = 'tt-field'

        const label = document.createElement('div')
        label.className = 'tt-field-label'
        const nameEl = document.createElement('span')
        nameEl.textContent = key
        label.appendChild(nameEl)
        if (required) {
            const star = document.createElement('span')
            star.className = 'tt-field-req'
            star.textContent = '*'
            label.appendChild(star)
        }
        const typeTag = document.createElement('span')
        typeTag.className = 'tt-field-type'
        typeTag.textContent = kind === 'json'
            ? (type === 'array' ? 'JSON ARRAY' : 'JSON OBJECT')
            : kind.toUpperCase()
        label.appendChild(typeTag)
        wrap.appendChild(label)

        if (schema.description) {
            const desc = document.createElement('div')
            desc.className = 'tt-field-desc'
            desc.textContent = String(schema.description)
            wrap.appendChild(desc)
        }

        let input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        if (kind === 'enum') {
            const select = document.createElement('select')
            select.className = 'tt-select'
            if (!required) select.appendChild(option('', '（不填）'))
            for (const value of schema.enum) {
                select.appendChild(option(JSON.stringify(value), String(value)))
            }
            if (schema.default !== undefined) select.value = JSON.stringify(schema.default)
            input = select
        } else if (kind === 'boolean') {
            const select = document.createElement('select')
            select.className = 'tt-select'
            if (!required) select.appendChild(option('', '（不填）'))
            select.appendChild(option('true', 'true'))
            select.appendChild(option('false', 'false'))
            if (schema.default !== undefined) {
                select.value = schema.default === true ? 'true' : 'false'
            }
            input = select
        } else if (kind === 'number') {
            const number = document.createElement('input')
            number.className = 'tt-input'
            number.type = 'number'
            number.step = type === 'integer' ? '1' : 'any'
            if (typeof schema.minimum === 'number') number.min = String(schema.minimum)
            if (typeof schema.maximum === 'number') number.max = String(schema.maximum)
            if (schema.default !== undefined) number.value = String(schema.default)
            input = number
        } else if (kind === 'json') {
            const area = document.createElement('textarea')
            area.className = 'tt-json'
            area.spellcheck = false
            area.rows = 3
            area.placeholder = type === 'array'
                ? 'JSON 数组，例如 [1, 2, 3]'
                : 'JSON 对象，例如 { "key": "value" }'
            if (schema.default !== undefined) area.value = JSON.stringify(schema.default, null, 2)
            input = area
        } else {
            const text = document.createElement('input')
            text.className = 'tt-input'
            text.type = 'text'
            if (typeof schema.maxLength === 'number') text.maxLength = schema.maxLength
            if (schema.default !== undefined) text.value = String(schema.default)
            input = text
        }

        input.title = schema.description ? String(schema.description) : key
        if (typeof saved === 'string' && saved !== '') {
            if (input.tagName === 'SELECT') {
                const select = input as HTMLSelectElement
                for (let index = 0; index < select.options.length; index++) {
                    if (select.options[index].value === saved) {
                        select.value = saved
                        break
                    }
                }
            } else {
                input.value = saved
            }
        }

        wrap.appendChild(input)
        return { spec: { key, kind, schema, required, input }, node: wrap }
    }

    function openDialog(name: string) {
        const tool = toolByName.get(name)
        if (!tool) return
        activeTool = name
        dialogTitle.textContent = name
        dialogDesc.textContent = tool.description ? String(tool.description) : ''
        form.textContent = ''
        fields = []
        jsonFallback = null

        const schema = schemaByName.get(name)
        const parameters = schema && typeof schema === 'object' ? schema : {}
        const properties = parameters.properties && typeof parameters.properties === 'object'
            ? parameters.properties
            : {}
        const required: string[] = Array.isArray(parameters.required) ? parameters.required : []
        const saved = lastRaw[name] || {}

        if (!schema) {
            // 还没拿到参数结构：先给整段 JSON，Schema 解析完会刷新成表单。
            const wrap = document.createElement('div')
            wrap.className = 'tt-field'
            const label = document.createElement('div')
            label.className = 'tt-field-label'
            label.textContent = '参数（JSON 对象）'
            wrap.appendChild(label)
            const note = document.createElement('div')
            note.className = 'tt-field-desc'
            note.textContent = schemasLoading
                ? '正在解析工具箱的参数结构…也可以先直接填 JSON。'
                : '没有拿到这个工具的参数结构，请手工填写完整 JSON。'
            wrap.appendChild(note)
            const area = document.createElement('textarea')
            area.className = 'tt-json'
            area.spellcheck = false
            area.rows = 6
            area.placeholder = '{ "key": "value" }'
            area.value = saved.__json__ || '{}'
            wrap.appendChild(area)
            form.appendChild(wrap)
            jsonFallback = area
        } else {
            for (const key of Object.keys(properties)) {
                const field = buildField(
                    key,
                    properties[key],
                    required.indexOf(key) >= 0,
                    saved[key],
                )
                if (!field) continue
                fields.push(field.spec)
                form.appendChild(field.node)
            }
        }

        if (!fields.length && !jsonFallback) {
            const note = document.createElement('div')
            note.className = 'tt-field-empty'
            note.textContent = '该工具不需要参数。'
            form.appendChild(note)
        }

        dialogError.textContent = ''
        dialog.classList.add('open')
        form.scrollTop = 0
        if (jsonFallback) {
            jsonFallback.focus()
        } else if (fields.length) {
            const first = fields[0].input
            first.focus()
            if (first.tagName === 'INPUT') (first as HTMLInputElement).select()
        }
    }

    function collectArgs(): { args?: Record<string, unknown>; error?: string } {
        if (jsonFallback) {
            const raw = jsonFallback.value
            if (!raw.trim()) return { args: {} }
            let value: unknown
            try {
                value = JSON.parse(raw)
            } catch (error) {
                return { error: '参数不是合法 JSON' }
            }
            if (value === null || typeof value !== 'object' || Array.isArray(value)) {
                return { error: '参数必须是 JSON 对象' }
            }
            return { args: value as Record<string, unknown> }
        }

        const args: Record<string, unknown> = {}
        for (const field of fields) {
            const raw = field.input.value
            const key = field.key
            const schema = field.schema || {}

            if (field.kind === 'enum') {
                if (!raw) {
                    if (field.required) return { error: `${key} 是必填项` }
                    continue
                }
                try {
                    args[key] = JSON.parse(raw)
                } catch (error) {
                    return { error: `${key} 的取值无法解析，重新选一次` }
                }
            } else if (field.kind === 'boolean') {
                if (!raw) {
                    if (field.required) return { error: `${key} 是必填项` }
                    continue
                }
                args[key] = raw === 'true'
            } else if (field.kind === 'number') {
                if (!raw.trim()) {
                    if (field.required) return { error: `${key} 是必填项` }
                    continue
                }
                const value = Number(raw)
                if (!isFinite(value)) return { error: `${key} 需要填数字` }
                if (String(schema.type).indexOf('integer') >= 0 && !Number.isInteger(value)) {
                    return { error: `${key} 需要整数` }
                }
                if (typeof schema.minimum === 'number' && value < schema.minimum) {
                    return { error: `${key} 不能小于 ${schema.minimum}` }
                }
                if (typeof schema.maximum === 'number' && value > schema.maximum) {
                    return { error: `${key} 不能大于 ${schema.maximum}` }
                }
                args[key] = value
            } else if (field.kind === 'json') {
                if (!raw.trim()) {
                    if (field.required) return { error: `${key} 是必填项` }
                    continue
                }
                let value: unknown
                try {
                    value = JSON.parse(raw)
                } catch (error) {
                    return { error: `${key} 不是合法 JSON` }
                }
                if (schema.type === 'array' && !Array.isArray(value)) {
                    return { error: `${key} 需要 JSON 数组` }
                }
                if (
                    schema.type === 'object' &&
                    (value === null || typeof value !== 'object' || Array.isArray(value))
                ) {
                    return { error: `${key} 需要 JSON 对象` }
                }
                args[key] = value
            } else {
                if (!raw.trim()) {
                    if (field.required) return { error: `${key} 是必填项` }
                    continue
                }
                if (typeof schema.minLength === 'number' && raw.length < schema.minLength) {
                    return { error: `${key} 至少 ${schema.minLength} 个字符` }
                }
                if (typeof schema.maxLength === 'number' && raw.length > schema.maxLength) {
                    return { error: `${key} 最多 ${schema.maxLength} 个字符` }
                }
                args[key] = raw
            }
        }
        return { args }
    }

    function submit() {
        if (!activeTool) return
        const name = activeTool
        const outcome = collectArgs()
        if (outcome.error) {
            dialogError.textContent = outcome.error
            return
        }
        if (jsonFallback) {
            lastRaw[name] = { __json__: jsonFallback.value }
        } else {
            const saved: Record<string, string> = {}
            for (const field of fields) saved[field.key] = field.input.value
            lastRaw[name] = saved
        }

        const args = outcome.args || {}
        queue.push({ tool: name, args })
        closeDialog()
        pushLog('[→] ' + name + ' ' + JSON.stringify(args))
    }

    /* ───────────────────── 拖动 / 悬浮球 ───────────────────── */

    function onPointerMove(event: PointerEvent) {
        if (!drag || event.pointerId !== drag.id) return
        const dx = event.clientX - drag.sx
        const dy = event.clientY - drag.sy
        if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true
        panel.style.left = clamp(drag.left + dx, 0, window.innerWidth - drag.width) + 'px'
        panel.style.top = clamp(drag.top + dy, 0, window.innerHeight - drag.height) + 'px'
    }

    function endDrag(event: PointerEvent) {
        if (!drag || event.pointerId !== drag.id) return
        drag.handle.style.cursor = ''
        drag = null
    }

    function startDrag(event: PointerEvent, handle: HTMLElement) {
        if (event.button !== 0) return
        drag = {
            id: event.pointerId,
            sx: event.clientX,
            sy: event.clientY,
            left: panel.offsetLeft,
            top: panel.offsetTop,
            width: panel.offsetWidth,
            height: panel.offsetHeight,
            moved: false,
            handle,
        }
        panel.style.right = 'auto'
        panel.style.left = drag.left + 'px'
        panel.style.top = drag.top + 'px'
        handle.style.cursor = 'grabbing'
        try {
            handle.setPointerCapture(event.pointerId)
        } catch (_) {
            // 某些环境不支持 pointer capture，忽略即可
        }
    }

    function bindDrag(handle: HTMLElement, onTap?: () => void, skip?: string) {
        handle.addEventListener('pointerdown', function (event) {
            const target = event.target as HTMLElement | null
            if (skip && target && target.closest && target.closest(skip)) return
            startDrag(event, handle)
        })
        handle.addEventListener('pointermove', onPointerMove)
        handle.addEventListener('pointerup', function (event) {
            const tapped = Boolean(drag && !drag.moved)
            endDrag(event)
            if (tapped && onTap) onTap()
        })
        handle.addEventListener('pointercancel', endDrag)
    }

    function restore() {
        panel.classList.remove('minimized')
        const rect = panel.getBoundingClientRect()
        if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
            panel.style.right = 'auto'
            panel.style.left = clamp(panel.offsetLeft, 0, window.innerWidth - rect.width) + 'px'
            panel.style.top = clamp(panel.offsetTop, 0, window.innerHeight - rect.height) + 'px'
        }
    }

    function minimize() {
        closeDialog()
        panel.classList.add('minimized')
    }

    head.addEventListener('pointerdown', function (event) {
        const target = event.target as HTMLElement | null
        if (target && target.closest && target.closest('.tt-min')) return
        startDrag(event, head)
    })
    head.addEventListener('pointermove', onPointerMove)
    head.addEventListener('pointerup', endDrag)
    head.addEventListener('pointercancel', endDrag)
    minBtn.addEventListener('click', minimize)
    bindDrag(ball, restore)

    /* ───────────────────── 事件绑定 ───────────────────── */

    const win = window as any
    win.__ttSetTools = applyTools
    win.__ttAppend = pushLog
    win.__ttQueue = queue
    log.readOnly = true

    search.addEventListener('input', filterRows)
    list.addEventListener('click', function (event) {
        const target = event.target as HTMLElement | null
        const row = target && target.closest
            ? target.closest('.tt-tool') as HTMLElement | null
            : null
        if (row) openDialog(String(row.dataset.tool || ''))
    })
    clearBtn.addEventListener('click', function () {
        log.value = ''
    })
    cancelBtn.addEventListener('click', closeDialog)
    confirmBtn.addEventListener('click', submit)
    form.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) submit()
    })
    dialog.addEventListener('click', function (event) {
        if (event.target === dialog) closeDialog()
    })
    root.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeDialog()
    })

    return function cleanup() {
        if (win.__ttSetTools === applyTools) delete win.__ttSetTools
        if (win.__ttAppend === pushLog) delete win.__ttAppend
        if (win.__ttQueue === queue) delete win.__ttQueue
    }
}
