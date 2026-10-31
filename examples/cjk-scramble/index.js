// @name        中日韩随机乱码
// @version     1.0.0
// @description 把页面文字按字符替换成随机中日韩字符（单向替换，用于截图遮挡/整活演示）
// @permissions dom
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />

// 结构：
//   chars.js           造字符池（纯数据）
//   page/apply.dom.js  注入页面的脚本：替换文字 + MutationObserver 跟踪后续渲染
//   page/destroy.dom.js 注入页面的脚本：断开观察器
//   page/run.js        把页面函数序列化成 runJs 代码
import { buildCharPool } from './chars.js';
import { applyScramble } from './page/apply.dom.js';
import { destroyScramble } from './page/destroy.dom.js';
import { pageCall } from './page/run.js';

const CHAR_POOL = buildCharPool();

async function runTranslate() {
  try {
    const ret = Coconut.runJs(pageCall(applyScramble, CHAR_POOL));
    Coconut.log('中日韩乱码已注入，返回：', ret);
  } catch (err) {
    Coconut.log('注入失败：', String(err));
  }
}

async function destroyTranslate() {
  try {
    Coconut.runJs(pageCall(destroyScramble));
    Coconut.log('乱码已停止监听（⚠️ 已经被打乱的文字不会自动复原！本脚本是单向替换）');
  } catch (error) {
    Coconut.log('销毁实例异常：', String(error));
  }
}

async function onHello() {
  await runTranslate();
}

async function onStop() {
  await destroyTranslate();
}

// —— 交给插件宿主 ——
// 打包成 IIFE 后函数声明不在全局作用域，宿主只在 globalThis 上找钩子。
globalThis.onHello = onHello;
globalThis.onStop = onStop;
