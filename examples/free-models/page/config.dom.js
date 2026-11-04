/**
 * 页面侧脚本：读工具箱已经落盘的 ai-config（用来等内存里的列表追上 IndexedDB）。
 * 返回 `{ profiles: [...] }` 或 `null`。
 */
export async function readAiConfig() {
  const value = await new Promise((resolve) => {
    const req = indexedDB.open('wuwa-v1', 1);
    req.onerror = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) {
        resolve(null);
        return;
      }
      const get = db.transaction('cache', 'readonly').objectStore('cache').get('ai-config');
      get.onerror = () => resolve(null);
      get.onsuccess = () => {
        const record = get.result;
        resolve(record && record.data ? { profiles: record.data.profiles || [] } : null);
      };
    };
  });
  return value;
}
