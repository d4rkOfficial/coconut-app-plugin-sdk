# 椰果工具箱启动器 · 插件开发 SDK

给椰果工具箱启动器写插件的开发仓库：

- **模块化源码**：按功能拆文件，`import` 随便用；注入页面的脚本单独放 `page/*.dom.js`；
- **Deno 一键打包**：esbuild 把整份源码压成启动器能加载的**单文件**（压缩 + 头部元数据）；
- **现成示例**：本机正在用的插件源码（`buff-coverage` / `echo-substat-optimizer` / `cjk-scramble`），
  外加官方内置的 `free-models`（多文件范本）；
- **热重载**：`deno task dev <id>` 保存即打包并写进启动器插件目录，3 秒内生效；
- **静态自查 + 冒烟测试**：权限 / 头部 / 钩子 / 禁用 API 检查、`.dom.js` 自包含检查，
  以及用「假宿主 + 假页面」跑打包产物的回归测试。

> 启动器本体（Tauri 外壳 + 工具箱静态包）在另一个仓库，本仓库只做插件侧。
> API 规范看 [`docs/plugin-api.md`](docs/plugin-api.md)，干活规则看 [`AGENTS.md`](AGENTS.md)。

## 相关仓库

| 仓库 | 是什么 |
| --- | --- |
| [`coconut-app-plugin-sdk`](https://github.com/d4rkOfficial/coconut-app-plugin-sdk) | **本仓库**：插件开发 SDK（示例 + 打包 / 热部署 / 自查 / 测试） |
| [`coconut-app`](https://github.com/d4rkOfficial/coconut-app) | 启动器本体（Tauri）：插件宿主、`Coconut` API、`plugin-api/` 类型的上游 |
| [`wuwa-afyg-tool`](https://github.com/d4rkOfficial/wuwa-afyg-tool) | 工具箱本体（SvelteKit）：插件调用的 WS 工具都来自这里 |
| [`wuwa-afyg-share`](https://github.com/d4rkOfficial/wuwa-afyg-share) | 椰果工坊：[启动器下载页](https://wuwa-afyg-share.200503.xyz/launcher) 与工程分享站 |

装启动器 / 给别人下载入口：<https://wuwa-afyg-share.200503.xyz/launcher>。

## 环境

| 工具    | 版本                           | 用途                                             |
| ------- | ------------------------------ | ------------------------------------------------ |
| Deno    | ≥ 2.4                          | **唯一工具链**：运行脚本、类型检查、格式化、lint |
| esbuild | `npm:esbuild`（Deno 自动拉取） | 打包                                             |

没有 `package.json`、不需要 `npm install`：`deno task` 会自动把 `npm:esbuild` 和 `jsr:@std/path`
拉进 Deno 缓存（首次需要联网，之后离线可用）。

## 快速开始

```powershell
deno task check                        # 静态自查（头部/权限/钩子/禁用 API/.dom.js 自包含）
deno task build                        # 打包全部示例 → dist/*.js（压缩后的单文件）
deno task dev echo-substat-optimizer   # 监听源码并自动部署到启动器（热重载）
```

插件日志在 `%APPDATA%\com.coconut.launcher\logs\plugins.log`；工具箱页面按 `Ctrl+T` 看只读 Console。

## 命令

| 命令                     | 说明                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `deno task build`        | 打包 `examples/*/index.js` → `dist/*.js`（压缩）                   |
| `deno task build:plain`  | 同上但不压缩（看产物 / 排错）                                      |
| `deno task build <id>`   | 只打指定插件                                                       |
| `deno task dev <id…>`    | 监听 + 打包 + 部署到启动器（`--dir` 换目录，`--no-deploy` 只重建） |
| `deno task deploy <id…>` | 把 `dist/<id>.js` 装进启动器（缺产物会先打包；`--dry` 只打印）     |
| `deno task pull --list`  | 列出启动器里已安装的插件                                           |
| `deno task pull <id>`    | 把已安装插件拉回 `examples/<id>/index.js`                          |
| `deno task new <id>`     | 从模板新建插件骨架                                                 |
| `deno task check`        | 静态自查；`check:strict` 把提示也算失败（CI 用）                   |
| `deno task test`         | 冒烟测试：假宿主 + 假页面跑打包产物                                |
| `deno task typecheck`    | `deno check`（示例 / 模板 / 脚本）                                 |
| `deno task fmt` / `lint` | 格式化 / lint（`plugin-api/` 不动）                                |
| `deno task tools`        | 工具箱更新后重新生成 `plugin-api/tools.d.ts`                       |
| `deno task clean`        | 删 `dist/`                                                         |
| `deno task verify`       | 一条命令：fmt 检查 + lint + 自查 + 类型 + 打包 + 测试              |

插件目录默认 `%APPDATA%\com.coconut.launcher\plugins`，可用 `--dir <目录>` 或环境变量
`COCONUT_PLUGINS_DIR` 覆盖。

## 目录

```text
coconut-app-plugin-sdk/
  AGENTS.md                     ← 人 / AI 都先读这个：硬规则 + 流程 + 自检清单
  docs/plugin-api.md            ← 上游 API 规范原文（Coconut.* 全部细节）
  plugin-api/                   ← API 类型声明（从上游同步，勿手改）
    coconut-plugin.d.ts         ← Coconut / 钩子 / 权限类型
    tools.d.ts                  ← 工具箱 WS 工具的类型（自动生成）
    generate-tools.mjs          ← 重新生成 tools.d.ts
  templates/plugin/index.js     ← `deno task new` 用的骨架
  examples/<id>/                ← 插件源码（目录名 = 插件 id = 产物文件名）
    index.js                    ← 入口：头部元数据 + 钩子 + 装配
    *.js                        ← 按功能拆的模块（state / api / render / …）
    page/*.dom.js               ← 注入页面的自包含脚本（runJs 用）
    page/run.js                 ← 把页面函数序列化成 runJs 代码
  scripts/                      ← build / dev / deploy / pull / new / check / test / clean
  dist/                         ← 打包产物（不入库）
```

## 示例

| 示例                     | 权限                           | 模块划分 / 看点                                                                                                                         |
| ------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `buff-coverage`          | toolbox, ui, dom               | `state` `snapshot` `geometry` `render` `theme` `measure` `refresh` + `page/*.dom.js`；只读浮层、几何标定、色块过渡动画                  |
| `echo-substat-optimizer` | toolbox, ui, dom               | `state` `api` `config` `slots` `search` `optimize` `overlay` `theme` `detect` + 5 个页面脚本；大量 `callTool` 编排、快照/还原、预算控制 |
| `cjk-scramble`           | dom                            | `chars` + 2 个页面脚本；`runJs` 注入自包含页面逻辑 + `MutationObserver`                                                                 |
| `free-models`            | toolbox, dom, storage, network | `constants` `log` `page` `profiles` `sync` + 3 个页面脚本；多文件、IndexedDB 只读、幂等同步                                             |

## 打包做了什么

`scripts/build.ts` 与启动器本体里的 `builtin/build.mjs` 同一套路：

1. esbuild `bundle + iife + es2020 + platform:neutral`：源码可以拆文件、用 ESM `import`，
   产物是**单个表达式作用域**，符合 QuickJS 没有模块系统的约束；
2. 把文件开头的 `// @name / @version / @permissions …` 抽出来，用 `banner` 重新贴回 （`minify`
   会删注释，不贴回去插件就丢了名字和权限）；
3. `minify: true`（默认）：产物是压缩后的单文件；`deno task build:plain` 可保留可读代码；
4. `charset: 'utf8'`：中文原样保留，不会被转成 `\uXXXX`。

## 页面脚本约定（`page/*.dom.js`）

要通过 `Coconut.runJs` 在工具箱页面里跑的代码**不要手写字符串**，写成普通函数：

```js
// page/apply.dom.js —— 自包含：不 import、不引用模块级常量，需要的数据用参数
export function applyThing(payload) {
  document.querySelectorAll('.x').forEach((el) => {
    el.dataset.bound = '1';
  });
  return JSON.stringify({ ok: true, payloadLength: payload.length });
}

// index.js
import { applyThing } from './page/apply.dom.js';
import { pageCall } from './page/run.js';
const result = await Coconut.runJs(pageCall(applyThing, someData));
```

`pageCall` 把函数 `toString()` 出来包成 `return (fn)(args)`，跟着一起被压缩。 `deno task check`
会：报错任何 `.dom.js` 里的 `import` / 模块级 `const`，
并在沙箱里把函数跑一遍，抓「引用了页面不存在的全局」这类忘了传参数的问题。

## 与启动器配合

- **安装**：`<id>.js` 放进插件目录即可，启动器最多 3 秒扫描一次；同名文件替换 = 重载。
- **启用状态**：`plugins/state.json`；**插件存储**：`plugins/storage/<id>.json`。
- **权限**由 Rust 侧硬校验，`@permissions` 没写的 API 一调就抛错。
- **钩子** 10 秒上限；连续 3 次抛错自动停用（卡片标红并显示最后一次错误）。

## 同步上游

- `plugin-api/*`、`docs/plugin-api.md` 来自上游 `coconut-app` 仓库，**不要手改**、也不要格式化；
  工具箱更新后跑 `deno task tools` 重新生成 `tools.d.ts`。
- 想把自己在启动器里改过的插件纳入版本管理：`deno task pull <id>`。

## 注意

`deno task dev` / `deno task deploy` 会**覆盖**插件目录里的同名文件。改别人的插件前先
`deno task pull <id>` 存档；不想动线上环境就用 `--dir` 指到一个空目录试。

## License

MIT © 2026 D4rk
