/**
 * 插件 JSX 运行时：让 `.jsx` / `.tsx` 里的裸标签直接产出引擎认识的东西。
 *
 * ```jsx
 * import { h, Fragment } from '../../plugin-api/jsx.ts';
 *
 * const view = <html><div class="card">{title}</div></html>;   // → Coconut.ui.overlay({ html: view })
 * const skin = <style>{`.card{color:#fff}`}</style>;           // → Coconut.ui.overlay({ css: skin })
 * const boot = <script>{`document.body.dataset.ready = '1'`}</script>; // → Coconut.toolbox.runJs(boot)
 * ```
 *
 * 三种裸标签产出「片段对象」`{ __coconut, text }`，运行时按 `__coconut` 认领：
 *   - `<script>` → `Coconut.toolbox.runJs(...)`
 *   - `<html>`   → `Coconut.ui.overlay({ html })`
 *   - `<style>`  → `Coconut.ui.overlay({ css })`
 *
 * 转义规则：
 *   - **普通字符串子节点自动转义**（`& < >`），想塞现成 HTML 用 {@link raw}；
 *   - `<script>` / `<style>` 的子节点按原文取（那是代码，不是文本）；
 *   - 嵌套标签返回的是 {@link Markup}，不会被二次转义。
 */

export type CoconutChunkKind = 'script' | 'html' | 'css';

export interface CoconutChunk<K extends CoconutChunkKind = CoconutChunkKind> {
  readonly __coconut: K;
  readonly text: string;
  toString(): string;
}

/** 已经拼好的 HTML 片段：在 JSX 里原样插入，不转义。 */
export class Markup implements CoconutChunk<'html'> {
  readonly __coconut = 'html' as const;
  readonly text: string;

  constructor(text: string) {
    this.text = text;
  }

  toString(): string {
    return this.text;
  }
}

class Chunk<K extends CoconutChunkKind> implements CoconutChunk<K> {
  readonly __coconut: K;
  readonly text: string;

  constructor(kind: K, text: string) {
    this.__coconut = kind;
    this.text = text;
  }

  toString(): string {
    return this.text;
  }
}

/** 把现成 HTML 标记成「原样插入」（`<html>{raw(rowsHtml)}</html>`）。 */
export function raw(value: unknown): Markup {
  return new Markup(value === null || value === undefined ? '' : String(value));
}

/** 显式构造片段（不想写 JSX 时用）。 */
export function script(text: unknown): CoconutChunk<'script'> {
  return new Chunk('script', String(text ?? ''));
}

export function html(text: unknown): Markup {
  return new Markup(String(text ?? ''));
}

export function css(text: unknown): CoconutChunk<'css'> {
  return new Chunk('css', String(text ?? ''));
}

/** Fragment：`<>…</>` 只能装 HTML 内容，混 `<script>` / `<style>` 会直接报错。 */
export const Fragment = Symbol.for('coconut.jsx.fragment');

type Props = Record<string, unknown> | null | undefined;

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const escapeText = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const escapeAttr = (value: string): string => escapeText(value).replace(/"/g, '&quot;');

/** `style={{ color: 'red' }}` → `color:red` */
function styleText(value: Record<string, unknown>): string {
  return Object.entries(value)
    .filter(([, entry]) => entry !== null && entry !== undefined && entry !== false)
    .map(([key, entry]) => `${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}:${entry}`)
    .join(';');
}

function attrsOf(props: Props): string {
  if (!props) return '';
  const parts: string[] = [];
  for (const [key, value] of Object.entries(props)) {
    if (key === 'children') continue;
    if (value === null || value === undefined || value === false) continue;
    const name = key === 'className' ? 'class' : key === 'htmlFor' ? 'for' : key;
    if (value === true) {
      parts.push(name);
      continue;
    }
    if (name === 'style' && typeof value === 'object') {
      parts.push(`style="${escapeAttr(styleText(value as Record<string, unknown>))}"`);
      continue;
    }
    parts.push(`${name}="${escapeAttr(String(value))}"`);
  }
  return parts.length ? ` ${parts.join(' ')}` : '';
}

function chunkKindOf(value: unknown): CoconutChunkKind | null {
  if (!value || typeof value !== 'object') return null;
  const kind = (value as { __coconut?: unknown }).__coconut;
  return kind === 'script' || kind === 'html' || kind === 'css' ? kind : null;
}

/** 收集子节点里的片段种类（Fragment 用来拒绝混入 script/style）。 */
function collectKinds(children: unknown[], out: Set<CoconutChunkKind> = new Set()) {
  for (const child of children.flat(Infinity)) {
    if (Array.isArray(child)) {
      collectKinds(child, out);
      continue;
    }
    const kind = chunkKindOf(child);
    if (kind) out.add(kind);
  }
  return out;
}

/**
 * @param children 子节点
 * @param escape 普通字符串要不要转义（`<script>` / `<style>` 里关掉）
 */
function flatten(children: unknown[], escape: boolean): string {
  return children
    .flat(Infinity)
    .map((child) => {
      if (child === null || child === undefined || child === false || child === true) return '';
      if (Array.isArray(child)) return flatten(child, escape);
      if (chunkKindOf(child)) return String((child as CoconutChunk).text);
      if (typeof child === 'object' && 'text' in (child as object)) {
        return String((child as { text?: unknown }).text);
      }
      const text = String(child);
      return escape ? escapeText(text) : text;
    })
    .join('');
}

/**
 * JSX 工厂（esbuild / Deno 都配成 `h`）。
 *
 * 普通标签返回 {@link Markup}（可以直接再嵌回 JSX、也能当字符串用）；
 * 三种裸标签返回对应 kind 的片段。
 */
export function h(tag: unknown, props: Props, ...children: unknown[]): CoconutChunk | Markup {
  if (tag === Fragment) {
    const kinds = collectKinds(children);
    if (kinds.has('script') || kinds.has('css')) {
      throw new TypeError('Fragment 里不能混 <script> / <style>：请分开传给 runJs / overlay');
    }
    return html(flatten(children, true));
  }

  const name = String(tag);
  if (name === 'script') return script(flatten(children, false));
  if (name === 'style') return css(flatten(children, false));
  if (name === 'html') return html(flatten(children, true));

  if (VOID_TAGS.has(name)) return new Markup(`<${name}${attrsOf(props)} />`);
  const inner = [...children, ...(props && 'children' in props ? [props.children] : [])];
  return new Markup(`<${name}${attrsOf(props)}>${flatten(inner, true)}</${name}>`);
}

/** 把任意值当文本取出来（片段取 text，其它 String()）。 */
export function textOf(value: unknown): string {
  if (chunkKindOf(value)) return String((value as CoconutChunk).text);
  return value === null || value === undefined ? '' : String(value);
}
