// @name        最优声骸词条
// @version     1.14.1
// @description 数据分析插件：在配装页(词条页)给出角色最优声骸主/副词条。副词条条数可设、全取中档值；打开词条页显示自有 Material 玻璃悬浮窗，配置后立即调用真实计算引擎，求出该副词条数下 cost 搭配 + 主词条 + 副词条的最优解（目标=全队总伤害最大）。算法：cost 搭配×主词条全枚举排序 → 按「cost 组合 × 4cost 主词条」多样性取短名单 → 每个候选在真实引擎上做副词条贪心（每步实测全部可行词条的边际收益，自动处理双爆平衡、生命/防御成长与混编伤害加成）→ 取全局最优并应用。工具箱 UI 保持只读：运行期间仅短暂切换当前配装（快照→枚举→算），算完自动应用并保留最优配置，中途打断自动还原。
// @permissions toolbox, ui, dom
// @mount       overlay
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />
//
// 模块划分：
//   state.js      运行期状态（st）+ 界面状态（UI）
//   api.js        工具调用封装 / 预算计数 / 角色属性读取 / 日志
//   config.js     词条、cost、主词条的空间定义 + 组合枚举（纯函数）
//   slots.js      副词条槽模型 + 真实配装读写
//   search.js     主词条枚举排序 + 短名单 + 副词条贪心
//   optimize.js   最优词条主流程（快照 / 预算 / 还原）
//   overlay.js    悬浮窗 CSS / 渲染 / 结果卡片 / 进度文案
//   theme.js      工具箱主题读取（深色、accent 色、圆角）
//   detect.js     词条页检测 / 浮窗交互意图 / 角色头像
//   page/*.dom.js 注入工具箱页面的自包含脚本（检测、交互、拖动、头像、主题）
import { call, log } from './api.js';
import { detectConfig, loadAvatars, readIntent } from './detect.js';
import { doRestore, optimize } from './optimize.js';
import { renderOverlay } from './overlay.js';
import { st, UI } from './state.js';
import { loadTheme } from './theme.js';

// ---- 主循环 ----
async function mainLoop() {
  if (st.scanning) return;
  st.scanning = true;
  try {
    const det = await detectConfig();
    const onResult = (det && det.navView === '结果') || false;
    st.tick++;
    if (st.tick % 20 === 0) {
      log(
        `tick onConfig=${det.onConfig} charTabs=${det.charTabs} subChips=${det.subChips}` +
          ` navView=${det.navView || ''} err=${det.err || ''}` +
          ` running=${st.running} show=${st.overlayShow}`,
      );
    }
    if (det.onConfig) {
      st.falseStreak = 0;
      if (!st.onConfig) {
        st.onConfig = true;
        st.overlayShow = true;
        log(`config view=true det=${JSON.stringify(det)}`);
        const team = await call('get_team', {});
        st.teamChars = (team || []).map((item) => item.character).filter(Boolean);
        if (UI.charIdx >= st.teamChars.length) UI.charIdx = 0;
        await loadTheme();
        await loadAvatars();
        renderOverlay();
        if (st.ovId) Coconut.ui.show(st.ovId);
      }
    } else {
      st.falseStreak++;
      if (st.falseStreak >= 2 && st.onConfig) {
        st.onConfig = false;
        log('config view=false');
        if (st.running) st.cancelled = true;
      }
    }

    // 浮窗可见：词条页，或测量中，或有结果呈现（如在结果页）
    const wantShow = st.onConfig || st.running || (UI.done && onResult);
    if (wantShow && !st.overlayShow) {
      st.overlayShow = true;
      renderOverlay();
      if (st.ovId) Coconut.ui.show(st.ovId);
    }
    if (!wantShow && st.overlayShow) {
      st.overlayShow = false;
      // 已完成则最优配置已应用并保留；仅重置界面态（不再还原）
      UI.done = false;
      UI.kept = false;
      if (st.ovId) {
        Coconut.ui.remove(st.ovId);
        st.ovId = 0;
        st.lastHtml = '';
        st.lastCss = '';
      }
    }

    if (st.overlayShow) {
      // 切换活动工程/队伍：中断测量、刷新头像
      try {
        const project = await call('get_project_state', {});
        const arr = (project && (project.team || [])) || [];
        const chars = arr.map((item) => item.character).filter(Boolean);
        const name = (project && (project.name || project.projectName)) || '';
        const fingerprint = `${name}|${chars.join(',')}`;
        if (fingerprint !== st.projectFP) {
          st.projectFP = fingerprint;
          log(`project/team -> ${fingerprint}`);
          if (st.running) st.cancelled = true;
          if (chars.length) st.teamChars = chars;
          if (UI.charIdx >= st.teamChars.length) UI.charIdx = 0;
          UI.done = false;
          UI.kept = false;
          UI.resultHtml = '';
          UI.prog = '';
          UI.msg = '';
          await loadAvatars();
          renderOverlay();
        }
      } catch {
        // 工程状态读不到时跳过
      }

      const prevDark = st.dark;
      await loadTheme();
      if (st.dark !== prevDark) renderOverlay();

      const intent = await readIntent();
      if (intent && intent.pos) {
        const parts = String(intent.pos).split(',');
        const x = parseInt(parts[0], 10);
        const y = parseInt(parts[1], 10);
        if (isFinite(x) && isFinite(y)) UI.pos = [x, y];
      }
      if (intent && intent.char && !st.running) {
        const index = st.teamChars.indexOf(intent.char);
        if (index >= 0 && index !== UI.charIdx) {
          UI.charIdx = index;
          UI.done = false;
          UI.resultHtml = '';
          UI.msg = '';
          UI.prog = '';
          renderOverlay();
        }
      }
      if (intent && intent.run && !st.running) {
        const n = parseInt(intent.n, 10);
        if (isFinite(n)) UI.N = Math.max(0, Math.min(n, 25));
        renderOverlay();
        optimize(UI.charIdx, UI.N);
      }
    }
  } catch (error) {
    log(`loop err ${String((error && error.message) || error)}`);
  } finally {
    st.scanning = false;
  }
}

function start() {
  if (st.started) return;
  st.started = true;
  log('started, mounting interval');
  mainLoop();
  st.timer = Coconut.setInterval(mainLoop, 800);
}

async function onStart() {
  start();
}

async function onHello() {
  start();
}

async function onEvent(event) {
  if (event && event.type === 'resync') mainLoop();
}

async function onStop() {
  if (st.running) {
    st.cancelled = true;
    try {
      await doRestore();
    } catch {
      // 已停用：还原失败也只能提示
    }
  }
  if (st.timer) {
    Coconut.clearInterval(st.timer);
    st.timer = null;
  }
  if (st.ovId) {
    Coconut.ui.remove(st.ovId);
    st.ovId = 0;
    st.lastHtml = '';
    st.lastCss = '';
  }
  st.started = false;
}

/** 页面会话结束：浮层随页面消失，停掉轮询、清掉渲染缓存。 */
async function onBye() {
  if (st.timer) {
    Coconut.clearInterval(st.timer);
    st.timer = null;
  }
  st.ovId = 0;
  st.lastHtml = '';
  st.lastCss = '';
  st.started = false;
}

// —— 交给插件宿主 ——
// 打包成 IIFE 后函数声明不在全局作用域，宿主只在 globalThis 上找钩子。
globalThis.onStart = onStart;
globalThis.onHello = onHello;
globalThis.onEvent = onEvent;
globalThis.onBye = onBye;
globalThis.onStop = onStop;
