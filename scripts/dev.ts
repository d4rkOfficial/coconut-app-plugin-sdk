/**
 * 开发模式：监听源码 → 自动重新打包 → 同步进启动器插件目录。
 * 启动器最多 3 秒扫描一次插件目录，保存源码基本等于热重载。
 *
 * 用法：
 *   deno task dev echo-substat-optimizer          # 监听并部署到启动器
 *   deno task dev a b                             # 同时监听多个
 *   deno task dev a --dir "D:\tmp\plugins"        # 换目标目录（自建测试目录）
 *   deno task dev a --no-deploy                   # 只重建，不写插件目录
 *   deno task dev a --no-minify                   # 产物不压缩（堆栈更好读）
 *
 * 目标目录优先级：--dir > COCONUT_PLUGINS_DIR > %APPDATA%\com.coconut.launcher\plugins
 *
 * 注意：这里会**覆盖**目标目录里的同名插件文件。改别人的插件前先
 *       `deno task pull <id>` 把线上版本拉进 examples/，避免丢源码。
 */
import { contextFor } from './build.ts';
import {
  bold,
  copyIfChanged,
  cyan,
  dim,
  exists,
  fail,
  green,
  join,
  launcherPluginsDir,
  listExamples,
  log,
  parseArgs,
  warn,
  yellow,
} from './lib.ts';

const { has, get, rest } = parseArgs();
const ids = listExamples(rest);
if (!ids.length) {
  fail('至少指定一个插件 id：deno task dev <id>');
  Deno.exit(1);
}

const deploy = !has('no-deploy');
const minify = !has('no-minify');
const target = launcherPluginsDir(get('dir'));

if (deploy) {
  if (!exists(target)) {
    fail(`目标插件目录不存在：${target}`);
    log(dim('用 --dir 指定别的目录，或先在启动器里打开过一次工具箱'));
    Deno.exit(1);
  }
  const clash = ids.filter((id) => exists(join(target, `${id}.js`)));
  if (clash.length) {
    warn(
      `${yellow('将覆盖')} 目标目录里已安装的：${
        clash.join(', ')
      }（先 deno task pull <id> 可留档）`,
    );
  }
}

const contexts: Awaited<ReturnType<typeof contextFor>>[] = [];
for (const id of ids) {
  const ctx = await contextFor(id, {
    minify,
    onBuilt({ id: builtId, outfile }) {
      let note = '';
      if (deploy) {
        try {
          const action = copyIfChanged(outfile, join(target, `${builtId}.js`));
          note = action === 'copied' ? cyan(` → ${target}`) : dim(' → 目标已是最新');
        } catch (error) {
          note = yellow(` → 部署失败：${(error as Error).message}`);
        }
      }
      log(`${green('✔')} ${bold(builtId)} ${dim(`${builtId}.js`)}${note}`);
    },
  });
  await ctx.watch();
  contexts.push(ctx);
}

log('');
log(`${green('监听中')}  ${ids.join(', ')}`);
if (deploy) log(dim(`部署目标：${target}`));
log(dim('保存源码即触发重建；启动器 3 秒内热重载。Ctrl+C 退出。'));

let closing = false;
const stop = async () => {
  if (closing) return;
  closing = true;
  log('');
  log(dim('正在停止监听…'));
  await Promise.all(contexts.map((ctx) => ctx.dispose().catch(() => {})));
  Deno.exit(0);
};
Deno.addSignalListener('SIGINT', stop);
try {
  Deno.addSignalListener('SIGTERM', stop);
} catch {
  // Windows 上不一定支持 SIGTERM，忽略
}
