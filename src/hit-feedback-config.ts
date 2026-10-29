import {DEFAULT_EYE_SPEED_CURVE} from './slime-eyes-config.ts';
import { BURST_DEFAULTS, BURST_LIMITS } from './slime-burst-config.ts';
import { SLIME_INFLATION_DEFAULTS, SLIME_INFLATION_LIMITS } from './slime-inflation-config.ts';
import { DEFAULT_JUICE_SPEED_CURVE } from './juice-speed-curve.ts';
/** Confirmed training feedback defaults. Existing settings files inherit these fields. */
export const HIT_DEFAULTS = {
  ...SLIME_INFLATION_DEFAULTS,...BURST_DEFAULTS,
  hitKnockEnabled: 1, hitRimEnabled: 1, hitSquashEnabled: 1,
  hitSquashMode: 0, hitSquashCompensation: 1,
  hitKnockTime: .2, hitKnockDistance: 1.05,
  hitRimTime: .3, hitRimFadeStart: .2, hitRimStrength: 1, hitRimBrightness: 2, hitRimWidth: .6,
  hitSquashTime: 2, hitSquashAmount: .15, hitCompressTime: .06, hitReleaseTime: .2, hitSpringFrequency: 4, hitSpringDamping: .15,
  // Screenshot defaults, world units; independent delayed burst, additional to sparks.
  slimeEyeSpeedCurve:DEFAULT_EYE_SPEED_CURVE,
  juiceSpeedCurve: DEFAULT_JUICE_SPEED_CURVE,
  hitSplashSheetsEnabled:1,hitSplashSheetsScale:1,hitSplashSheetsSpeed:1,hitSplashSheetsDelay:0,hitSplashSheetsHeight:0,
  hitSplashParticlesCount:33,hitSplashParticlesScale:1,hitSplashParticlesHeight:0,
  hitSplashParticlesEnabled:1,
  juiceEnabled:1,juiceDelay:.13,juiceCount:16,juiceSpeed:4,juiceSpeedJitter:1,
  juiceRadius:.34,juiceLife:1.8,juiceSize:.6,juiceSizeJitter:.08,
  juiceColor:0xffdd32,juiceCurve:2,juiceDragRel:.55,juiceDepthTest:1,juiceHeight:.1,
};
export const HIT_LIMITS = {
  ...SLIME_INFLATION_LIMITS,...BURST_LIMITS,
  hitKnockEnabled:[0,1,1],hitRimEnabled:[0,1,1],hitSquashEnabled:[0,1,1],
  hitSquashMode:[0,1,1],hitSquashCompensation:[0,1,.05],
  hitKnockTime:[.05,1,.01],hitKnockDistance:[0,3,.05],
  hitRimTime:[.04,5,.01],hitRimFadeStart:[0,5,.01],hitRimStrength:[0,1,.05],hitRimBrightness:[0,5,.1],hitRimWidth:[.1,1,.05],
  hitSquashTime:[.05,5,.01],hitSquashAmount:[.02,.65,.01],hitCompressTime:[.01,.5,.01],hitReleaseTime:[0,2,.01],hitSpringFrequency:[.5,12,.1],hitSpringDamping:[.05,2,.05],
  hitSplashSheetsEnabled:[0,1,1],hitSplashSheetsScale:[.05,3,.05],hitSplashSheetsSpeed:[.1,5,.1],hitSplashSheetsDelay:[0,3,.01],hitSplashSheetsHeight:[-1,3,.05],
  hitSplashParticlesCount:[1,33,1],hitSplashParticlesScale:[.1,3,.05],hitSplashParticlesHeight:[-1,3,.05],
  hitSplashParticlesEnabled:[0,1,1],
  juiceEnabled:[0,1,1],juiceDelay:[0,3,.01],juiceCount:[1,64,1],juiceSpeed:[0,20,.1],juiceSpeedJitter:[0,10,.1],juiceRadius:[0,1.5,.01],
  juiceLife:[.05,5,.05],juiceSize:[.01,2,.01],juiceSizeJitter:[0,1,.01],juiceColor:[0,0xffffff,1],
  juiceCurve:[0,6,1],juiceDragRel:[.05,1,.05],juiceDepthTest:[0,1,1],juiceHeight:[-.5,1,.01],
} satisfies Record<Exclude<keyof typeof HIT_DEFAULTS,'juiceSpeedCurve'|'slimeEyeSpeedCurve'>,[number,number,number]>;
export type HitSettings = typeof HIT_DEFAULTS;
export const HIT_CONTROLS: [Exclude<keyof HitSettings,'juiceSpeedCurve'|'slimeEyeSpeedCurve'>,string,string,string][] = [
 ['hitKnockEnabled','受击击退','0/1','0 关闭，1 开启；只阻挡场地边界。'],
 ['hitRimEnabled','白色边缘亮光','0/1','整座假人同步发亮；0 关闭，1 开启。'],
 ['hitSquashEnabled','受击缩放回弹','0/1','控制整体缩放和沿命中方向压缩；0 关闭，1 开启。'],
 ['hitSquashMode','受击缩放模式','','整体缩放 / 沿命中方向压缩，切换立即生效。方向取最近一次命中的箭，不随怪物转身改变。'],
 ['hitSquashCompensation','方向压缩 · 横向补偿','比例','仅方向模式生效；1 补偿另外两轴以保持体积，0 不补偿。与预览页方案 03 相同。'],
 ['hitKnockTime','击退时长','s','先快后慢。回弹何时开始由“开始回弹时间”独立控制。'],
 ['hitKnockDistance','击退距离','u','每次从当前位置重新击退，不累加上次剩余距离。'],
 ['hitRimTime','边缘光总持续时间','s','从最近一次命中到完全消失，默认 0.30 秒；修改后下次命中生效。'],
 ['hitRimFadeStart','边缘光开始淡出时间','s','命中后先保持亮度，默认 0.20 秒开始淡出；0 表示立即淡出。若不小于总时长，则保持到结束时关闭。修改后下次命中生效。'],
 ['hitRimStrength','亮边总强度','倍','命中后的保持亮度，开始淡出后逐渐减弱。'],
 ['hitRimBrightness','边缘亮度','倍','白色亮边强度。'],
 ['hitRimWidth','边缘范围','比例','越大越向身体内部扩展；默认 0.60。'],
 ['hitSquashAmount','受击压缩量','比例','默认 0.15；整体模式三个轴缩至 85%，方向模式沿箭的命中方向缩至 85%。'],
 ['hitSquashTime','缩放总持续时间','s','从最近一次命中计算，包含压缩、保持与回弹，默认 2 秒。末尾平滑恢复原大小；总时长优先于开始回弹时间。修改后下次命中生效。'],
 ['hitCompressTime','压缩用时','s','到达压缩目标后保持，直到释放。'],
 ['hitReleaseTime','开始回弹时间','s','从最近一次命中开始计时；默认 0.20 秒。独立于击退时长，碰墙不会提前释放；修改后下次命中生效。汁液发射时间独立设置。'],
 ['hitSpringFrequency','弹簧频率','Hz','越大回弹越快。'],
 ['hitSpringDamping','弹簧阻尼','比例','越小弹得越久；最晚在缩放总持续时间结束时恢复原大小。'],

 ['juiceEnabled','黄色汁液迸发','0/1','每次命中单独产生一波黄色汁液。'],
 ['juiceDelay','汁液迸发时机','s','从命中计时，默认 0.13 秒；独立于缩放回弹。连击各自计时，出生后不跟随敌人。'],
 ['juiceCurve','汁液曲线','0–6','0 Linear，1 OutQuad，2 OutCubic（默认），3 OutExpo，4 smoothstep，5 指数阻力，6 自定义速度曲线（尺寸保持 OutCubic）。'],
 ['juiceCount','汁液粒子数','个','默认 16。'],
 ['juiceRadius','汁液圆盘半径','u','默认 0.34，圆盘内均匀出生，水平四周飞散。'],
 ['juiceHeight','汁液发射高度偏移','u','相对敌人 aimHeight，默认 +0.10；不是模型包围盒中心。'],
 ['juiceSpeed','汁液初速基准','u/s','默认 4.0。'],
 ['juiceSpeedJitter','汁液初速随机±','u/s','默认 ±1.0。'],
 ['juiceSize','汁液出生尺寸基准','u','默认 0.60，直接使用世界单位。'],
 ['juiceSizeJitter','汁液尺寸随机±','u','默认 ±0.08。'],
 ['juiceLife','汁液寿命','s','默认 1.80 秒，实际随机取 88%–112%，与 lab 相同。'],
 ['juiceDragRel','汁液指数阻力 Drel','比例','默认 0.55，仅指数阻力曲线生效，OutCubic 不使用此参数。'],
 ['juiceColor','汁液颜色','色值','默认 #ffdd32，与黄色史莱姆身体同色。'],
 ['juiceDepthTest','汁液深度遮挡','0/1','1：保留与地面、人物的遮挡，和 lab 相同。'],
];

export const HIT_SPLASH_SHEET_CONTROLS: typeof HIT_CONTROLS = [
 ['hitSplashSheetsEnabled','液片飞溅 · 开关','0/1','受伤时从脚底生成的大片液体，跟随敌人。'],
 ['hitSplashSheetsScale','液片整体大小','倍','整体缩放液片和扩散范围。'],
 ['hitSplashSheetsSpeed','液片播放速度','倍','加快或放慢运动、展开和消散。'],
 ['hitSplashSheetsDelay','液片触发延迟','s','从命中开始计时。'],
 ['hitSplashSheetsHeight','液片高度偏移','u','相对怪物脚底。'],
];
export const HIT_SPLASH_PARTICLE_CONTROLS: typeof HIT_CONTROLS = [
 ['hitSplashParticlesEnabled','跟随汁滴 · 开关','0/1','独立控制新增颗粒，不受旧版黄色汁液迸发开关影响。'],
 ['hitSplashParticlesCount','跟随汁滴数量','个','每次命中的颗粒数量。'],
 ['hitSplashParticlesScale','跟随汁滴大小倍率','倍','乘以共用汁液尺寸，不改变贴图比例。'],
 ['hitSplashParticlesHeight','跟随汁滴高度偏移','u','叠加在脚底和共用汁液高度之上；速度、曲线、寿命、延迟沿用下方汁液参数。'],
];
