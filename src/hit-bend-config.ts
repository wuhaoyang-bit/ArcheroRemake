/** Yellow-slime horizontal hit-bend defaults, limits, and panel rows (PLAN §5 / §9). */

export const HIT_BEND_DEFAULTS = {
  hitBendEnabled: 1,
  hitBendMax: 0.4,
  hitBendFormTime: 0.1,
  hitBendFollowDelay: 0,
  hitBendFollowTime: 0.12,
  hitBendFollowAmount: 0.85,
  hitBendSpringFreq: 4.5,
  hitBendSpringDamp: 0.28,
  hitBendFootLockY: 0.1,
  hitBendPeakY: 1.15,
  hitBendWaistY: 0.575,
};

export const HIT_BEND_LIMITS: Record<keyof typeof HIT_BEND_DEFAULTS, [number, number, number]> = {
  hitBendEnabled: [0, 1, 1],
  hitBendMax: [0, 1.5, 0.01],
  hitBendFormTime: [0.02, 0.5, 0.01],
  hitBendFollowDelay: [0, 0.5, 0.01],
  hitBendFollowTime: [0.02, 0.5, 0.01],
  hitBendFollowAmount: [0, 2, 0.05],
  hitBendSpringFreq: [0.5, 12, 0.1],
  hitBendSpringDamp: [0.05, 2, 0.05],
  hitBendFootLockY: [0, 0.5, 0.01],
  hitBendPeakY: [0.2, 2, 0.01],
  hitBendWaistY: [0.1, 2, 0.01],
};

export type HitBendSettings = typeof HIT_BEND_DEFAULTS;

export const HIT_BEND_CONTROLS: [keyof HitBendSettings, string, string, string][] = [
  ['hitBendEnabled', '史莱姆 · 水平弯曲', '0/1', '仅黄色史莱姆；0 关闭并恢复 rest。修改后下次命中生效（开关关闭立即恢复）。'],
  ['hitBendMax', '弯曲 · 成 C 最大幅度', 'u', '水平位移世界单位；默认 0.4。修改后下次命中生效。'],
  ['hitBendFormTime', '弯曲 · 成 C 用时', 's', '肚子权重 0→1。修改后下次命中生效。'],
  ['hitBendFollowDelay', '弯曲 · 后仰延迟', 's', '成 C 满后到上半再转的间隔；0=立刻。修改后下次命中生效。'],
  ['hitBendFollowTime', '弯曲 · 后仰用时', 's', '方案 A 上半权重 0→1。修改后下次命中生效。'],
  ['hitBendFollowAmount', '弯曲 · 后仰幅度', '比例', '上半沿击退方向切向加算倍率。修改后下次命中生效。'],
  ['hitBendSpringFreq', '弯曲 · 弹回频率', 'Hz', '欠阻尼弹簧，与受击缩放弹簧同公式。修改后下次命中生效。'],
  ['hitBendSpringDamp', '弯曲 · 弹回阻尼', '比例', '越小弹越久。修改后下次命中生效。'],
  ['hitBendFootLockY', '弯曲 · 脚锁高度', 'u', '底座坐标 yBase；此高度及以下水平位移为 0。修改后下次命中生效。'],
  ['hitBendPeakY', '弯曲 · 峰值高度', 'u', '底座坐标；对齐眼睛高度默认 1.15。修改后下次命中生效。'],
  ['hitBendWaistY', '弯曲 · 腰线高度', 'u', '方案 A 上半再转起点；默认 0.575。修改后下次命中生效。'],
];

export function snapshotHitBend(c: HitBendSettings): HitBendSettings {
  return {
    hitBendEnabled: c.hitBendEnabled,
    hitBendMax: c.hitBendMax,
    hitBendFormTime: c.hitBendFormTime,
    hitBendFollowDelay: c.hitBendFollowDelay,
    hitBendFollowTime: c.hitBendFollowTime,
    hitBendFollowAmount: c.hitBendFollowAmount,
    hitBendSpringFreq: c.hitBendSpringFreq,
    hitBendSpringDamp: c.hitBendSpringDamp,
    hitBendFootLockY: c.hitBendFootLockY,
    hitBendPeakY: c.hitBendPeakY,
    hitBendWaistY: c.hitBendWaistY,
  };
}
