/**
 * 打包插件：`dev/<id>/index.js`（或 `examples/<id>/index.js`）→ `dist/<id>.js`（压缩后的单文件）
 *
 * 做法照抄上游 coconut-app/builtin/build.mjs：
 *   - esbuild `bundle + iife`（QuickJS 运行时里没有 import/export，产物必须是单文件表达式）
 *   - 抽出源码开头的 `// @xxx` 头部，用 `banner` 贴回去（minify 会删注释，丢了插件就没了名字/权限）
 *   - ES2020、platform neutral、`charset: utf8`（中文不转 \uXXXX）
 *
 * 用法：
 *   deno task build                     # 打包全部示例
 *   deno task build eye-care            # 只打指定插件
 *   deno task build:plain               # 不压缩（看产物 / 排错）
 */
import * as esbuild from 'npm:esbuild@^0.25.0'

import {
    bold,
    dim,
    distDir,
    ensureDir,
    entryOf,
    exists,
    fail,
    fmtSize,
    green,
    listPlugins,
    log,
    outfileOf,
    parseArgs,
    readHeader,
    readText,
    rel,
    repoRoot,
    warn,
} from './lib.ts'

/** 单个产物超过这个体积就提醒：QuickJS 解析 / 启动会变慢。 */
const SIZE_WARN = 400 * 1024

export interface BuildOptions {
    minify?: boolean
    quiet?: boolean
    onBuilt?: (info: { id: string; outfile: string; metafile: esbuild.Metafile }) => void
}

/** 组装 esbuild 配置（watch 与一次性打包共用）。 */
export function optionsFor(id: string, opts: BuildOptions = {}): esbuild.BuildOptions {
    const entry = entryOf(id)
    if (!exists(entry)) {
        fail(`找不到入口：${rel(entry)}`)
        Deno.exit(1)
    }
    const header = readHeader(readText(entry))
    if (!header.meta.name) {
        fail(`${id}/index.js 缺少 // @name 头部元数据（启动器靠它显示插件名）`)
        Deno.exit(1)
    }
    const plugins: esbuild.Plugin[] = []
    if (opts.onBuilt) {
        const onBuilt = opts.onBuilt
        plugins.push({
            name: 'coconut-after-build',
            setup(build) {
                build.onEnd((result) => {
                    if (result.errors.length) return
                    onBuilt({ id, outfile: outfileOf(id), metafile: result.metafile! })
                })
            },
        })
    }
    return {
        entryPoints: [entry],
        outfile: outfileOf(id),
        bundle: true,
        format: 'iife',
        platform: 'neutral',
        target: 'es2020',
        charset: 'utf8',
        minify: opts.minify !== false,
        legalComments: 'none',
        banner: { js: `${header.raw}\n` },
        // JSX：`<script>` / `<html>` / `<style>` 三个裸标签由 plugin-api/jsx.ts 的 h() 认领
        jsx: 'transform',
        jsxFactory: 'h',
        jsxFragment: 'Fragment',
        loader: { '.jsx': 'jsx', '.tsx': 'tsx' },
        resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'],
        metafile: true,
        absWorkingDir: repoRoot,
        logLevel: 'warning',
        plugins,
    }
}

/** 一次性打包一个插件，返回产物信息。 */
export async function buildPlugin(
    id: string,
    { minify = true, quiet = false }: BuildOptions = {},
): Promise<{ id: string; outfile: string; size: number; inputs: number; ms: number }> {
    ensureDir(distDir)
    const started = Date.now()
    const result = await esbuild.build(optionsFor(id, { minify }))
    const outfile = outfileOf(id)
    const size = Deno.statSync(outfile).size
    const inputs = Object.keys(result.metafile?.inputs ?? {}).length
    if (!quiet) {
        log(
            `  ${bold(id.padEnd(24))} ${String(inputs).padStart(2)} 个文件 → ` +
                `${`dist/${id}.js`.padEnd(34)} ${fmtSize(size).padStart(8)}  ${
                    dim(`${Date.now() - started}ms`)
                }`,
        )
        if (size > SIZE_WARN) {
            warn(
                `${id} 产物 ${fmtSize(size)}，超过 ${fmtSize(SIZE_WARN)}；` +
                    `QuickJS 加载会变慢，考虑拆掉用不到的代码`,
            )
        }
    }
    return { id, outfile, size, inputs, ms: Date.now() - started }
}

/** 监听模式下的 esbuild context（调用方负责 ctx.watch() / dispose()）。 */
export function contextFor(id: string, opts: BuildOptions = {}) {
    ensureDir(distDir)
    return esbuild.context(optionsFor(id, opts))
}

async function main() {
    const { has, get, rest } = parseArgs()
    const minify = !has('no-minify')
    const quiet = has('quiet')
    const ids = listPlugins(rest)
    if (!ids.length) {
        fail('dev/ 和 examples/ 下没有可打包的插件（需要 <id>/index.js）')
        Deno.exit(1)
    }
    if (!quiet) log(`打包 ${ids.length} 个插件${minify ? '' : dim('（未压缩）')}：`)
    let total = 0
    for (const id of ids) {
        const info = await buildPlugin(id, { minify, quiet })
        total += info.size
    }
    if (!quiet) {
        log(green(`完成：${ids.length} 个产物，共 ${fmtSize(total)}，输出在 dist/`))
        log(dim(`装进启动器：deno task deploy ${ids[0]}${ids.length > 1 ? ' …' : ''}`))
    }
}

if (import.meta.main) await main()
