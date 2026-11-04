/**
 * 配置（AI profile）层面的原子操作：识别托管配置、增删改、去重。
 * 只管「一条配置怎么读写」，不管什么时候同步（那是 sync.js 的事）。
 *
 * 所有工具调用都是 `await Coconut.tools.call(...)`：不阻塞插件线程，
 * 同步过程里定时器 / http 服务照常工作。
 */
import { LEGACY_PREFIX, MANAGED_LABEL, MANAGED_PREFIX, PUBLIC_KEY } from './constants.js';
import { log } from './log.js';

/** 这条配置是不是本插件写入的托管配置。 */
export function isManaged(profile) {
  return String(profile.label || '').startsWith(MANAGED_PREFIX);
}

/** 空白「默认配置」：baseUrl / model / apiKey 都没填。 */
function isEmptyProfile(profile) {
  const empty = (value) => String(value || '').trim() === '';
  return empty(profile.baseUrl) && empty(profile.model) && profile.apiKeySet !== true;
}

/** 托管配置的固定字段。 */
export function profileFields(model, baseUrl) {
  return {
    baseUrl,
    model,
    // 真实 Key 由插件的 Authorization 透传兜底：这里的 public 不是合法 Key。
    apiKey: PUBLIC_KEY,
    maxToolRounds: 48,
    directRequest: false,
  };
}

/** 调一次工具，失败只记日志。 */
async function tool(name, args) {
  try {
    return (await Coconut.tools.call(name, args)) || {};
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 删一条配置。工具箱要求至少保留一条，删不掉时把它改回空白「默认配置」
 * （这样列表里也看不到免费模型了）。
 */
export async function deleteProfile(profile) {
  try {
    await tool('manage_ai_profile', { action: 'delete', id: profile.id });
    return true;
  } catch (error) {
    try {
      await tool('manage_ai_profile', {
        action: 'update',
        id: profile.id,
        label: '默认配置',
        baseUrl: '',
        model: '',
        apiKey: '',
      });
    } catch (inner) {
      log(`清理配置失败：${inner}`);
    }
    return false;
  }
}

/** 兜底去重：同一 model 只留第一条托管配置。 */
export async function dedupeManaged() {
  const state = await tool('get_ai_profiles', {});
  const seen = new Set();
  let removed = 0;
  for (const profile of state.profiles || []) {
    if (!isManaged(profile)) continue;
    const model = String(profile.model || '');
    if (!seen.has(model)) {
      seen.add(model);
      continue;
    }
    if (await deleteProfile(profile)) removed += 1;
  }
  return removed;
}

/** 写工具箱设置（比如 ai_enabled）：失败了也不打断同步。 */
export async function setSetting(key, value) {
  try {
    await tool('set_setting', { key, value });
  } catch (error) {
    log(`设置 ${key} 失败：${error}`);
  }
}

/** 把当前模型列表同步进工具箱，返回增/改/删的条数。 */
export async function syncModels(models, baseUrl) {
  const state = await tool('get_ai_profiles', {});
  const profiles = state.profiles || [];
  const managed = profiles.filter(isManaged);
  let added = 0;
  let updated = 0;

  for (const model of models) {
    const index = managed.findIndex((profile) => String(profile.model || '') === model);
    if (index >= 0) {
      const profile = managed.splice(index, 1)[0];
      await tool('manage_ai_profile', {
        action: 'update',
        id: profile.id,
        label: MANAGED_LABEL,
        ...profileFields(model, baseUrl),
      });
      updated += 1;
    } else {
      await tool('manage_ai_profile', {
        action: 'add',
        label: MANAGED_LABEL,
        ...profileFields(model, baseUrl),
      });
      added += 1;
    }
  }

  let removed = 0;
  for (const profile of managed) {
    if (await deleteProfile(profile)) removed += 1;
  }
  for (const profile of profiles) {
    const label = String(profile.label || '');
    if (label.startsWith(LEGACY_PREFIX)) {
      if (await deleteProfile(profile)) removed += 1;
    } else if ((profile.id === 'default' || label === '默认配置') && isEmptyProfile(profile)) {
      if (await deleteProfile(profile)) removed += 1;
    }
  }
  return { added, updated, removed };
}
