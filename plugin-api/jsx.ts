/**
 * 插件 JSX 运行时。
 *
 * **新写法（推荐）——一个标签只干一件事：**
 *
 * ```jsx
 * import { css, h, html, script } from '../../plugin-api/jsx.ts';
 *
 * const view = <div class='card'>{title}</div>;             // → ui.overlay({ html: view })
 * const skin = css`.card { color: #fff }`;                  // → ui.overlay({ css: skin })
 * const boot = script`document.body.dataset.ready = '1'`;   // → toolbox.runJs(boot)
 * const part = html`<i>${prebuiltHtml}</i>`;                // 现成 HTML 原样插入（= raw()）
 * ```
 *
 * 规则只有三条：
 *   1. **JSX 只负责 HTML**：任意 JSX 表达式（顶层 `<div>` 即可，不用包 `<html>`）产出
 *      {@link Markup}，直接给 `Coconut.ui.overlay({ html })`，也能当字符串用；
 *   2. **CSS / 页面脚本用标签模板** `css`…`` / `script`…``，内容原样取，不转义；
 *   3. **文本自动转义**：JSX 的文本子节点和 `{}` 插值都会转义 `& < >`；想塞现成的 HTML
 *      用 {@link html} 标签模板或 {@link raw} 包一层。
 *
 * 兼容：`<html>` / `<style>` / `<script>` 三个裸标签是旧写法，仍然可用，但**只建议改旧代码时
 * 保留**；新代码请用上面的 `Markup` / `css` / `script`。旧标签产出的片段对象形状不变
 * （`{ __coconut: 'html' | 'css' | 'script', text }`），引擎和类型都认。
 */

export type CoconutChunkKind = 'script' | 'html' | 'css';

/** 引擎认识的片段：`html` 给浮层、`css` 给浮层样式、`script` 给 runJs。 */
export interface CoconutChunk<K extends CoconutChunkKind = CoconutChunkKind> {
  readonly __coconut: K;
  readonly text: string;
  toString(): string;
}

/** 已经拼好的 HTML：在 JSX 里原样插入，不二次转义。 */
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

/** 把值当文本取出来（片段取 `text`，其它 `String()`）。 */
export function textOf(value: unknown): string {
  if (value && typeof value === 'object') {
    const kind = (value as { __coconut?: unknown }).__coconut;
    if (kind === 'script' || kind === 'html' || kind === 'css') {
      return String((value as CoconutChunk).text);
    }
  }
  return value === null || value === undefined ? '' : String(value);
}

/** 把现成 HTML 标记成「原样插入」（`<div>{raw(rowsHtml)}</div>`）。 */
export function raw(value: unknown): Markup {
  return new Markup(textOf(value));
}

type TemplateStrings = TemplateStringsArray | readonly string[];

function isTemplate(value: unknown): value is TemplateStringsArray {
  return Array.isArray(value) && Object.prototype.hasOwnProperty.call(value, 'raw');
}

/**
 * `css` / `script` / `html` 都支持两种调用：
 *   - 标签模板：`css\`.a { color: ${color} }\``（插值原样拼，不转义）
 *   - 普通字符串：`css('.a { color: #fff }')`
 */
function joinText(first: unknown, values: readonly unknown[]): string {
  if (!isTemplate(first)) return textOf(first);
  let out = String(first[0] ?? '');
  for (let index = 0; index < values.length; index++) {
    out += textOf(values[index]) + String(first[index + 1] ?? '');
  }
  return out;
}

/** 浮层 CSS 片段（标签模板或普通字符串）。 */
export function css(strings: TemplateStrings, ...values: unknown[]): CoconutChunk<'css'>;
export function css(text: unknown): CoconutChunk<'css'>;
export function css(first: unknown, ...values: unknown[]): CoconutChunk<'css'> {
  return new Chunk('css', joinText(first, values));
}

/** 页面脚本片段（`runJs` 的函数体，要自己 `return`）。 */
export function script(strings: TemplateStrings, ...values: unknown[]): CoconutChunk<'script'>;
export function script(text: unknown): CoconutChunk<'script'>;
export function script(first: unknown, ...values: unknown[]): CoconutChunk<'script'> {
  return new Chunk('script', joinText(first, values));
}

/** 现成 HTML（标签模板或普通字符串）：原样插入，不转义。 */
export function html(strings: TemplateStrings, ...values: unknown[]): Markup;
export function html(text: unknown): Markup;
export function html(first: unknown, ...values: unknown[]): Markup {
  return new Markup(joinText(first, values));
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
 * 普通标签返回 {@link Markup}；`<html>` / `<style>` / `<script>` 是兼容旧写法的裸标签，
 * 分别返回 html / css / script 片段。
 */
export function h(tag: unknown, props: Props, ...children: unknown[]): CoconutChunk | Markup {
  if (tag === Fragment) {
    const kinds = collectKinds(children);
    if (kinds.has('script') || kinds.has('css')) {
      throw new TypeError('Fragment 里不能混 <script> / <style>：请分开传给 runJs / overlay');
    }
    return new Markup(flatten(children, true));
  }

  const name = String(tag);
  const inner = [...children, ...(props && 'children' in props ? [props.children] : [])];
  if (name === 'html') return new Markup(flatten(inner, true));
  if (name === 'style') return new Chunk('css', flatten(inner, false));
  if (name === 'script') return new Chunk('script', flatten(inner, false));

  if (VOID_TAGS.has(name)) return new Markup(`<${name}${attrsOf(props)} />`);
  return new Markup(`<${name}${attrsOf(props)}>${flatten(inner, true)}</${name}>`);
}
