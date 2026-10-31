/**
 * 页面脚本的调用封装：序列化 → Coconut.runJs → 解析返回值。
 * 这里所有失败都吞掉（浮层是只读增强，不能因为量不到几何就把插件弄崩）。
 */
import { animateBars as animateBarsPage } from './page/animate.dom.js';
import { measureTimeline as measureTimelinePage } from './page/measure.dom.js';
import { placeOverlay as placeOverlayPage } from './page/place.dom.js';
import { pageCall } from './page/run.js';

/** 量一次页面几何；量不到返回 null。 */
export async function measure() {
  try {
    // 宿主把 runJs 的返回值同步交回，但页面脚本本身可能是异步的；
    // await 一下对同步返回值是 no-op，对异步脚本是必需的（测试环境下也更稳）。
    return JSON.parse(await Coconut.runJs(pageCall(measureTimelinePage)));
  } catch {
    return null;
  }
}

/** 把浮层摆到时间轴沟槽上。 */
export async function placeOverlay(geometry) {
  if (!geometry || !geometry.onTimeline) return;
  try {
    await Coconut.runJs(
      pageCall(placeOverlayPage, {
        l: Math.round(geometry.sideRight),
        t: Math.round(geometry.gutterTop),
        w: Math.round(geometry.iw - geometry.sideRight),
        h: geometry.barTop == null ? 0 : Math.round(geometry.barTop - geometry.gutterTop),
      }),
    );
  } catch {
    // 页面正在重建时找不到 .cov-root 属正常
  }
}

/** 色块位置平滑过渡；返回新的 key→位置 映射（失败返回 null）。 */
export async function animateBars(oldGeo, freshBars) {
  try {
    const result = await Coconut.runJs(pageCall(animateBarsPage, oldGeo || {}, freshBars || []));
    return result ? JSON.parse(String(result)) : null;
  } catch {
    return null;
  }
}
