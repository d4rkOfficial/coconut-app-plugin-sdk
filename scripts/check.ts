/**
 * 静态自查 + 页面脚本自包含检查。不联网、不改文件。
 *
 * 错误（exit 1）：
 *   - UTF-8 BOM / 缺 `// @name` / `@permissions` 有未知权限 / `@mount` 非法
 *   - 生命周期既没有全局钩子也没有 `Coconut.addEventListener(...)`；
 *     钩子写成 const/let/var 或赋值表达式
 *   - 语法错误（用 esbuild 解析）
 *   - 用了 Coconut.xxx 但没申请对应权限
 *   - `.dom.js` / `.dom.ts` 里出现 `import` 或模块级 `const/let/var`
 *     （注入页面时只序列化函数本体，模块作用域一律拿不到）
 *
 * 提示（`--strict` 时升级为错误）：
 *   - 缺 @version / @description
 *   - `.dom.js` / `.dom.ts` 导出的函数疑似引用了模块作用域变量或页面没有的全局
 *   - 运行时没有的宿主 API（fetch / new URL / atob / require / process …）；
 *     如果这段代码是要塞进 runJs 的页面脚本，那它是合法的，忽略即可
 *   - 用浮层但 @mount 不是 overlay
 *
 * 用法：
 *   deno task check                 # 检查 dev/ 与 examples/ 下的全部插件
 *   deno task check eye-care        # 只查一个
 *   deno task check --strict        # 提示也算失败（CI 用）
 */
import * as esbuild from 'npm:esbuild@^0.25.0'

import {
    bold,
    cyan,
    dim,
    entryOf,
    fail,
    green,
    join,
    listPlugins,
    log,
    MOUNTS,
    parseArgs,
    parsePermissions,
    PERMISSIONS,
    readHeader,
    readText,
    red,
    rel,
    yellow,
} from './lib.ts'

type Level = 'error' | 'warn' | 'info'

interface Issue {
    level: Level
    message: string
    line?: number
    file?: string
}

/** 权限 → 用到的 API 形态（文本匹配，足够抓真实调用）。 */
const PERMISSION_USAGE: Array<[string, RegExp]> = [
    ['dom', /\bCoconut\s*\.\s*runJs\s*\(/],
    ['dom', /\bCoconut\s*\.\s*ui\s*\.\s*(overlay|injectCss)\s*\(/],
    ['ui', /\bCoconut\s*\.\s*ui\s*\./],
    ['toolbox', /\bCoconut\s*\.\s*callTool\s*\(/],
    ['network', /\bCoconut\s*\.\s*fetch\s*\(/],
    ['network', /\bCoconut\s*\.\s*webSocket\s*\(/],
    ['server', /\bCoconut\s*\.\s*http\s*(?:\(|\.)/],
    ['storage', /\bCoconut\s*\.\s*storage\s*\./],
]

/** QuickJS 运行时**没有**的宿主 API（裸调用；`Coconut.xxx` 不算）。 */
const HOST_API_TRAPS: Array<[RegExp, string]> = [
    [/(?<![.\w$])fetch\s*\(/, 'fetch()：用 Coconut.fetch'],
    [/(?<![.\w$])require\s*\(/, 'require()：QuickJS 没有模块系统，靠打包内联'],
    [/(?<![.\w$])import\s*\(/, '动态 import()：打包成 IIFE 后不可用'],
    [/new\s+URL\s*\(/, 'new URL()：运行时没有 URL，自己解析字符串'],
    [/(?<![.\w$])atob\s*\(|(?<![.\w$])btoa\s*\(/, 'atob/btoa：运行时没有，自己实现'],
    [/(?<![.\w$])structuredClone\s*\(/, 'structuredClone()：用 JSON 深拷贝替代'],
    [/(?<![.\w$])process\s*\./, 'process：没有 Node 环境'],
    [/(?<![.\w$])Buffer\s*\./, 'Buffer：没有，用 Uint8Array 自己拼'],
]

const HOOKS = ['onStart', 'onHello', 'onEvent', 'onStop']

/** `Coconut.addEventListener('hello', …)` 的合法生命周期事件名。 */
const LIFECYCLE_EVENTS = ['start', 'hello', 'event', 'bye', 'stop']

/** 页面侧常见全局：注入了就不算「自包含失败」。 */
const PAGE_GLOBALS = [
    'document',
    'window',
    'self',
    'top',
    'parent',
    'navigator',
    'location',
    'history',
    'localStorage',
    'sessionStorage',
    'indexedDB',
    'MutationObserver',
    'IntersectionObserver',
    'ResizeObserver',
    'Node',
    'Element',
    'HTMLElement',
    'Event',
    'CustomEvent',
    'KeyboardEvent',
    'MouseEvent',
    'PointerEvent',
    'getComputedStyle',
    'requestAnimationFrame',
    'cancelAnimationFrame',
    'requestIdleCallback',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'clearInterval',
    'queueMicrotask',
    'console',
    'performance',
    'URL',
    'URLSearchParams',
    'TextEncoder',
    'TextDecoder',
    'atob',
    'btoa',
    'fetch',
    'structuredClone',
    'crypto',
    'Image',
    'XMLHttpRequest',
    'DOMParser',
    'CSS',
    'innerWidth',
    'innerHeight',
    'scrollX',
    'scrollY',
]

/** 万能代理：任何属性 / 调用 / 迭代都能继续走下去，用来兜住页面 API。 */
function anyProxy(): any {
    const target = function loose() {}
    const handler: ProxyHandler<any> = {
        get: (_t, key) => {
            if (key === Symbol.toPrimitive) return () => ''
            if (key === Symbol.iterator) return function* empty() {}
            if (key === 'toString' || key === 'valueOf') return () => ''
            if (key === 'length') return 0
            if (key === 'then') return undefined // 不要被当成 Promise
            return proxy
        },
        apply: () => proxy,
        construct: () => proxy,
        has: () => true,
    }
    const proxy = new Proxy(target, handler)
    return proxy
}

function lineOf(source: string, index: number): number {
    return source.slice(0, index).split('\n').length
}

/**
 * 把注释替换成等长空白（保留换行），避免注释里提到的 API / 钩子名触发误报。
 * 只处理 `//` 与块注释；字符串、模板字符串原样保留。
 */
function maskComments(source: string): string {
    let out = ''
    let index = 0
    let quote = ''
    while (index < source.length) {
        const char = source[index]
        const next = source[index + 1]
        if (quote) {
            if (char === '\\') {
                out += char + (next ?? '')
                index += 2
                continue
            }
            if (char === quote) quote = ''
            out += char
            index++
            continue
        }
        if (char === '"' || char === "'" || char === '`') {
            quote = char
            out += char
            index++
            continue
        }
        if (char === '/' && next === '/') {
            while (index < source.length && source[index] !== '\n') {
                out += ' '
                index++
            }
            continue
        }
        if (char === '/' && next === '*') {
            out += '  '
            index += 2
            while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
                out += source[index] === '\n' ? '\n' : ' '
                index++
            }
            if (index < source.length) {
                out += '  '
                index += 2
            }
            continue
        }
        out += char
        index++
    }
    return out
}

/** 插件源码（含 JSX / TSX）——`.dom.js` / `.dom.ts` 是页面脚本，单独走自包含检查。 */
function walkJs(dir: string, out: string[] = []): string[] {
    for (const entry of Deno.readDirSync(dir)) {
        const full = join(dir, entry.name)
        if (entry.isDirectory) walkJs(full, out)
        else if (entry.isFile && /\.(js|jsx|ts|tsx)$/.test(entry.name)) out.push(full)
    }
    return out.sort()
}

/** 注入页面的自包含脚本：`*.dom.js` 或 `*.dom.ts`。 */
function isDomModule(file: string): boolean {
    return /\.dom\.(js|ts)$/.test(file)
}

/* ───────────────────── 页面脚本（.dom.js / .dom.ts）自包含检查 ───────────────────── */

async function checkDomModule(file: string, source: string): Promise<Issue[]> {
    const issues: Issue[] = []
    const add = (level: Level, message: string, line?: number) =>
        issues.push({ level, message, line, file })

    // 1. 页面脚本不允许 import：序列化后只有函数本体，import 的绑定拿不到
    const importAt = /^\s*import\s[^\n]*/m.exec(source)
    if (importAt) {
        add(
            'error',
            '页面脚本里不要 import（注入页面时只有函数本体）',
            lineOf(source, importAt.index),
        )
    }

    // 2. 页面脚本不允许顶层 const/let/var：函数里的自由变量会被序列化丢掉
    const topDecl = /^(?:const|let|var)\s+[^\n]*/m.exec(source)
    if (topDecl) {
        add(
            'error',
            '模块级 const/let/var 在注入页面后会丢失，请改成函数参数传入',
            lineOf(source, topDecl.index),
        )
    }

    // 3. 运行时自包含检查：把导出的函数序列化后在「只有页面全局」的沙箱里跑一遍
    let mod: Record<string, unknown>
    try {
        mod = await import(`file://${file.replace(/\\/g, '/')}?t=${Date.now()}`)
    } catch (error) {
        add('error', `动态导入失败：${(error as Error).message}`)
        return issues
    }

    for (const [name, value] of Object.entries(mod)) {
        if (typeof value !== 'function') continue
        const serialized = `return (${String(value).trim()});`
        let sandboxed: (...args: unknown[]) => unknown
        try {
            sandboxed = new Function(...PAGE_GLOBALS, serialized)(
                ...PAGE_GLOBALS.map(() => anyProxy()),
            )
        } catch (error) {
            add('error', `${name} 无法序列化：${(error as Error).message}`)
            continue
        }
        const argCount = Math.max(0, Math.min(value.length, 4))
        const args = Array.from({ length: argCount }, () => anyProxy())
        try {
            const returned = sandboxed(...args)
            if (returned && typeof (returned as Promise<unknown>).then === 'function') {
                await Promise.race([
                    (returned as Promise<unknown>).catch((error) => {
                        if (error instanceof ReferenceError) {
                            add(
                                'warn',
                                `${name}() 引用了页面没有的全局：${
                                    String((error as Error).message)
                                }` +
                                    '（忘了传参数？模块作用域变量在页面里不存在）',
                            )
                        }
                    }),
                    new Promise((resolve) => {
                        const id = setTimeout(resolve, 200)
                        Deno.unrefTimer(id)
                    }),
                ])
            }
        } catch (error) {
            if (error instanceof ReferenceError) {
                add(
                    'warn',
                    `${name}() 引用了页面没有的全局：${(error as Error).message}` +
                        '（忘了传参数？模块作用域变量在页面里不存在）',
                )
            }
        }
    }
    return issues
}

/* ───────────────────────── 单个插件 ───────────────────────── */

async function checkPlugin(id: string): Promise<Issue[]> {
    const entry = entryOf(id)
    const files = walkJs(join(entry, '..'))
    const source = readText(entry)
    // 注释里出现的 API / 钩子名不算数（例如模板里的示例代码）
    const maskedSource = maskComments(source)
    const maskedFiles = new Map(files.map((file) => [file, maskComments(readText(file))]))
    const issues: Issue[] = []
    const entryRel = rel(entry)
    const add = (level: Level, message: string, line?: number, file = entryRel) =>
        issues.push({ level, message, line, file })

    // 1. BOM
    const bytes = Deno.readFileSync(entry)
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
        add('error', '文件带 UTF-8 BOM，请存成「UTF-8 无 BOM」')
    }

    // 2. 头部元数据
    const { meta } = readHeader(source)
    if (!meta.name) add('error', '缺少 // @name（启动器靠它显示插件名）')
    if (!meta.version) add('warn', '建议补 // @version（插件卡片显示 v…）')
    if (!meta.description) add('warn', '建议补 // @description（插件卡片的一句话说明）')

    const permissions = parsePermissions(meta.permissions)
    const unknownPermissions = permissions.filter((item) => !PERMISSIONS.includes(item))
    if (unknownPermissions.length) {
        add(
            'error',
            `未知权限：${unknownPermissions.join(', ')}（可选 ${PERMISSIONS.join(' / ')}）`,
        )
    }
    if (meta.mount && !MOUNTS.includes(meta.mount)) {
        add('error', `@mount 只能是 ${MOUNTS.join(' / ')}，当前是 ${meta.mount}`)
    }

    // 3. 生命周期写法：全局钩子（function 声明 + globalThis）或 Coconut.addEventListener
    //    （两者等价；监听器不用挂 globalThis，可以叠加多个）。
    const declared = HOOKS.filter((hook) =>
        new RegExp(`\\bfunction\\s+${hook}\\s*\\(`).test(maskedSource)
    )
    for (const hook of HOOKS) {
        const decl = new RegExp(`(^|\\n)\\s*(?:const|let|var)\\s+${hook}\\b`).exec(maskedSource)
        const expr = new RegExp(`(^|\\n)\\s*${hook}\\s*=\\s*`).exec(maskedSource)
        if (decl) {
            add(
                'error',
                `${hook} 必须写成 function 声明（当前是 const/let/var），宿主找不到它`,
                lineOf(source, decl.index),
            )
        } else if (expr) {
            add(
                'error',
                `${hook} 必须是 function 声明，不能写 ${hook} = ...`,
                lineOf(source, expr.index),
            )
        }
    }
    const listened = LIFECYCLE_EVENTS.filter((event) =>
        new RegExp(`\\bCoconut\\s*\\.\\s*addEventListener\\s*\\(\\s*['"]${event}['"]`).test(
            maskedSource,
        )
    )
    if (!declared.length && !listened.length) {
        add(
            'error',
            `一个生命周期回调都没定义（用 Coconut.addEventListener('hello', …) 或 function onHello()，至少一个）`,
        )
    }
    for (const hook of declared) {
        if (!new RegExp(`globalThis\\s*\\.\\s*${hook}\\b`).test(maskedSource)) {
            add(
                'warn',
                `${hook} 没有挂到 globalThis（打包成 IIFE 后宿主找不到它；也可以改用 Coconut.addEventListener）`,
                maskedSource.indexOf(`function ${hook}`),
            )
        }
    }

    // 4. 语法（esbuild 解析，等价 node --check；.jsx / .tsx 走对应 loader）
    for (const file of files) {
        const loader = file.endsWith('.tsx')
            ? 'tsx'
            : file.endsWith('.jsx')
            ? 'jsx'
            : file.endsWith('.ts')
            ? 'ts'
            : 'js'
        try {
            await esbuild.transform(readText(file), {
                loader,
                format: 'esm',
                sourcefile: file,
                jsx: 'transform',
                jsxFactory: 'h',
                jsxFragment: 'Fragment',
            })
        } catch (error) {
            issues.push({
                level: 'error',
                message: `语法错误：${(error as Error).message}`,
                file: rel(file),
            })
        }
    }

    // 5. 权限 vs 用法（扫整个插件目录：API 可能被拆到别的模块里）
    const allSource = [...maskedFiles.values()].join('\n')
    for (const [permission, pattern] of PERMISSION_USAGE) {
        const match = pattern.exec(allSource)
        if (match && !permissions.includes(permission)) {
            add(
                'error',
                `用了需要 ${permission} 权限的 API，但 @permissions 里没写`,
                undefined,
                '（整个插件）',
            )
        }
    }
    if (/\bCoconut\s*\.\s*ui\s*\.\s*overlay\s*\(/.test(allSource) && meta.mount !== 'overlay') {
        add('warn', '@mount 建议写成 overlay（用了浮层；只影响插件卡片展示）')
    }

    // 6. 运行时没有的宿主 API（只看插件侧源码，.dom.js / .dom.ts 是页面脚本，不受此限制）
    for (const file of files) {
        if (isDomModule(file)) continue
        const text = maskedFiles.get(file) ?? readText(file)
        for (const [pattern, hint] of HOST_API_TRAPS) {
            const match = pattern.exec(text)
            if (match) {
                issues.push({
                    level: 'warn',
                    message: `运行时没有 ${hint}（若在 runJs 的页面脚本里则合法）`,
                    line: lineOf(text, match.index),
                    file: rel(file),
                })
            }
        }
    }

    // 7. 声明了没用到（--verbose 才显示）
    const used = new Set<string>()
    for (const [permission, pattern] of PERMISSION_USAGE) {
        if (pattern.test(allSource)) used.add(permission)
    }
    const unused = permissions.filter((item) => item !== 'debug' && !used.has(item))
    if (unused.length) add('info', `声明了但没检测到使用：${unused.join(', ')}`)

    // 8. 页面脚本自包含
    for (const file of files) {
        if (!isDomModule(file)) continue
        for (const issue of await checkDomModule(file, readText(file))) issues.push(issue)
    }

    return issues
}

/* ───────────────────────── 主流程 ───────────────────────── */

const { has, get, rest } = parseArgs()
const strict = has('strict')
const verbose = has('verbose')
const ids = listPlugins(rest)

let errors = 0
let warnings = 0

for (const id of ids) {
    const issues = await checkPlugin(id)
    const shown = issues.filter(
        (issue) =>
            issue.level === 'error' || issue.level === 'warn' ||
            (verbose && issue.level === 'info'),
    )
    if (!shown.length) {
        log(`${green('✔')} ${bold(id)}`)
        continue
    }
    log(`${shown.some((issue) => issue.level === 'error') ? red('✗') : yellow('!')} ${bold(id)}`)
    for (const issue of shown) {
        const isError = issue.level === 'error' || (strict && issue.level === 'warn')
        const tag = isError ? red('error') : issue.level === 'warn' ? yellow('warn ') : dim('info ')
        const where = issue.line ? cyan(`${issue.file}:${issue.line}`) : dim(issue.file ?? '')
        log(`   ${tag} ${where} ${issue.message}`)
    }
    errors += issues.filter((issue) =>
        issue.level === 'error' || (strict && issue.level === 'warn')
    ).length
    warnings += issues.filter((issue) => issue.level === 'warn').length
}

log('')
if (errors) {
    fail(
        `${ids.length} 个插件里有 ${errors} 个问题${warnings ? `（另有 ${warnings} 条提示）` : ''}`,
    )
    Deno.exit(1)
}
log(
    green(
        `检查通过：${ids.length} 个插件${
            warnings ? `，${warnings} 条提示（--verbose 看详情）` : ''
        }`,
    ),
)
