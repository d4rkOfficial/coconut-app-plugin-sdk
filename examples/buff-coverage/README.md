# buff-coverage · Buff 覆盖范围

排轴页的只读浮层：把每个 Buff 在时间轴上的覆盖区间画成色块，随滚动/拖动跟随，自动适配昼夜主题。

- **权限**：`toolbox, ui, dom`
- **入口**：`index.js`（`deno task dev buff-coverage` 直接跑）
- **看点**
  - 用 `callTool('get_damage_entries')` + `get_timeline_summary` 拿数据，**完全不改工具箱 UI**；
  - `runJs` 只读量取锚点几何，再线性标定「时间轴 pos → 视口 x」；
  - 同名同阶 Buff 合并、分段结构一致的行合并、视野无关行隐藏；
  - 色块位置变化做平滑过渡，容器几何在创建时就内联烘焙，避免重建闪烁。

适合当作「只读型 overlay 插件」的范本：所有状态都在插件侧算，页面只被读、不被写。

## 模块划分

`state.js` 运行期状态 · `snapshot.js` 数据→Buff 快照/分段（纯函数） · `geometry.js` pos→px 标定 ·
`render.js` CSS+HTML · `theme.js` 昼夜主题 · `measure.js` 页面脚本调用 · `refresh.js` 一次刷新流程 ·
`page/{measure,place,animate}.dom.js` 注入页面的自包含脚本 · `page/run.js` pageCall
