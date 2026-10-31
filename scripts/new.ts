/**
 * 从模板新建一个插件：templates/plugin → examples/<id>/
 *
 * 用法：
 *   deno task new my-plugin
 *   deno task new my-plugin --name "我的插件" --permissions dom,ui,toolbox
 *
 * 生成后：改 examples/<id>/index.js，然后
 *   deno task build <id>          打包
 *   deno task dev   <id>          监听并自动装进启动器（热重载）
 */
import {
  bold,
  cyan,
  dim,
  examplesDir,
  exists,
  fail,
  green,
  join,
  log,
  parseArgs,
  PERMISSIONS,
  readText,
  rel,
  templatesDir,
} from './lib.ts';

const { has, get, rest } = parseArgs();
const id = String(rest[0] || '').trim();

if (!id) {
  fail('用法：deno task new <插件id> [--name 显示名] [--permissions dom,ui]');
  Deno.exit(1);
}
if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) || id.startsWith('_')) {
  fail(`插件 id 不合法：${id}（字母数字开头，可含 . _ -，不能以 _ 开头）`);
  log(dim('文件名就是插件 id，会直接显示在启动器插件卡片上'));
  Deno.exit(1);
}

const templatePath = join(templatesDir, 'plugin', 'index.js');
if (!exists(templatePath)) {
  fail(`模板不存在：${rel(templatePath)}`);
  Deno.exit(1);
}

const dest = join(examplesDir, id, 'index.js');
if (exists(dest)) {
  fail(`已经存在：${rel(dest)}`);
  Deno.exit(1);
}

const name = String(get('name', id)).replace(/"/g, '').trim() || id;
const permissions = String(get('permissions', 'dom, ui'))
  .split(/[,，\s]+/)
  .map((item) => item.trim())
  .filter(Boolean);

const unknown = permissions.filter((item) => !PERMISSIONS.includes(item));
if (unknown.length) {
  fail(`未知权限：${unknown.join(', ')}（可选：${PERMISSIONS.join(' / ')}）`);
  Deno.exit(1);
}

const template = readText(templatePath);
const rendered = template
  .replace('__NAME__', () => name)
  .replace('__PERMISSIONS__', () => permissions.join(', '));

Deno.mkdirSync(join(examplesDir, id), { recursive: true });
Deno.writeTextFileSync(dest, rendered);

log(`${green('✔')} 已创建 ${bold(id)} → ${cyan(rel(dest))}`);
log(`  显示名：${name}`);
log(`  权限：${permissions.length ? permissions.join(', ') : '（无）'}`);
log('');
log('下一步：');
log(dim(`  1. 编辑 ${rel(dest)}（需要多文件：page/*.dom.js 放注入页面的代码）`));
log(dim(`  2. deno task check ${id}        静态自查（头部/权限/钩子/禁用 API）`));
log(dim(`  3. deno task dev ${id}          监听并自动部署到启动器（3 秒热重载）`));
log(dim('  4. 工具箱里按 Ctrl+T 看插件日志'));
