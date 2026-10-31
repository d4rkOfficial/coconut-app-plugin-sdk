/**
 * 副词条槽模型 + 真实配装读写。
 *
 * 槽规则：5 个声骸 × 每槽最多 5 条 × **同类词条每条声骸至多 1 条**
 * （等价于全角色同类 ≤5 条）。全流程只用中档值。
 */
import { call, log } from './api.js';
import { MID, SUB_TYPES } from './config.js';
import { st } from './state.js';

/** 空槽模型：`[[类型...] × 5]`。 */
export function newModel() {
  return [[], [], [], [], []];
}

/** 选「条数最少且尚未包含该类型」的槽，保证同槽不出重名；无合法槽返回 -1。 */
export function slotForType(model, type) {
  let bestSlot = -1;
  let bestLen = 99;
  for (let i = 0; i < 5; i++) {
    if (model[i].indexOf(type) >= 0) continue;
    if (model[i].length < bestLen) {
      bestLen = model[i].length;
      bestSlot = i;
    }
  }
  return bestSlot;
}

/** 加一条副词条（直接写中档值），返回落点 `{ slot, idx }`。 */
export async function addRoll(c, model, type) {
  const slot = slotForType(model, type);
  if (slot < 0) return null;
  const idx = model[slot].length;
  await call('add_substat', { char: c, slot: slot + 1, label: type, value: MID[type] });
  model[slot].push(type);
  return { slot, idx };
}

/** 删一条副词条（用于搜索时试加后回滚）。 */
export async function delRoll(c, model, slot, idx) {
  await call('remove_substat', { char: c, slot: slot + 1, idx: idx });
  if (model[slot] && model[slot][idx] !== undefined) model[slot].splice(idx, 1);
}

/** 槽模型 → 「词条×条数」组合。 */
export function modelToComp(model) {
  const count = {};
  for (const slot of model) for (const type of slot) count[type] = (count[type] || 0) + 1;
  const comp = [];
  for (const type of SUB_TYPES) if (count[type]) comp.push({ type, count: count[type] });
  return comp;
}

/** 真实配装里的副词条条数统计（按类型）。 */
export function compOfEchoes(echoes) {
  const count = {};
  for (const echo of (echoes || [])) {
    for (const sub of (echo.substats || [])) {
      if (Number(sub.value) > 0) count[sub.type] = (count[sub.type] || 0) + 1;
    }
  }
  return count;
}

/** 落地校验：搜索得到的 comp 与真实配装比对，不一致返回差异描述。 */
export function compDiff(comp, actual) {
  const want = {};
  for (const item of (comp || [])) want[item.type] = (want[item.type] || 0) + item.count;
  const keys = {};
  for (const key of Object.keys(want)) keys[key] = 1;
  for (const key of Object.keys(actual)) keys[key] = 1;
  const bad = [];
  for (const key of Object.keys(keys)) {
    if ((want[key] || 0) !== (actual[key] || 0)) {
      bad.push(`${key} 期望${want[key] || 0}/实得${actual[key] || 0}`);
    }
  }
  return bad.join('; ');
}

/** 清空全部副词条（每次都读真实状态，不依赖本地模型）。 */
export async function clearAllSubs(c) {
  const cfg = await call('get_config_summary', {});
  const ch = (cfg && cfg.characters || [])[c - 1];
  const echoes = ch && ch.echoes;
  for (let slot = 0; slot < 5; slot++) {
    const subs = (echoes && echoes[slot] && echoes[slot].substats) || [];
    for (let idx = subs.length - 1; idx >= 0; idx--) {
      if (st.cancelled) return;
      await call('remove_substat', { char: c, slot: slot + 1, idx });
    }
  }
}

/** 按「词条×条数」重建副词条（同槽不同名、同类 ≤5、全中档值）。 */
export async function buildSubs(c, comp) {
  const model = newModel();
  for (const item of comp) {
    for (let i = 0; i < item.count; i++) {
      if (st.cancelled) return model;
      if (!await addRoll(c, model, item.type)) break;
    }
  }
  return model;
}

/** 清空槽状态缓存（真实配装状态未知时调用）。 */
export function resetLive() {
  st.liveCosts = [0, 0, 0, 0, 0];
  st.liveMains = ['', '', '', '', ''];
}

/** 写 cost（只写变化项；改 cost 后主词条可能被引擎重置，强制重写）。 */
export async function applyCosts(c, costs) {
  for (let i = 0; i < 5; i++) {
    if (st.liveCosts[i] === costs[i]) continue;
    await call('set_echo_cost', { char: c, slot: i + 1, cost: costs[i] });
    st.liveCosts[i] = costs[i];
    st.liveMains[i] = '';
  }
}

/** 写主词条（只写变化项）；返回是否全部写入成功。 */
export async function applyMains(c, mains) {
  for (let i = 0; i < 5; i++) {
    if (st.liveMains[i] === mains[i]) continue;
    const result = await call('set_main_stat', { char: c, slot: i + 1, label: mains[i] });
    if (result && result.__err) {
      st.liveMains[i] = '';
      log(`主词条写入失败 槽${i + 1} ${mains[i]}：${result.__err}`);
      return false;
    }
    st.liveMains[i] = mains[i];
  }
  return true;
}

/** 兜底：把配置里任何 ≤0 的副词条值修复为对应中档值（避免试加/回滚留下 0）。 */
export async function healZeros(c) {
  try {
    const cfg = await call('get_config_summary', {});
    const ch = (cfg && cfg.characters || [])[c - 1];
    if (!ch || !ch.echoes) return;
    for (let slot = 0; slot < 5; slot++) {
      const subs = ch.echoes[slot].substats || [];
      for (let idx = 0; idx < subs.length; idx++) {
        const value = Number(subs[idx].value);
        if (isFinite(value) && value <= 0 && MID[subs[idx].type] != null) {
          await call('update_substat_value', {
            char: c,
            slot: slot + 1,
            idx,
            value: MID[subs[idx].type],
          });
        }
      }
    }
  } catch {
    // 兜底逻辑失败不影响结果
  }
}
