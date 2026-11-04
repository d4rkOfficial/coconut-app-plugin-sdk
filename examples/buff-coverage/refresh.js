/**
 * 一次刷新：量几何 → 读伤害条目/排轴 → 构造快照 → 合并同区间 Buff →
 * 拟合坐标 → 过滤视野 → 渲染浮层（并做色块过渡动画）。
 */
import { fitPos } from './geometry.js';
import { animateBars, measure, placeOverlay } from './measure.js';
import { buildHtml, overlayCss } from './render.jsx';
import { buildSnapshot } from './snapshot.js';
import { st } from './state.js';
import { readDark } from './theme.js';

/** 调工具箱工具并解包成对象（异步、不阻塞插件线程）。 */
async function toolJson(name, args) {
  let value = (await Coconut.tools.call(name, args)) || {};
  if (value && value.data && !value.items) value = value.data;
  return value;
}

export async function refresh() {
  if (st.scanning) return;
  st.scanning = true;
  try {
    const m = await measure();
    if (!m || !m.onTimeline) {
      if (st.lastHtml) st.lastHtml = '';
      if (st.ovId) Coconut.ui.hide(st.ovId);
      return;
    }

    // 数据：只读取伤害条目 + 排轴标签
    const damage = await toolJson('get_damage_entries', { format: 'json' });
    const entries = Array.isArray(damage.items) ? damage.items : [];
    const timeline = await toolJson('get_timeline_summary', { format: 'json' });
    const items = Array.isArray(timeline.items) ? timeline.items : [];

    const snapshot = buildSnapshot(entries, items);
    // 生效范围完全一致（分段结构完全相同）的 buff 合成一条
    const bySeg = new Map();
    for (const group of snapshot.rows) {
      const sig = group.segments.map((s) => `${s.first}-${s.last}`).join(',');
      let cluster = bySeg.get(sig);
      if (!cluster) {
        cluster = {
          sig,
          segments: group.segments.map((s) => ({ first: s.first, last: s.last })),
          members: [],
        };
        bySeg.set(sig, cluster);
      }
      cluster.members.push(group);
    }
    const clusters = [...bySeg.values()].sort(
      (a, b) => a.segments[0].first - b.segments[0].first,
    );
    const total = clusters.length;

    // 几何：把挂载块（id → pos）和它的真实 left 拟合成一条直线
    const posById = m.posById || {};
    const samples = [];
    for (const sample of m.samples) {
      const pos = posById[sample.id];
      if (pos == null || !isFinite(pos)) continue;
      samples.push({ pos, left: sample.left });
    }
    const fit = fitPos(samples);
    let viewMin = -Infinity;
    let viewMax = Infinity;
    if (fit) {
      const width = Math.max(1, m.iw - m.sideRight);
      viewMin = (m.sideRight - fit.a) / fit.b;
      viewMax = (m.sideRight + width - fit.a) / fit.b;
      if (viewMin > viewMax) {
        const swap = viewMin;
        viewMin = viewMax;
        viewMax = swap;
      }
    }
    // 只保留「任一色块段与视野相交」的 buff；完全无关的整行隐藏
    const shown = Number.isFinite(viewMin) && fit
      ? clusters.filter((c) => c.segments.some((s) => !(s.last < viewMin || s.first > viewMax)))
      : clusters;

    if (!st.geomLogged) {
      st.geomLogged = true;
      Coconut.log(
        `[buff-coverage] v8 total=${total} shown=${shown.length} samples=${samples.length}` +
          ` view=${viewMin.toFixed(0)}..${viewMax.toFixed(0)}` +
          ` fit=${fit ? `a=${fit.a.toFixed(1)} b=${fit.b.toFixed(3)}` : 'null'}`,
      );
    }

    // 昼夜主题：get_settings_state 读 theme_mode
    const dark = await readDark();
    const built = buildHtml(shown, m.sideRight, Math.max(1, m.iw - m.sideRight), fit, dark, {
      top: m.gutterTop || 0,
      height: m.barTop != null ? m.barTop - m.gutterTop : 0,
    });
    const css = overlayCss(dark);
    const htmlText = built.html.text;
    if (htmlText !== st.lastHtml || css !== st.themeCss) {
      if (st.ovId) Coconut.ui.remove(st.ovId);
      st.ovId = Coconut.ui.overlay({ html: built.html, css });
      st.lastHtml = htmlText;
      st.themeCss = css;
      // 色块位置变化重加载动画：按稳定 key 把旧位置平滑过渡到新位置；新增色块淡入
      const next = await animateBars(st.barGeo, built.bars);
      if (next) st.barGeo = next;
    }
    placeOverlay(m);
    if (st.ovId) Coconut.ui.show(st.ovId);
  } catch (err) {
    if (st.ovId) Coconut.ui.hide(st.ovId);
  } finally {
    st.scanning = false;
  }
}
