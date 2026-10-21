/** Confirmed training feedback defaults. Existing settings files inherit these fields. */
export const HIT_DEFAULTS = {
  hitBaseEnabled: 1, hitDirectionEnabled: 1, hitKnockEnabled: 1, hitRimEnabled: 1, hitSquashEnabled: 1,
  hitKnockTime: .2, hitKnockDistance: 1.05,
  hitRimTime: .3, hitRimStrength: 1, hitRimBrightness: 2, hitRimWidth: .6,
  hitSquashAmount: .15, hitCompressTime: .06, hitReleaseTime: .2, hitSpringFrequency: 4, hitSpringDamping: .15,
  hitParticleLife: .6, hitParticleCount: 14, hitParticleAngle: 26,
  hitParticleMinSpeed: 10, hitParticleMaxSpeed: 17.5, hitParticleDrag: 5, hitParticleSize: 1,
};
export const HIT_LIMITS = {
  hitBaseEnabled:[0,1,1],hitDirectionEnabled:[0,1,1],hitKnockEnabled:[0,1,1],hitRimEnabled:[0,1,1],hitSquashEnabled:[0,1,1],
  hitKnockTime:[.05,1,.01],hitKnockDistance:[0,3,.05],
  hitRimTime:[.04,2,.01],hitRimStrength:[0,1,.05],hitRimBrightness:[0,5,.1],hitRimWidth:[.1,1,.05],
  hitSquashAmount:[.02,.65,.01],hitCompressTime:[.01,.5,.01],hitReleaseTime:[0,2,.01],hitSpringFrequency:[.5,12,.1],hitSpringDamping:[.05,2,.05],
  hitParticleLife:[.1,1,.01],hitParticleCount:[1,64,1],hitParticleAngle:[0,75,1],hitParticleMinSpeed:[0,30,.5],hitParticleMaxSpeed:[0,30,.5],hitParticleDrag:[0,20,.5],hitParticleSize:[.25,3,.05],
} satisfies Record<keyof typeof HIT_DEFAULTS,[number,number,number]>;
export type HitSettings = typeof HIT_DEFAULTS;
export const HIT_CONTROLS: [keyof HitSettings,string,string,string][] = [
 ['hitBaseEnabled','基础命中火花','0/1','0 关闭，1 开启；包含闪点、柔光、光圈、全向火花、余烬和短暂点光源。'],
 ['hitDirectionEnabled','方向火花','0/1','沿箭方向飞溅的 REEBOO 火花；0 关闭，1 开启。'],
 ['hitKnockEnabled','受击击退','0/1','0 关闭，1 开启；只阻挡场地边界。'],
 ['hitRimEnabled','白色边缘亮光','0/1','整座假人同步发亮；0 关闭，1 开启。'],
 ['hitSquashEnabled','整体缩放回弹','0/1','包括底座，围绕脚底整体缩放；0 关闭，1 开启。'],
 ['hitKnockTime','击退时长','s','先快后慢。回弹何时开始由“开始回弹时间”独立控制。'],
 ['hitKnockDistance','击退距离','u','每次从当前位置重新击退，不累加上次剩余距离。'],
 ['hitRimTime','亮边持续时间','s','默认比击退晚 0.1 秒结束。'],
 ['hitRimStrength','亮边总强度','倍','命中时峰值强度，随后渐弱。'],
 ['hitRimBrightness','边缘亮度','倍','白色亮边强度。'],
 ['hitRimWidth','边缘范围','比例','越大越向身体内部扩展；默认 0.60。'],
 ['hitSquashAmount','整体压缩量','比例','默认 0.15，三个轴缩至 85%。'],
 ['hitCompressTime','压缩用时','s','到达压缩目标后保持，直到释放。'],
 ['hitReleaseTime','开始回弹时间','s','从最近一次命中开始计时；默认 0.20 秒。独立于击退时长，碰墙不会提前释放；修改后下次命中生效。'],
 ['hitSpringFrequency','弹簧频率','Hz','越大回弹越快。'],
 ['hitSpringDamping','弹簧阻尼','比例','越小弹得越久；不因亮边结束而截断。'],
 ['hitParticleLife','方向粒子基准寿命','s','实际寿命随机取 72%–100%。'],
 ['hitParticleCount','方向粒子数量','个','每次命中数量，基础层另有 33 个粒子。'],
 ['hitParticleAngle','方向锥体半角','°','沿实际箭方向均匀采样。'],
 ['hitParticleMinSpeed','方向初速下限','u/s','上下限反置时按从小到大采样。'],
 ['hitParticleMaxSpeed','方向初速上限','u/s','粒子生成后保持世界空间运动。'],
 ['hitParticleDrag','方向指数阻力','/s','速度指数衰减，不影响基础层的恒定阻尼。'],
 ['hitParticleSize','方向粒子尺寸','倍','以 REEBOO 细条尺寸为基准。'],
];
