/**
 * 把已经安装进启动器的插件拉回仓库，变成可编辑、可版本管理的源码。
 * （线上插件是打包后的单文件；拉回来是单文件形态，需要拆模块请手动按
 *  `page/*.dom.js` + 功能模块拆分，见 AGENTS.md 的模块约定。）
 *
 * 用法：
 *   deno task pull --list                     # 列出启动器里装了哪些插件
 *   deno task pull buff-coverage              # → dev/buff-coverage/index.js
 *   deno task pull some-live-plugin --as fork # → dev/fork/index.js
 *   deno task pull eye-care --force           # 覆盖 dev/ 下已存在的同名项目
 *
 * 用途：直接改启动器目录里的插件容易丢源码；先 pull 进 dev/，改完再 deploy 回去。
 */
import {
    bold,
    cyan,
    devDir,
    dim,
    exists,
    fail,
    fmtSize,
    green,
    join,
    launcherPluginsDir,
    log,
    parseArgs,
    parsePermissions,
    readHeader,
    rel,
    warn,
} from './lib.ts'

const { has, get, rest } = parseArgs()
const source = launcherPluginsDir(get('dir'))

if (!exists(source)) {
    fail(`插件目录不存在：${source}`)
    Deno.exit(1)
}

const files = [...Deno.readDirSync(source)]
    .filter((entry) => entry.isFile && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort()

if (has('list') || !rest.length) {
    if (!files.length) {
        log(dim(`插件目录里没有 .js 文件：${source}`))
        Deno.exit(0)
    }
    log(`插件目录：${dim(source)}`)
    for (const name of files) {
        const full = join(source, name)
        const { meta } = readHeader(Deno.readTextFileSync(full))
        const perms = parsePermissions(meta.permissions)
        log(
            `  ${bold(name.padEnd(32))} ${(meta.version || '-').padEnd(8)} ` +
                `${fmtSize(Deno.statSync(full).size).padStart(8)}  ${dim(meta.name || '')}` +
                (perms.length ? dim(`  [${perms.join(',')}]`) : ''),
        )
    }
    if (!rest.length) log(dim('\n拉回仓库：deno task pull <文件名去掉 .js>'))
    Deno.exit(0)
}

const id = String(rest[0]).replace(/\.js$/i, '')
const as = get('as', id)
const destDir = join(devDir, as)
const dest = join(destDir, 'index.js')

if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(as)) {
    fail(`目录名不合法：${as}（只允许字母数字和 . _ -，且不能以 _ 开头）`)
    Deno.exit(1)
}
if (!files.includes(`${id}.js`)) {
    fail(`插件目录里没有 ${id}.js`)
    log(dim('用 deno task pull --list 看已安装的插件'))
    Deno.exit(1)
}
if (exists(dest) && !has('force')) {
    fail(`目标已存在：${rel(dest)}`)
    log(dim('确认要覆盖就加 --force，或换 --as <新目录名>'))
    Deno.exit(1)
}

const src = join(source, `${id}.js`)
const bytes = Deno.readFileSync(src)
Deno.mkdirSync(destDir, { recursive: true })
Deno.writeFileSync(dest, bytes)

const { meta } = readHeader(new TextDecoder().decode(bytes))
const perms = parsePermissions(meta.permissions)
log(`${green('✔')} ${bold(id)} ${dim(fmtSize(bytes.length))} → ${cyan(rel(dest))}`)
log(
    `  ${(meta.name || id).padEnd(20)} v${meta.version || '?'}` +
        (perms.length ? dim(`  [${perms.join(',')}]`) : ''),
)
if (meta.permissions?.includes('debug')) {
    warn('这个插件带 debug 权限（会收到全部 WS 帧），发布前记得去掉')
}
if (as !== id) {
    warn(`目录名 ${as} 就是产物 id（文件名 = 插件 id），部署后插件卡片会显示成 ${as}.js`)
}
log(dim(`\n下一步：改 ${rel(dest)}，然后 deno task dev ${as}`))
