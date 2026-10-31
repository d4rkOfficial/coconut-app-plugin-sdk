// @name        Buff覆盖范围
// @version     8.2.0
// @description 排轴页浮层（纯 overlay，不注入工具箱 UI）：进入排轴快照 buff 绑定；按时间轴块相邻性把每个 buff 切成多个连续段（视野内不连续也分段显示，一行多色块）；同名同阶合并、分段结构完全一致的 buff 合成一条；完全与可见操作块/参考线无关的行隐藏；buff 名固定在左侧图例列、用对应行色块颜色着色，始终可读，右侧轨道上按段渲染显眼色块；按长度长→短实时排序；色块位置变化重加载平滑过渡+新块淡入动画，容器几何位置在创建时即内联烘焙（消除重建向上位移闪烁）；加宽色块、Google Material 500 显眼色；自动适配昼夜主题；跟随滚动与拖动；仅排轴页显示。只读。
// @permissions toolbox, ui, dom
// @mount       overlay
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />

/*
 * 只读原则：工具箱 UI 只读，绝不注入。
 *  - 数据：get_damage_entries 每条目的 buffs[]（真正的绑定 buff 源）；get_timeline_summary 提供 pos→块/线标签。
 *  - 合并：同名同阶（去掉尾部「N阶/N层」）归并为一条，覆盖范围=全组首→尾 pos。
 *  - 过滤：只保留与「当前视野内操作块」有关的 buff（覆盖区间与挂载块窗口相交），随滚动更新。
 *  - 几何：runJs 只读量取锚点 + 挂载中的 [data-block]（属性=IndexedDB opBlock.id）→ id→pos 线性标定 pos→视口 x。
 *  - 坐标：IndexedDB "wuwa-v1"/cache 只读匹配 id→pos（参考插件同源，只读不写）。
 *  - 定位：只写自己浮层元素 .cov-root / .cov-bar 的 style。
 *
 * 模块划分：
 *   state.js      运行期状态
 *   snapshot.js   数据 → Buff 快照 / 分段（纯函数）
 *   geometry.js   pos → 视口 left 的最小二乘标定
 *   render.js     CSS + HTML（纯字符串）
 *   theme.js      读工具箱昼夜主题
 *   measure.js    页面脚本调用封装
 *   refresh.js    一次刷新的完整流程
 *   page/*.dom.js 注入页面的自包含脚本（几何测量 / 摆放 / 色块过渡）
 */
import { refresh } from './refresh.js';
import { st } from './state.js';

function start() {
  if (st.timer) return;
  refresh();
  st.timer = Coconut.setInterval(refresh, 900);
}

async function onStart() {
  start();
}

async function onHello() {
  start();
}

async function onEvent(event) {
  if (event && event.type === 'resync') refresh();
}

async function onStop() {
  if (st.timer) {
    Coconut.clearInterval(st.timer);
    st.timer = null;
  }
  if (st.ovId) {
    Coconut.ui.remove(st.ovId);
    st.ovId = 0;
  }
  st.lastHtml = '';
}

// —— 交给插件宿主 ——
// 打包成 IIFE 后函数声明不在全局作用域，宿主只在 globalThis 上找钩子。
globalThis.onStart = onStart;
globalThis.onHello = onHello;
globalThis.onEvent = onEvent;
globalThis.onStop = onStop;
