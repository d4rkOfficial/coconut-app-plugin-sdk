// @name        中日韩随机乱码
// @version     1.1.0
// @description 把页面文字按字符替换成随机中日韩字符（单向替换，用于截图遮挡/整活演示）
// @permissions dom
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />

// 结构：
//   chars.js            造字符池（纯数据）
//   page/apply.dom.js   注入页面的脚本：替换文字 + MutationObserver 跟踪后续渲染
//   page/destroy.dom.js 注入页面的脚本：断开观察器
//
// 页面脚本直接传给 Coconut.toolbox.runJs：引擎会取出函数源码送到页面执行，
// 后面的参数 JSON 序列化后传进去。不再需要 pageCall 那层字符串拼接。
import { buildCharPool } from './chars.js';
import { applyScramble } from './page/apply.dom.js';
import { destroyScramble } from './page/destroy.dom.js';

const CHAR_POOL = buildCharPool();

function runTranslate() {
  try {
    const ret = Coconut.toolbox.runJs(applyScramble, CHAR_POOL);
    Coconut.log('中日韩乱码已注入，返回：', String(ret));
  } catch (error) {
    Coconut.log('注入失败：', String(error));
  }
}

function destroyTranslate() {
  try {
    Coconut.toolbox.runJs(destroyScramble);
    Coconut.log('乱码已停止监听（⚠️ 已经被打乱的文字不会自动复原！本脚本是单向替换）');
  } catch (error) {
    Coconut.log('销毁实例异常：', String(error));
  }
}

async function onHello() {
  runTranslate();
}

/** 页面重载 / 关闭：观察器随页面一起消失，这里只留个记录。 */
async function onBye() {
  Coconut.log('工具箱页面已关闭，乱码观察器随页面释放');
}

async function onStop() {
  destroyTranslate();
}

// —— 交给插件宿主 ——
// 打包成 IIFE 后函数声明不在全局作用域，宿主只在 globalThis 上找钩子。
globalThis.onHello = onHello;
globalThis.onBye = onBye;
globalThis.onStop = onStop;
