// @name        免费模型
// @version     1.0.0
// @description 把启动器免费模型代理里的模型同步成工具箱的 AI 配置（内置插件，可停用）
// @permissions toolbox, dom, storage, network
// @mount       none
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />

//
// 这就是「免费模型」这套功能的全部逻辑，用的是和用户插件完全一样的 Coconut API：
//   - 模型列表来自启动器自己的 /v1/models（那边一天只向上游打一次，结果带缓存）；
//   - 写配置走 Coconut.callTool('manage_ai_profile')；
//   - 判断用户有没有关 AI 助手要读工具箱 IndexedDB，走 Coconut.runJs；
//   - 「第一次用」用 Coconut.storage 记，避免把工具箱首次进入写下的 enabled=false 当用户选择。
//
// 模块划分：
//   constants.js  固定字段 / 标记
//   log.js        统一日志格式
//   page.js       页面脚本调用封装（重试、JSON 解析）
//   profiles.js   单条配置的原子操作（识别托管配置 / 增删改 / 拉模型 / 去重）
//   sync.js       同步编排（何时写、等配置就绪、失败退避重试）
//   page/*.dom.js 注入页面的自包含函数（IndexedDB 读写、打开 AI 面板）
import { log } from './log.js';
import { safeSync } from './sync.js';

async function onStart() {
  log(`插件已加载（${Coconut.plugin.version}）`);
}

async function onHello() {
  await safeSync('onHello');
}

async function onEvent(event) {
  if (!event || event.type !== 'resync') return;
  await safeSync('resync');
}

async function onStop() {
  log('插件停止');
}

// —— 交给引擎 ——
// esbuild 会把这整份代码包进 IIFE，函数声明不再落在全局作用域；
// 插件宿主是在 globalThis 上找钩子的，所以这里显式挂出去。
globalThis.onStart = onStart;
globalThis.onHello = onHello;
globalThis.onEvent = onEvent;
globalThis.onStop = onStop;
