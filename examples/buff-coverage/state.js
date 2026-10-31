/** 插件运行期状态（模块之间共享同一个对象，改属性而不是重新赋值）。 */
export const st = {
  /** 当前浮层 id（0 = 没有） */
  ovId: 0,
  /** 上次渲染的 html，用来跳过重复 overlay */
  lastHtml: '',
  /** 轮询定时器 id */
  timer: null,
  /** 正在刷新（防重入） */
  scanning: false,
  /** 几何日志只打一次 */
  geomLogged: false,
  /** 上次渲染用的 css，用来判断主题是否变了 */
  themeCss: '',
  /** 上次每个色块的位置，用来做平滑过渡 */
  barGeo: {},
};
