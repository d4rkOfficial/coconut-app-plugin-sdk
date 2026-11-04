/**
 * 宿主 API 封装：工具调用的同步/异步统一（字符串 JSON.parse、解包 data / ok:false）、
 * 真实计算计数（预算）、角色属性读取、日志。
 */
import { st } from './state.js';

const P = 'echo-substat-optimizer';

/** 插件日志统一前缀。 */
export function log(message) {
  try {
    Coconut.log(`[${P}] ${message}`);
  } catch {
    // 日志失败不能影响主流程
  }
}

/** 调工具箱工具：异步、不阻塞插件线程；解包 `data` 与 `ok:false`。 */
export function call(name, args) {
  return Coconut.tools.call(name, args || {}).then(
    (value) => {
      if (value && typeof value === 'object' && value.ok === false) {
        return { __err: value.error || `执行失败:${name}` };
      }
      if (value && typeof value === 'object' && 'data' in value && value.data !== undefined) {
        return value.data;
      }
      return value;
    },
    (error) => ({ __err: String((error && error.message) || error) }),
  );
}

export function sleep(ms) {
  return new Promise((resolve) => {
    Coconut.setTimeout(() => {
      resolve(1);
    }, ms);
  });
}

/**
 * 真实计算一次全队总伤（计入预算）。
 * 预算用尽只置 budgetHit，由调用方决定「停止搜索但保留结果」。
 */
export async function calcTotal() {
  st.searchCalls++;
  if (st.searchCalls > st.searchMax) st.budgetHit = true;
  const result = await call('get_result_summary', { summaryOnly: true });
  const value = Number(result && result.total);
  return isFinite(value) ? value : NaN;
}

/** 角色参与计算的伤害属性（用来生成 3cost 属性加成主词条）。 */
export async function charElements(char) {
  try {
    const result = await call('get_result_summary', { character: char });
    const entries = (result && result.entries) || [];
    const set = {};
    for (const entry of entries) {
      if (entry && entry.element) set[entry.element] = 1;
    }
    return Object.keys(set);
  } catch {
    return [];
  }
}
