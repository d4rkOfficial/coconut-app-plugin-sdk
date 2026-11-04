/**
 * 页面侧脚本：识别当前是不是「词条 / 环境配置 / 配装」视图。
 * 返回 JSON：`{ onConfig, charTabs, subChips, navView, err }`。
 */
export function readConfigView() {
  const out = { onConfig: false, charTabs: 0, subChips: 0, navView: '', err: '' };
  try {
    const NAV = {
      '队伍': 1,
      '队伍配置': 1,
      '排轴': 1,
      '拉表': 1,
      '词条': 1,
      '环境配置': 1,
      '配装': 1,
      '结果': 1,
    };
    const CONFIG_VIEW = { '词条': 1, '环境配置': 1, '配装': 1 };
    const activeish = function (el) {
      const cls = String(el.className || '').toLowerCase();
      const as = el.getAttribute('aria-selected');
      const ac = el.getAttribute('aria-current');
      return /active|selected|current/.test(cls) || as === 'true' || as === 'page' ||
        ac === 'page' || ac === 'true';
    };

    // 导航激活态兜底：能唯一确定视图时就以它为准
    let activeView = '';
    for (const el of document.querySelectorAll('button,[role=tab],[role=menuitem],a')) {
      const t = String(el.textContent || '').trim();
      if (!t || t.length > 8 || !NAV[t]) continue;
      if (activeish(el)) activeView = activeView ? '_multi' : t;
    }

    // 内容识别为主：角色 cost 标签 + 副词条 chip
    const all = document.querySelectorAll('button,a,div,span,[role=tab],[role=menuitem]');
    let ct = 0;
    let sc = 0;
    for (const el of all) {
      const t = String(el.textContent || '').trim();
      if (!t || t.length > 16) continue;
      if (/^[^\s]{1,6}\s*\(\d{4,5}\)$/.test(t)) ct++;
      if (
        /^(暴击率|暴击伤害|攻击%|生命%|防御%|共鸣效率|攻击|生命|防御|普攻伤害加成|共鸣解放伤害加成|重击伤害加成|共鸣技能伤害加成|普攻加成)\s+[\d.]+%?\s*$/
          .test(t)
      ) sc++;
    }
    out.charTabs = ct;
    out.subChips = sc;
    out.navView = activeView;

    let res = (ct >= 1) || (sc >= 4);
    if (activeView && activeView !== '_multi') res = !!CONFIG_VIEW[activeView];
    out.onConfig = res;
  } catch (e) {
    out.err = String(e);
  }
  return out;
}
