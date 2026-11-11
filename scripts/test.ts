/**
 * 用户测试 runner：跑 `dev/<id>/test.js`（每个插件一个测试文件）。
 *
 * 流程：
 *   1. 找出 `dev/` 下的插件（也可以只跑指定 id）；
 *   2. 先打包成 `dist/<id>.js`；
 *   3. 起子进程跑 `dev/<id>/test.js`，测试文件自己
 *      `import { runPluginTests } from '../../tests/harness.ts'`。
 *
 * 用法：
 *   deno task test                  # 跑 dev/ 下所有 test.js
 *   deno task test my-plugin        # 只跑指定插件（可写多个）
 *   deno task test:examples         # 官方示例的回归测试（不是用户测试）
 *
 * 测试沙箱（假 DOM / 假 Coconut / 断言）在 `tests/harness.ts`，模板里的 test.js 可直接照着改。
 */
import { buildPlugin } from './build.ts'
import {
    bold,
    devDir,
    dim,
    exists,
    fail,
    green,
    join,
    listDevPlugins,
    log,
    parseArgs,
    rel,
    repoRoot,
} from './lib.ts'

const { rest } = parseArgs()
const ids = listDevPlugins(rest)

if (!ids.length) {
    log(dim('dev/ 下还没有插件。'))
    log(dim('deno task new <id> 会从模板生成 dev/<id>/（自带 test.js）。'))
    Deno.exit(0)
}

let failed = 0
let ran = 0
for (const id of ids) {
    const testFile = join(devDir, id, 'test.js')
    if (!exists(testFile)) {
        log(`  ${bold(id)} ${dim('跳过：没有 test.js')}`)
        continue
    }

    log(`\n${bold(id)} ${dim(rel(testFile))}`)
    try {
        await buildPlugin(id, { quiet: true })
    } catch (error) {
        fail(`${id} 打包失败：${(error as Error).message}`)
        failed += 1
        continue
    }

    ran += 1
    // 用子进程隔离：每个测试文件有自己的 globalThis / 假宿主，互不污染。
    const child = new Deno.Command(Deno.execPath(), {
        args: ['run', '-A', testFile],
        cwd: repoRoot,
        stdout: 'inherit',
        stderr: 'inherit',
    }).spawn()
    const status = await child.status
    if (!status.success) failed += 1
}

log('')
if (failed) {
    fail(`${failed} 个插件测试没通过（共跑 ${ran} 个）`)
    Deno.exit(1)
}
log(green(`完成：${ran} 个插件测试通过`))
log(dim('官方示例的回归测试：deno task test:examples'))
