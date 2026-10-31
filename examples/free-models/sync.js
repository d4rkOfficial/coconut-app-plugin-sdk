/**
 * 同步编排：判断该不该写配置、等工具箱把配置读进内存、写完后打开 AI 面板，
 * 以及「页面还没打开」时的退避重试。
 */
import { MAX_RETRIES } from './constants.js';
import { log } from './log.js';
import { openAssistantPanel, readAiConfig, readAiPrefs } from './page.js';
import {
  dedupeManaged,
  deleteProfile,
  fetchModels,
  isManaged,
  setSetting,
  syncModels,
} from './profiles.js';

/**
 * 工具箱是异步把 ai-config 从 IndexedDB 读进内存的：页面刚起来时
 * get_ai_profiles 可能还返回空列表，这时候直接 add 会写出重复配置。
 * 所以先看 IDB 里到底有多少条，再等内存里的列表追上。
 */
async function waitForConfig() {
  const stored = await readAiConfig();
  if (!stored || !Array.isArray(stored.profiles) || !stored.profiles.length) {
    // 真的没有历史配置：等一个节拍让工具箱初始化完
    await Coconut.sleep(1000);
    return true;
  }
  for (let attempt = 0; attempt < 16; attempt++) {
    const current = Coconut.callTool('get_ai_profiles', {}) || {};
    const ids = new Set((current.profiles || []).map((profile) => String(profile.id)));
    if (stored.profiles.every((profile) => ids.has(String(profile.id)))) return true;
    await Coconut.sleep(250);
  }
  log('等工具箱加载配置超时，按当前列表继续');
  return true;
}

let retryTimer = null;
let retryCount = 0;

/** 页面还在启动 / 正在刷新时，过几秒自己再试一次（不依赖新的 hello）。 */
export function scheduleRetry(delay, reason) {
  if (retryTimer) return;
  if (retryCount >= MAX_RETRIES) {
    log(`${reason}：已重试 ${retryCount} 次，等下一次页面就绪`);
    return;
  }
  retryCount += 1;
  log(`${reason}：${delay / 1000} 秒后重试（第 ${retryCount} 次）`);
  retryTimer = Coconut.setTimeout(async () => {
    retryTimer = null;
    await safeSync('retry');
  }, delay);
}

function isPageMissing(error) {
  return /页面还没打开|WS 连接已关闭|WS 发送失败/.test(String(error));
}

/** 主同步：读开关 → 等配置就绪 → 拉模型 → 写配置 → 视情况打开 AI 面板。 */
export async function runSync() {
  // 「写过一次」要和「这个工具箱确实有偏好」一起看：
  // 浏览器数据被清掉（新 profile）时 prefs 不存在，这时应重新按首次使用处理。
  const storedSeeded = Coconut.storage.get('seeded', false) === true;
  const prefs = await readAiPrefs();
  if (prefs === null) {
    // 页面刚起来 / 工具箱还没挂好：状态未知就别动用户的配置，过几秒重试
    scheduleRetry(3000, '读不到 AI 助手开关');
    return;
  }
  if (!(await waitForConfig())) {
    log('工具箱配置还没准备好，跳过本次同步');
    return;
  }
  const seeded = storedSeeded && prefs.found === true;
  const aiOff = prefs.found === true && prefs.enabled === false && seeded;

  if (aiOff) {
    const state = Coconut.callTool('get_ai_profiles', {}) || {};
    let removed = 0;
    for (const profile of state.profiles || []) {
      if (isManaged(profile) && deleteProfile(profile)) removed += 1;
    }
    log(`用户关掉了 AI 助手，已清理 ${removed} 条免费模型配置`);
    return;
  }

  let models = [];
  try {
    models = await fetchModels();
  } catch (error) {
    log(`拿免费模型列表失败：${error}`);
    return;
  }
  if (!models.length) {
    log('免费模型列表为空，跳过同步');
    return;
  }

  retryCount = 0;
  const result = syncModels(models);
  const deduped = dedupeManaged();
  setSetting('ai_enabled', true);
  if (!seeded) {
    Coconut.storage.set('seeded', true);
    log(`首次使用：写入 ${models.length} 个免费模型并打开 AI 助手`);
  } else {
    log(
      `同步完成：新增 ${result.added}，更新 ${result.updated}，清理 ${result.removed + deduped}`,
    );
  }
  if (prefs.found !== true || prefs.enabled === true) {
    await openAssistantPanel();
  }
}

/** 带「页面没就绪就退避重试」的同步入口。 */
export async function safeSync(reason) {
  try {
    await runSync();
  } catch (error) {
    if (isPageMissing(error)) {
      scheduleRetry(2500, `${reason}：工具箱页面还没连上`);
      return;
    }
    throw error;
  }
}
