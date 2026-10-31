/**
 * 配置（AI profile）层面的原子操作：识别托管配置、增删改、拉模型列表、去重。
 * 只管「一条配置怎么读写」，不管什么时候同步（那是 sync.js 的事）。
 */
import { BASE_URL, LEGACY_PREFIX, MANAGED_LABEL, MANAGED_PREFIX, PUBLIC_KEY } from './constants.js';
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
export function profileFields(model) {
  return {
    baseUrl: BASE_URL,
    model,
    // 真实 Key 由启动器代理兜底：这里的 public 不是合法 Key，代理会换成用户存的那把。
    apiKey: PUBLIC_KEY,
    maxToolRounds: 48,
    directRequest: false,
  };
}

/**
 * 删一条配置。工具箱要求至少保留一条，删不掉时把它改回空白「默认配置」
 * （这样列表里也看不到免费模型了）。
 */
export function deleteProfile(profile) {
  try {
    Coconut.callTool('manage_ai_profile', { action: 'delete', id: profile.id });
    return true;
  } catch (error) {
    try {
      Coconut.callTool('manage_ai_profile', {
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
export function dedupeManaged() {
  const state = Coconut.callTool('get_ai_profiles', {}) || {};
  const seen = new Set();
  let removed = 0;
  for (const profile of state.profiles || []) {
    if (!isManaged(profile)) continue;
    const model = String(profile.model || '');
    if (!seen.has(model)) {
      seen.add(model);
      continue;
    }
    if (deleteProfile(profile)) removed += 1;
  }
  return removed;
}

/** 拿启动器免费代理的模型列表（刚启动时列表可能还没就绪，会重试几次）。 */
export async function fetchModels() {
  for (let attempt = 0; attempt < 4; attempt++) {
    const payload = Coconut.fetch(`${BASE_URL}/models`, {});
    const list = (payload && payload.json && payload.json.data) || [];
    const ids = list.map((item) => String(item.id)).filter(Boolean);
    if (ids.length) return ids;
    await Coconut.sleep(1200);
  }
  return [];
}

/** 写工具箱设置（比如 ai_enabled）。 */
export function setSetting(key, value) {
  try {
    Coconut.callTool('set_setting', { key, value });
  } catch (error) {
    log(`设置 ${key} 失败：${error}`);
  }
}

/** 把当前模型列表同步进工具箱，返回增/改/删的条数。 */
export function syncModels(models) {
  const state = Coconut.callTool('get_ai_profiles', {}) || {};
  const profiles = state.profiles || [];
  const managed = profiles.filter(isManaged);
  let added = 0;
  let updated = 0;

  for (const model of models) {
    const index = managed.findIndex((profile) => String(profile.model || '') === model);
    if (index >= 0) {
      const profile = managed.splice(index, 1)[0];
      Coconut.callTool('manage_ai_profile', {
        action: 'update',
        id: profile.id,
        label: MANAGED_LABEL,
        ...profileFields(model),
      });
      updated += 1;
    } else {
      Coconut.callTool('manage_ai_profile', {
        action: 'add',
        label: MANAGED_LABEL,
        ...profileFields(model),
      });
      added += 1;
    }
  }

  let removed = 0;
  for (const profile of managed) {
    if (deleteProfile(profile)) removed += 1;
  }
  for (const profile of profiles) {
    const label = String(profile.label || '');
    if (label.startsWith(LEGACY_PREFIX)) {
      if (deleteProfile(profile)) removed += 1;
    } else if ((profile.id === 'default' || label === '默认配置') && isEmptyProfile(profile)) {
      if (deleteProfile(profile)) removed += 1;
    }
  }
  return { added, updated, removed };
}
