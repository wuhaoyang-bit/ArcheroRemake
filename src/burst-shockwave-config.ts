import {validateJuiceSpeedCurve, type JuiceSpeedPoint} from './juice-speed-curve.ts';

export const DEFAULT_SHOCKWAVE_SPEED_CURVE:JuiceSpeedPoint[]=[
  {time:0,progress:100},{time:25,progress:56.25},{time:50,progress:25},{time:75,progress:6.25},{time:100,progress:0},
];
export const SHOCKWAVE_DEFAULTS={
  burstShockwaveEnabled:1,burstShockwaveRadius:3.2,burstShockwaveDuration:.32,
  burstShockwaveWidth:.75,burstShockwaveStrength:5,burstShockwaveFadePower:1.5,
};
export type ShockwaveSettings=typeof SHOCKWAVE_DEFAULTS & {burstShockwaveSpeedCurve:JuiceSpeedPoint[]};
export const SHOCKWAVE_LIMITS:Record<keyof typeof SHOCKWAVE_DEFAULTS,[number,number,number]>={
  burstShockwaveEnabled:[0,1,1],burstShockwaveRadius:[.5,8,.1],burstShockwaveDuration:[.08,1,.01],
  burstShockwaveWidth:[.1,2,.05],burstShockwaveStrength:[0,16,.25],burstShockwaveFadePower:[.5,4,.1],
};
export const SHOCKWAVE_CONTROLS:[keyof typeof SHOCKWAVE_DEFAULTS,string,string,string][]=[
  ['burstShockwaveEnabled','空间扭曲冲击波','0/1','怪物真正爆开时触发；关闭立即清除现有冲击波。'],
  ['burstShockwaveRadius','最大扩散半径','u','以爆点为中心，默认 3.2；仅波带经过的区域发生折射。'],
  ['burstShockwaveDuration','扩散时长','s','默认 0.32 秒；与下方速度曲线一起决定运动节奏。'],
  ['burstShockwaveWidth','波带宽度','u','发生压缩与拉伸的环形区域总宽度，默认 0.75。'],
  ['burstShockwaveStrength','扭曲强度','px','以 390 px 宽游戏画面为基准，随视口等比缩放；0 关闭扭曲。'],
  ['burstShockwaveFadePower','扭曲衰减指数','','越大越早淡出；仅控制强度，扩散运动仍由速度曲线决定。'],
];
export const SHOCKWAVE_CURVE_OPTIONS={
  title:'冲击波扩散速度曲线',x:'扩散时间进度',y:'相对扩散速度',max:300,
  defaults:DEFAULT_SHOCKWAVE_SPEED_CURVE,validate:validateJuiceSpeedCurve,
  help:'默认先快速推出，再逐渐减速至停止。曲线越高，该阶段越快；速度积分并按总范围归一化，调整节奏不会改变最终半径。全零曲线不产生冲击波。可拖点、双击加点或输入数值，修改后下次爆炸生效。',
};
