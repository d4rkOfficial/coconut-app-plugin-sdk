/**
 * 中日韩随机字符池：常用简体中文 + 平假名 + 片假名 + 韩文谚文。
 *
 * 页面脚本是自包含函数，拿不到模块作用域，所以这里只负责「造数据」，
 * 由 index.js 作为参数传给 page/apply.dom.js。
 */
export function buildCharPool() {
  let pool = '';
  for (let code = 0x4e00; code <= 0x4fa0; code++) pool += String.fromCodePoint(code); // 常用简体中文
  for (let code = 0x3040; code <= 0x309f; code++) pool += String.fromCodePoint(code); // 平假名
  for (let code = 0x30a0; code <= 0x30ff; code++) pool += String.fromCodePoint(code); // 片假名
  for (let code = 0xac00; code <= 0xad00; code++) pool += String.fromCodePoint(code); // 韩文谚文
  return pool;
}
