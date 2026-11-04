/**
 * 页面探测：是否在词条页、浮窗交互意图、角色头像。
 *
 * 页面脚本直接交给 `Coconut.toolbox.runJs`（函数对象 + 参数），
 * 返回值就是页面里 return 的真实值，不用再 JSON.parse。
 */
import { collectAvatars } from './page/avatar.dom.js';
import { readConfigView } from './page/config.dom.js';
import { readOverlayIntent } from './page/intent.dom.js';
import { st } from './state.js';

/** 当前是否在词条页（内容识别为主，导航激活态兜底）。 */
export async function detectConfig() {
  try {
    return (await Coconut.toolbox.runJs(readConfigView)) || { onConfig: false };
  } catch (error) {
    return { onConfig: false, err: String(error) };
  }
}

/** 读浮窗交互意图（按钮/胶囊点击）。 */
export async function readIntent() {
  try {
    const value = await Coconut.toolbox.runJs(readOverlayIntent);
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

/** 读角色头像：把配装页真实 `<img>` 的 src 映射到角色名（相对路径用工具箱地址补全）。 */
export async function loadAvatars() {
  try {
    const list = await Coconut.toolbox.runJs(collectAvatars);
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
