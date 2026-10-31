/**
 * 最优词条主流程：快照 → 解锁 → 枚举 → 短名单贪心 → 应用 → 复核。
 *
 * 预算：所有真实计算（calcTotal）都计入 searchCalls；用尽只「停止继续搜索」，
 * 已找到的最优解照常应用，不丢结果；只有被用户中断才还原原配装。
 */
import { calcTotal, call, charElements, log } from './api.js';
import { buildResult, renderOverlay, setProg } from './overlay.js';
import { greedySubs, probeMain1, rankCandidates, shortlist } from './search.js';
import {
  applyCosts,
  applyMains,
  buildSubs,
  clearAllSubs,
  compDiff,
  compOfEchoes,
  healZeros,
  resetLive,
} from './slots.js';
import { noteBest, st, UI } from './state.js';

/** 还原本次运行的角色配装（始终用 runChar，运行中切换角色也不会还原错人）。 */
export async function doRestore() {
  const who = st.runChar || st.teamChars[UI.charIdx];
  if (!who) return;
  const result = await call('apply_substat_plan', { character: who, name: st.snapName });
  if (result && result.__err) {
    UI.msg = `还原失败，请手动确认配装：${result.__err}`;
    log(`restore failed: ${result.__err}`);
  } else {
    log(`restored ${who}`);
  }
}

export async function optimize(charIdx, N) {
  if (st.running) return;
  st.running = true;
  st.cancelled = false;
  st.budgetHit = false;
  st.searchCalls = 0;
  st.runStart = Date.now();
  st.runChar = st.teamChars[charIdx] || '';
  st.runBest = -Infinity;
  UI.busy = true;
  UI.done = false;
  UI.resultHtml = '';
  UI.msg = '';
  UI.kept = false;
  UI.base = null;
  setProg('读取配装…');
  let ok = false;
  try {
    const char = st.runChar;
    if (!char) {
      UI.msg = '角色不存在';
      return;
    }
    const cfg = await call('get_config_summary', {});
    const ch = (cfg && cfg.characters || [])[charIdx];
    if (!ch || !ch.echoes) {
      UI.msg = '读取配装失败（无活动工程？）';
      return;
    }

    // 快照原配装（固定名覆盖），供中途打断/失败时还原
    const snap = await call('export_substat_plan', {
      character: char,
      name: st.snapName,
      overwrite: true,
    });
    st.snapName = (snap && snap.name) || st.snapName;

    // 解锁词条(config)环节：锁定时编辑不生效（引擎真实计算的前提）
    const unlocked = await call('unlock_phase', { phase: 'config' });
    if (unlocked && unlocked.__err) {
      UI.msg = `解锁词条页失败：${unlocked.__err}`;
      return;
    }
    st.unlockedThisRun = true;

    const c = charIdx + 1;
    resetLive();

    // 基线 = 角色原配装（含原副词条）
    setProg('读取原配装总伤…');
    const base = await calcTotal();
    if (!isFinite(base)) {
      UI.msg = '原配装计算失败（引擎无结果）';
      return;
    }
    UI.base = base;

    // 1cost 主词条自适应（攻击%/生命%/防御% 里实测最优）
    setProg('探测 1cost 主词条…');
    await applyCosts(c, [4, 1, 1, 1, 1]);
    await clearAllSubs(c);
    st.main1Pool = [await probeMain1(c)];
    log(`1cost main -> ${st.main1Pool[0]}`);

    // 第一步：cost 搭配 × 主词条 全枚举（空副词条）
    const elems = await charElements(char);
    const ranked = await rankCandidates(c, elems);
    if (st.cancelled) return;
    if (!ranked.length) {
      UI.msg = '未找到有效主词条（引擎返回异常）';
      return;
    }
    log(
      'rank top: ' + ranked.slice(0, 10)
        .map((item) => `${item.profile.name} ${item.mains.join('/')}=${Math.round(item.t)}`)
        .join(' | '),
    );

    // 第二步：短名单 × 副词条贪心联合搜索
    const Nn = Math.max(0, Math.min(N | 0, 25));
    const estPer = Math.max(40, 4 * Nn * 5 + 30); // 每候选粗估计算次数
    const left = Math.max(0, st.searchMax - st.searchCalls);
    const K = Math.max(2, Math.min(6, Math.floor((left * 0.8) / estPer)));
    const short = shortlist(ranked, K);
    log(
      `shortlist(${short.length}): ` +
        short.map((item) => `${item.profile.name} ${item.mains.join('/')}`).join(' | '),
    );

    let bestS = null;
    let partialS = null;
    for (let si = 0; si < short.length; si++) {
      if (st.cancelled || st.budgetHit) break;
      const cand = short[si];
      setProg(
        `第二步 · 主/副词条联合搜索 ${si + 1}/${short.length} · ${cand.profile.name}`,
        0,
        0,
        bestS ? bestS.total : undefined,
      );
      await applyCosts(c, cand.profile.costs);
      await clearAllSubs(c);
      if (!await applyMains(c, cand.mains)) continue;
      const res = Nn > 0
        ? await greedySubs(c, Nn)
        : { comp: [], total: await calcTotal(), complete: true };
      log(
        `cand ${cand.profile.name} ${cand.mains.join('/')} -> ${Math.round(res.total)}` +
          `${res.complete ? '' : '(未补齐)'} comp=` +
          res.comp.map((item) => `${item.type}x${item.count}`).join(','),
      );
      if (isFinite(res.total)) noteBest(res.total);
      if (!isFinite(res.total)) continue;
      if (!res.complete) {
        // 预算/中断导致的半成品：只在没有任何完整方案时才采用
        if (!partialS || res.total > partialS.total) {
          partialS = {
            profile: cand.profile,
            mains: cand.mains.slice(),
            comp: res.comp,
            total: res.total,
            partial: true,
          };
        }
        continue;
      }
      if (!bestS || res.total > bestS.total) {
        bestS = {
          profile: cand.profile,
          mains: cand.mains.slice(),
          comp: res.comp,
          total: res.total,
        };
      }
    }
    if (st.cancelled) return;
    if (!bestS) bestS = partialS;
    if (!bestS) {
      UI.msg = '未找到有效最优（引擎返回异常）';
      return;
    }

    // 第三步：应用全局最优并复核
    setProg('应用最优方案…');
    await applyCosts(c, bestS.profile.costs);
    await clearAllSubs(c);
    await applyMains(c, bestS.mains);
    await buildSubs(c, bestS.comp);
    await healZeros(c);
    const ft = await calcTotal();
    if (!isFinite(ft)) {
      UI.msg = '最优方案复核失败（引擎返回异常）';
      return;
    }
    noteBest(ft);
    if (ft + 1e-6 < bestS.total) {
      log(`warn 复核 ${Math.round(ft)} < 搜索 ${Math.round(bestS.total)}`);
    }

    await call('export_substat_plan', { character: char, name: 'eso_best', overwrite: true });
    const cfg2 = await call('get_config_summary', {});
    const ch2 = (cfg2 && cfg2.characters || [])[charIdx];
    const diff = compDiff(bestS.comp, compOfEchoes(ch2 && ch2.echoes));
    if (diff) log(`warn 副词条落地不一致：${diff}`);

    UI.best = ft;
    UI.gainPct = base > 0 ? ((ft - base) / base) * 100 : null;
    UI.resultHtml = buildResult(
      char,
      bestS.profile.name,
      bestS.profile.costs,
      bestS.mains,
      bestS.comp,
      ch2 ? ch2.echoes : null,
      base,
      ft,
    );
    UI.done = true;
    UI.kept = true; // 算完即应用并保留最优配置
    ok = true;
    setProg(
      '计算完成' + (st.budgetHit ? '（预算用尽，取已找到的最优）' : '') +
        (bestS.partial ? '（副词条未补齐，可再点一次计算）' : ''),
    );
    renderOverlay(); // 收尾强制渲染一次：进度栏有 450ms 节流，这里不能省
    log(
      `done base=${Math.round(base)} ft=${Math.round(ft)} calls=${st.searchCalls}` +
        `${st.budgetHit ? ' budgetHit' : ''} cost=${bestS.profile.name}` +
        ` mains=${bestS.mains.join('/')}`,
    );
  } catch (error) {
    log(`opt err ${String((error && error.message) || error)}`);
    UI.msg = `优化出错：${String((error && error.message) || error)}`;
  } finally {
    st.running = false;
    UI.busy = false;
    st.runStart = 0;
    if (!ok) {
      try {
        await doRestore();
      } catch {
        // 还原失败已在 doRestore 里写进 UI.msg
      }
      UI.done = false;
      UI.kept = false;
      if (!UI.msg) UI.msg = '未完成，已还原原配装';
    }
    if (st.unlockedThisRun) {
      try {
        await call('lock_phase', { phase: 'config' });
      } catch {
        // 锁不回去也不影响结果
      }
      st.unlockedThisRun = false;
    }
  }
}
