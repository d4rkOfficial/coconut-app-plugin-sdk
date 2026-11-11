/**
 * 官方示例的回归测试（**不是**用户测试）。
 *
 * 用 `tests/harness.ts` 的假宿主 + 假页面，把 `examples/` 里的产物和 JSX 运行时跑一遍，
 * 防止改 SDK / 工具链时把示例改坏。
 *
 * 用法：
 *   deno task test:examples     # 需要先 deno task build（deno task verify 已串好）
 *   deno task test              # 只跑 dev/<id>/test.js（用户自己的插件）
 */
import { bold, dim, distDir, exists, fail, join, log } from '../scripts/lib.ts'
import {
    check,
    dispatchLifecycle,
    type Engine,
    FakeNode,
    FakeObserver,
    FakePage,
    finish,
    loadPlugin,
    settle,
    textNode,
} from './harness.ts'

/* ───────────────────────── 场景 ───────────────────────── */

async function testCjkScramble() {
    log(`${bold('cjk-scramble')}`)
    const page = new FakePage()
    page.add(textNode('你好，椰果工具箱！'))
    const loaded = loadPlugin('cjk-scramble', {
        callTool: () => ({}),
        fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
    }, page)

    check('挂上了 onHello / onStop', !!loaded.hooks.onHello && !!loaded.hooks.onStop)
    check(
        '产物保留了 @name 头部',
        Deno.readTextFileSync(join(distDir, 'cjk-scramble.js')).startsWith('// @name'),
    )
    const bundled = Deno.readTextFileSync(join(distDir, 'cjk-scramble.js'))
    check(
        '产物已压缩',
        bundled.split('\n').some((line) => line.length > 500),
        `最长行 ${Math.max(...bundled.split('\n').map((line) => line.length))}`,
    )

    await loaded.hooks.onHello()
    await settle()
    const scrambled = page.body.textContent
    check('页面文字被打乱', scrambled !== '你好，椰果工具箱！', scrambled)
    check('标点/英文/空白保持原样', /[，！]/.test(scrambled))
    check('页面挂上了 __simpleTranslate', !!page.window.__simpleTranslate)
    check('注册了 MutationObserver', FakeObserver.instances.length > 0)

    await loaded.hooks.onStop()
    await settle()
    check('onStop 清掉了页面引用', page.window.__simpleTranslate === null)
    check('onStop 断开了观察器', FakeObserver.instances[0].disconnected)
}

async function testFreeModels() {
    log(`${bold('free-models')}`)
    const profiles: Array<Record<string, unknown>> = [
        { id: 'default', label: '默认配置', baseUrl: '', model: '', apiKeySet: false },
    ]
    const calls: string[] = []
    const page = new FakePage({
        'ai-gen-prefs': { data: { enabled: true } },
        'ai-config': { data: { profiles: [{ id: 'default' }] } },
    })
    const loaded = loadPlugin('free-models', {
        callTool(name, args) {
            calls.push(`${name}:${String(args.action || '')}`)
            if (name === 'get_ai_profiles') return { profiles }
            if (name === 'manage_ai_profile') {
                if (args.action === 'add') profiles.push({ id: `p${profiles.length}`, ...args })
                return {}
            }
            return {}
        },
        fetch: () => ({
            status: 200,
            ok: true,
            json: { data: [{ id: 'free-a-free' }, { id: 'free-b-free' }] },
            body: '',
        }),
    }, page)

    await loaded.hooks.onHello()
    await settle(20)
    check(
        '写入了两个免费模型配置',
        profiles.filter((p) => String(p.label).includes('OC_FREE')).length === 2,
    )
    check('打开了 ai_enabled', calls.includes('set_setting:'))
    check('记录了首次使用', loaded.stored.seeded === true)
    check('日志有首次使用提示', loaded.logs.some((line) => line.includes('首次使用')))

    await loaded.hooks.onEvent({ type: 'resync' })
    await settle(20)
    check('第二次同步走「同步完成」分支', loaded.logs.some((line) => line.includes('同步完成')))
    check(
        '没有产生重复配置',
        profiles.filter((p) => String(p.model || '') === 'free-a').length === 1,
    )
}

async function testBuffCoverage() {
    log(`${bold('buff-coverage')}`)
    const page = new FakePage({
        projects: {
            data: [{
                id: 'p1',
                encounter: {
                    timeline: { data: { opBlocks: [{ id: 'b1', pos: 0 }, { id: 'b2', pos: 10 }] } },
                },
            }],
        },
        'project-active': 'p1',
    })
    const gutter = page.add(new FakeNode('div'))
    gutter.setAttribute('style', 'border:1px dashed #333')
    gutter.textContent = '伤害绑定'
    gutter.rect = { left: 200, top: 100, right: 1400, bottom: 700, width: 1200, height: 600 }
    const aside = page.add(new FakeNode('aside'))
    aside.className = 'theme-glass-surface border-r'
    // 侧栏右边界 = 0：让「可见时间轴窗口」覆盖下面两个块的位置（pos 0 与 10）
    aside.rect = { left: 0, top: 0, right: 0, bottom: 800, width: 0, height: 800 }

    const blockA = page.add(new FakeNode('div'))
    blockA.setAttribute('data-block', 'b1')
    blockA.rect = { left: 220, top: 300, right: 260, bottom: 340, width: 40, height: 40 }
    const blockB = page.add(new FakeNode('div'))
    blockB.setAttribute('data-block', 'b2')
    blockB.rect = { left: 620, top: 300, right: 660, bottom: 340, width: 40, height: 40 }

    const loaded = loadPlugin('buff-coverage', {
        callTool(name) {
            if (name === 'get_damage_entries') {
                return {
                    items: [
                        { pos: 0, buffs: ['攻击提升1阶'] },
                        { pos: 10, buffs: ['攻击提升1阶'] },
                    ],
                }
            }
            if (name === 'get_timeline_summary') {
                return {
                    items: [
                        { pos: 0, kind: 'opBlock', no: 1 },
                        { pos: 10, kind: 'opBlock', no: 2 },
                    ],
                }
            }
            if (name === 'get_settings_state') return { theme_mode: 'dark' }
            return {}
        },
        fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
    }, page)

    await loaded.hooks.onStart()
    await settle(30)
    const last = loaded.overlays.at(-1)
    check('挂出了覆盖范围浮层', !!last && String(last.html).includes('Buff 覆盖范围'))
    check(
        '渲染了 buff 行',
        !!last && String(last.html).includes('攻击提升'),
        String(last?.html || '').slice(0, 200),
    )
    check(
        '渲染了色块',
        !!last && String(last.html).includes('cov-bar'),
        String(last?.html || '').slice(0, 200),
    )
    check(
        '页面脚本被调用（测量/摆放/过渡）',
        loaded.runJsCodes.length >= 2,
        `${loaded.runJsCodes.length}`,
    )
    check('浮层 CSS 是深色', !!last && String(last.css).includes('rgba(13,15,22'))

    await loaded.hooks.onStop()
    check(
        'onStop 清掉了浮层和定时器',
        loaded.removedOverlays.length > 0 && loaded.intervals.size === 0,
    )
}

/* 最优词条：用简单的乘法型伤害模型假扮真实引擎。 */
function makeEchoEngine() {
    const state = {
        echoes: Array.from({ length: 5 }, () => ({
            cost: 1,
            main: '攻击%',
            substats: [] as Array<{ type: string; value: number }>,
        })),
        exported: {} as Record<string, unknown>,
        appliedPlan: null as unknown,
    }
    const stat = () => {
        let atkPct = 0
        let flatAtk = 0
        let critRate = 5
        let critDamage = 150
        let bonus = 0
        for (const echo of state.echoes) {
            if (echo.main === '暴击率') critRate += 22
            else if (echo.main === '暴击伤害') critDamage += 44
            else if (echo.main === '攻击%') {
                atkPct += echo.cost === 4 ? 33 : echo.cost === 3 ? 30 : 18
            } else if (echo.main === '共鸣效率') continue
            else if (echo.main.endsWith('伤害加成')) bonus += 30
            for (const sub of echo.substats) {
                const value = Number(sub.value)
                if (sub.type === '攻击%') atkPct += value
                else if (sub.type === '攻击') flatAtk += value
                else if (sub.type === '暴击率') critRate += value
                else if (sub.type === '暴击伤害') critDamage += value
                else if (sub.type === '普攻伤害加成' || sub.type === '共鸣解放伤害加成') {
                    bonus += value * 0.5
                }
            }
        }
        return { atkPct, flatAtk, critRate, critDamage, bonus }
    }
    const total = () => {
        const s = stat()
        const atk = 800 * (1 + s.atkPct / 100) + s.flatAtk
        return atk * (1 + s.bonus / 100) *
            (1 + Math.min(s.critRate, 100) / 100 * s.critDamage / 100)
    }
    const engine: Engine = {
        callTool(name, args) {
            const slot = Number(args.slot || 0) - 1
            if (name === 'get_config_summary') {
                return {
                    characters: [
                        { name: '锁暝', echoes: state.echoes },
                        {
                            name: '散华',
                            echoes: state.echoes.map(() => ({
                                cost: 1,
                                main: '攻击%',
                                substats: [],
                            })),
                        },
                    ],
                }
            }
            if (name === 'get_team') return [{ character: '锁暝' }, { character: '散华' }]
            if (name === 'get_project_state') {
                return { name: 'test', team: [{ character: '锁暝' }, { character: '散华' }] }
            }
            if (name === 'get_settings_state') return { theme_mode: 'dark' }
            if (name === 'get_result_summary') {
                if (args.character) return { entries: [{ element: '湮灭' }] }
                return { total: total() }
            }
            if (name === 'set_echo_cost') {
                state.echoes[slot].cost = Number(args.cost)
                return {}
            }
            if (name === 'set_main_stat') {
                state.echoes[slot].main = String(args.label)
                return {}
            }
            if (name === 'add_substat') {
                const echo = state.echoes[slot]
                if (echo.substats.some((sub) => sub.type === args.label)) return { error: '重复' }
                echo.substats.push({ type: String(args.label), value: Number(args.value ?? 0) })
                return {}
            }
            if (name === 'remove_substat') {
                state.echoes[slot].substats.splice(Number(args.idx), 1)
                return {}
            }
            if (name === 'update_substat_value') {
                state.echoes[slot].substats[Number(args.idx)].value = Number(args.value)
                return {}
            }
            if (name === 'export_substat_plan') {
                state.exported[String(args.name)] = JSON.parse(JSON.stringify(state.echoes))
                return { name: args.name }
            }
            if (name === 'apply_substat_plan') {
                const plan = state.exported[String(args.name)]
                if (Array.isArray(plan)) state.echoes = JSON.parse(JSON.stringify(plan))
                state.appliedPlan = args.name
                return {}
            }
            if (name === 'unlock_phase' || name === 'lock_phase') return {}
            return {}
        },
        fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
    }
    return { engine, state }
}

async function testEchoOptimizer() {
    log(`${bold('echo-substat-optimizer')}`)
    const page = new FakePage()
    // 词条页特征：导航激活 + 角色 cost 标签 + 副词条 chip
    const nav = page.add(new FakeNode('button'))
    nav.className = 'active'
    nav.textContent = '词条'
    const charTab = page.add(new FakeNode('div'))
    charTab.textContent = '锁暝 (43311)'
    for (const chip of ['攻击% 8.6%', '暴击率 8.1%', '暴击伤害 16.2%', '生命% 8.6%']) {
        const el = page.add(new FakeNode('span'))
        el.textContent = chip
    }
    // 浮窗交互元素
    const root = page.add(new FakeNode('div'))
    root.className = 'eso-root'
    const title = new FakeNode('div')
    title.className = 'eso-title'
    root.appendChild(title)
    const runBtn = page.add(new FakeNode('button'))
    runBtn.className = 'eso-run'
    const input = page.add(new FakeNode('input'))
    input.className = 'eso-n'
    input.value = '6'
    // 头像
    const holder = page.add(new FakeNode('div'))
    holder.textContent = '锁暝'
    const img = new FakeNode('img')
    img.setAttribute('src', '/avatars/suoming.webp')
    holder.appendChild(img)
    page.documentElement.styleVars = {
        '--theme-accent-bg': '#2e7d5b',
        '--theme-surface-radius': '12px',
    }

    const { engine, state } = makeEchoEngine()
    const loaded = loadPlugin('echo-substat-optimizer', engine, page)
    check(
        '挂上了四个钩子',
        ['onStart', 'onHello', 'onEvent', 'onStop'].every((name) => !!loaded.hooks[name]),
    )

    await loaded.hooks.onStart()
    await settle(40)
    const first = loaded.overlays.at(-1)
    check('检测到词条页并弹出浮窗', !!first && String(first.html).includes('最优声骸词条'))
    check('浮窗里渲染了队伍角色', !!first && String(first.html).includes('锁暝'))
    check('浮窗里带上了头像', !!first && String(first.html).includes('/avatars/suoming.webp'))
    check('读取了主题变量', String(first?.css).includes('#2e7d5b'))

    // 触发一次「计算最优」：点浮窗按钮 → 页面把意图写进 body.dataset → 主循环 tick 一次
    const [tickLoop] = [...loaded.intervals.values()]
    page.body.dataset.esoRun = '1'
    page.body.dataset.esoN = '6'
    tickLoop()
    await settle(60)

    // 等待 optimize 跑完（用 fake 引擎的 export 记录判断）
    for (let i = 0; i < 200; i++) {
        if (state.exported.eso_best) break
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    check('计算完成后导出了 eso_best 方案', !!state.exported.eso_best)
    const applied = state.echoes
    const subs = applied.flatMap((echo) => echo.substats)
    check('按设定条数写入副词条', subs.length === 6, `${subs.length}`)
    check(
        '每条声骸同类词条不重复',
        applied.every((echo) =>
            new Set(echo.substats.map((s) => s.type)).size === echo.substats.length
        ),
    )
    check('副词条都用中档值', subs.every((sub) => Number(sub.value) > 0))
    check(
        '主词条都是合法组合（4cost 至少一个）',
        applied.filter((echo) => echo.cost === 4).length >= 1,
    )

    // 结果卡片：等收尾那次渲染落地（结果 html 在 export 之后才设置）
    for (let i = 0; i < 200; i++) {
        if (String(loaded.overlays.at(-1)?.html || '').includes('最优（cost 搭配')) break
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
    const last = loaded.overlays.at(-1)
    check(
        '结果卡片显示了 cost 搭配',
        !!last && String(last.html).includes('最优（cost 搭配'),
        String(last?.html || '').slice(0, 200),
    )

    await loaded.hooks.onStop()
    await settle(5)
    check(
        'onStop 清掉了浮层与定时器',
        loaded.removedOverlays.length > 0 && loaded.intervals.size === 0,
    )
}

/* ───────────────────────── JSX 片段 ───────────────────────── */

async function testJsxChunks() {
    log(`${bold('plugin-api/jsx')}`)
    const { h, raw, Fragment, textOf, css, script, html } = await import('../plugin-api/jsx.ts')

    // 新写法：JSX 就是 HTML，CSS / 页面脚本各用各的标签模板。
    const view = h('div', { class: 'card' }, 'a<b&c')
    check(
        '普通 JSX 直接产出 HTML 片段',
        view.__coconut === 'html' && String(view) === '<div class="card">a&lt;b&amp;c</div>',
        String(view),
    )
    const skin = css`
        .a {
            content: "<";
        }
    `
    check('css 标签模板原样取', skin.__coconut === 'css' && String(skin).includes('content: "<"'))
    check(
        'script 标签模板原样取',
        String(script`return 1 < 2;`) === 'return 1 < 2;',
        String(script`return 1 < 2;`),
    )
    const prebuilt = '<i>x</i>'
    check('html 标签模板原样插入', String(html`<p>${prebuilt}</p>`) === '<p><i>x</i></p>')

    const escaped = String(h('html', null, h('div', { className: 'c' }, 'a<b&c')))
    check('字符串子节点自动转义', escaped.includes('a&lt;b&amp;c'), escaped)
    check('className 映射成 class', escaped.includes('class="c"'), escaped)

    const rawish = String(h('html', null, h('div', null, raw('<i>x</i>'))))
    check('raw() 原样插入', rawish.includes('<i>x</i>') && !rawish.includes('&lt;i&gt;'), rawish)

    const style = String(h('style', null, '.a{content:"<"}'))
    check('<style> 不转义', style === '.a{content:"<"}', style)

    const voidTag = String(h('img', { src: 'a.png', alt: 'q"q' }))
    check('void 标签自闭合 + 属性转义', voidTag === '<img src="a.png" alt="q&quot;q" />', voidTag)

    check('Fragment 拼成 html 片段', textOf(h(Fragment, null, 'x')) === 'x')

    let threw = ''
    try {
        h(Fragment, null, h('style', null, '.x{}'))
    } catch (error) {
        threw = (error as Error).name
    }
    check('Fragment 混入 <style> 直接报错', threw === 'TypeError', threw)

    check('片段带 kind', css('.x{}').__coconut === 'css')
}

/* ───────────────────────── 工具测试台 ───────────────────────── */

async function testToolTester() {
    log(`${bold('tool-tester')}`)
    const { normalizeTools } = await import('../examples/tool-tester/tools.ts')

    const tools = normalizeTools([
        'get_team',
        {
            type: 'function',
            function: {
                name: 'get_settings_state',
                description: '读取设置',
                parameters: {
                    type: 'object',
                    properties: { key: { type: 'string', enum: ['theme_mode'] } },
                    required: ['key'],
                },
            },
        },
        { type: 'function', function: { name: 'no_schema' } },
    ])
    check('工具定义归一化（名字 / Schema / 去重）', tools.length === 3, `${tools.length}`)
    const getTeam = tools.find((tool) => tool.name === 'get_team')
    const settings = tools.find((tool) => tool.name === 'get_settings_state')
    const noSchema = tools.find((tool) => tool.name === 'no_schema')
    check(
        '普通字符串条目也能用',
        !!getTeam && getTeam.hasSchema === false,
    )
    check(
        '带 parameters 的条目保留枚举 Schema',
        !!settings &&
            settings.hasSchema === true &&
            JSON.stringify(settings.parameters).includes('theme_mode'),
    )
    check('没有 parameters 时标记为无 Schema', !!noSchema && noSchema.hasSchema === false)

    const loaded = loadPlugin('tool-tester', {
        callTool: () => ({ echo: 'ok' }),
        fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
    }, new FakePage())

    await dispatchLifecycle(loaded, 'hello', {
        session: 'test',
        tools: [
            'get_team',
            {
                type: 'function',
                function: {
                    name: 'get_settings_state',
                    description: '读取设置',
                    parameters: {
                        type: 'object',
                        properties: { key: { type: 'string', enum: ['theme_mode'] } },
                        required: ['key'],
                    },
                },
            },
        ],
    })
    await settle(5)

    const last = loaded.overlays.at(-1)
    const html = String(last?.html || '')
    check(
        '浮层是搜索 + 表单 + 只读日志外壳',
        html.includes('tt-search') &&
            html.includes('tt-form') &&
            html.includes('tt-log') &&
            html.includes('readonly'),
    )
    check(
        '工具列表在页面侧加载（外壳不内联工具名）',
        html.includes('正在加载工具索引') && !html.includes('get_settings_state'),
    )
    check('有收起按钮和悬浮球', html.includes('tt-min') && html.includes('tt-ball'))
    check('开启了请求轮询', loaded.intervals.size > 0)

    await dispatchLifecycle(loaded, 'stop')
    await settle(2)
    check(
        'onStop 停了轮询并移除浮层',
        loaded.intervals.size === 0 && loaded.removedOverlays.length > 0,
    )
}

/* ───────────────────────── 主流程 ───────────────────────── */

if (!exists(distDir)) {
    fail('缺少 dist/，先跑 deno task build')
    Deno.exit(1)
}

log(dim('用假宿主 + 假页面跑 examples/ 打包产物…\n'))
await testJsxChunks()
await testCjkScramble()
await testFreeModels()
await testBuffCoverage()
await testEchoOptimizer()
await testToolTester()

finish()
