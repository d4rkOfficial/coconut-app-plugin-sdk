/**
 * 把 `dist/<id>.js` 装进启动器插件目录（一次性动作；持续同步用 `deno task dev`）。
 *
 * 用法：
 *   deno task deploy eye-care              # 安装 dist/eye-care.js（缺产物会先打包）
 *   deno task deploy eye-care --build      # 强制先重新打包
 *   deno task deploy eye-care --dry        # 只打印将要写哪里
 *   deno task deploy eye-care --dir "D:\tmp"
 */
import { buildPlugin } from './build.ts'
import {
    bold,
    cyan,
    dim,
    exists,
    fail,
    fmtSize,
    green,
    join,
    launcherPluginsDir,
    listPlugins,
    log,
    outfileOf,
    parseArgs,
    readHeader,
    readText,
    warn,
} from './lib.ts'

const { has, get, rest } = parseArgs()
const ids = listPlugins(rest)
if (!ids.length) {
    fail('至少指定一个插件 id：deno task deploy <id>')
    Deno.exit(1)
}

const target = launcherPluginsDir(get('dir'))
const dry = has('dry')
const shouldBuild = has('build')

if (!dry && !exists(target)) {
    fail(`目标插件目录不存在：${target}`)
    log(dim('先用 --dir 指定目录，或在启动器里打开一次工具箱生成该目录'))
    Deno.exit(1)
}

let failed = 0
for (const id of ids) {
    const outfile = outfileOf(id)
    if (shouldBuild || !exists(outfile)) {
        if (!exists(outfile)) log(dim(`dist/${id}.js 不存在，先打包…`))
        try {
            await buildPlugin(id, {})
        } catch (error) {
            fail(`${id} 打包失败：${(error as Error).message}`)
            failed += 1
            continue
        }
    }
    const size = Deno.statSync(outfile).size
    const dest = join(target, `${id}.js`)
    if (dry) {
        log(`${bold(id)}  ${fmtSize(size)}  ${dim('→')} ${cyan(dest)}  ${dim('(dry-run)')}`)
        continue
    }
    try {
        Deno.copyFileSync(outfile, dest)
        log(`${green('✔')} ${bold(id)} ${dim(fmtSize(size))} → ${cyan(dest)}`)
    } catch (error) {
        fail(`${id} 写入失败：${(error as Error).message}`)
        failed += 1
    }
}

if (failed) {
    fail(`${failed} 个插件没装上`)
    Deno.exit(1)
}
if (!dry) {
    // 顺手核对一下产物头部还在（banner 贴回来是否成功）
    for (const id of ids) {
        const { meta } = readHeader(readText(outfileOf(id)))
        if (!meta.name) warn(`${id} 产物缺少 // @name 头部（banner 没贴回来？）`)
    }
    log('')
    log(dim('启动器会在 3 秒内扫描到新文件；插件卡片里出现同名插件即加载成功。'))
    log(dim('改的是别人的插件？先 deno task pull <id> 把线上源码拉进 dev/。'))
}
