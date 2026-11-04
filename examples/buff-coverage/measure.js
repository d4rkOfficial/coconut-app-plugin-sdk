/**
 * 页面脚本的调用封装：函数对象直接交给 `Coconut.toolbox.runJs`，
 * 引擎负责序列化源码 + 传参，返回值也是**真实值**（不用再 JSON.parse）。
 *
 * 这里所有失败都吞掉：浮层是只读增强，不能因为量不到几何就把插件弄崩。
 *
 * `await` 是给「页面脚本本身是异步的」用的：真实宿主是同步阻塞调用（await 一个
 * 非 Promise 值等于没 await），测试宿主里页面脚本会返回 Promise，await 才有意义。
 */
import { animateBars as animateBarsPage } from './page/animate.dom.js';
import { measureTimeline as measureTimelinePage } from './page/measure.dom.js';
import { placeOverlay as placeOverlayPage } from './page/place.dom.js';

/** 量一次页面几何；量不到返回 null。 */
export async function measure() {
  try {
    return (await Coconut.toolbox.runJs(measureTimelinePage)) || null;
  } catch {
    return null;
  }
}

/** 把浮层摆到时间轴沟槽上。 */
export function placeOverlay(geometry) {
  if (!geometry || !geometry.onTimeline) return;
  try {
    Coconut.toolbox.runJs(placeOverlayPage, {
      l: Math.round(geometry.sideRight),
      t: Math.round(geometry.gutterTop),
      w: Math.round(geometry.iw - geometry.sideRight),
      h: geometry.barTop == null ? 0 : Math.round(geometry.barTop - geometry.gutterTop),
    });
  } catch {
    // 页面正在重建时找不到 .cov-root 属正常
  }
}

/** 色块位置平滑过渡；返回新的 key→位置 映射（失败返回 null）。 */
export async function animateBars(oldGeo, freshBars) {
  try {
    return (await Coconut.toolbox.runJs(animateBarsPage, oldGeo || {}, freshBars || [])) || null;
  } catch {
    return null;
  }
}
