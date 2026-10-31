# echo-substat-optimizer · 最优声骸词条

在「词条」页给出某角色在当前副词条条数下的最优
`cost 搭配 × 主词条 × 副词条`（目标：全队总伤害最大）。

- **权限**：`toolbox, ui, dom`
- **入口**：`index.js`
- **看点**
  - 大量 `callTool` 编排：`get_config_summary` / `set_echo_cost` / `set_main_stat` / `add_substat` /
    `remove_substat` / `get_result_summary` / `export_substat_plan` …
  - 改动前先 `export_substat_plan` 快照，打断/失败自动 `apply_substat_plan` 还原；
  - 算法：cost×主词条全枚举排序 → 按多样性取短名单 → 每个候选在真实引擎上做副词条贪心
    （每步实测全部可行词条的边际收益）→ 取全局最优并应用；
  - 有计算预算（`searchMax`），预算用尽只停止搜索、保留已找到的最优；
  - 页面检测、悬浮窗、主题读取、头像映射全在这里，可作为「重型 UI + 高频工具调用」的范本。

注意：这个插件会**临时修改**当前工程的角色配装（算完应用最优、中途离开还原），
调试时建议先在测试工程里跑。

## 模块划分

`state.js` 状态 · `api.js` 工具调用/预算/日志 · `config.js` 词条与 cost 空间 · `slots.js`
副词条槽模型与配装读写 · `search.js` 主词条枚举+短名单+副词条贪心 · `optimize.js` 主流程/还原 ·
`overlay.js` 浮层渲染 · `theme.js` 主题 · `detect.js` 词条页检测/交互意图/头像 ·
`page/{config,intent,drag,avatar,theme}.dom.js` 页面脚本 · `page/run.js` pageCall
