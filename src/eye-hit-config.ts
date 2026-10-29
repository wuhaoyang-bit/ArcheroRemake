import type {JuiceSpeedPoint} from './juice-speed-curve.ts';
import {validateJuiceSpeedCurve,sampleJuiceSpeedCurve} from './juice-speed-curve.ts';
export const EYE_HIT_CURVES={
 eyeHitPullCurve:[{time:0,progress:260},{time:25,progress:180},{time:65,progress:45},{time:100,progress:0}],
 eyeHitReturnCurve:[{time:0,progress:0},{time:35,progress:70},{time:100,progress:260}],
 eyeHitAbsorbCurve:[{time:0,progress:260},{time:40,progress:80},{time:80,progress:10},{time:100,progress:0}],
} satisfies Record<string,JuiceSpeedPoint[]>;
export type EyeHitCurveKey=keyof typeof EYE_HIT_CURVES;
export const EYE_HIT_CURVE_KEYS=Object.keys(EYE_HIT_CURVES) as EyeHitCurveKey[];
export function validateEyeHitCurve(raw:unknown){const c=validateJuiceSpeedCurve(raw);if(sampleJuiceSpeedCurve(c,1).integral<.001)throw new Error('速度曲线不能全为 0');return c;}
export const EYE_HIT_DEFAULTS={eyeHitEnabled:1,eyeHitPull:1.5,eyeHitPullTime:.07,eyeHitHoldTime:.012,eyeHitReturnTime:.065,eyeHitDepth:1.25,eyeHitAbsorbTime:.075,eyeHitRestoreSpeed:2,eyeHitReferenceSpeed:12,eyeHitMinimumStrength:.45,eyeHitTetherEnabled:1,eyeHitTetherRoot:.7,eyeHitTetherNeck:.24,eyeHitTetherTip:.65};
export type EyeHitSettings=typeof EYE_HIT_DEFAULTS & Partial<typeof EYE_HIT_CURVES>;
export const EYE_HIT_LIMITS:Record<keyof typeof EYE_HIT_DEFAULTS,[number,number,number]>={eyeHitEnabled:[0,1,1],eyeHitPull:[0,3,.05],eyeHitPullTime:[.015,.4,.005],eyeHitHoldTime:[0,.15,.005],eyeHitReturnTime:[.015,.4,.005],eyeHitDepth:[0,2.5,.05],eyeHitAbsorbTime:[.015,.3,.005],eyeHitRestoreSpeed:[.2,8,.1],eyeHitReferenceSpeed:[1,40,.5],eyeHitMinimumStrength:[0,1,.05],eyeHitTetherEnabled:[0,1,1],eyeHitTetherRoot:[.1,1.2,.05],eyeHitTetherNeck:[.05,.6,.01],eyeHitTetherTip:[.1,1,.05]};
export const EYE_HIT_CONTROLS:[keyof typeof EYE_HIT_DEFAULTS,string,string,string][]=[
 ['eyeHitEnabled','眼球受击滞后','0/1','快速拉开 → 绷紧拉回 → 入体吸能 → 匀速推出。参数与曲线在下次命中生效；关闭立即归位。'],
 ['eyeHitPull','满强度拉开距离','眼球半径','沿击退反方向拉开；背面受击限制内缩，侧面受击产生侧向牵拉。'],
 ['eyeHitPullTime','拉开时长','s','下方拉开曲线决定快慢；默认先猛拉，再绷紧。'],
 ['eyeHitHoldTime','绷紧停留','s','到达最大拉开距离后停留多久；0 不停留。'],
 ['eyeHitReturnTime','拉回正常眼位时长','s','由静止加速回冲，到正常眼位后立即进入吸能阶段。'],
 ['eyeHitDepth','满强度入体深度','眼球半径','越过正常眼位，沿脸部向内进入胶体的距离。'],
 ['eyeHitAbsorbTime','入体吸能时长','s','减速到最深处，之后不再弹簧回摆。'],
 ['eyeHitRestoreSpeed','匀速推出速度','半径/s','越小推出越慢；深度越大恢复越久，不使用缓入缓出。'],
 ['eyeHitReferenceSpeed','满强度击退参考速度','u/s','以击退初速和场地剩余空间估算力度，达到此速度为满强度。'],
 ['eyeHitMinimumStrength','挤压基础反应','比例','墙边或关闭击退时仍保留的受击反应；0 完全按击退力度。'],
 ['eyeHitTetherEnabled','显示黄色胶质连接','0/1','胶质从原挂接位置连到眼球后端，回冲时收回身体；爆炸断开。'],
 ['eyeHitTetherRoot','连接根部宽度','眼球半径','身体端液丘的宽度。'],
 ['eyeHitTetherNeck','连接中部粗细','眼球半径','拉长时中部变细，保持短粗胶质感。'],
 ['eyeHitTetherTip','连接眼球端宽度','眼球半径','胶质包住眼球后部的宽度。'],
];
