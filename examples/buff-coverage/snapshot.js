/**
 * 从工具箱数据构造 Buff 快照：canonical name → 覆盖区间 / 分段 / 阶数。
 * 纯函数，不碰 DOM、不碰插件状态。
 */

/** HTML 转义。 */
export function esc(value) {
  return String(value == null ? '' : value).replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
  );
}

/** 时间轴条目（操作块 / 参考线）的短标签。 */
export function labelOf(item) {
  return item && item.kind === 'refLine' ? `线${item.no || 0}` : `块${item.no || 0}`;
}

/** 去掉尾部「N阶/N层」，把同名不同阶归并成一条。 */
export function stripTier(name) {
  return String(name).replace(/\s*\d+\s*(?:阶|层)\s*$/, '');
}

/** 有序数组里 (lo, hi) 之间还有没有别的 pos。 */
export function hasBetween(sorted, lo, hi) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (sorted[mid] <= lo) low = mid + 1;
    else high = mid;
  }
  return low < sorted.length && sorted[low] < hi;
}

/**
 * 把绑定位置按时间轴操作块的相邻性切成若干连续段。
 * 视野内不连续的位置也会被分成不同段，一行里就画成多个色块。
 */
export function segmentPositions(pos, opPos) {
  const runs = [];
  let current = [pos[0]];
  for (let i = 1; i < pos.length; i++) {
    if (hasBetween(opPos, pos[i - 1], pos[i])) {
      runs.push(current);
      current = [pos[i]];
    } else {
      current.push(pos[i]);
    }
  }
  if (current.length) runs.push(current);
  return runs.map((run) => ({ first: run[0], last: run[run.length - 1] }));
}

/**
 * 由伤害条目构造 Buff 快照。
 * @param {Array<{ pos?: number, buffs?: string[] }>} entries get_damage_entries 的 items
 * @param {Array<{ pos?: number, kind?: string, no?: number }>} items get_timeline_summary 的 items
 */
export function buildSnapshot(entries, items) {
  const posToLabel = {};
  const opPos = [];
  let maxPos = 0;
  for (const item of items) {
    if (item.pos > maxPos) maxPos = item.pos;
    posToLabel[item.pos] = labelOf(item);
    if (item.kind === 'opBlock') opPos.push(item.pos);
  }
  opPos.sort((a, b) => a - b);

  const groups = new Map();
  for (const entry of entries) {
    const buffs = Array.isArray(entry.buffs) ? entry.buffs : [];
    if (!buffs.length) continue;
    const pos = Number(entry.pos) || 0;
    for (const buff of buffs) {
      const orig = String(buff);
      const canon = stripTier(orig);
      let group = groups.get(canon);
      if (!group) {
        group = { name: canon, pos: [], tiers: new Set(), origNames: new Set() };
        groups.set(canon, group);
      }
      group.pos.push(pos);
      group.origNames.add(orig);
      const tier = orig.match(/(\d+)\s*阶/);
      if (tier) group.tiers.add(tier[1]);
    }
  }

  const rows = [];
  for (const group of groups.values()) {
    group.pos.sort((a, b) => a - b);
    const uniq = [];
    for (const pos of group.pos) {
      if (!uniq.length || uniq[uniq.length - 1] !== pos) uniq.push(pos);
    }
    group.segments = segmentPositions(uniq, opPos);
    group.first = group.segments.length ? group.segments[0].first : 0;
    group.last = group.segments.length ? group.segments[group.segments.length - 1].last : 0;
    group.firstLabel = posToLabel[group.first] || '';
    group.lastLabel = posToLabel[group.last] || '';
    group.n = uniq.length;
    group.names = group.origNames.size;
    rows.push(group);
  }
  rows.sort((a, b) => a.first - b.first);
  return { rows, maxPos };
}
