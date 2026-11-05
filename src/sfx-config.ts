/** Combat SFX: arrow fire + Body (instant) + slime pool (delayed). */

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
};

export type SfxSettings = typeof SFX_DEFAULTS;

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
];

export const SFX_ARROW_FIRE_MAX_VOICES = 2;
export const SFX_BODY_HIT_MAX_VOICES = 2;
export const SFX_SLIME_HIT_MAX_VOICES = 2;
