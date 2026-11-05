/** Combat SFX: arrow fire + Body (instant) + slime pool (delayed) + slime burst windup/death. */

export const SFX_SLIME_BURST_DEATH_COUNT = 8;

/** Bitmask defaults: 小爆 A + 肉感 0 + 蘑菇噗 (bits 0, 2, 7). */
export const SFX_SLIME_BURST_DEATH_DEFAULT_MASK =
  (1 << 0) | (1 << 2) | (1 << 7);

export const SFX_DEFAULTS = {
  sfxArrowFireEnabled: 1,
  sfxArrowFireVolume: 0.75,
  sfxArrowFirePitchMin: -1,
  sfxArrowFirePitchMax: 1,

  sfxBodyHitEnabled: 1,
  sfxBodyHitVolume: 0.8,
  sfxBodyHitPitchMin: -1,
  sfxBodyHitPitchMax: 1,

  sfxSlimeHitEnabled: 1,
  sfxSlimeHitVolume: 0.8,
  sfxSlimeHitPitchMin: -1,
  sfxSlimeHitPitchMax: 1,
  sfxSlimeHitVolumeJitter: 0.1,
  sfxSlimeHitDelay: 0.12,

  /** Yellow-slime winding one-shot; variant 1–4 maps to public/audio/slime-burst-windup/. */
  sfxSlimeBurstWindupEnabled: 1,
  sfxSlimeBurstWindupVariant: 1,
  sfxSlimeBurstWindupVolume: 0.85,
  sfxSlimeBurstWindupPitchMin: 0,
  sfxSlimeBurstWindupPitchMax: 0,

  /** Yellow-slime burst (gone) layered one-shots; mask bit i ↔ death clip i. */
  sfxSlimeBurstDeathEnabled: 1,
  sfxSlimeBurstDeathVolume: 1.2,
  sfxSlimeBurstDeathMask: SFX_SLIME_BURST_DEATH_DEFAULT_MASK,
  sfxSlimeBurstDeathDelay0: 0,
  sfxSlimeBurstDeathDelay1: 0,
  sfxSlimeBurstDeathDelay2: 0,
  sfxSlimeBurstDeathDelay3: 0,
  sfxSlimeBurstDeathDelay4: 0,
  sfxSlimeBurstDeathDelay5: 0,
  sfxSlimeBurstDeathDelay6: 0,
  sfxSlimeBurstDeathDelay7: 0,
};

export type SfxSettings = typeof SFX_DEFAULTS;

export type SfxSlimeBurstDeathDelayKey =
  | 'sfxSlimeBurstDeathDelay0'
  | 'sfxSlimeBurstDeathDelay1'
  | 'sfxSlimeBurstDeathDelay2'
  | 'sfxSlimeBurstDeathDelay3'
  | 'sfxSlimeBurstDeathDelay4'
  | 'sfxSlimeBurstDeathDelay5'
  | 'sfxSlimeBurstDeathDelay6'
  | 'sfxSlimeBurstDeathDelay7';

export const SFX_SLIME_BURST_DEATH_DELAY_KEYS: readonly SfxSlimeBurstDeathDelayKey[] = [
  'sfxSlimeBurstDeathDelay0',
  'sfxSlimeBurstDeathDelay1',
  'sfxSlimeBurstDeathDelay2',
  'sfxSlimeBurstDeathDelay3',
  'sfxSlimeBurstDeathDelay4',
  'sfxSlimeBurstDeathDelay5',
  'sfxSlimeBurstDeathDelay6',
  'sfxSlimeBurstDeathDelay7',
];

export const SFX_LIMITS: Record<keyof SfxSettings, [number, number, number]> = {
  sfxArrowFireEnabled: [0, 1, 1],
  sfxArrowFireVolume: [0, 1, 0.01],
  sfxArrowFirePitchMin: [-12, 12, 0.1],
  sfxArrowFirePitchMax: [-12, 12, 0.1],

  sfxBodyHitEnabled: [0, 1, 1],
  sfxBodyHitVolume: [0, 1, 0.01],
  sfxBodyHitPitchMin: [-12, 12, 0.1],
  sfxBodyHitPitchMax: [-12, 12, 0.1],

  sfxSlimeHitEnabled: [0, 1, 1],
  sfxSlimeHitVolume: [0, 1, 0.01],
  sfxSlimeHitPitchMin: [-12, 12, 0.1],
  sfxSlimeHitPitchMax: [-12, 12, 0.1],
  sfxSlimeHitVolumeJitter: [0, 0.5, 0.01],
  sfxSlimeHitDelay: [0, 1, 0.01],

  sfxSlimeBurstWindupEnabled: [0, 1, 1],
  sfxSlimeBurstWindupVariant: [1, 4, 1],
  sfxSlimeBurstWindupVolume: [0, 1, 0.01],
  sfxSlimeBurstWindupPitchMin: [-12, 12, 0.1],
  sfxSlimeBurstWindupPitchMax: [-12, 12, 0.1],

  sfxSlimeBurstDeathEnabled: [0, 1, 1],
  /** Allow >1 so the explosion layer can sit louder than hit one-shots. */
  sfxSlimeBurstDeathVolume: [0, 2, 0.01],
  sfxSlimeBurstDeathMask: [0, (1 << SFX_SLIME_BURST_DEATH_COUNT) - 1, 1],
  sfxSlimeBurstDeathDelay0: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay1: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay2: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay3: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay4: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay5: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay6: [0, 2, 0.01],
  sfxSlimeBurstDeathDelay7: [0, 2, 0.01],
};

export const SFX_CONTROLS: [keyof SfxSettings, string, string, string][] = [
  ['sfxArrowFireEnabled', '启用箭射音效', '0/1', '每支箭 fire() 时播放 bow01；0 关闭，1 开启。'],
  ['sfxArrowFireVolume', '箭射音量', '比例', 'bow01 基准音量。默认 0.75。'],
  ['sfxArrowFirePitchMin', '箭射音高下限', '半音', '相对原调最低半音；播放时在上下限间均匀随机。默认 -1。'],
  ['sfxArrowFirePitchMax', '箭射音高上限', '半音', '相对原调最高半音；若低于下限会自动对调。默认 +1。'],

  ['sfxBodyHitEnabled', '启用肉体受击音效', '0/1', '黄史莱姆受击瞬间播放 Hitted_Body；0 关闭，1 开启。'],
  ['sfxBodyHitVolume', '肉体受击音量', '比例', 'Hitted_Body 基准音量。默认 0.8。'],
  ['sfxBodyHitPitchMin', '肉体音高下限', '半音', '相对原调最低半音；播放时在上下限间均匀随机。默认 -1。'],
  ['sfxBodyHitPitchMax', '肉体音高上限', '半音', '相对原调最高半音；若低于下限会自动对调。默认 +1。'],

  ['sfxSlimeHitEnabled', '启用史莱姆音效', '0/1', '仅黄史莱姆受击成功后，按延迟播放史莱姆样本池；0 关闭，1 开启。'],
  ['sfxSlimeHitDelay', '史莱姆音效延迟', 's', '受击成功后再等这么久才播史莱姆音效。默认 0.12；0 为立即。'],
  ['sfxSlimeHitVolume', '史莱姆音量', '比例', '基准音量；再叠加下方音量抖动。默认 0.8。'],
  ['sfxSlimeHitPitchMin', '史莱姆音高下限', '半音', '相对原调最低半音；播放时在上下限间均匀随机。默认 -1。'],
  ['sfxSlimeHitPitchMax', '史莱姆音高上限', '半音', '相对原调最高半音；若低于下限会自动对调。默认 +1。'],
  ['sfxSlimeHitVolumeJitter', '史莱姆音量抖动', '比例', '相对基准音量的 ± 抖动幅度；0.1 = ±10%。默认 0.1。'],

  ['sfxSlimeBurstWindupEnabled', '启用蓄爆音效', '0/1', '黄史莱姆进入 winding（蓄爆）瞬间播放一次；爆开时打断。0 关闭，1 开启。'],
  ['sfxSlimeBurstWindupVariant', '蓄爆音效版本', '1–4', '1 咕噜 A · 2 咕噜 B · 3 倾倒 · 4 吸血感。切换后下次蓄爆生效。'],
  ['sfxSlimeBurstWindupVolume', '蓄爆音量', '比例', '蓄爆 one-shot 基准音量。默认 0.85。'],
  ['sfxSlimeBurstWindupPitchMin', '蓄爆音高下限', '半音', '相对原调最低半音；默认 0（不偏调，便于比版本）。'],
  ['sfxSlimeBurstWindupPitchMax', '蓄爆音高上限', '半音', '相对原调最高半音；默认 0。'],

  ['sfxSlimeBurstDeathEnabled', '启用死亡音效', '0/1', '黄史莱姆爆开（gone）瞬间按勾选同时播放；可叠加多条。0 关闭，1 开启。'],
  ['sfxSlimeBurstDeathVolume', '死亡音量', '比例', '死亡层总音量，可大于 1。默认 1.2。'],
  ['sfxSlimeBurstDeathMask', '死亡音效多选', '勾选', '下拉勾选要同时播放的死亡样本；每条可设播放延迟（默认 0s）。'],
];

/** Labels for the windup variant select (1-based index matches sfxSlimeBurstWindupVariant). */
export const SFX_SLIME_BURST_WINDUP_VARIANT_LABELS = [
  '1 · 咕噜 A',
  '2 · 咕噜 B',
  '3 · 倾倒',
  '4 · 吸血感',
] as const;

/** Labels for death multi-select (0-based index matches mask bit / delay key). */
export const SFX_SLIME_BURST_DEATH_LABELS = [
  '0 · 小爆 A',
  '1 · 小爆 B',
  '2 · 肉感 0',
  '3 · 肉感 1',
  '4 · 肉感 2',
  '5 · 肉感 3',
  '6 · 肉感 4',
  '7 · 蘑菇噗',
] as const;

export const SFX_ARROW_FIRE_MAX_VOICES = 2;
export const SFX_BODY_HIT_MAX_VOICES = 2;
export const SFX_SLIME_HIT_MAX_VOICES = 2;
export const SFX_SLIME_BURST_WINDUP_MAX_VOICES = 2;
/** All 8 death clips may layer at once (plus pending delayed starts). */
export const SFX_SLIME_BURST_DEATH_MAX_VOICES = 16;

export function sfxSlimeBurstDeathDelayKey(index: number): SfxSlimeBurstDeathDelayKey {
  return SFX_SLIME_BURST_DEATH_DELAY_KEYS[Math.max(0, Math.min(SFX_SLIME_BURST_DEATH_COUNT - 1, index))]!;
}

export function countDeathMaskBits(mask: number): number {
  let n = 0;
  let m = Math.max(0, Math.round(mask)) & ((1 << SFX_SLIME_BURST_DEATH_COUNT) - 1);
  while (m) {
    n += m & 1;
    m >>= 1;
  }
  return n;
}
