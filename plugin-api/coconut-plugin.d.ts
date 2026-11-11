/**
 * 椰果工具箱 · 插件 API v1
 */

import type { CoconutToolName, CoconutToolParams } from './tools.d.ts';

export type { CoconutToolName, CoconutToolParams };

/* ───────────────────────────── 元数据 / 权限 ───────────────────────────── */

/** 插件能申请的权限；没声明就调用对应 API 会抛错。 */
export type CoconutPermission =
  /** 在工具箱页面里执行 JS（Coconut.toolbox.runJs、浮层的 script 片段） */
  | 'dom'
  /** 调用工具箱的 WS 工具（Coconut.callTool / Coconut.tools.call） */
  | 'toolbox'
  /** Coconut.fetch：由启动器代发 HTTP（不限域名） */
  | 'network'
  /** Coconut.storage：插件私有 KV（落盘到 plugins/storage/<id>.json） */
  | 'storage'
  /** Coconut.ui：浮层 / 注入 CSS / requestAnimationFrame（只画不跑代码） */
  | 'ui'
  /** Coconut.http：在启动器里开本地 HTTP / WebSocket 服务 */
  | 'server'
  /** 只读订阅原始 WS 收发帧（开发调试用，默认先别申请） */
  | 'debug';

/** 露脸方式。目前只影响启动页插件列表里的展示，不改变 API。 */
export type CoconutMount = 'none' | 'overlay';

/** Coconut.plugin：启动器解析出的元数据。 */
export interface CoconutPluginMeta {
  /** 插件 id = 文件名（不含 .js） */
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly mount: CoconutMount;
  readonly permissions: CoconutPermission[];
}

/* ───────────────────────────── 事件 ───────────────────────────── */

/** onHello 的参数：工具箱页面就绪。 */
export interface CoconutHelloInfo {
  /** 这一条 WS 会话的 id（字符串） */
  session: string;
  /**
   * 工具箱当前注册的工具列表。
   *
   * 不同工具箱版本给的东西不一样：可能是工具名字符串，也可能是
   * `{ type: 'function', function: { name, description, parameters } }` 定义。
   * 取名字时两种都兼容一下：
   * ```js
   * const name = typeof item === 'string' ? item : item.function?.name;
   * ```
   */
  tools: Array<string | { name?: string; function?: { name?: string } }>;
}

/** 启动器主动触发「重新同步」（免费模型插件就靠这个）。 */
export interface CoconutResyncEvent {
  type: 'resync';
  /** 可选：模型列表已就绪时带上的 id 数组 */
  models?: string[];
}

/** 原始 WS 帧（需要 debug 权限）。direction = recv 是工具箱发来的，send 是启动器发出去的。 */
export interface CoconutFrameEvent {
  type: 'frame';
  direction: 'recv' | 'send';
  frame: unknown;
  /** 毫秒时间戳 */
  at: number;
}

/**
 * 目前会收到的全部事件。
 *
 * 按 `event.type` 窄化即可；以后新增事件类型时会直接多出新成员，
 * 所以请把不认识的 event 直接忽略掉，不要假设只会有这两种。
 */
export type CoconutEvent = CoconutResyncEvent | CoconutFrameEvent;

/* ───────────────────────────── 能力 ───────────────────────────── */

/** Coconut.fetch 的选项（走启动器进程里的 reqwest，不受页面 CORS 限制）。 */
export interface CoconutFetchOptions {
  /** 默认 GET；大小写不敏感 */
  method?: string;
  headers?: Record<string, string>;
  /** 原始请求体 */
  body?: string;
  /** JSON 请求体（设置了 body 时优先 body） */
  json?: unknown;
}

/** Coconut.fetch 的返回值。body 是原文，json 是自动 JSON.parse 的结果（解析失败为 null）。 */
export interface CoconutFetchResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: string;
  json: unknown;
}

/**
 * 注册浮层时的初始内容。
 *
 * `html` / `css` 是**数据**：只有 `ui` 权限也能用。引擎会净化 html
 * （去掉 `<script>` / `<iframe>` / on* 属性 / `javascript:` URL），
 * 所以想画什么都可以，但不能借 html 偷偷跑代码。
 *
 * 要在页面里跑代码就用 `script`——它需要 `dom` 权限。
 */
export interface CoconutOverlayOptions {
  /** 初始 HTML（也接受 `<html>` JSX 片段） */
  html?: string | CoconutJsxChunk<'html'>;
  /** 初始 CSS（也接受 `<style>` JSX 片段） */
  css?: string | CoconutJsxChunk<'css'>;
  /**
   * 页面侧脚本：传函数会被序列化后调用，参数是浮层根节点；
   * 返回一个函数就当销毁回调（浮层 remove / 插件停用时调用）。
   * 也可以用 `<script>` JSX 片段。需要 `dom` 权限。
   */
  script?:
    | string
    | CoconutJsxChunk<'script'>
    | ((root: HTMLElement) => void | (() => void));
}

/** 插件私有 KV：值是 JSON 可序列化的东西，落盘在 plugins/storage/<id>.json。 */
export interface CoconutStorage {
  /** 读一个键；不存在时返回 fallback（没给 fallback 则返回 null） */
  get<T = unknown>(key: string): T | null;
  get<T = unknown>(key: string, fallback: T): T;
  set(key: string, value: unknown): true;
  delete(key: string): true;
  /** 读出全部键值（浅拷贝） */
  all(): Record<string, unknown>;
}

/** 插件浮层 / 样式注入。 */
export interface CoconutUi {
  /**
   * 注册一个浮层，返回引擎分配的浮层 id（从 1 递增）。
   *
   * 浮层铺满视口，**层级（z-index）由引擎统一编排**：后注册的盖住先注册的。
   * 浮层本身不拦截鼠标，需要交互的元素自己写 `pointer-events: auto`。
   */
  overlay(options?: CoconutOverlayOptions): number;
  /** 显示 / 隐藏指定浮层；返回是否找到了这个 id。 */
  visible(id: number, visible: boolean): boolean;
  /** 等价于 `visible(id, true)` */
  show(id: number): boolean;
  /** 等价于 `visible(id, false)` */
  hide(id: number): boolean;
  /** 删除指定浮层；返回是否找到了这个 id。 */
  remove(id: number): boolean;
  /**
   * 往工具箱页面注入一段页面级 CSS（不是浮层）。
   * 内容放在 <style id="css::<插件id>::<id>"> 里，重复调用会覆盖，传空串就撤掉。
   */
  injectCss(id: string, css: string): true;

  /**
   * 请求一帧回调：`callback` 拿到页面时间戳（毫秒）。
   *
   * 实现是「页面 rAF → 合并 → 回传插件线程」：
   * - **≤30Hz、有 1～2 帧抖动**，只适合低频驱动（读数、状态轮询、节流后的重绘）；
   * - 页面隐藏 / 最小化时自动暂停（和浏览器 rAF 一致）；
   * - 想要 60fps 的视觉动画，把动画写进页面侧脚本（`overlay({ script })` 或
   *   `Coconut.toolbox.runJs`），那里是原生 rAF。
   *
   * 页面会话结束（bye）时回调会被清空，需要在下一个 `onHello` 里重新注册。
   * 需要 ui 权限。
   */
  requestAnimationFrame(callback: (timestamp: number) => void): number;
  /** 取消一帧回调；最后一个被取消时引擎会停掉页面上的 rAF 循环。 */
  cancelAnimationFrame(id: number): void;
}

/** 启动器信息（只读）。 */
export interface CoconutLauncherInfo {
  /** 启动器当前语言：zh-Hans / zh-Hant / ja / ko / en */
  readonly lang: string;
  /** 椰果工具箱包体版本（commit / build） */
  readonly toolboxVersion: string;
  /** 游戏数据版本 */
  readonly gameVersion: string;
}

/** 一个资源根：本地目录 + 启动器本地服务地址。 */
export interface CoconutSource {
  /** 资源在计算机上的绝对路径（例如 C:\\Users\\...\\toolbox-static） */
  readonly dir: string;
  /** 启动器本地服务里对应的地址，可直接给 fetch / img src 用 */
  readonly url: string;
}

/** 插件读取工具箱资源用的两个根。 */
export interface CoconutSrc {
  /** 椰果工具箱包体目录：dir + http://127.0.0.1:47821/ */
  readonly toolbox: CoconutSource;
  /** 启动器本地资源目录（本地化游戏图标等）：dir + http://127.0.0.1:47821/icons/ */
  readonly static: CoconutSource;
}

/* ───────────────────────────── 事件对象 / 工具调用 / 工具箱 ───────────────────────────── */

/**
 * 所有事件共用的形状。`dispatchEvent` 是**同步**的，没有冒泡 / capture。
 *
 * `detail` 里有什么取决于事件类型；`preventDefault()` 只有 `cancelable: true`
 * 的事件才有效（工具调用 / socket 事件都是普通事件）。
 */
export interface CoconutEventObject<T = unknown> {
  readonly type: string;
  readonly detail: T;
  readonly target: CoconutEventTarget | null;
  readonly currentTarget: CoconutEventTarget | null;
  readonly timeStamp: number;
  readonly defaultPrevented: boolean;
  readonly cancelable: boolean;
  preventDefault(): void;
}

/** 监听器选项：`once` / `signal`（AbortSignal）都支持，capture / passive 会被忽略。 */
export interface CoconutAddEventListenerOptions {
  once?: boolean;
  signal?: AbortSignal;
}

/** 与 DOM `EventTarget` 同形的事件对象（插件也能自己 new 一个当总线）。 */
export interface CoconutEventTarget {
  addEventListener(
    type: string,
    listener: (event: CoconutEventObject) => void | Promise<void>,
    options?: CoconutAddEventListenerOptions,
  ): void;
  removeEventListener(type: string, listener: (event: CoconutEventObject) => void): void;
  dispatchEvent(event: CoconutEventObject): boolean;
}

/** 一次异步工具调用的结果。 */
export interface CoconutToolResultDetail<T = unknown> {
  /** 调用 id（从 1 递增，与 Promise 一一对应） */
  readonly id: number;
  readonly tool: string;
  readonly args: unknown;
  /** 成功时的工具返回值 */
  readonly result?: T;
  /** 失败时的错误文本 */
  readonly error?: string;
  /** 被 AbortSignal 中止 */
  readonly aborted?: boolean;
  /** 从发起到结束的毫秒数 */
  readonly ms: number;
}

/** `Coconut.tools`：异步工具调用 + 结果事件。需要 toolbox 权限。 */
export interface CoconutTools extends CoconutEventTarget {
  /**
   * 调用一个工具箱工具，返回 Promise（**不阻塞插件线程**）。
   *
   * 与同步的 `Coconut.callTool` 的区别：调用期间定时器 / socket / http 事件照常派发，
   * 可以用 `options.signal` 中止（中止后结果被丢弃，工具箱那边的计算不会停下）。
   */
  call<K extends CoconutToolName>(
    tool: K,
    args?: CoconutToolParams[K],
    options?: { signal?: AbortSignal },
  ): Promise<unknown>;
}

/** `Coconut.toolbox`：工具箱本身。 */
export interface CoconutToolbox {
  /**
   * 在工具箱页面里执行代码，返回页面侧的真实值（不再字符串化）。
   *
   * - 传字符串：当作函数体，必须自己 `return`；
   * - 传函数对象：源码送到页面执行，后面的参数 JSON 序列化后传进去。
   *   函数必须**自包含**（闭包变量在页面里不存在），且不能是 async 函数。
   * - 传 `script` 片段（`script` 标签模板，即 `<script>` 的替代写法）也可以。
   *
   * 需要 dom 权限。
   */
  runJs<T = unknown>(code: string): T;
  runJs<T = unknown>(fn: (...args: never[]) => T, ...args: unknown[]): T;
  runJs<T = unknown>(chunk: CoconutJsxChunk<'script'>): T;

  /** 关掉工具箱页面，回到启动器首页。需要 toolbox 权限。 */
  exit(): true;
}

/** JSX 运行时产出的片段：`html`（普通 JSX / html 模板）、`css`、`script`。 */
export interface CoconutJsxChunk<K extends 'script' | 'html' | 'css' = 'script' | 'html' | 'css'> {
  readonly __coconut: K;
  readonly text: string;
  toString(): string;
}

/* ───────────────────────────── 事件 / 工具 / 工具箱 结束 ───────────────────────────── */

/* ───────────────────────────── HTTP / WebSocket ───────────────────────────── */

/** 生命周期事件名（与 onStart / onHello / onEvent / onBye / onStop 对应）。 */
export type CoconutLifecycleEventName = 'start' | 'hello' | 'event' | 'bye' | 'stop';

/** 生命周期事件对象（Coconut.addEventListener 的回调入参）。 */
export interface CoconutLifecycleEventMap {
  start: undefined;
  hello: CoconutHelloInfo;
  event: CoconutEvent;
  /** 页面会话结束：关闭 / 重载 / 回到启动器。 */
  bye: { session?: string } | undefined;
  stop: undefined;
}

/** Coconut.http 收到的请求。 */
export interface CoconutHttpRequest {
  readonly server: number;
  readonly method: string;
  readonly path: string;
  /** 原始 query 字符串（不含 `?`） */
  readonly query: string;
  readonly headers: Record<string, string>;
  readonly body: string;
}

/** Coconut.http 的响应。第一次 write/end/send 会把状态行与响应头发给客户端。 */
export interface CoconutHttpResponse {
  /** 已经调用过 end / send 之后为 true。 */
  readonly ended: boolean;
  status(code: number): this;
  header(name: string, value: string): this;
  /** header 的别名 */
  setHeader(name: string, value: string): this;
  /** 写一段响应体（不结束请求）。 */
  write(chunk: string): boolean;
  /** 结束请求，可带最后一段响应体。 */
  end(body?: string): boolean;
  /** 结束请求：字符串原样发送，其它值 JSON 序列化。 */
  send(body?: unknown): boolean;
  /** 设置 application/json 并结束请求。 */
  json(value: unknown): boolean;
}

/** 服务端 WebSocket 连接（Coconut.http 的 connection 事件）。 */
export interface CoconutWebSocketConnection {
  readonly id: number;
  readonly path: string;
  send(data: string): boolean;
  close(): boolean;
  addEventListener(
    type: 'message',
    listener: (event: { data: string }) => void | Promise<void>,
  ): this;
  addEventListener(
    type: 'close',
    listener: (event: { code: number }) => void | Promise<void>,
  ): this;
  removeEventListener(
    type: 'message' | 'close',
    listener: (event: { data: string } | { code: number }) => void | Promise<void>,
  ): this;
}

/** Coconut.http.createServer 返回的服务对象。 */
export interface CoconutHttpServer {
  readonly id: number;
  readonly port: number;
  /** 关掉监听，并断开该服务上的 WebSocket 连接。 */
  close(): boolean;
  addEventListener(
    type: 'request',
    listener: (request: CoconutHttpRequest, response: CoconutHttpResponse) => void | Promise<void>,
  ): this;
  addEventListener(
    type: 'connection',
    listener: (socket: CoconutWebSocketConnection) => void | Promise<void>,
  ): this;
  removeEventListener(
    type: 'request',
    listener: (request: CoconutHttpRequest, response: CoconutHttpResponse) => void | Promise<void>,
  ): this;
  removeEventListener(
    type: 'connection',
    listener: (socket: CoconutWebSocketConnection) => void | Promise<void>,
  ): this;
}

/** Coconut.http.createServer 的选项。host 默认 127.0.0.1，port=0 时由系统分配。 */
export interface CoconutHttpServerOptions {
  host?: string;
  port?: number;
}

/** 插件自己的 HTTP / WebSocket 服务。需要 server 权限。 */
export interface CoconutHttp {
  /** `Coconut.http(options)` 等价于 `Coconut.http.createServer(options)`。 */
  (options?: CoconutHttpServerOptions): CoconutHttpServer;
  createServer(options?: CoconutHttpServerOptions): CoconutHttpServer;
}

/** Coconut.webSocket(url) 返回的客户端对象。需要 network 权限。 */
export interface CoconutWebSocket {
  readonly id: number;
  readonly url: string;
  /** 握手成功后为 true；收到 close 后变 false。 */
  connected: boolean;
  /** 0 CONNECTING / 1 OPEN / 2 CLOSING / 3 CLOSED（宿主同步连接，构造出来就是 OPEN）。 */
  readonly readyState: number;
  readonly CONNECTING: 0;
  readonly OPEN: 1;
  readonly CLOSING: 2;
  readonly CLOSED: 3;
  /** 不在 OPEN 状态时抛 `DOMException(name='InvalidStateError')`。 */
  send(data: string): boolean;
  close(code?: number, reason?: string): boolean;
  addEventListener(type: 'open', listener: (event: Record<string, never>) => void | Promise<void>): this;
  addEventListener(
    type: 'message',
    listener: (event: { data: string }) => void | Promise<void>,
  ): this;
  addEventListener(
    type: 'close',
    listener: (event: { code: number }) => void | Promise<void>,
  ): this;
  removeEventListener(
    type: 'open',
    listener: (event: Record<string, never>) => void | Promise<void>,
  ): this;
  removeEventListener(
    type: 'message',
    listener: (event: { data: string }) => void | Promise<void>,
  ): this;
  removeEventListener(
    type: 'close',
    listener: (event: { code: number }) => void | Promise<void>,
  ): this;
}

/** 插件拿到的全局 `Coconut`。 */
export interface CoconutContext {
  readonly plugin: CoconutPluginMeta;

  /**
   * @deprecated 改用 {@link CoconutToolbox.runJs}：支持传函数对象、返回真实值而不是字符串。
   *
   * **运行时仍然可用**（只是第一次调用会在 console 打一条废弃警告），
   * 这里把类型声明注释掉是为了让新代码编译期就被拦住。
   *
   * ```ts
   * // 旧写法（同步、返回字符串）
   * // const count = Number(Coconut.runJs('return document.querySelectorAll(".card").length'));
   *
   * // 新写法（可传函数、返回真实值）
   * const count = Coconut.toolbox.runJs(() => document.querySelectorAll('.card').length);
   * ```
   */
  // runJs(code: string): string;

  /**
   * @deprecated 改用 {@link CoconutTools.call}（异步 + 可中止 + 结果事件）。
   *
   * **运行时仍然可用**（第一次调用会打废弃警告）。
   *
   * ```ts
   * // 旧写法（同步阻塞，最多 30s，期间事件全部停摆）
   * // const state = Coconut.callTool('get_ai_profiles', {});
   *
   * // 新写法（不阻塞、可中止、能收事件）
   * const state = await Coconut.tools.call('get_ai_profiles', {});
   * ```
   */
  // callTool<K extends CoconutToolName>(tool: K, args?: CoconutToolParams[K]): unknown;

  /** 由启动器代发 HTTP 请求。需要 network 权限。 */
  fetch(url: string, options?: CoconutFetchOptions): CoconutFetchResult;

  /** 插件私有 KV。需要 storage 权限。 */
  readonly storage: CoconutStorage;

  /** 浮层 / CSS / rAF。需要 ui 权限（浮层里带 script 片段时还需要 dom）。 */
  readonly ui: CoconutUi;

  /** 工具箱本身：页面脚本执行（需要 dom）、回到启动器（需要 toolbox）。 */
  readonly toolbox: CoconutToolbox;

  /** 异步工具调用 + result / error 事件。需要 toolbox 权限。 */
  readonly tools: CoconutTools;

  /** 启动器信息：语言 / 工具箱版本 / 游戏数据版本（只读，不需要权限）。 */
  readonly launcher: CoconutLauncherInfo;

  /** 工具箱包体 + 启动器本地资源（只读，不需要权限）。 */
  readonly src: CoconutSrc;

  /** 写日志：只落盘到 %APPDATA%\com.coconut.launcher\logs\plugins.log。 */
  log(...args: unknown[]): void;

  /** 等一会儿（毫秒）：`await Coconut.sleep(500)`。需要忙等时优先用它。 */
  sleep(ms: number): Promise<void>;

  /** 插件自己的 HTTP / WebSocket 服务。需要 server 权限。 */
  readonly http: CoconutHttp;

  /** 连接一个 WebSocket（客户端）。需要 network 权限。 */
  webSocket(url: string): CoconutWebSocket;

  /**
   * 生命周期事件监听器：与 onStart / onHello / onEvent / onStop 等价。
   * `Coconut` 本身是事件对象，可重复添加，也可用 removeEventListener 移除。
   *
   * 注意：监听器拿到的是**事件对象**，数据在 `event.detail` 里；
   * 全局钩子 `onHello(info)` 才直接拿 info。
   * ```js
   * Coconut.addEventListener('hello', (event) => {
   *   const tools = event.detail.tools;
   * });
   * ```
   */
  addEventListener<K extends CoconutLifecycleEventName>(
    type: K,
    listener: (event: CoconutEventObject<CoconutLifecycleEventMap[K]>) => void | Promise<void>,
    options?: CoconutAddEventListenerOptions,
  ): this;
  removeEventListener<K extends CoconutLifecycleEventName>(
    type: K,
    listener: (event: CoconutEventObject<CoconutLifecycleEventMap[K]>) => void | Promise<void>,
  ): this;

  /**
   * 定时器都在插件线程的事件循环里跑，钩子会等它们跑完；
   * 回调调用时**不带参数**（只是为了能塞 Promise 的 resolve，才允许声明入参）。
   */
  setTimeout(handler: (...args: unknown[]) => void, ms?: number): number;
  setInterval(handler: (...args: unknown[]) => void, ms?: number): number;
  clearTimeout(id: number): void;
  clearInterval(id: number): void;
}

/* ───────────────────────────── 全局声明 ───────────────────────────── */

declare global {
  /** 插件上下文（见上）。 */
  const Coconut: CoconutContext;

  /**
   * 插件钩子。**按需定义**即可，没定义的钩子等于空实现。
   * 定义成普通 function / async function 都行。
   */
  var onStart: (() => void | Promise<void>) | undefined;
  var onHello: ((info: CoconutHelloInfo) => void | Promise<void>) | undefined;
  var onEvent: ((event: CoconutEvent) => void | Promise<void>) | undefined;
  /** 页面会话结束（关闭 / 重载 / 回到启动器）：清浮层、断连接就在这里做。 */
  var onBye: ((info?: { session?: string }) => void | Promise<void>) | undefined;
  var onStop: (() => void | Promise<void>) | undefined;

  /* JSX：`.jsx` / `.tsx` 里写普通 HTML 标签即可（由 plugin-api/jsx.ts 的 h() 认领），
     JSX 表达式产出 HTML 片段，直接给 Coconut.ui.overlay({ html })。
     浮层 CSS 用 `css` 标签模板、页面脚本用 `script` 标签模板（都从 jsx.ts 导入）：
       const view = <div class='card'>{title}</div>;
       const skin = css`.card { color: #fff }`;
       const boot = script`document.body.dataset.ready = '1'`;
     旧写法 <html> / <style> / <script> 仍然兼容，但不建议在新代码里用。

     下面这些属性类型只是为了**补全**：写着 `[attribute: string]: unknown` 兜底，
     所以拼错的属性不会报错，但常用标签 / 属性会有提示。 */
  namespace JSX {
    /** JSX 表达式的结果：HTML 片段（`Markup`，可当字符串用）。 */
    type Element = CoconutJsxChunk<'html'>;
    interface ElementChildrenAttribute {
      children: unknown;
    }
    /** 行内样式：`style={{ left: '1px' }}` → `left:1px`。 */
    interface CoconutJsxStyle {
      [property: string]: string | number | null | undefined | false;
    }
    /** 所有 HTML 标签共用的属性。浮层是静态 HTML，所以没有事件属性。 */
    interface CoconutJsxProps {
      children?: unknown;
      class?: string;
      className?: string;
      id?: string;
      title?: string;
      role?: string;
      lang?: string;
      dir?: string;
      hidden?: boolean;
      tabIndex?: number;
      tabindex?: number;
      style?: CoconutJsxStyle | string;
      [attribute: string]: unknown;
    }
    interface CoconutJsxAnchorProps extends CoconutJsxProps {
      href?: string;
      target?: string;
      rel?: string;
      download?: string | boolean;
    }
    interface CoconutJsxImageProps extends CoconutJsxProps {
      src?: string;
      alt?: string;
      width?: number | string;
      height?: number | string;
      loading?: 'lazy' | 'eager';
      decoding?: 'sync' | 'async' | 'auto';
    }
    interface CoconutJsxInputProps extends CoconutJsxProps {
      type?: string;
      name?: string;
      value?: string | number;
      placeholder?: string;
      checked?: boolean;
      disabled?: boolean;
      readonly?: boolean;
      min?: string | number;
      max?: string | number;
      step?: string | number;
    }
    interface CoconutJsxButtonProps extends CoconutJsxProps {
      type?: 'button' | 'submit' | 'reset';
      name?: string;
      value?: string;
      disabled?: boolean;
    }
    interface CoconutJsxLabelProps extends CoconutJsxProps {
      for?: string;
      htmlFor?: string;
    }
    interface CoconutJsxOptionProps extends CoconutJsxProps {
      value?: string;
      selected?: boolean;
      disabled?: boolean;
    }
    interface CoconutJsxCellProps extends CoconutJsxProps {
      colspan?: number;
      rowspan?: number;
      colSpan?: number;
      rowSpan?: number;
    }
    interface CoconutJsxMetaProps extends CoconutJsxProps {
      charset?: string;
      name?: string;
      content?: string;
      httpEquiv?: string;
    }
    interface CoconutJsxLinkProps extends CoconutJsxProps {
      rel?: string;
      href?: string;
      type?: string;
      crossorigin?: string;
    }
    interface CoconutJsxSvgProps extends CoconutJsxProps {
      viewBox?: string;
      width?: number | string;
      height?: number | string;
      fill?: string;
      stroke?: string;
    }
    interface IntrinsicElements {
      a: CoconutJsxAnchorProps;
      img: CoconutJsxImageProps;
      input: CoconutJsxInputProps;
      button: CoconutJsxButtonProps;
      label: CoconutJsxLabelProps;
      option: CoconutJsxOptionProps;
      td: CoconutJsxCellProps;
      th: CoconutJsxCellProps;
      meta: CoconutJsxMetaProps;
      link: CoconutJsxLinkProps;
      svg: CoconutJsxSvgProps;

      /* 兼容旧写法的三个裸标签（见 plugin-api/jsx.ts 顶部说明） */
      html: CoconutJsxProps;
      style: CoconutJsxProps;
      script: CoconutJsxProps;

      /* 其余常用标签：属性走同一套兜底类型 */
      div: CoconutJsxProps;
      span: CoconutJsxProps;
      p: CoconutJsxProps;
      b: CoconutJsxProps;
      i: CoconutJsxProps;
      em: CoconutJsxProps;
      strong: CoconutJsxProps;
      small: CoconutJsxProps;
      u: CoconutJsxProps;
      s: CoconutJsxProps;
      code: CoconutJsxProps;
      pre: CoconutJsxProps;
      br: CoconutJsxProps;
      hr: CoconutJsxProps;
      ul: CoconutJsxProps;
      ol: CoconutJsxProps;
      li: CoconutJsxProps;
      h1: CoconutJsxProps;
      h2: CoconutJsxProps;
      h3: CoconutJsxProps;
      h4: CoconutJsxProps;
      h5: CoconutJsxProps;
      h6: CoconutJsxProps;
      section: CoconutJsxProps;
      header: CoconutJsxProps;
      footer: CoconutJsxProps;
      nav: CoconutJsxProps;
      main: CoconutJsxProps;
      aside: CoconutJsxProps;
      article: CoconutJsxProps;
      form: CoconutJsxProps;
      fieldset: CoconutJsxProps;
      legend: CoconutJsxProps;
      select: CoconutJsxProps;
      textarea: CoconutJsxProps;
      table: CoconutJsxProps;
      thead: CoconutJsxProps;
      tbody: CoconutJsxProps;
      tfoot: CoconutJsxProps;
      tr: CoconutJsxProps;
      colgroup: CoconutJsxProps;
      canvas: CoconutJsxProps;
      video: CoconutJsxProps;
      audio: CoconutJsxProps;
      source: CoconutJsxProps;
      iframe: CoconutJsxProps;

      /** 其它标签按普通 HTML 属性处理 */
      [tag: string]: CoconutJsxProps;
    }
  }

  /* 这几个宿主 API 都**没有**：fetch / URL / URLSearchParams / TextEncoder /
     TextDecoder / atob / btoa / structuredClone / crypto / Buffer / process /
     require / import。要发请求请用 Coconut.fetch，要编码请自己写。 */

  /* console.* / setTimeout / setInterval / clearTimeout / clearInterval /
     queueMicrotask 沿用 `lib.dom` 的声明（类型一样），运行时由启动器提供：
     - console.* 只进内置调试终端（不写日志文件），console.clear 清空终端；
     - Coconut.log 才写插件日志文件；
     - 定时器是插件线程自己的事件循环，回调**不带参数**；
     - 其余宿主 API 一律没有，见上面那段注释。 */
}

export {};
