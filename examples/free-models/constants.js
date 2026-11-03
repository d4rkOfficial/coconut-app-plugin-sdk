/** 托管配置的标记与固定常量。 */
/** 免费模型服务监听的首选端口；被占用时退回系统分配。 */
export const SERVER_PORT = 47830;
/** 代理会把这个占位 Key 换成用户真实存的 Key，所以这里不是秘密。 */
export const PUBLIC_KEY = 'public';
/** 托管配置的 label 前缀（零宽字符，用户改不动、也不显眼）。 */
export const MANAGED_PREFIX = '\u200B';
export const MANAGED_LABEL = '\u200BOC_FREE\u200C';
/** 老版本用过的可见前缀，同步时顺手清理。 */
export const LEGACY_PREFIX = '椰果免费 · ';
/** 页面没就绪时的最大重试次数。 */
export const MAX_RETRIES = 6;
