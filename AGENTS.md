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
| 2  | 钩子必须写成 `async function onHello() {}` 这种**函数声明**                                                               | `const onHello = …` 会让宿主找不到钩子                                   |
| 3  | 入口文件末尾必须把钩子**挂到 `globalThis`**                                                                               | 打包成 IIFE 后函数声明不在全局作用域，宿主只在 `globalThis` 上找         |
| 4  | 文件开头保留 `// @name …` 头部（UTF-8 **无 BOM**）                                                                        | `minify` 删注释，构建脚本靠它贴回 banner；带 BOM 首行注释会读丢          |
| 5  | 只用 ES2020；没有 `fetch` / `URL` / `TextEncoder` / `atob` / `btoa` / `crypto` / `structuredClone` / `process` / `Buffer` | 运行时只有 ES2020 标准库子集 + `Coconut`                                 |
| 6  | 用了哪个能力就申请哪个权限（Rust 侧硬校验，直接抛错）                                                                     | 见第 4 节权限表                                                          |
| 7  | 单个钩子 **10 秒**上限；连续 **3 次抛错**自动停用                                                                         | 别忙等、别在钩子里跑重活；异常自己 `try/catch` 并写日志                  |
| 8  | `onHello` 每次页面就绪都会触发（刷新 / WS 重连），**必须可重复执行**                                                      | 别在里面做不可重入的事（重复注册、重复写配置）                           |
| 9  | `onStart` 里**不能** `runJs` / 画浮层                                                                                     | 那时工具箱页面可能还没打开                                               |
| 10 | 插件目录里**文件名 = 插件 id**；示例目录名必须等于产物 id                                                                 | 卡片名、存储文件名、`state.json` 键都跟着它                              |
| 11 | 注入页面的代码必须放 `page/*.dom.js`，且**完全自包含**                                                                    | 只有函数本体被序列化进页面，模块作用域（import、顶层常量）在页面里不存在 |

## 2. 目录与命令

```text
examples/<id>/index.js    ← 入口：头部元数据 + 钩子 + 装配（保持短）
examples/<id>/*.js        ← 按功能拆的模块（state / api / render / sync / …）
examples/<id>/page/*.dom.js ← 注入页面的自包含函数
examples/<id>/page/run.js   ← pageCall：把页面函数序列化成 runJs 代码
templates/plugin/index.js   ← `deno task new` 用的骨架
plugin-api/*.d.ts           ← API 类型（上游同步，勿手改勿格式化）
docs/plugin-api.md          ← 上游 API 规范原文
scripts/*.ts                ← build / dev / deploy / pull / new / check / test / clean
dist/<id>.js                ← 产物（gitignored）
```

| 命令                    | 用途                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `deno task new <id>`    | 从模板新建插件（`--name` / `--permissions` 可选）                                  |
| `deno task check`       | 静态自查：头部 / 权限 / 钩子 / 禁用宿主 API / **`.dom.js` 自包含**（**改完必跑**） |
| `deno task build`       | 打包全部 → `dist/`（压缩）；`deno task build <id>` 只打一个                        |
| `deno task build:plain` | 不压缩产物（看堆栈 / 排查）                                                        |
| `deno task dev <id>`    | 监听 + 打包 + **部署到启动器**（热重载；会覆盖同名插件）                           |
| `deno task deploy <id>` | 一次性安装 `dist/<id>.js`（`--dry` 只打印）                                        |
| `deno task pull <id>`   | 把启动器里已安装的插件拉回 `examples/<id>`                                         |
| `deno task test`        | 冒烟测试：假宿主 + 假页面跑打包产物（改了页面脚本/钩子就值得跑）                   |
| `deno task typecheck`   | `deno check`（示例 / 模板 / 脚本）                                                 |
| `deno task verify`      | fmt 检查 + lint + 自查 + 类型 + 打包 + 测试（提交前一把梭）                        |

插件目录默认 `%APPDATA%\com.coconut.launcher\plugins`，可用 `--dir <目录>` 或 `COCONUT_PLUGINS_DIR`
覆盖。

## 3. 模块划分约定

- **入口 `index.js`**：头部元数据 + 钩子（`onStart/onHello/onEvent/onStop`）+ 把模块装配起来。
  主循环、调度这类「流程」可以留在入口，但不要往里堆算法和渲染。
- **状态**：放一个 `state.js`，导出**一个可变对象**（`export const st = { … }`）。 ES 模块的
  `export let` 在别的模块里不能赋值，所以统一改 `st.xxx`。
- **纯逻辑**（快照、几何、配置空间、渲染字符串）单独成文件，不碰 `Coconut`，方便测。
- **宿主调用**统一收敛到一个 `api.js`（工具调用封装、预算、日志），别到处散 `Coconut.callTool`。
- **页面脚本**：`page/<作用>.dom.js`，一文件一个功能函数；`page/run.js` 里放 `pageCall`。 `.dom.js`
  里 **不要 `import`、不要顶层 `const/let/var`**——把数据用参数传进去。
- 命名与注释用中文，跟现有示例保持一致；每个文件顶部一句话说明职责。

## 4. 权限

| 权限      | 解锁                                               | 典型触发                                        |
| --------- | -------------------------------------------------- | ----------------------------------------------- |
| `dom`     | `Coconut.runJs`、`ui.overlay`、`ui.injectCss`      | 读写页面、拿 DOM 几何、IndexedDB                |
| `toolbox` | `Coconut.callTool`                                 | 调工具箱工具（配装/排轴/拉表/设置…）            |
| `network` | `Coconut.fetch`                                    | 由启动器代发 HTTP（无 CORS）                    |
| `storage` | `Coconut.storage.*`                                | 插件私有 KV（落盘 `plugins/storage/<id>.json`） |
| `ui`      | `Coconut.ui.*`（`overlay`/`injectCss` 另需 `dom`） | 浮层、注入 CSS                                  |
| `debug`   | `onEvent` 里的原始 WS 帧                           | 只在开发时开，发布前删                          |

`Coconut.log` / `console.*` / 定时器不需要权限。`deno task check` 会用文本匹配核对 「用了 API ⇄
声明了权限」，报错就补 `@permissions`。

## 5. `Coconut` 速查

| 成员                             | 说明                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------- |
| `Coconut.plugin`                 | `{ id, name, version, mount, permissions }`，只读                               |
| `Coconut.runJs(code)`            | 页面里执行**函数体**（自己 `return`），返回字符串（异步页面脚本也等得到结果）   |
| `Coconut.callTool(name, args?)`  | 调工具箱工具，返回 `unknown`；报错抛异常                                        |
| `Coconut.fetch(url, opts?)`      | `{ status, ok, headers, body, json }`；无超时参数                               |
| `Coconut.storage`                | `get/set/delete/all`；值必须 JSON 可序列化                                      |
| `Coconut.ui`                     | `overlay({html,css})` → id；`show/hide/visible/remove(id)`；`injectCss(id,css)` |
| `Coconut.launcher`               | `lang` / `toolboxVersion` / `gameVersion`                                       |
| `Coconut.src`                    | `toolbox.{dir,url}`、`static.{dir,url}`（给 `fetch` / `<img src>` 用 `.url`）   |
| `Coconut.log(...)` / `console.*` | 写插件日志；`Coconut.log` 用 `String()` 拼参（对象会变 `[object Object]`）      |
| `Coconut.sleep(ms)` / 定时器     | 定时器回调**不带参数**                                                          |

浮层要点：容器铺满视口且 **`pointer-events: none`**（要点击的元素自己写 `auto`）； **z-index
由引擎编排**（后注册的盖住先注册的），插件不能也不该指定层级。

## 6. `tools.d.ts`：工具名与入参类型

`Coconut.callTool` 返回 `unknown`。工具名会被补全、参数会被校验，返回值自己断言：

```js
/** @type {{ total?: number, entries?: Array<{ character?: string, damage?: number }> }} */
const summary = Coconut.callTool('get_result_summary', { summaryOnly: true }) || {};
```

- 工具清单来自工具箱包体；工具箱更新后 `deno task tools` 重新生成。
- 刚出的新工具还没生成类型时：`Coconut.callTool(/** @type {any} */ ('新工具'), {})`。
- 先传 `{}` 摸清返回结构，再回来补断言。

## 7. 页面脚本（最容易被改坏的地方）

```js
// page/apply.dom.js —— 只有函数本体进页面：不 import、不引用模块级常量
export function applyScramble(pool) {
  /* 只用页面全局：document / window / indexedDB / MutationObserver … */
  return JSON.stringify({ ok: true });
}

// index.js
import { applyScramble } from './page/apply.dom.js';
import { pageCall } from './page/run.js';

const raw = await Coconut.runJs(pageCall(applyScramble, charPool)); // 参数会 JSON 序列化
const data = JSON.parse(raw);
```

- 函数会跟着插件一起被压缩，`toString()` 拿到的仍是有效代码——所以**别依赖函数名/变量名可读**。
- 需要模块里的数据（字符池、配置）就用参数传，别直接引用。
- `deno task check` 会在沙箱里跑一遍这些函数，抓「忘了传参数 / 引用了页面没有的全局」。
- 判断 DOM 时必须能忍「工具箱还没渲染」：找不到元素就早返回，别抛错（浮层因异常闪一下很常见）。

## 8. 调试

- **插件日志**：`%APPDATA%\com.coconut.launcher\logs\plugins.log`（每次打开工具箱换新文件， 旧的滚成
  `plugins-<时间>.log`，保留最近 10 份）。
- **只读 Console**：工具箱页面 `Ctrl+T`（或 `` Ctrl+` ``），「插件日志 / 启动器日志」两栏。
- **插件弹窗**：标题栏右上角 ✕ / `Esc` 关闭；可按名称 / id / 描述 / 权限搜索，按 「全部 / 已启用 /
  已停用 / 异常」筛选，一键全部启用 / 全部停用；每行是启用开关 + 重载，
  错误次数和最后一次错误直接显示在行内（删文件请自己进插件目录）。
- **状态文件**：`plugins/state.json`（启用状态）、`plugins/storage/<id>.json`（插件存储）。
- **启动器 panic**：`%APPDATA%\com.coconut.launcher\panic.log`。
- 改完先 `deno task check`，再 `deno task build`（`build:plain` 排错），再 `deno task test`。

## 9. 常见坑

| 症状                                      | 原因 / 处理                                                        |
| ----------------------------------------- | ------------------------------------------------------------------ |
| 插件「加载失败」                          | 语法错误、带 BOM、头部被顶掉 → `deno task check <id>`              |
| 钩子完全没被调用                          | 写成 `const onHello = …`，或产物里没挂 `globalThis.onHello`        |
| 打包后不执行但源码没事                    | 忘了 `globalThis.onX = onX`（IIFE 作用域）                         |
| `runJs` 返回 `"null"`                     | 代码里没有 `return`；它永远返回字符串，对象要自己 `JSON.stringify` |
| 报「工具箱页面还没打开」                  | 在 `onStart` 里 `runJs` 了；挪到 `onHello` 或轮询重试              |
| 页面脚本报 `x is not defined`             | `.dom.js` 引用了模块作用域变量/忘了传参 → 改成参数传入             |
| 连续 3 次报错被停用                       | 钩子抛异常；卡片上看最后一次错误，修完点「启用」                   |
| 钩子「超过 10s 未返回」                   | 死循环 / 等不会完成的 Promise；用定时器别忙等                      |
| `Coconut.log(obj)` 打出 `[object Object]` | 用 `console.log` 或先 `JSON.stringify`                             |
| 浮层里的按钮点了没反应                    | 浮层默认 `pointer-events: none`，交互元素加 `auto`                 |
| 改了文件没生效                            | 启动器 3 秒扫描；也可以点「重载」/「重新扫描」                     |

## 10. 完成前自检（必须全过）

```powershell
deno task check:strict      # 头部/权限/钩子/禁用 API/.dom.js 自包含，零错误零提示
deno task build <id>        # 产物能打出来（默认压缩）
deno task test              # 假宿主冒烟测试
deno task verify            # 或者一把梭：fmt + lint + check + typecheck + build + test
```

外加人工确认：

1. 产物 `dist/<id>.js` 开头仍是 `// @name …` 头部，UTF-8 无 BOM；
2. 启动器插件卡片里「已启用」、错误次数 0；
3. `Ctrl+T` 里能看到你写的日志，`onStop` 后浮层/定时器/注入的 CSS 都收干净了；
4. 只申请了真正用到的权限（`debug` 一定没有）。

## 11. 护栏

- **不要擅自运行 `deno task dev` / `deno task deploy`**：它们会覆盖启动器插件目录里用户正在用的
  插件。需要真机验证先和用户确认，或 `--dir` 指到空目录。
- **不要手改/格式化** `plugin-api/*`、`docs/plugin-api.md`（上游同步产物）；`tools.d.ts` 只跑
  `deno task tools` 重新生成。
- 不要「顺手重构」示例的行为——它们是用户正在用的插件，改动要有明确需求；
  纯拆分/搬文件时必须保证行为等价，并用 `deno task test` 验证。
- 不要引入运行时依赖（QuickJS 里没有 Node 环境）；esbuild 只作为构建期依赖。
- 保持 `@mount` 与实际一致（用浮层写 `overlay`），文件行尾 LF、UTF-8 无 BOM。
- `dist/` 不入库；提交前确认 `git status` 里没有产物和 `node_modules`。

## 12. 相关文件索引

| 想知道                             | 看                                                                 |
| ---------------------------------- | ------------------------------------------------------------------ |
| API 完整语义、权限细节、运行时边界 | [`docs/plugin-api.md`](docs/plugin-api.md)                         |
| `Coconut` 类型定义                 | [`plugin-api/coconut-plugin.d.ts`](plugin-api/coconut-plugin.d.ts) |
| 工具箱工具的参数类型               | [`plugin-api/tools.d.ts`](plugin-api/tools.d.ts)                   |
| 打包细节（IIFE / banner / 压缩）   | [`scripts/build.ts`](scripts/build.ts)                             |
| 自查规则（含 `.dom.js` 沙箱检查）  | [`scripts/check.ts`](scripts/check.ts)                             |
| 冒烟测试怎么造假宿主               | [`scripts/test.ts`](scripts/test.ts)                               |
| 现成的真实插件写法                 | `examples/*/index.js` 与 `examples/*/page/`                        |
