/**
 * 统一日志格式：字符串原样拼，其它值 JSON 化。
 * （Coconut.log 用 String() 拼参，对象会变成 [object Object]。）
 * @param {...unknown} args
 */
export function log(...args) {
  Coconut.log(...args.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))));
}
