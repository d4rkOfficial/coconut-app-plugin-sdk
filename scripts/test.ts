/**
 * 冒烟测试：用「假 Coconut 宿主 + 假页面」把 `dist/<id>.js` 真跑一遍。
 *
 * 覆盖点：
 *   1. 打包产物能在干净作用域里加载，并把钩子挂到 globalThis；
 *   2. 头部元数据（banner）没被打包吃掉；
 *   3. `.dom.js` 序列化出来的页面脚本在假页面里能正常执行（这是重构最容易出错的地方）；
 *   4. 关键行为：乱码替换、免费模型同步、Buff 覆盖浮层、最优词条计算并落到配装。
 *
 * 说明：这里不追求覆盖全部分支，只做「改动后没把插件改坏」的回归。
 * 用法：deno task test
 */
import { bold, dim, distDir, exists, fail, green, join, log, red } from './lib.ts';

/* ───────────────────────── 假 DOM ───────────────────────── */

type Listener = (event: unknown) => void;

class FakeNode {
  tagName: string;
  nodeType = 1;
  className = '';
  id = '';
  children: FakeNode[] = [];
  parentElement: FakeNode | null = null;
  attrs: Record<string, string> = {};
  dataset: Record<string, string> = {};
  style: Record<string, unknown> = {};
  styleVars: Record<string, string> = {};
  listeners: Record<string, Listener[]> = {};
  rect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  text = '';
  value = '';
  offsetLeft = 0;
  offsetTop = 0;
  offsetWidth = 0;

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get childNodes(): FakeNode[] {
    return this.children;
  }

  get textContent(): string {
    if (this.nodeType === 3) return this.text;
    return this.text + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value: string) {
    if (this.nodeType === 3) this.text = String(value);
    else this.text = String(value);
  }

  get classList() {
    return classListOf(this);
  }

  appendChild(node: FakeNode): FakeNode {
    node.parentElement = this;
    this.children.push(node);
    return node;
  }

  remove(): void {
    if (!this.parentElement) return;
    this.parentElement.children = this.parentElement.children.filter((item) => item !== this);
    this.parentElement = null;
  }

  getAttribute(name: string): string | null {
    if (name === 'class') return this.className || null;
    if (name === 'style') return this.attrs.style ?? null;
    return this.attrs[name] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attrs[name] = String(value);
    if (name === 'class') this.className = String(value);
  }

  hasAttribute(name: string): boolean {
    return this.getAttribute(name) != null;
  }

  addEventListener(type: string, handler: Listener): void {
    (this.listeners[type] ||= []).push(handler);
  }

  dispatch(type: string, event: unknown): void {
    for (const handler of this.listeners[type] || []) handler(event);
  }

  click(): void {
    this.dispatch('click', { type: 'click' });
  }

  getBoundingClientRect() {
    return this.rect;
  }

  setPointerCapture(): void {}

  querySelectorAll(selector: string): FakeNode[] {
    return collect(this).filter((node) => node !== this && matches(node, selector));
  }

  querySelector(selector: string): FakeNode | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

/** 极简 classList（用外部函数避免 `this` 别名）。 */
function classListOf(node: FakeNode) {
  return {
    add(name: string) {
      node.className = `${node.className} ${name}`.trim();
    },
    remove(name: string) {
      node.className = node.className
        .split(/\s+/)
        .filter((item) => item && item !== name)
        .join(' ');
    },
    contains(name: string) {
      return node.className.split(/\s+/).includes(name);
    },
  };
}

function textNode(value: string): FakeNode {
  const node = new FakeNode('#text');
  node.nodeType = 3;
  node.text = value;
  return node;
}

function collect(root: FakeNode, out: FakeNode[] = []): FakeNode[] {
  for (const child of root.children) {
    if (child.nodeType === 1) {
      out.push(child);
      collect(child, out);
    }
  }
  return out;
}

/** 极简选择器：支持 `tag` / `.cls` / `#id` / `[attr]` / `[attr="v"]` / `[attr*="v"]` / `[attr^="v"]`，空格=后代。 */
function matches(node: FakeNode, selector: string): boolean {
  return selector.split(',').some((part) => matchComplex(node, part.trim()));
}

function matchSimple(node: FakeNode, token: string): boolean {
  const rest = token;
  const classMatch = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(rest);
  if (classMatch) {
    const tag = classMatch[1];
    if (tag && node.tagName !== tag.toUpperCase()) return false;
    for (const cls of classMatch[2].split('.').filter(Boolean)) {
      if (!node.className.split(/\s+/).includes(cls)) return false;
    }
    for (const attr of classMatch[3].match(/\[[^\]]+\]/g) || []) {
      const body = attr.slice(1, -1);
      const eq = /^([\w-]+)\s*([*^]?)=\s*["']?([^"']*)["']?$/.exec(body);
      if (!eq) {
        if (node.getAttribute(body) == null) return false;
        continue;
      }
      const value = node.getAttribute(eq[1]) ?? '';
      if (eq[2] === '*' && !value.includes(eq[3])) return false;
      if (eq[2] === '^' && !value.startsWith(eq[3])) return false;
      if (!eq[2] && value !== eq[3]) return false;
    }
    return true;
  }
  if (token.startsWith('#')) return node.id === token.slice(1);
  if (token.startsWith('.')) return node.classList.contains(token.slice(1));
  return node.tagName === token.toUpperCase();
}

function matchComplex(node: FakeNode, selector: string): boolean {
  const tokens = selector.split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  if (!matchSimple(node, tokens[tokens.length - 1])) return false;
  let current: FakeNode | null = node.parentElement;
  for (let i = tokens.length - 2; i >= 0; i--) {
    let found = false;
    while (current) {
      if (matchSimple(current, tokens[i])) {
        found = true;
        current = current.parentElement;
        break;
      }
      current = current.parentElement;
    }
    if (!found) return false;
  }
  return true;
}

/* ───────────────────────── 假页面 ───────────────────────── */

class FakePage {
  window: Record<string, unknown> = {};
  observations: FakeObserver[] = [];
  document: Record<string, unknown>;
  documentElement = new FakeNode('html');
  body = new FakeNode('body');

  constructor(dbData: Record<string, unknown> = {}) {
    this.body.parentElement = null;
    this.documentElement.appendChild(this.body);
    this.document = {
      body: this.body,
      documentElement: this.documentElement,
      querySelector: (selector: string) =>
        collect(this.documentElement).find((node) => matches(node, selector)) ?? null,
      querySelectorAll: (selector: string) =>
        collect(this.documentElement).filter((node) => matches(node, selector)),
      createElement: (tag: string) => new FakeNode(tag),
      title: '椰果工具箱',
    };
    this.db = dbData;
  }

  db: Record<string, unknown>;

  /** 造一个元素挂到 body（或指定父节点）下。 */
  add(node: FakeNode, parent: FakeNode = this.body): FakeNode {
    parent.appendChild(node);
    return node;
  }

  /** 执行 runJs 的代码：模拟宿主包一层 async 函数，并返回 String(结果)。 */
  run(code: string): string {
    const names = [
      'document',
      'window',
      'indexedDB',
      'MutationObserver',
      'Node',
      'getComputedStyle',
      'innerWidth',
      'innerHeight',
      'setTimeout',
      'clearTimeout',
      'console',
    ];
    const values = [
      this.document,
      this.window,
      this.makeIndexedDB(),
      FakeObserver,
      { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      (el: FakeNode) => ({ getPropertyValue: (name: string) => el.styleVars[name] ?? '' }),
      1600,
      900,
      setTimeout,
      clearTimeout,
      console,
    ];
    const fn = new Function(...names, `return (async () => {${code}\n})()`);
    const result = fn(...values) as Promise<unknown> | unknown;
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      // runJs 是同步返回字符串的宿主 API：这里用「轮询 + 同步兜底」模拟。
      // 测试里页面脚本都很短，用微任务轮询等待它 resolve。
      return this.waitValue(result as Promise<unknown>);
    }
    return String(result);
  }

  private pending = new Map<number, unknown>();
  private waitValue(promise: Promise<unknown>): string {
    const key = this.pending.size + 1;
    this.pending.set(key, undefined);
    promise.then((value) => {
      this.pending.set(key, String(value));
    });
    return `PENDING:${key}`;
  }

  /** 把 `PENDING:n` 解析成真实值（迭代直到没有 pending）。 */
  async resolve(value: unknown): Promise<string> {
    let text = String(value);
    for (let round = 0; round < 20; round++) {
      const match = /PENDING:(\d+)/.exec(text);
      if (!match) return text;
      const key = Number(match[1]);
      await new Promise((resolve) => setTimeout(resolve, 1));
      const settled = this.pending.get(key);
      if (settled === undefined) continue;
      text = String(settled);
    }
    return text;
  }

  private makeIndexedDB() {
    const data = this.db;
    return {
      open(_name: string) {
        const request: Record<string, unknown> = {};
        setTimeout(() => {
          request.result = {
            objectStoreNames: { contains: () => true },
            transaction: () => ({
              objectStore: () => ({
                get: (key: string) => {
                  const get: Record<string, unknown> = {};
                  setTimeout(() => {
                    get.result = data[key];
                    (get.onsuccess as (() => void) | undefined)?.();
                  }, 0);
                  return get;
                },
              }),
            }),
          };
          (request.onsuccess as (() => void) | undefined)?.();
        }, 0);
        return request;
      },
    };
  }
}

class FakeObserver {
  static instances: FakeObserver[] = [];
  callback: (records: unknown[]) => void;
  target: FakeNode | null = null;
  options: Record<string, unknown> | null = null;
  disconnected = false;
  constructor(callback: (records: unknown[]) => void) {
    this.callback = callback;
    FakeObserver.instances.push(this);
  }
  observe(target: FakeNode, options: Record<string, unknown>) {
    this.target = target;
    this.options = options;
  }
  disconnect() {
    this.disconnected = true;
  }
}

/* ───────────────────────── 假 Coconut 宿主 ───────────────────────── */

interface Engine {
  callTool(name: string, args: Record<string, unknown>): unknown;
  fetch(url: string, options?: unknown): unknown;
}

interface Loaded {
  hooks: Record<string, (...args: unknown[]) => unknown>;
  logs: string[];
  overlays: Array<{ html?: string; css?: string }>;
  removedOverlays: number[];
  intervals: Map<number, () => void>;
  stored: Record<string, unknown>;
  runJsCodes: string[];
  page: FakePage;
}

function loadPlugin(id: string, engine: Engine, page: FakePage): Loaded {
  const file = join(distDir, `${id}.js`);
  if (!exists(file)) {
    fail(`缺少产物 dist/${id}.js，先跑 deno task build`);
    Deno.exit(1);
  }
  const code = Deno.readTextFileSync(file);
  const logs: string[] = [];
  const overlays: Array<{ html?: string; css?: string }> = [];
  const removedOverlays: number[] = [];
  const intervals = new Map<number, () => void>();
  const stored: Record<string, unknown> = {};
  const runJsCodes: string[] = [];
  let overlaySeq = 0;
  let timerSeq = 0;

  const coconut = {
    plugin: { id, name: id, version: 'test', mount: 'none', permissions: [] },
    log: (...args: unknown[]) => logs.push(args.map((item) => String(item)).join(' ')),
    callTool: (name: string, args: Record<string, unknown>) => engine.callTool(name, args || {}),
    fetch: (url: string, options: unknown) => engine.fetch(url, options),
    storage: {
      get: (key: string, fallback: unknown) =>
        key in stored ? stored[key] : (fallback === undefined ? null : fallback),
      set: (key: string, value: unknown) => {
        stored[key] = value;
        return true;
      },
      delete: (key: string) => {
        delete stored[key];
        return true;
      },
      all: () => ({ ...stored }),
    },
    ui: {
      overlay: (options: { html?: string; css?: string }) => {
        overlays.push(options || {});
        overlaySeq += 1;
        return overlaySeq;
      },
      remove: (target: number) => {
        removedOverlays.push(target);
        return true;
      },
      show: () => true,
      hide: () => true,
      visible: () => true,
      injectCss: () => true,
    },
    http: {
      createServer: (options?: { port?: number }) => {
        const listeners = new Map<string, Array<(...args: unknown[]) => unknown>>();
        const server = {
          id: 1,
          port: Number(options?.port || 47830),
          close: () => true,
          addEventListener: (type: string, listener: (...args: unknown[]) => unknown) => {
            const list = listeners.get(type) || [];
            list.push(listener);
            listeners.set(type, list);
            return server;
          },
          __listeners: (type: string) => listeners.get(type) || [],
        };
        return server;
      },
    },
    webSocket: () => {
      throw new Error('测试宿主没有 WebSocket 客户端');
    },
    launcher: { lang: 'zh-Hans', toolboxVersion: 'test', gameVersion: 'test' },
    src: {
      toolbox: { dir: '', url: 'http://toolbox.local/' },
      static: { dir: '', url: 'http://toolbox.local/icons/' },
    },
    runJs: (codeText: string) => {
      runJsCodes.push(codeText);
      const raw = page.run(codeText);
      // 页面脚本可能是异步的：把它包成一个「thenable 字符串」让插件 await 到正确值
      return {
        then: (resolve: (value: string) => void) => {
          page.resolve(raw).then(resolve);
        },
        toString: () => raw,
      };
    },
    sleep: () => Promise.resolve(),
    setTimeout: () => {
      timerSeq += 1;
      return timerSeq;
    },
    clearTimeout: () => {},
    setInterval: (handler: () => void) => {
      timerSeq += 1;
      intervals.set(timerSeq, handler);
      return timerSeq;
    },
    clearInterval: (target: number) => intervals.delete(target),
  };

  const hooks: Record<string, (...args: unknown[]) => unknown> = {};
  const names = ['onStart', 'onHello', 'onEvent', 'onStop'];
  for (const name of names) delete (globalThis as Record<string, unknown>)[name];
  const factory = new Function('Coconut', 'console', code);
  factory(coconut, console);
  for (const name of names) {
    const fn = (globalThis as Record<string, unknown>)[name];
    if (typeof fn === 'function') hooks[name] = fn as (...args: unknown[]) => unknown;
    delete (globalThis as Record<string, unknown>)[name];
  }
  return { hooks, logs, overlays, removedOverlays, intervals, stored, runJsCodes, page };
}

/** 等所有微任务/定时器排空。 */
async function settle(rounds = 12) {
  for (let i = 0; i < rounds; i++) await new Promise((resolve) => setTimeout(resolve, 1));
}

/* ───────────────────────── 断言 ───────────────────────── */

let failures = 0;
let passes = 0;
function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passes += 1;
    log(`   ${green('✔')} ${name}`);
  } else {
    failures += 1;
    log(`   ${red('✗')} ${name}${detail ? dim(`  ${detail}`) : ''}`);
  }
}

/* ───────────────────────── 场景 ───────────────────────── */

async function testCjkScramble() {
  log(`${bold('cjk-scramble')}`);
  const page = new FakePage();
  page.add(textNode('你好，椰果工具箱！'));
  const loaded = loadPlugin('cjk-scramble', {
    callTool: () => ({}),
    fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
  }, page);

  check('挂上了 onHello / onStop', !!loaded.hooks.onHello && !!loaded.hooks.onStop);
  check(
    '产物保留了 @name 头部',
    Deno.readTextFileSync(join(distDir, 'cjk-scramble.js')).startsWith('// @name'),
  );
  const bundled = Deno.readTextFileSync(join(distDir, 'cjk-scramble.js'));
  check(
    '产物已压缩',
    bundled.split('\n').some((line) => line.length > 500),
    `最长行 ${Math.max(...bundled.split('\n').map((line) => line.length))}`,
  );

  await loaded.hooks.onHello();
  await settle();
  const scrambled = page.body.textContent;
  check('页面文字被打乱', scrambled !== '你好，椰果工具箱！', scrambled);
  check('标点/英文/空白保持原样', /[，！]/.test(scrambled));
  check('页面挂上了 __simpleTranslate', !!page.window.__simpleTranslate);
  check('注册了 MutationObserver', FakeObserver.instances.length > 0);

  await loaded.hooks.onStop();
  await settle();
  check('onStop 清掉了页面引用', page.window.__simpleTranslate === null);
  check('onStop 断开了观察器', FakeObserver.instances[0].disconnected);
}

async function testFreeModels() {
  log(`${bold('free-models')}`);
  const profiles: Array<Record<string, unknown>> = [
    { id: 'default', label: '默认配置', baseUrl: '', model: '', apiKeySet: false },
  ];
  const calls: string[] = [];
  const page = new FakePage({
    'ai-gen-prefs': { data: { enabled: true } },
    'ai-config': { data: { profiles: [{ id: 'default' }] } },
  });
  const loaded = loadPlugin('free-models', {
    callTool(name, args) {
      calls.push(`${name}:${String(args.action || '')}`);
      if (name === 'get_ai_profiles') return { profiles };
      if (name === 'manage_ai_profile') {
        if (args.action === 'add') profiles.push({ id: `p${profiles.length}`, ...args });
        return {};
      }
      return {};
    },
    fetch: () => ({
      status: 200,
      ok: true,
      json: { data: [{ id: 'free-a-free' }, { id: 'free-b-free' }] },
      body: '',
    }),
  }, page);

  await loaded.hooks.onHello();
  await settle(20);
  check(
    '写入了两个免费模型配置',
    profiles.filter((p) => String(p.label).includes('OC_FREE')).length === 2,
  );
  check('打开了 ai_enabled', calls.includes('set_setting:'));
  check('记录了首次使用', loaded.stored.seeded === true);
  check('日志有首次使用提示', loaded.logs.some((line) => line.includes('首次使用')));

  await loaded.hooks.onEvent({ type: 'resync' });
  await settle(20);
  check('第二次同步走「同步完成」分支', loaded.logs.some((line) => line.includes('同步完成')));
  check(
    '没有产生重复配置',
    profiles.filter((p) => String(p.model || '') === 'free-a').length === 1,
  );
}

async function testBuffCoverage() {
  log(`${bold('buff-coverage')}`);
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
  });
  const gutter = page.add(new FakeNode('div'));
  gutter.setAttribute('style', 'border:1px dashed #333');
  gutter.textContent = '伤害绑定';
  gutter.rect = { left: 200, top: 100, right: 1400, bottom: 700, width: 1200, height: 600 };
  const aside = page.add(new FakeNode('aside'));
  aside.className = 'theme-glass-surface border-r';
  // 侧栏右边界 = 0：让「可见时间轴窗口」覆盖下面两个块的位置（pos 0 与 10）
  aside.rect = { left: 0, top: 0, right: 0, bottom: 800, width: 0, height: 800 };

  const blockA = page.add(new FakeNode('div'));
  blockA.setAttribute('data-block', 'b1');
  blockA.rect = { left: 220, top: 300, right: 260, bottom: 340, width: 40, height: 40 };
  const blockB = page.add(new FakeNode('div'));
  blockB.setAttribute('data-block', 'b2');
  blockB.rect = { left: 620, top: 300, right: 660, bottom: 340, width: 40, height: 40 };

  const loaded = loadPlugin('buff-coverage', {
    callTool(name) {
      if (name === 'get_damage_entries') {
        return {
          items: [
            { pos: 0, buffs: ['攻击提升1阶'] },
            { pos: 10, buffs: ['攻击提升1阶'] },
          ],
        };
      }
      if (name === 'get_timeline_summary') {
        return {
          items: [
            { pos: 0, kind: 'opBlock', no: 1 },
            { pos: 10, kind: 'opBlock', no: 2 },
          ],
        };
      }
      if (name === 'get_settings_state') return { theme_mode: 'dark' };
      return {};
    },
    fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
  }, page);

  await loaded.hooks.onStart();
  await settle(30);
  const last = loaded.overlays.at(-1);
  check('挂出了覆盖范围浮层', !!last && String(last.html).includes('Buff 覆盖范围'));
  check(
    '渲染了 buff 行',
    !!last && String(last.html).includes('攻击提升'),
    String(last?.html || '').slice(0, 200),
  );
  check(
    '渲染了色块',
    !!last && String(last.html).includes('cov-bar'),
    String(last?.html || '').slice(0, 200),
  );
  check(
    '页面脚本被调用（测量/摆放/过渡）',
    loaded.runJsCodes.length >= 2,
    `${loaded.runJsCodes.length}`,
  );
  check('浮层 CSS 是深色', !!last && String(last.css).includes('rgba(13,15,22'));

  await loaded.hooks.onStop();
  check(
    'onStop 清掉了浮层和定时器',
    loaded.removedOverlays.length > 0 && loaded.intervals.size === 0,
  );
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
  };
  const stat = () => {
    let atkPct = 0;
    let flatAtk = 0;
    let critRate = 5;
    let critDamage = 150;
    let bonus = 0;
    for (const echo of state.echoes) {
      if (echo.main === '暴击率') critRate += 22;
      else if (echo.main === '暴击伤害') critDamage += 44;
      else if (echo.main === '攻击%') atkPct += echo.cost === 4 ? 33 : echo.cost === 3 ? 30 : 18;
      else if (echo.main === '共鸣效率') continue;
      else if (echo.main.endsWith('伤害加成')) bonus += 30;
      for (const sub of echo.substats) {
        const value = Number(sub.value);
        if (sub.type === '攻击%') atkPct += value;
        else if (sub.type === '攻击') flatAtk += value;
        else if (sub.type === '暴击率') critRate += value;
        else if (sub.type === '暴击伤害') critDamage += value;
        else if (sub.type === '普攻伤害加成' || sub.type === '共鸣解放伤害加成') {
          bonus += value * 0.5;
        }
      }
    }
    return { atkPct, flatAtk, critRate, critDamage, bonus };
  };
  const total = () => {
    const s = stat();
    const atk = 800 * (1 + s.atkPct / 100) + s.flatAtk;
    return atk * (1 + s.bonus / 100) * (1 + Math.min(s.critRate, 100) / 100 * s.critDamage / 100);
  };
  const engine: Engine = {
    callTool(name, args) {
      const slot = Number(args.slot || 0) - 1;
      if (name === 'get_config_summary') {
        return {
          characters: [
            { name: '锁暝', echoes: state.echoes },
            {
              name: '散华',
              echoes: state.echoes.map(() => ({ cost: 1, main: '攻击%', substats: [] })),
            },
          ],
        };
      }
      if (name === 'get_team') return [{ character: '锁暝' }, { character: '散华' }];
      if (name === 'get_project_state') {
        return { name: 'test', team: [{ character: '锁暝' }, { character: '散华' }] };
      }
      if (name === 'get_settings_state') return { theme_mode: 'dark' };
      if (name === 'get_result_summary') {
        if (args.character) return { entries: [{ element: '湮灭' }] };
        return { total: total() };
      }
      if (name === 'set_echo_cost') {
        state.echoes[slot].cost = Number(args.cost);
        return {};
      }
      if (name === 'set_main_stat') {
        state.echoes[slot].main = String(args.label);
        return {};
      }
      if (name === 'add_substat') {
        const echo = state.echoes[slot];
        if (echo.substats.some((sub) => sub.type === args.label)) return { error: '重复' };
        echo.substats.push({ type: String(args.label), value: Number(args.value ?? 0) });
        return {};
      }
      if (name === 'remove_substat') {
        state.echoes[slot].substats.splice(Number(args.idx), 1);
        return {};
      }
      if (name === 'update_substat_value') {
        state.echoes[slot].substats[Number(args.idx)].value = Number(args.value);
        return {};
      }
      if (name === 'export_substat_plan') {
        state.exported[String(args.name)] = JSON.parse(JSON.stringify(state.echoes));
        return { name: args.name };
      }
      if (name === 'apply_substat_plan') {
        const plan = state.exported[String(args.name)];
        if (Array.isArray(plan)) state.echoes = JSON.parse(JSON.stringify(plan));
        state.appliedPlan = args.name;
        return {};
      }
      if (name === 'unlock_phase' || name === 'lock_phase') return {};
      return {};
    },
    fetch: () => ({ status: 200, ok: true, json: {}, body: '' }),
  };
  return { engine, state };
}

async function testEchoOptimizer() {
  log(`${bold('echo-substat-optimizer')}`);
  const page = new FakePage();
  // 词条页特征：导航激活 + 角色 cost 标签 + 副词条 chip
  const nav = page.add(new FakeNode('button'));
  nav.className = 'active';
  nav.textContent = '词条';
  const charTab = page.add(new FakeNode('div'));
  charTab.textContent = '锁暝 (43311)';
  for (const chip of ['攻击% 8.6%', '暴击率 8.1%', '暴击伤害 16.2%', '生命% 8.6%']) {
    const el = page.add(new FakeNode('span'));
    el.textContent = chip;
  }
  // 浮窗交互元素
  const root = page.add(new FakeNode('div'));
  root.className = 'eso-root';
  const title = new FakeNode('div');
  title.className = 'eso-title';
  root.appendChild(title);
  const runBtn = page.add(new FakeNode('button'));
  runBtn.className = 'eso-run';
  const input = page.add(new FakeNode('input'));
  input.className = 'eso-n';
  input.value = '6';
  // 头像
  const holder = page.add(new FakeNode('div'));
  holder.textContent = '锁暝';
  const img = new FakeNode('img');
  img.setAttribute('src', '/avatars/suoming.webp');
  holder.appendChild(img);
  page.documentElement.styleVars = {
    '--theme-accent-bg': '#2e7d5b',
    '--theme-surface-radius': '12px',
  };

  const { engine, state } = makeEchoEngine();
  const loaded = loadPlugin('echo-substat-optimizer', engine, page);
  check(
    '挂上了四个钩子',
    ['onStart', 'onHello', 'onEvent', 'onStop'].every((name) => !!loaded.hooks[name]),
  );

  await loaded.hooks.onStart();
  await settle(40);
  const first = loaded.overlays.at(-1);
  check('检测到词条页并弹出浮窗', !!first && String(first.html).includes('最优声骸词条'));
  check('浮窗里渲染了队伍角色', !!first && String(first.html).includes('锁暝'));
  check('浮窗里带上了头像', !!first && String(first.html).includes('/avatars/suoming.webp'));
  check('读取了主题变量', String(first?.css).includes('#2e7d5b'));

  // 触发一次「计算最优」：点浮窗按钮 → 页面把意图写进 body.dataset → 主循环 tick 一次
  const [tickLoop] = [...loaded.intervals.values()];
  page.body.dataset.esoRun = '1';
  page.body.dataset.esoN = '6';
  tickLoop();
  await settle(60);

  // 等待 optimize 跑完（用 fake 引擎的 export 记录判断）
  for (let i = 0; i < 200; i++) {
    if (state.exported.eso_best) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  check('计算完成后导出了 eso_best 方案', !!state.exported.eso_best);
  const applied = state.echoes;
  const subs = applied.flatMap((echo) => echo.substats);
  check('按设定条数写入副词条', subs.length === 6, `${subs.length}`);
  check(
    '每条声骸同类词条不重复',
    applied.every((echo) =>
      new Set(echo.substats.map((s) => s.type)).size === echo.substats.length
    ),
  );
  check('副词条都用中档值', subs.every((sub) => Number(sub.value) > 0));
  check(
    '主词条都是合法组合（4cost 至少一个）',
    applied.filter((echo) => echo.cost === 4).length >= 1,
  );

  // 结果卡片：等收尾那次渲染落地（结果 html 在 export 之后才设置）
  for (let i = 0; i < 200; i++) {
    if (String(loaded.overlays.at(-1)?.html || '').includes('最优（cost 搭配')) break;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  const last = loaded.overlays.at(-1);
  check(
    '结果卡片显示了 cost 搭配',
    !!last && String(last.html).includes('最优（cost 搭配'),
    String(last?.html || '').slice(0, 200),
  );

  await loaded.hooks.onStop();
  await settle(5);
  check(
    'onStop 清掉了浮层与定时器',
    loaded.removedOverlays.length > 0 && loaded.intervals.size === 0,
  );
}

/* ───────────────────────── 主流程 ───────────────────────── */

if (!exists(distDir)) {
  fail('缺少 dist/，先跑 deno task build');
  Deno.exit(1);
}

log(dim('用假宿主 + 假页面跑打包产物…\n'));
await testCjkScramble();
await testFreeModels();
await testBuffCoverage();
await testEchoOptimizer();

log('');
if (failures) {
  fail(`${failures} 项失败（成功 ${passes} 项）`);
  Deno.exit(1);
}
log(green(`全部通过：${passes} 项`));
