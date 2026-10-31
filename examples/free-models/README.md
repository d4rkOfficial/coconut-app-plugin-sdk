# free-models · 免费模型同步（多文件示例）

启动器内置插件（不是用户插件），把启动器免费模型代理里的模型同步成工具箱的 AI 配置。

- **权限**：`toolbox, dom, storage, network`
- **入口**：`index.js`（**多模块**，`deno task build` 会内联成一个文件）
- **看点**
  - 页面侧逻辑写在 `*.dom.js` 里的**自包含普通函数**，注入时用
    `` `return (${String(fn).trim()})()` `` 序列化，不手写模板字符串；
  - IndexedDB 只读（`wuwa-v1` / `cache`）判断用户有没有关 AI 助手；
  - `Coconut.fetch` 打启动器本地 `/v1/models`，`Coconut.storage` 记「首次使用」；
  - 幂等与去重：`get_ai_profiles` + `manage_ai_profile` 增改删，同名只留一条；
  - 页面还没就绪时用 `Coconut.setTimeout` 短退避重试，而不是阻塞钩子。

这是「源码拆多文件、产物仍单文件」的官方范本；改它之前建议先
`deno task pull free-models --as free-models-fork`，避免和内置插件同 id。

## 模块划分

`constants.js` 标记/地址 · `log.js` 日志 · `page.js` 页面调用封装 · `profiles.js` 配置原子操作 ·
`sync.js` 同步编排 · `page/{prefs,config,assistant}.dom.js` 页面脚本 · `page/run.js` pageCall
