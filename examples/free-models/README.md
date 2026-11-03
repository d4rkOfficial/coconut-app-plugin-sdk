# free-models · 免费模型

把 opencode 的免费模型同步成工具箱的 AI 配置，并**由插件自己**提供 OpenAI 兼容服务。
不再是启动器内置插件，也不需要启动器里的 Rust `/v1` 代理。

- **权限**：`toolbox, dom, storage, network, server`
- **端口**：首选 `47830`，被占用时用系统分配端口（同步配置时写实际端口）
- **入口**：`index.js`（多模块，`deno task build` 会内联成一个文件）
- **路由**：`GET /v1/models`、`POST /v1/chat/completions`
- **上游**：`https://opencode.ai/inference/v1`，全部走 `Coconut.fetch`
- **缓存**：模型列表存插件 storage，24 小时内不重复请求上游

## 模块划分

```text
constants.js   端口 / 托管配置标记
log.js         统一日志
models.js      上游模型列表、缓存、Authorization
openai.js      SSE 转换（隐藏 read 工具）/ 非流式收集
server.js      Coconut.http 服务与两个 OpenAI 路由
page.js        页面脚本调用封装
profiles.js    单条 AI 配置的增删改 / 去重
sync.js        同步编排（何时写、等配置就绪、失败退避）
page/*.dom.js  IndexedDB 只读、打开 AI 面板
```

## 两个关键点

1. `Coconut.http.createServer()` 返回的是**事件对象**：用
   `server.addEventListener('request', (req, res) => …)` 处理请求； 同一个端口也可以接收 WebSocket
   升级，用 `server.addEventListener('connection', socket => …)`。
2. 不要在自己的插件里 `Coconut.fetch('http://127.0.0.1:47830/v1/models')`： 服务端 handler
   和插件主线程是同一个 QuickJS 线程，自请求会等自己，直接死锁。 需要模型列表时调用 `models.js` 的
   `fetchModels()`。
