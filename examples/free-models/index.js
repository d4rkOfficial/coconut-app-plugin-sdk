// @name        免费模型
// @version     1.1.0
// @description 自带 OpenAI 兼容服务，把 opencode 免费模型同步成工具箱的 AI 配置
// @permissions toolbox, dom, storage, network, server
// @mount       none
/// <reference path="../../plugin-api/coconut-plugin.d.ts" />

//
// 这就是「免费模型」这套功能的全部逻辑，用的是和用户插件完全一样的 Coconut API：
//   - 插件自己用 Coconut.http 开 /v1/models 与 /v1/chat/completions；
//   - 上游列表 / 对话都走 Coconut.fetch，不再依赖启动器内置代理；
//   - 写配置走 Coconut.tools.call('manage_ai_profile')（异步，不阻塞插件线程）；
//   - 判断用户有没有关 AI 助手要读工具箱 IndexedDB，走 Coconut.toolbox.runJs；
//   - 「第一次用」用 Coconut.storage 记，避免把工具箱首次进入写下的 enabled=false 当用户选择。
//
// 模块划分：
//   constants.js  固定字段 / 标记
//   log.js        统一日志格式
//   models.js     上游模型列表、缓存、Authorization
//   openai.js     SSE 转换 / 非流式收集
//   server.js     HTTP 服务与两个 OpenAI 路由
//   page.js       页面脚本调用封装（重试、类型化返回）
//   profiles.js   单条配置的原子操作（识别托管配置 / 增删改 / 去重）
//   sync.js       同步编排（何时写、等配置就绪、失败退避重试）
//   page/*.dom.js 注入页面的自包含函数（IndexedDB 读写、打开 AI 面板）
import { log } from './log.js';
import { closeServer, ensureServer } from './server.js';
import { safeSync } from './sync.js';

async function onStart() {
  try {
    ensureServer();
  } catch (error) {
    log(`启动免费模型服务失败：${error}`);
  }
  log(`插件已加载（${Coconut.plugin.version}）`);
}

async function onHello() {
  try {
    ensureServer();
  } catch (error) {
    log(`启动免费模型服务失败：${error}`);
    return;
  }
  await safeSync('onHello');
}

async function onEvent(event) {
  if (!event || event.type !== 'resync') return;
  await safeSync('resync');
}

async function onStop() {
  closeServer();
  log('插件停止');
}

// —— 交给引擎 ——
// esbuild 会把这整份代码包进 IIFE，函数声明不再落在全局作用域；
// 插件宿主是在 globalThis 上找钩子的，所以这里显式挂出去。
globalThis.onStart = onStart;
globalThis.onHello = onHello;
globalThis.onEvent = onEvent;
globalThis.onStop = onStop;
