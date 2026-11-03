/**
 * opencode 免费模型列表：上游拉取、24 小时缓存、对外 id 映射。
 *
 * 这里不再经过启动器的 Rust 代理，全部走 Coconut.fetch；模型缓存放进插件私有
 * storage，重启启动器后仍能沿用上次结果。
 */

export const UPSTREAM = 'https://opencode.ai/inference/v1';
export const PUBLIC_KEY = 'public';
const MODELS_TTL = 24 * 60 * 60 * 1000;
const MODELS_KEY = 'models-v1';
const USER_AGENT = 'opencode/1.19.3';

const publicId = (id) => {
  if (id === 'big-pickle') return null;
  const base = String(id || '').replace(/-free$/, '');
  if (!base || base === id) return null;
  return base;
};

export const extractModels = (payload) => {
  const list = payload && Array.isArray(payload.data) ? payload.data : [];
  const ids = list
    .map((item) => String((item && item.id) || ''))
    .filter((id) => id && !id.startsWith('jev-'))
    .map(publicId)
    .filter(Boolean);
  return Array.from(new Set(ids)).sort();
};

const readCache = () => {
  const cached = Coconut.storage.get(MODELS_KEY, null);
  if (!cached || typeof cached !== 'object') return null;
  const at = Number(cached.at || 0);
  const models = Array.isArray(cached.models) ? cached.models.map(String).filter(Boolean) : [];
  if (!models.length) return null;
  return { at, models };
};

const writeCache = (models) => {
  Coconut.storage.set(MODELS_KEY, { at: Date.now(), models });
};

/** 拿对外模型 id 列表；force=false 时优先用 24 小时缓存。 */
export const fetchModels = (force = false) => {
  const cached = readCache();
  if (!force && cached && Date.now() - cached.at < MODELS_TTL) return cached.models;

  try {
    const response = Coconut.fetch(`${UPSTREAM}/models`, {
      headers: {
        'user-agent': USER_AGENT,
        accept: 'application/json',
      },
    });
    if (response.ok && response.json) {
      const models = extractModels(response.json);
      if (models.length) {
        writeCache(models);
        return models;
      }
    }
    Coconut.log('免费模型列表为空或上游返回异常，沿用缓存');
  } catch (error) {
    Coconut.log('拉取免费模型列表失败：', String(error));
  }
  return cached ? cached.models : [];
};

export const upstreamModel = (publicModel) => `${publicModel}-free`;

/** 调用方自带的 Key 合法就用它，否则退回公开额度。 */
export const authorization = (headers) => {
  const raw = String((headers && headers.authorization) || '').trim();
  const key = raw.replace(/^Bearer\s+/i, '').trim();
  const invalid = !key || key.length < 8 || key.length > 200;
  const blocked = ['public', 'undefined', 'null', 'none', 'bearer'].includes(key.toLowerCase());
  if (invalid || blocked || !/^[A-Za-z0-9._~+/=-]+$/.test(key)) {
    return `Bearer ${PUBLIC_KEY}`;
  }
  return `Bearer ${key}`;
};
