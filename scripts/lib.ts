/**
 * 脚本共用的小工具：路径、入口发现、头部元数据解析、启动器插件目录定位。
 *
 * 打包思路沿用上游 coconut-app/builtin/build.mjs：esbuild 打成 IIFE 单文件，
 * 再把文件开头的 `// @xxx` 头部用 banner 贴回去（minify 会把注释删掉）。
 */
import { basename, dirname, fromFileUrl, join, relative, resolve } from '@std/path';

export const repoRoot = resolve(dirname(fromFileUrl(import.meta.url)), '..');
export const examplesDir = join(repoRoot, 'examples');
export const templatesDir = join(repoRoot, 'templates');
export const distDir = join(repoRoot, 'dist');

/** 允许出现在 `@permissions` 里的权限名（与 coconut-plugin.d.ts 保持一致）。 */
export const PERMISSIONS = ['dom', 'toolbox', 'network', 'storage', 'ui', 'server', 'debug'];
/** 允许出现在 `@mount` 里的取值。 */
export const MOUNTS = ['none', 'overlay'];

export interface Args {
  /** 位置参数（插件 id 等） */
  rest: string[];
  has(name: string): boolean;
  get(name: string, fallback?: string): string;
}

/** 把 `--key` / `--key=value` / 位置参数分开。 */
export function parseArgs(argv: string[] = Deno.args): Args {
  const flags = new Map<string, string | true>();
  const rest: string[] = [];
  for (const item of argv) {
    if (item === '--') continue;
    if (item.startsWith('--')) {
      const body = item.slice(2);
      const at = body.indexOf('=');
      if (at < 0) flags.set(body, true);
      else flags.set(body.slice(0, at), body.slice(at + 1));
    } else {
      rest.push(item);
    }
  }
  return {
    rest,
    has: (name: string) => flags.has(name),
    get: (name: string, fallback = '') => {
      const value = flags.get(name);
      return typeof value === 'string' ? value : fallback;
    },
  };
}

/* ───────────────────────── 输出 ───────────────────────── */

const useColor = Deno.stdout.isTerminal() && !Deno.env.get('NO_COLOR');
const paint =
  (code: string) => (text: string) => (useColor ? `\u001b[${code}m${text}\u001b[0m` : text);
export const dim = paint('2');
export const bold = paint('1');
export const red = paint('31');
export const green = paint('32');
export const yellow = paint('33');
export const cyan = paint('36');

export function log(...args: unknown[]): void {
  console.log(...args);
}
export function warn(...args: unknown[]): void {
  console.warn(`${yellow('!')} ${args.join(' ')}`);
}
export function fail(...args: unknown[]): void {
  console.error(`${red('✗')} ${args.join(' ')}`);
}

export function fmtSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
}

/* ───────────────────────── 文件系统 ───────────────────────── */

export function exists(target: string): boolean {
  try {
    Deno.statSync(target);
    return true;
  } catch {
    return false;
  }
}

export function ensureDir(dir: string): void {
  Deno.mkdirSync(dir, { recursive: true });
}

export function readText(file: string): string {
  return Deno.readTextFileSync(file);
}

export function writeText(file: string, text: string): void {
  ensureDir(dirname(file));
  Deno.writeTextFileSync(file, text);
}

/** 相对仓库根目录的展示用路径（Windows 下统一成 /）。 */
export function rel(target: string): string {
  return relative(repoRoot, target).replace(/\\/g, '/');
}

/* ───────────────────────── 入口发现 ───────────────────────── */

/** `examples/` 下所有可打包插件（跳过 `_` / `.` 开头、没有 index.js 的目录）。 */
export function listExamples(only: string[] = []): string[] {
  if (!exists(examplesDir)) return [];
  const names = [...Deno.readDirSync(examplesDir)]
    .filter((entry) => entry.isDirectory)
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .filter((name) => exists(join(examplesDir, name, 'index.js')))
    .sort();
  if (!only.length) return names;
  const picked = names.filter((name) => only.includes(name));
  const missing = only.filter((name) => !names.includes(name));
  if (missing.length) {
    fail(`examples/ 下找不到这些插件：${missing.join(', ')}`);
    Deno.exit(1);
  }
  return picked;
}

export function entryOf(id: string): string {
  return join(examplesDir, id, 'index.js');
}

export function outfileOf(id: string): string {
  return join(distDir, `${id}.js`);
}

/* ───────────────────────── 头部元数据 ───────────────────────── */

export interface HeaderInfo {
  /** 原样的头部注释块（给 esbuild banner 用） */
  raw: string;
  /** `@key` → 值 */
  meta: Record<string, string>;
}

/**
 * 解析文件开头 `@key value` 形式的元数据。只认第一行代码之前的注释：
 * 遇到非注释行立刻停止，避免把正文注释当元数据。
 */
export function readHeader(source: string): HeaderInfo {
  const lines = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').split('\n');
  const raw: string[] = [];
  const meta: Record<string, string> = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (raw.length) raw.push('//');
      continue;
    }
    if (!trimmed.startsWith('//')) break;
    if (!trimmed.startsWith('// @')) continue;
    raw.push(trimmed);
    const match = /^\/\/\s*@([\w-]+)\s*(.*)$/.exec(trimmed);
    if (match) meta[match[1]] = match[2].trim();
  }
  return { raw: raw.join('\n'), meta };
}

/** `@permissions` 常用逗号分隔（中英文逗号都认）。 */
export function parsePermissions(raw: string | undefined): string[] {
  return String(raw || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/* ───────────────────────── 启动器目录 ───────────────────────── */

/** 启动器插件目录：--dir > COCONUT_PLUGINS_DIR > %APPDATA%\com.coconut.launcher\plugins。 */
export function launcherPluginsDir(override = ''): string {
  if (override) return resolve(override);
  const fromEnv = Deno.env.get('COCONUT_PLUGINS_DIR');
  if (fromEnv) return resolve(fromEnv);
  const appData = Deno.env.get('APPDATA') ??
    join(Deno.env.get('USERPROFILE') ?? '.', 'AppData', 'Roaming');
  return join(appData, 'com.coconut.launcher', 'plugins');
}

/** 把 src 复制到 dst（内容一致就跳过），返回 'copied' / 'same'。 */
export function copyIfChanged(src: string, dst: string): 'copied' | 'same' {
  const next = Deno.readFileSync(src);
  if (exists(dst)) {
    const prev = Deno.readFileSync(dst);
    if (prev.length === next.length && prev.every((byte, index) => byte === next[index])) {
      return 'same';
    }
  }
  ensureDir(dirname(dst));
  Deno.writeFileSync(dst, next);
  return 'copied';
}

export { basename, dirname, join };
