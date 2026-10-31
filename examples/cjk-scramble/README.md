# cjk-scramble · 中日韩随机乱码

把页面文字按字符替换成随机中日韩字符（英文/数字/标点保留），用于截图遮挡或演示。

- **权限**：`dom`
- **入口**：`index.js`
- **看点**
  - `runJs` 注入**自包含**页面脚本（字符池作为参数传入，见 `page/run.js` 的 `pageCall`）；
  - 用 `MutationObserver` 让后加载的内容也被替换；
  - 在页面上挂 `window.__simpleTranslate`，`onStop` 时 `destroy()` 断开观察器并清空引用。

注意：这是**单向替换**，被打乱的文字不会自动复原（刷新页面即可恢复）；
演示完记得在启动器里停用插件。

## 模块划分

`chars.js` 字符池 · `page/apply.dom.js` 替换+观察器 · `page/destroy.dom.js` 收尾 · `page/run.js`
pageCall
