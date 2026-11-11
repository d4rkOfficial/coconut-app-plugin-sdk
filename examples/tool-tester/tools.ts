/**
 * 工具箱 hello 里的工具条目 → 测试台内部使用的统一结构。
 *
 * 实际上启动器转发 hello 时只给**工具名**（`session.tools` 是 HashSet<String>）；
 * 参数 JSON Schema 由页面侧从工具箱打包 chunk 里解析（见 page/panel.dom.ts）。
 * 这里仍然兼容 `{ type:'function', function:{ name, parameters } }`，方便别处复用。
 */

/** 工具箱工具参数的 JSON Schema 子集（够画表单用）。 */
export interface ToolSchema {
    type?: string | string[]
    description?: string
    enum?: unknown[]
    properties?: Record<string, ToolSchema>
    required?: string[]
    items?: ToolSchema
    additionalProperties?: boolean | ToolSchema
    minimum?: number
    maximum?: number
    minLength?: number
    maxLength?: number
    default?: unknown
}

/** 测试台里的一个工具。 */
export interface ToolDef {
    name: string
    /** 工具说明（可能被截断，只用于展示）。 */
    description: string
    parameters: ToolSchema
    /** 工具箱是否真的给了参数结构（没给就只能降级成 JSON 输入）。 */
    hasSchema: boolean
}

const EMPTY_SCHEMA: ToolSchema = { type: 'object', properties: {} }
const MAX_DESCRIPTION = 300

/** 截断 schema 里的长说明：hello 一次会把全部工具塞过来，太大不值得。 */
function trimSchema(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(trimSchema)
    if (!value || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        out[key] = key === 'description' && typeof entry === 'string'
            ? entry.slice(0, MAX_DESCRIPTION)
            : trimSchema(entry)
    }
    return out
}

function normalizeOne(entry: unknown): ToolDef | null {
    if (typeof entry === 'string') {
        const name = entry.trim()
        if (!name) return null
        return { name, description: '', parameters: EMPTY_SCHEMA, hasSchema: false }
    }
    if (!entry || typeof entry !== 'object') return null

    const raw = entry as {
        name?: unknown
        description?: unknown
        parameters?: unknown
        function?: { name?: unknown; description?: unknown; parameters?: unknown }
    }
    // OpenAI 风格 { type:'function', function:{...} }，也兼容直接给 { name, parameters }
    const fn = raw.function && typeof raw.function === 'object' ? raw.function : raw
    const name = typeof fn.name === 'string' ? fn.name.trim() : ''
    if (!name) return null

    const hasSchema = Boolean(fn.parameters && typeof fn.parameters === 'object')
    const parameters = hasSchema ? trimSchema(fn.parameters) as ToolSchema : EMPTY_SCHEMA
    const description = typeof fn.description === 'string'
        ? fn.description.replace(/\s+/g, ' ').trim().slice(0, MAX_DESCRIPTION)
        : ''

    return { name, description, parameters, hasSchema }
}

/** 把 hello 里的 `tools` 归一化、去重并按名字排序。 */
export function normalizeTools(raw: unknown): ToolDef[] {
    if (!Array.isArray(raw)) return []
    const map = new Map<string, ToolDef>()
    for (const entry of raw) {
        const tool = normalizeOne(entry)
        if (tool && !map.has(tool.name)) map.set(tool.name, tool)
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
