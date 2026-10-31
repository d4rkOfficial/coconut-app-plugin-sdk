/**
 * 词条 / cost / 主词条的空间定义 + 组合枚举。
 * 纯数据与纯函数，不碰宿主 API，方便单测。
 */

/** 可优化副词条类型（add_substat 的中档默认值；治疗加成中档=0，排除）。 */
export const SUB_TYPES = [
  '攻击',
  '生命',
  '防御',
  '攻击%',
  '生命%',
  '防御%',
  '暴击率',
  '暴击伤害',
  '共鸣效率',
  '普攻伤害加成',
  '重击伤害加成',
  '共鸣技能伤害加成',
  '共鸣解放伤害加成',
];

/** 副词条中档值（与 add_substat 默认值一致，全流程只用中档值）。 */
export const MID = {
  '攻击': 40,
  '生命': 430,
  '防御': 50,
  '攻击%': 8.6,
  '生命%': 8.6,
  '防御%': 10.9,
  '暴击率': 8.1,
  '暴击伤害': 16.2,
  '共鸣效率': 9.2,
  '普攻伤害加成': 8.6,
  '重击伤害加成': 8.6,
  '共鸣技能伤害加成': 8.6,
  '共鸣解放伤害加成': 8.6,
};

/** 双爆互乘：单条边际为 0 时也必须保留（暴伤在暴击率=0 时无收益，加完暴击率后才有收益）。 */
export const CRIT_TYPES = { '暴击率': 1, '暴击伤害': 1 };

/** cost 搭配（5 声骸，总 cost≤12）。 */
export const PROFILES = [
  { name: '43311', n4: 1, n3: 2, n1: 2, costs: [4, 3, 3, 1, 1] },
  { name: '44111', n4: 2, n3: 0, n1: 3, costs: [4, 4, 1, 1, 1] },
  { name: '41111', n4: 1, n3: 0, n1: 4, costs: [4, 1, 1, 1, 1] },
  { name: '43111', n4: 1, n3: 1, n1: 3, costs: [4, 3, 1, 1, 1] },
  { name: '33111', n4: 0, n3: 2, n1: 3, costs: [3, 3, 1, 1, 1] },
  { name: '33311', n4: 0, n3: 3, n1: 2, costs: [3, 3, 3, 1, 1] },
];

/** 4cost 主词条池（伤害向）。 */
export const MAIN4 = ['暴击率', '暴击伤害', '攻击%'];
/** 1cost 主词条候选：按角色成长属性实测选一个。 */
export const MAIN1_CANDIDATES = ['攻击%', '生命%', '防御%'];

/** 组合（有放回）枚举：返回 arr 中取 k 个的所有多重集。 */
export function combRep(arr, k) {
  if (k === 0) return [[]];
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    for (const tail of combRep(arr.slice(i), k - 1)) out.push([arr[i]].concat(tail));
  }
  return out;
}

/**
 * 枚举某 cost 搭配的所有主词条分配（槽位按 cost 分组，组内取多重集）。
 * @param {{ costs: number[], n4: number, n3: number, n1: number }} profile
 * @param {string[]} elems 角色伤害属性
 * @param {string[]} main1Pool 1cost 主词条池
 */
export function enumerateAssignments(profile, elems, main1Pool) {
  const MAIN3 = elems.map((elem) => `${elem}伤害加成`).concat(['攻击%', '共鸣效率']);
  const out = [];
  const c4 = combRep(MAIN4, profile.n4);
  const c3 = combRep(MAIN3, profile.n3);
  const c1 = combRep(main1Pool, profile.n1);
  for (const a4 of c4) {
    for (const a3 of c3) {
      for (const a1 of c1) {
        const mains = [];
        let i4 = 0;
        let i3 = 0;
        let i1 = 0;
        for (const cost of profile.costs) {
          if (cost === 4) mains.push(a4[i4++]);
          else if (cost === 3) mains.push(a3[i3++]);
          else mains.push(a1[i1++]);
        }
        out.push(mains);
      }
    }
  }
  return out;
}
