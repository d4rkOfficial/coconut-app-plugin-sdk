/**
 * 页面脚本的调用封装：把 `.dom.js` 里的函数序列化后丢给 `Coconut.runJs`，
 * 并处理「页面还没打开」这种可重试的情况。
 */
import { log } from './log.js';
import { openAssistant as openAssistantPage } from './page/assistant.dom.js';
import { readAiConfig as readAiConfigPage } from './page/config.dom.js';
import { readAiPrefs as readAiPrefsPage } from './page/prefs.dom.js';
import { pageCall } from './page/run.js';

/** 读工具箱 ai-gen-prefs：`{ found, enabled }` / `{ error: true }` / `null`（读不到）。 */
export async function readAiPrefs() {
  const code = pageCall(readAiPrefsPage);
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      const parsed = JSON.parse(await Coconut.runJs(code));
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
    return JSON.parse(await Coconut.runJs(pageCall(readAiConfigPage)));
  } catch {
    return null;
  }
}

/** 打开工具箱的 AI 悬浮窗。 */
export async function openAssistantPanel() {
  const code = pageCall(openAssistantPage);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const result = String(await Coconut.runJs(code));
      if (result === 'already' || result === 'opened') return true;
    } catch (error) {
      log(`打开 AI 悬浮窗失败：${error}`);
      return false;
    }
    await Coconut.sleep(400);
  }
  return false;
}
