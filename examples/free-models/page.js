/**
 * 页面脚本的调用封装：函数对象直接交给 `Coconut.toolbox.runJs`，
 * 返回值是页面侧的真实值；这里只处理「页面还没打开」这种可重试的情况。
 */
import { log } from './log.js';
import { openAssistant as openAssistantPage } from './page/assistant.dom.js';
import { readAiConfig as readAiConfigPage } from './page/config.dom.js';
import { readAiPrefs as readAiPrefsPage } from './page/prefs.dom.js';

/** 读工具箱 ai-gen-prefs：`{ found, enabled }` / `{ error: true }` / `null`（读不到）。 */
export async function readAiPrefs() {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const parsed = await Coconut.toolbox.runJs(readAiPrefsPage);
      if (parsed && parsed.error) {
        await Coconut.sleep(500);
        continue;
      }
      return parsed;
    } catch (error) {
      // 页面还在启动时 runJs 会报「工具箱页面还没打开」：等一下重试，别急着放弃
      if (attempt < 2) log(`读取 AI 助手开关失败：${error}`);
      await Coconut.sleep(700);
    }
  }
  return null;
}

/** 读 IndexedDB 里的 ai-config（读失败就返回 null）。 */
export async function readAiConfig() {
  try {
    return await Coconut.toolbox.runJs(readAiConfigPage);
  } catch {
    return null;
  }
}

/** 打开工具箱的 AI 悬浮窗。 */
export async function openAssistantPanel() {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = String(await Coconut.toolbox.runJs(openAssistantPage));
      if (result === 'already' || result === 'opened') return true;
    } catch (error) {
      log(`打开 AI 悬浮窗失败：${error}`);
      return false;
    }
    await Coconut.sleep(400);
  }
  return false;
}
