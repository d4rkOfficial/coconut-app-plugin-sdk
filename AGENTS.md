# AGENTS.md · 椰果工具箱启动器插件 SDK

本文件是**在这个仓库里干活的第一入口**（人 / AI 都适用）。读完这一份就能开工； `Coconut` API
的完整细节看 [`docs/plugin-api.md`](docs/plugin-api.md)，别在别处猜。

## 0. 这是什么

- 这个仓库是**插件侧 SDK**：模块化源码 → `deno task build` 压成单个 `.js` → 放进启动器插件目录 → 3
  秒热重载。
- 工具链只有 **Deno**（没有 `package.json`、不跑 `npm install`）。esbuild 通过 `npm:esbuild`
  自动拉取。
- 启动器本体（Tauri 外壳 + 工具箱）**不在**这个仓库，不要在这里找/改它。
- 插件是跑在启动器进程内、独立线程里的 **QuickJS 脚本**，只能通过全局 `Coconut` 读页面、调工具、发
  HTTP、画浮层、写日志。**不是浏览器扩展**，碰不到页面的 JS 上下文。

最小阅读顺序：本文件 → `examples/` 里最接近需求的示例 → `docs/plugin-api.md` 对应小节。

## 1. 硬规则（违反 = 插件不工作，别靠运行时兜底）

| #  | 规则                                                                                                                      | 为什么                                                                   |
| -- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1  | 产物必须**单文件**；运行时没有 `import` / `export` / `require`                                                            | QuickJS 无模块系统。源码可以随便 `import`，`deno task build` 会内联      |
| 2  | 生命周期用 `Coconut.addEventListener('hello', fn)` 注册（推荐），或写成 `async function onHello() {}` **函数声明** | `const onHello = …` 会让宿主找不到；监听器写法不用挂全局 |
| 3  | 用全局钩子时，入口末尾必须把钩子**挂到 `globalThis`**                                                              | 打包成 IIFE 后函数声明不在全局作用域，宿主只在 `globalThis` 上找 |
| 4  | 文件开头保留 `// @name …` 头部（UTF-8 **无 BOM**）                                                                        | `minify` 删注释，构建脚本靠它贴回 banner；带 BOM 首行注释会读丢          |
| 5  | 只用 ES2020；没有 `fetch` / `URL` / `TextEncoder` / `atob` / `btoa` / `crypto` / `structuredClone` / `process` / `Buffer` | 运行时只有 ES2020 标准库子集 + `Coconut`                                 |
| 6  | 用了哪个能力就申请哪个权限（Rust 侧硬校验，直接抛错）                                                                     | 见第 4 节权限表                                                          |
| 7  | 单个钩子 **10 秒**上限；连续 **3 次抛错**自动停用                                                                         | 别忙等、别在钩子里跑重活；异常自己 `try/catch` 并写日志                  |
| 8  | `onHello` 每次页面就绪都会触发（刷新 / WS 重连），**必须可重复执行**                                                      | 别在里面做不可重入的事（重复注册、重复写配置）                           |
| 9  | `onStart` 里**不能** `runJs` / 画浮层                                                                                     | 那时工具箱页面可能还没打开                                               |
| 10 | 插件目录里**文件名 = 插件 id**；用户项目放 `dev/<id>/`，`examples/` 只放官方示例                                          | 卡片名、存储文件名、`state.json` 键都跟着它                              |
| 11 | 注入页面的代码写成普通函数放 `page/*.dom.js` / `*.dom.ts`，**完全自包含**，直接用 `Coconut.toolbox.runJs(fn, ...args)` 调用 | 只有函数本体被序列化进页面，模块作用域（import、顶层常量）在页面里不存在 |

## 2. 目录与命令

```text
dev/<id>/index.js         ← 用户项目入口：头部元数据 + 生命周期 + 装配（`.ts` / `.jsx` / `.tsx` 也行）
dev/<id>/test.js          ← 用户测试入口（`deno task test` 跑；模板自带）
dev/<id>/*.js             ← 按功能拆的模块（state / api / render / sync / …）
dev/<id>/*.jsx            ← 浮层 HTML + css / script 标签模板（见第 6 节）
dev/<id>/page/*.dom.js    ← 注入页面的自包含函数（TypeScript 可用 `.dom.ts`）
examples/<id>/            ← 官方示例（只读参考，build/check/test:examples 也会跑）
templates/plugin/         ← `deno task new` 用的骨架（index.js / overlay.jsx / test.js / deno.json）
tests/harness.ts          ← 测试沙箱：假 DOM + 假 Coconut + loadPlugin + 断言
tests/examples.test.ts    ← 官方示例回归测试（deno task test:examples）
plugin-api/*.d.ts         ← API 类型（本仓库为准；tools.d.ts 只由 deno task tools 生成）
docs/plugin-api.md        ← API 规范原文
scripts/*.ts              ← build / dev / deploy / pull / new / check / test / clean
dist/<id>.js              ← 产物（gitignored）
```

| 命令                     | 用途                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------- |
| `deno task new <id>`     | 从模板新建插件到 `dev/<id>/`（`--name` / `--permissions` 可选）                     |
| `deno task check`        | 静态自查：头部 / 权限 / 生命周期 / 禁用宿主 API / **`.dom.js` 自包含**（**改完必跑**） |
| `deno task build`        | 打包全部（dev + examples）→ `dist/`（压缩）；`deno task build <id>` 只打一个         |
| `deno task build:plain`  | 不压缩产物（看堆栈 / 排查）                                                         |
| `deno task dev <id>`     | 监听 + 打包 + **部署到启动器**（热重载；会覆盖同名插件）                            |
| `deno task deploy <id>`  | 一次性安装 `dist/<id>.js`（`--dry` 只打印）                                         |
| `deno task pull <id>`    | 把启动器里已安装的插件拉回 `dev/<id>`                                               |
| `deno task test`         | 跑 `dev/<id>/test.js`（先自动打包；没有 test.js 就跳过）                            |
| `deno task test:examples`| 官方示例的回归测试（**不是**用户测试）                                              |
| `deno task typecheck`    | `deno check`（示例 / 模板 / 脚本 / 测试）                                           |
| `deno task verify`       | fmt 检查 + lint + 自查 + 类型 + 打包 + 示例测试 + 用户测试（提交前一把梭）          |

插件目录默认 `%APPDATA%\com.coconut.launcher\plugins`，可用 `--dir <目录>` 或 `COCONUT_PLUGINS_DIR`
覆盖。

## 3. 模块划分约定

- **入口 `index.js`**：头部元数据 + 生命周期（`Coconut.addEventListener('start'|'hello'|'event'|'bye'|'stop', fn)`，
  或全局钩子 `onStart/onHello/onEvent/onBye/onStop`）+ 把模块装配起来。
  主循环、调度这类「流程」可以留在入口，但不要往里堆算法和渲染。
- **状态**：放一个 `state.js`，导出**一个可变对象**（`export const st = { … }`）。 ES 模块的
  `export let` 在别的模块里不能赋值，所以统一改 `st.xxx`。
- **纯逻辑**（快照、几何、配置空间、渲染字符串）单独成文件，不碰 `Coconut`，方便测。
- **宿主调用**统一收敛到一个 `api.js`（工具调用封装、预算、日志），别到处散 `Coconut.tools.call`。
- **页面脚本**：`page/<作用>.dom.js`（TypeScript 可写 `.dom.ts`），一文件一个功能函数，**直接传**给
  `Coconut.toolbox.runJs`；不再需要 `pageCall` / `page/run.js`。页面脚本里 **不要 `import`、
  不要顶层 `const/let/var`**——把数据用参数传进去。
- **浮层/页面片段**：优先写成 `.jsx`：JSX 只写 HTML（顶层标签直接是片段），CSS / 页面脚本用
  `css` / `script` 标签模板（见第 6 节）。
- **测试**：`dev/<id>/test.js` 用 `tests/harness.ts` 的假宿主跑（见第 2 节命令）。
- 命名与注释用中文，跟现有示例保持一致；每个文件顶部一句话说明职责。

## 4. 权限

| 权限      | 解锁                                                                | 典型触发                                        |
| --------- | ------------------------------------------------------------------- | ----------------------------------------------- |
| `dom`     | `Coconut.toolbox.runJs`、`ui.overlay` 的 `script` 片段              | 读写页面、拿 DOM 几何、IndexedDB                |
| `toolbox` | `Coconut.tools.call`、`Coconut.toolbox.exit`                        | 调工具箱工具（配装/排轴/拉表/设置…）            |
| `network` | `Coconut.fetch`、`Coconut.webSocket`                                | 由启动器代发 HTTP（无 CORS）、连 WS             |
| `storage` | `Coconut.storage.*`                                                 | 插件私有 KV（落盘 `plugins/storage/<id>.json`） |
| `ui`      | `Coconut.ui.*`（`overlay` / `injectCss` / `requestAnimationFrame`） | 浮层、注入 CSS、低频 rAF                        |
| `server`  | `Coconut.http.createServer`                                         | 开本地 HTTP / WebSocket 服务（事件对象）        |
| `debug`   | `onEvent` / `addEventListener('frame')` 的原始 WS 帧                | 只在开发时开，发布前删                          |

`Coconut.log` / `console.*` / 定时器不需要权限。`deno task check` 会用文本匹配核对 「用了 API ⇄
声明了权限」，报错就补 `@permissions`。

`Coconut` 本身是事件对象：`Coconut.addEventListener('start'|'hello'|'event'|'bye'|'stop', fn)`
与五个全局钩子等价，可叠加、可 `removeEventListener`。**监听器拿到的是事件对象，数据在
`event.detail`**（全局钩子 `onHello(info)` 才直接拿 info）。`Coconut.http.createServer()` /
`Coconut.webSocket(url)` / `Coconut.tools` 返回的也都是同一种事件对象。

**废弃**：`Coconut.runJs`、`Coconut.callTool` 仍可运行（第一次调用会 `console.warn`），但类型声明
已注释掉——新代码用 `Coconut.toolbox.runJs` / `Coconut.tools.call`。

## 5. `Coconut` 速查

| 成员                                        | 说明                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `Coconut.plugin`                            | `{ id, name, version, mount, permissions }`，只读                                                |
| `Coconut.toolbox.runJs(code\|fn, ...args)`  | 页面里执行，返回**真实值**；函数必须是自包含的同步函数                                           |
| `Coconut.toolbox.exit()`                    | 回到启动器首页（需要 `toolbox`）                                                                 |
| `Coconut.tools.call(name, args?, {signal})` | 异步调工具，返回 Promise；不阻塞插件线程，可 `AbortSignal` 中止                                  |
| `Coconut.tools`                             | 事件对象：`result` / `error`（`detail` 带 `tool/result/error/ms`）                               |
| `Coconut.fetch(url, opts?)`                 | `{ status, ok, headers, body, json }`；无超时参数                                                |
| `Coconut.http.createServer(opts)`           | 返回事件对象：`request` / `connection`；`port` / `close()`；需要 `server`                        |
| `Coconut.webSocket(url)`                    | 返回事件对象：`open` / `message` / `close`；`send()` / `close()`；需要 `network`                 |
| `Coconut.addEventListener`                  | 生命周期事件 `start` / `hello` / `event` / `bye` / `stop`，配 `removeEventListener`              |
| `Coconut.storage`                           | `get/set/delete/all`；值必须 JSON 可序列化                                                       |
| `Coconut.ui`                                | `overlay({html,css})` → id；`show/hide/visible/remove(id)`；`injectCss`；`requestAnimationFrame` |
| `Coconut.launcher`                          | `lang` / `toolboxVersion` / `gameVersion`                                                        |
| `Coconut.src`                               | `toolbox.{dir,url}`、`static.{dir,url}`（给 `fetch` / `<img src>` 用 `.url`）                    |
| `Coconut.log(...)` / `console.*`            | `Coconut.log` 写日志文件；`console.*` 只进内置调试终端（`console.clear` 清空）                   |
| `Coconut.sleep(ms)` / 定时器                | 定时器回调**不带参数**                                                                           |
| `Coconut.Event` / `EventTarget`             | 事件对象构造器（也可用全局 `Event` / `EventTarget` / `AbortController`）                         |

浮层要点：容器铺满视口且 **`pointer-events: none`**（要点击的元素自己写 `auto`）； **z-index
由引擎编排**（后注册的盖住先注册的），插件不能也不该指定层级。

## 6. JSX（`.jsx` / `.tsx`）

**一个标签只干一件事**：JSX 只写 HTML，CSS / 页面脚本用标签模板。任意 JSX 表达式（顶层 `<div>`
即可，不用包 `<html>`）产出 `Markup`，直接给 `ui.overlay({ html })`：

```jsx
import { css, h, script } from '../../plugin-api/jsx.ts'; // h 是 JSX 工厂，必须导入

const view = <div class='card'>{title}</div>; // → Coconut.ui.overlay({ html: view })
const skin = css`.card { color: #fff }`; // → Coconut.ui.overlay({ css: skin })
const boot = script`document.body.dataset.ready = '1'`; // → Coconut.toolbox.runJs(boot)
```

- `css` / `script` 的内容**原样取**，不转义（`script` 里是函数体，要自己 `return`）；
- JSX 的文本子节点 / `{}` 插值会自动转义 `< > &`；嵌套片段不会二次转义；
- 插入现成 HTML 用 `html` 标签模板或 `raw()`；
- 片段对象是 `{ __coconut: 'script'|'html'|'css', text }`，`String(chunk)` 也能拿到文本；
- 兼容旧写法 `<html>` / `<style>` / `<script>`（行为不变），但新代码别再用了；
- 文件扩展名用 `.jsx` / `.tsx`（`.js` 里写 JSX 会按普通 JS 解析而报错）；
- 类型补全：模板 `templates/plugin/deno.json` 已接好 `plugin-api` 类型与 `jsxFactory`，
  `deno task new` 会把它复制到 `dev/<id>/deno.json`。

## 7. `tools.d.ts`：工具名与入参类型

`Coconut.tools.call` 返回 `Promise<unknown>`。工具名会被补全、参数会被校验，返回值自己断言：

```js
/** @type {{ total?: number, entries?: Array<{ character?: string, damage?: number }> }} */
const summary = (await Coconut.tools.call('get_result_summary', { summaryOnly: true })) || {};
```

- 工具清单来自工具箱包体；工具箱更新后 `deno task tools` 重新生成。
- 刚出的新工具还没生成类型时：`Coconut.tools.call(/** @type {any} */ ('新工具'), {})`。
- 先传 `{}` 摸清返回结构，再回来补断言。

## 8. 页面脚本（最容易被改坏的地方）

```js
// page/apply.dom.js —— 只有函数本体进页面：不 import、不引用模块级常量
export function applyScramble(pool) {
  /* 只用页面全局：document / window / indexedDB / MutationObserver … */
  return { ok: true }; // 返回对象/字符串都行，插件侧拿到的就是真实值
}

// index.js
import { applyScramble } from './page/apply.dom.js';

const data = await Coconut.toolbox.runJs(applyScramble, charPool); // 参数会 JSON 序列化
```

- 函数会跟着插件一起被压缩，`toString()` 拿到的仍是有效代码——所以**别依赖函数名/变量名可读**。
- 需要模块里的数据（字符池、配置）就用参数传，别直接引用。
- `deno task check` 会在沙箱里跑一遍这些函数，抓「忘了传参数 / 引用了页面没有的全局」。
- 页面脚本可以是 `async`（真实宿主会等它 resolve）；插件侧 `await` 一下最稳。
- 判断 DOM 时必须能忍「工具箱还没渲染」：找不到元素就早返回，别抛错（浮层因异常闪一下很常见）。

## 9. 调试

- **插件日志**：`%APPDATA%\com.coconut.launcher\logs\plugins.log`，只有 `Coconut.log` 写这里
  （每次打开工具箱换新文件，旧的滚成 `plugins-<时间>.log`，保留最近 10 份）。
- **调试终端**：工具箱页面 `Ctrl+T`（或 `` Ctrl+` ``），可读写；`console.*` 只进这里， `Tab`
  切换插件层 / DOM 层，括号闭合回车运行、未闭合回车换行。
- **插件弹窗**：标题栏右上角 ✕ / `Esc` 关闭；可按名称 / id / 描述 / 权限搜索，按 「全部 / 已启用 /
  已停用 / 异常」筛选，一键全部启用 / 全部停用；每行是启用开关 + 重载，
  错误次数和最后一次错误直接显示在行内（删文件请自己进插件目录）。
- **状态文件**：`plugins/state.json`（启用状态）、`plugins/storage/<id>.json`（插件存储）。
- **启动器 panic**：`%APPDATA%\com.coconut.launcher\panic.log`。
- 改完先 `deno task check`，再 `deno task build`（`build:plain` 排错），再 `deno task test <id>`
  （官方示例是 `deno task test:examples`）。

## 10. 常见坑

| 症状                                      | 原因 / 处理                                                         |
| ----------------------------------------- | ------------------------------------------------------------------- |
| 插件「加载失败」                          | 语法错误、带 BOM、头部被顶掉 → `deno task check <id>`               |
| 生命周期完全没被调用                      | 写成 `const onHello = …`、忘了挂 `globalThis`，或监听器事件名拼错（`start/hello/event/bye/stop`）→ `deno task check <id>` |
| 打包后不执行但源码没事                    | 用了全局钩子却忘了 `globalThis.onX = onX`（IIFE 作用域）            |
| `runJs` 返回 `"null"`                     | 代码里没有 `return`；它永远返回字符串，对象要自己 `JSON.stringify`  |
| 报「工具箱页面还没打开」                  | 在 `onStart` 里 `runJs` 了；挪到 `onHello` 或轮询重试               |
| 页面脚本报 `x is not defined`             | `.dom.js` 引用了模块作用域变量/忘了传参 → 改成参数传入              |
| 连续 3 次报错被停用                       | 生命周期回调抛异常；卡片上看最后一次错误，修完点「启用」            |
| 回调「超过 10s 未返回」                   | 死循环 / 等不会完成的 Promise；用定时器别忙等                       |
| `Coconut.log(obj)` 打出 `[object Object]` | 用 `Coconut.log(JSON.stringify(obj))`，或 `console.log`（只进终端） |
| 浮层里的按钮点了没反应                    | 浮层默认 `pointer-events: none`，交互元素加 `auto`                  |
| 改了文件没生效                            | 启动器 3 秒扫描；也可以点「重载」/「重新扫描」                      |

## 11. 完成前自检（必须全过）

```powershell
deno task check:strict      # 头部/权限/生命周期/禁用 API/.dom.js 自包含，零错误零提示
deno task build <id>        # 产物能打出来（默认压缩）
deno task test <id>         # dev/<id>/test.js（假宿主）；示例用 deno task test:examples
deno task verify            # 或者一把梭：fmt + lint + check + typecheck + build + test:examples + test
```

外加人工确认：

1. 产物 `dist/<id>.js` 开头仍是 `// @name …` 头部，UTF-8 无 BOM；
2. 启动器插件卡片里「已启用」、错误次数 0；
3. `Ctrl+T` 里能看到你写的日志，`onStop` 后浮层/定时器/注入的 CSS 都收干净了；
4. 只申请了真正用到的权限（`debug` 一定没有）。

## 12. 护栏

- **不要擅自运行 `deno task dev` / `deno task deploy`**：它们会覆盖启动器插件目录里用户正在用的
  插件。需要真机验证先和用户确认，或 `--dir` 指到空目录。
- `plugin-api/` 与 `docs/plugin-api.md` 已由本仓库维护（启动器 `main` 不再带这个目录）；
  `tools.d.ts` 只跑 `deno task tools` 重新生成，别手改。
- 不要「顺手重构」示例的行为——它们是用户正在用的插件，改动要有明确需求；
  纯拆分/搬文件时必须保证行为等价，并用 `deno task test:examples` 验证。
- 不要引入运行时依赖（QuickJS 里没有 Node 环境）；esbuild 只作为构建期依赖。
- 保持 `@mount` 与实际一致（用浮层写 `overlay`），文件行尾 LF、UTF-8 无 BOM。
- `dist/` 不入库；提交前确认 `git status` 里没有产物和 `node_modules`。

## 13. 相关文件索引

| 想知道                             | 看                                                                 |
| ---------------------------------- | ------------------------------------------------------------------ |
| API 完整语义、权限细节、运行时边界 | [`docs/plugin-api.md`](docs/plugin-api.md)                         |
| `Coconut` 类型定义                 | [`plugin-api/coconut-plugin.d.ts`](plugin-api/coconut-plugin.d.ts) |
| 工具箱工具的参数类型               | [`plugin-api/tools.d.ts`](plugin-api/tools.d.ts)                   |
| 打包细节（IIFE / banner / 压缩）   | [`scripts/build.ts`](scripts/build.ts)                             |
| 自查规则（含 `.dom.js` 沙箱检查）  | [`scripts/check.ts`](scripts/check.ts)                             |
| 测试沙箱（假宿主 / 假页面 / 断言） | [`tests/harness.ts`](tests/harness.ts)                             |
| 官方示例回归测试                   | [`tests/examples.test.ts`](tests/examples.test.ts)                 |
| 现成的真实插件写法                 | `examples/*/index.js` 与 `examples/*/page/`                        |
