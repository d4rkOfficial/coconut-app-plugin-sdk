/**
 * 页面探测：是否在词条页、浮窗交互意图、角色头像。
 */
import { collectAvatars } from './page/avatar.dom.js';
import { readConfigView } from './page/config.dom.js';
import { readOverlayIntent } from './page/intent.dom.js';
import { pageCall } from './page/run.js';
import { st } from './state.js';

/** 跑一段页面脚本，兼容「同步返回 / 返回 Promise」两种宿主实现。 */
async function runPage(code) {
  const pending = Coconut.runJs(code);
  return pending && typeof pending.then === 'function' ? await pending : pending;
}

/** 当前是否在词条页（内容识别为主，导航激活态兜底）。 */
export async function detectConfig() {
  let raw;
  try {
    raw = await runPage(pageCall(readConfigView));
  } catch (error) {
    return { onConfig: false, err: String(error) };
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    return { onConfig: false, parseErr: String(error), raw: String(raw).slice(0, 160) };
  }
}

/** 读浮窗交互意图（按钮/胶囊点击）。 */
export async function readIntent() {
  let raw;
  try {
    raw = await runPage(pageCall(readOverlayIntent));
  } catch {
    return {};
  }
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** 读角色头像：把配装页真实 `<img>` 的 src 映射到角色名（相对路径用工具箱地址补全）。 */
export async function loadAvatars() {
  try {
    const raw = await runPage(pageCall(collectAvatars));
    const list = JSON.parse(raw);
    const base = (Coconut.src && Coconut.src.toolbox && Coconut.src.toolbox.url) || '';
    const all = {};
    for (const item of (Array.isArray(list) ? list : [])) {
      if (!item || !item.name || !item.src) continue;
      let url = item.src;
      if (url.charAt(0) === '/') url = base + url;
      all[item.name] = url;
    }
    const matched = {};
    for (const char of st.teamChars) {
      if (all[char]) matched[char] = all[char];
    }
    if (!Object.keys(matched).length) {
      // 兜底：按包含匹配
      for (const char of st.teamChars) {
        for (const key of Object.keys(all)) {
          if (key && char && (key.indexOf(char) >= 0 || char.indexOf(key) >= 0)) {
            matched[char] = all[key];
          }
        }
      }
    }
    if (Object.keys(matched).length) st.avatars = matched;
  } catch {
    // 配装页还没渲染出头像时忽略
  }
}
