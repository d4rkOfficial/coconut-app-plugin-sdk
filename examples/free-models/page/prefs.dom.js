/**
 * 页面侧脚本：读工具箱的 ai-gen-prefs（判断用户有没有关掉 AI 助手）。
 *
 * 约束（见 AGENTS.md）：函数必须**完全自包含**——只有函数本体被序列化进页面，
 * 模块作用域里的东西（import、顶层常量）在页面里都不存在。
 */
export async function readAiPrefs() {
  const value = await new Promise((resolve) => {
    const req = indexedDB.open('wuwa-v1', 1);
    req.onerror = () => resolve({ error: true });
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) {
        resolve({ found: false });
        return;
      }
      const get = db.transaction('cache', 'readonly').objectStore('cache').get('ai-gen-prefs');
      get.onerror = () => resolve({ error: true });
      get.onsuccess = () => {
        const record = get.result;
        const data = record && record.data ? record.data : null;
        if (!data) {
          resolve({ found: false });
          return;
        }
        resolve({ found: true, enabled: data.enabled === true });
      };
    };
  });
  return JSON.stringify(value);
}
