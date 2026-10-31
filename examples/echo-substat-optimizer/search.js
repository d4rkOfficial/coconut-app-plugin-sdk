/**
 * 搜索：cost 搭配 × 主词条 全枚举排序 → 短名单 → 每个候选做副词条贪心。
 *
 * 关键点：主词条优劣必须和副词条一起评（4c 暴击率/暴击伤害在空副词条下排序会反），
 * 副词条每步都在真实引擎上实测边际收益，双爆平衡、生命/防御成长、多加成混编都由引擎给出。
 */
import { calcTotal, call, log } from './api.js';
import { CRIT_TYPES, enumerateAssignments, PROFILES, SUB_TYPES } from './config.js';
import { setProg } from './overlay.js';
import {
  addRoll,
  applyCosts,
  applyMains,
  clearAllSubs,
  delRoll,
  modelToComp,
  newModel,
} from './slots.js';
import { noteBest, st } from './state.js';

/** 1cost 主词条自适应：攻击%/生命%/防御% 实测取最优（生命/防御成长角色不会错堆攻击）。 */
export async function probeMain1(c) {
  let best = '攻击%';
  let bestTotal = -Infinity;
  for (const main of ['攻击%', '生命%', '防御%']) {
    if (st.cancelled || st.budgetHit) break;
    const result = await call('set_main_stat', { char: c, slot: 5, label: main });
    if (result && result.__err) {
      log(`1cost 主词条不支持：${main}`);
      continue;
    }
    const total = await calcTotal();
    if (isFinite(total) && total > bestTotal) {
      bestTotal = total;
      best = main;
    }
  }
  return best;
}

/** 第一步：cost 搭配 × 主词条 全枚举排序（空副词条，成本低）。 */
export async function rankCandidates(c, elems) {
  const plans = PROFILES.map((profile) => ({
    profile,
    assigns: enumerateAssignments(profile, elems, st.main1Pool),
  }));
  const total = plans.reduce((sum, item) => sum + item.assigns.length, 0);
  const out = [];
  let done = 0;
  for (const plan of plans) {
    if (st.cancelled || st.budgetHit) break;
    await applyCosts(c, plan.profile.costs);
    await clearAllSubs(c);
    for (const mains of plan.assigns) {
      if (st.cancelled || st.budgetHit) break;
      if (!await applyMains(c, mains)) continue;
      const t = await calcTotal();
      done++;
      if (isFinite(t)) {
        out.push({ profile: plan.profile, mains: mains.slice(), t });
        noteBest(t);
      }
      if (done % 6 === 0) setProg('第一步 · 枚举 cost 搭配×主词条（空副词条）', done, total);
    }
  }
  out.sort((a, b) => b.t - a.t);
  return out;
}

/**
 * 短名单：
 *  ① 各 cost 搭配各自的最优候选（前 3 个搭配）——保证「cost 搭配」之间也是带副词条的公平比较；
 *  ② 全局最优；
 *  ③ 其余按排序补满，同一个「cost 搭配 × 4cost 主词条」最多 2 个，保证三种 4cost 主词条都被覆盖。
 */
export function shortlist(list, k) {
  const out = [];
  const push = (item) => {
    if (item && out.length < k && out.indexOf(item) < 0) out.push(item);
  };
  const seenProfile = {};
  const profileBest = [];
  for (const item of list) {
    if (!seenProfile[item.profile.name]) {
      seenProfile[item.profile.name] = 1;
      profileBest.push(item);
    }
  }
  for (let i = 0; i < Math.min(3, profileBest.length); i++) push(profileBest[i]);
  if (list.length) push(list[0]);
  const seenKey = {};
  for (const item of list) {
    if (out.length >= k) break;
    const key = `${item.profile.name}|${item.mains[0] || ''}`;
    if ((seenKey[key] || 0) >= 2) continue;
    seenKey[key] = (seenKey[key] || 0) + 1;
    push(item);
  }
  out.sort((a, b) => b.t - a.t);
  return out;
}

/**
 * 第二步：副词条贪心（逐条加「当前边际收益最大」的词条）。
 * 每步重新实测所有可行类型；收益恒为 0 的类型立即剪掉，双爆永不剪。
 */
export async function greedySubs(c, N) {
  const model = newModel();
  const count = {};
  for (const type of SUB_TYPES) count[type] = 0;
  const active = SUB_TYPES.slice();
  let cur = await calcTotal();
  const base = cur;
  for (let step = 0; step < N; step++) {
    if (st.cancelled || st.budgetHit) break;
    let bestType = null;
    let bestTotal = cur;
    const dead = [];
    for (const type of active.slice()) {
      if (st.cancelled || st.budgetHit) break;
      if (count[type] >= 5) continue;
      const position = await addRoll(c, model, type);
      if (!position) continue;
      const trial = await calcTotal();
      await delRoll(c, model, position.slot, position.idx);
      if (!isFinite(trial)) continue;
      if (trial > bestTotal + 1e-9) {
        bestTotal = trial;
        bestType = type;
      } else if (!CRIT_TYPES[type] && Math.abs(trial - cur) <= 1e-9 * Math.max(1, cur)) {
        dead.push(type);
      }
    }
    for (const type of dead) {
      const index = active.indexOf(type);
      if (index >= 0) active.splice(index, 1);
    }
    if (!bestType) break;
    if (!await addRoll(c, model, bestType)) break;
    count[bestType]++;
    cur = bestTotal;
    noteBest(cur);
    setProg(`第二步 · 副词条贪心 ${step + 1}/${N} · +${bestType}`, 0, 0, cur);
    log(`greedy ${step + 1}/${N} +${bestType} total=${Math.round(cur)} active=${active.length}`);
  }
  const verify = await calcTotal();
  const comp = modelToComp(model);
  if (N > 0 && !comp.length) log('warn 贪心未加入任何副词条（检查 add_substat 是否接受中档值）');
  const added = comp.reduce((sum, item) => sum + item.count, 0);
  return { comp, total: isFinite(verify) ? verify : cur, base, complete: added >= N };
}
