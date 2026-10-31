/** 插件运行期状态 + 界面状态（模块之间共享同一个对象，只改属性、不重新赋值整个对象）。 */
export const st = {
  /** 浮层 id（0 = 没有） */
  ovId: 0,
  /** 主循环定时器 id */
  timer: null,
  /** 主循环是否已启动（防重入） */
  started: false,
  /** 主循环是否正在跑（防重入） */
  scanning: false,
  /** 是否正在做最优计算 */
  running: false,
  /** 用户离开词条页 / 点了停止 → 中断计算并还原 */
  cancelled: false,
  /** 当前是否在词条页 */
  onConfig: false,
  /** 当前队伍角色名 */
  teamChars: [],
  /** 快照方案名 */
  snapName: 'eso_snap',
  /** 工具箱是否深色主题 */
  dark: true,
  /** 连续离开词条页的次数（离开 2 次才判定为真的离开） */
  falseStreak: 0,
  /** 主题 accent 背景色 / 文字色 / 圆角 */
  accentBg: '',
  accentText: '',
  surfaceRadius: 10,
  /** 上次渲染的 html / css（去重用） */
  lastHtml: '',
  lastCss: '',
  /** 主循环计数 / 上次渲染时间（进度条限流） */
  tick: 0,
  lastRenderT: 0,
  /** 本轮是否解锁了词条环节（结束时锁回去） */
  unlockedThisRun: false,
  /** 角色名 → 头像 URL */
  avatars: {},
  /** 浮窗是否显示 */
  overlayShow: false,
  /** 活动工程指纹（工程名|角色列表），变了就中断并刷新 */
  projectFP: '',
  /** 本轮已用的真实计算次数 / 预算 */
  searchCalls: 0,
  searchMax: 2600,
  /** 预算是否用尽（只停搜索，不丢结果） */
  budgetHit: false,
  /** 本轮开始时间 / 正在算的角色名 / 迄今最大总伤 */
  runStart: 0,
  runChar: '',
  runBest: -Infinity,
  /** 真实配装的槽状态缓存（只写变化项） */
  liveCosts: [0, 0, 0, 0, 0],
  liveMains: ['', '', '', '', ''],
  /** 1cost 主词条池（按角色成长属性实测后改写） */
  main1Pool: ['攻击%'],
};

/** 界面状态 */
export const UI = {
  charIdx: 0,
  N: 14,
  prog: '',
  msg: '',
  base: null,
  best: null,
  gainPct: null,
  resultHtml: '',
  busy: false,
  done: false,
  kept: false,
  pos: null,
};

/** 记录「迄今发现的最大总伤」（进度栏展示用）。 */
export function noteBest(value) {
  if (isFinite(value) && value > st.runBest) {
    st.runBest = value;
    return true;
  }
  return false;
}
