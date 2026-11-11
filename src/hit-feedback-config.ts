import {EYE_HIT_CURVES,type EyeHitCurveKey} from './eye-hit-config.ts';
import {DEFAULT_EYE_SPEED_CURVE} from './slime-eyes-config.ts';
import {DEFAULT_LIQUID_SPEED_CURVE} from './slime-liquid-flight-config.ts';
import {SLIME_TRAIL_DEFAULTS,SLIME_TRAIL_LIMITS} from './slime-trail-config.ts';
import { BURST_DEFAULTS, BURST_LIMITS } from './slime-burst-config.ts';
import { SLIME_INFLATION_DEFAULTS, SLIME_INFLATION_LIMITS } from './slime-inflation-config.ts';
import { DEFAULT_JUICE_SPEED_CURVE } from './juice-speed-curve.ts';
import { HIT_BEND_CONTROLS, HIT_BEND_DEFAULTS, HIT_BEND_LIMITS } from './hit-bend-config.ts';
import type { ProgressPoint } from './lock-rings.ts';

/** OutCubic 1-(1-q)³ sampled as editable progress keypoints (matches formula mode). */
export const DEFAULT_HIT_KNOCK_CURVE: ProgressPoint[] = [0, 10, 25, 50, 75, 90, 100].map(time =>
  ({ time, progress: Number((100 * (1 - (1 - time / 100) ** 3)).toFixed(3)) }));

/** Confirmed training feedback defaults. Existing settings files inherit these fields. */
export const HIT_DEFAULTS = {
  ...SLIME_INFLATION_DEFAULTS,...BURST_DEFAULTS,...EYE_HIT_CURVES,...SLIME_TRAIL_DEFAULTS,
  ...HIT_BEND_DEFAULTS,
  hitKnockEnabled: 1, hitRimEnabled: 1, hitSquashEnabled: 1,
  hitSquashMode: 0, hitSquashCompensation: 1,
  hitKnockTime: .2, hitKnockDistance: 1.05, hitKnockStun: 0,
  hitKnockCurveMode: 0, hitKnockCurve: DEFAULT_HIT_KNOCK_CURVE,
  hitRimTime: .3, hitRimFadeStart: .2, hitRimStrength: 1, hitRimBrightness: 2, hitRimWidth: .6,
  hitSquashTime: 2, hitSquashAmount: .15, hitCompressTime: .06, hitReleaseTime: .2, hitSpringFrequency: 4, hitSpringDamping: .15,
  // Screenshot defaults, world units; independent delayed burst, additional to sparks.
  slimeEyeSpeedCurve:DEFAULT_EYE_SPEED_CURVE,
  liquidSpeedCurve:DEFAULT_LIQUID_SPEED_CURVE,
  juiceSpeedCurve: DEFAULT_JUICE_SPEED_CURVE,
  hitSplashSheetsEnabled:1,hitSplashSheetsScale:1,hitSplashSheetsSpeed:1,hitSplashSheetsDelay:0,hitSplashSheetsHeight:0,
  hitSplashBackEnabled:1,hitSplashBackScale:1,hitSplashBackSpeed:1,hitSplashBackDelay:0,
  hitSplashParticlesCount:33,hitSplashParticlesScale:1,hitSplashParticlesHeight:0,
  hitSplashParticlesEnabled:1,
  juiceEnabled:1,juiceDelay:.13,juiceCount:16,juiceSpeed:4,juiceSpeedJitter:1,
  juiceRadius:.34,juiceLife:1.8,juiceSize:.6,juiceSizeJitter:.08,
  juiceColor:0xffdd32,juiceCurve:2,juiceDragRel:.55,juiceDepthTest:1,juiceHeight:.1,
  // Directional cone spray (Blood / Arterial / quarks); lab refresh defaults.
  spraySpeedCurve: DEFAULT_JUICE_SPEED_CURVE,
  sprayEnabled:1,sprayDelay:0,sprayMode:2,sprayFlat:0,sprayGravity:9.8,
  sprayDebugDir:0,
  sprayFrontEnabled:1,sprayFrontCount:4,sprayFrontSizeScale:.3,sprayFrontSpeedScale:.25,sprayFrontLife:.3,
  sprayJetSpeedScale:1,sprayFanSpeedScale:1,sprayJetSizeScale:1,sprayFanSizeScale:1,
  sprayJetShare:.4,sprayJetSpread:12,sprayFanSpread:55,
  sprayCount:16,spraySpeed:7.6,spraySpeedJitter:1.5,
  spraySize:.67,spraySizeJitter:.15,sprayLife:1.3,sprayLifeJitter:.2,
  spraySpreadDeg:45,sprayRadius:.3,sprayHeight:.1,
  sprayCurve:2,sprayDragRel:.55,
};
export const HIT_LIMITS = {
  ...SLIME_INFLATION_LIMITS,...BURST_LIMITS,...SLIME_TRAIL_LIMITS,
  ...HIT_BEND_LIMITS,
  hitKnockEnabled:[0,1,1],hitRimEnabled:[0,1,1],hitSquashEnabled:[0,1,1],
  hitSquashMode:[0,1,1],hitSquashCompensation:[0,1,.05],
  hitKnockTime:[.05,1,.01],hitKnockDistance:[0,3,.05],hitKnockStun:[0,2,.01],hitKnockCurveMode:[0,1,1],
  hitRimTime:[.04,5,.01],hitRimFadeStart:[0,5,.01],hitRimStrength:[0,1,.05],hitRimBrightness:[0,5,.1],hitRimWidth:[.1,1,.05],
  hitSquashTime:[.05,5,.01],hitSquashAmount:[.02,.65,.01],hitCompressTime:[.01,.5,.01],hitReleaseTime:[0,2,.01],hitSpringFrequency:[.5,12,.1],hitSpringDamping:[.05,2,.05],
  hitSplashSheetsEnabled:[0,1,1],hitSplashSheetsScale:[.05,3,.05],hitSplashSheetsSpeed:[.1,5,.1],hitSplashSheetsDelay:[0,3,.01],hitSplashSheetsHeight:[-1,3,.05],
  hitSplashBackEnabled:[0,1,1],hitSplashBackScale:[.05,3,.05],hitSplashBackSpeed:[.1,5,.1],hitSplashBackDelay:[0,3,.01],
  hitSplashParticlesCount:[1,33,1],hitSplashParticlesScale:[.1,3,.05],hitSplashParticlesHeight:[-1,3,.05],
  hitSplashParticlesEnabled:[0,1,1],
  juiceEnabled:[0,1,1],juiceDelay:[0,3,.01],juiceCount:[1,64,1],juiceSpeed:[0,20,.1],juiceSpeedJitter:[0,10,.1],juiceRadius:[0,1.5,.01],
  juiceLife:[.05,5,.05],juiceSize:[.01,2,.01],juiceSizeJitter:[0,1,.01],juiceColor:[0,0xffffff,1],
  juiceCurve:[0,6,1],juiceDragRel:[.05,1,.05],juiceDepthTest:[0,1,1],juiceHeight:[-.5,1,.01],
  sprayEnabled:[0,1,1],sprayDelay:[0,3,.01],sprayMode:[0,2,1],sprayFlat:[0,1,1],sprayGravity:[0,20,.1],
  sprayDebugDir:[0,1,1],
  sprayFrontEnabled:[0,1,1],sprayFrontCount:[1,12,1],sprayFrontSizeScale:[.05,1,.05],sprayFrontSpeedScale:[0,1,.05],sprayFrontLife:[.05,1,.05],
  sprayJetSpeedScale:[0,3,.05],sprayFanSpeedScale:[0,3,.05],sprayJetSizeScale:[.1,3,.05],sprayFanSizeScale:[.1,3,.05],
  sprayJetShare:[0,1,.05],sprayJetSpread:[0,45,1],sprayFanSpread:[0,85,1],
  sprayCount:[1,80,1],spraySpeed:[0,20,.1],spraySpeedJitter:[0,10,.1],
  spraySize:[.01,2,.01],spraySizeJitter:[0,1,.01],sprayLife:[.05,5,.05],sprayLifeJitter:[0,2,.05],
  spraySpreadDeg:[0,180,1],sprayRadius:[0,1.5,.01],sprayHeight:[-.5,1,.01],
  sprayCurve:[0,6,1],sprayDragRel:[.05,1,.05],
} satisfies Record<Exclude<keyof typeof HIT_DEFAULTS,'hitKnockCurve'|'juiceSpeedCurve'|'spraySpeedCurve'|'slimeEyeSpeedCurve'|'liquidSpeedCurve'|EyeHitCurveKey>,[number,number,number]>;
export type HitSettings = typeof HIT_DEFAULTS;
export const HIT_CONTROLS: [Exclude<keyof HitSettings,'hitKnockCurve'|'juiceSpeedCurve'|'spraySpeedCurve'|'slimeEyeSpeedCurve'|'liquidSpeedCurve'|EyeHitCurveKey>,string,string,string][] = [
 ['hitKnockEnabled','受击击退','0/1','0 关闭，1 开启；只阻挡场地边界。'],
 ['hitRimEnabled','白色边缘亮光','0/1','整座假人同步发亮；0 关闭，1 开启。'],
 ['hitSquashEnabled','受击缩放回弹','0/1','控制整体缩放和沿命中方向压缩；0 关闭，1 开启。'],
 ['hitSquashMode','受击缩放模式','','整体缩放 / 沿命中方向压缩，切换立即生效。方向取最近一次命中的箭，不随怪物转身改变。'],
 ['hitSquashCompensation','方向压缩 · 横向补偿','比例','仅方向模式生效；1 补偿另外两轴以保持体积，0 不补偿。与预览页方案 03 相同。'],
 ['hitKnockTime','击退时长','s','总时长；公式模式为先快后慢 OutCubic。回弹何时开始由“开始回弹时间”独立控制。'],
 ['hitKnockDistance','击退距离','u','每次从当前位置重新击退，不累加上次剩余距离。'],
 ['hitKnockStun','击退后硬直','s','仅黄色史莱姆：击退结束后再锁主动追击；默认 0。击退/弹簧等位移照常；蜘蛛不受影响。修改后下次命中生效。'],
 ['hitKnockCurveMode','击退位移曲线','','0 公式 OutCubic；1 手动关键点。横轴时间进度，纵轴已完成击退距离比例。修改后下次命中生效。'],
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
 ...HIT_BEND_CONTROLS,

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

export const SPRAY_CONTROLS: typeof HIT_CONTROLS = [
 ['sprayEnabled','方向喷溅 · 开关','0/1','模式 0/1 从背面喷出；模式 2 从箭击中点沿箭行进反方向喷出。'],
 ['sprayDebugDir','方向粒子调试开关','0/1','1 时集中射流为青蓝色、扇形飞溅为橙红色；关闭恢复黄色果冻色。'],
 ['sprayFrontEnabled','前方侧向碎滴 · 开关','0/1','沿用方向喷溅延迟，到期从怪物当前前表面向两侧挤出；独立于背面喷溅开关。'],
 ['sprayFrontCount','前方碎滴 · 数量','个','左右合计，默认 4。'],
 ['sprayFrontSizeScale','前方碎滴 · 大小倍率','倍','相对于方向粒子整体大小，默认 0.3，更轻微。'],
 ['sprayFrontSpeedScale','前方碎滴 · 速度倍率','倍','相对于方向粒子整体初速，默认 0.25，飞行距离更短。'],
 ['sprayFrontLife','前方碎滴 · 寿命','s','默认 0.3 秒，快速消散。'],
 ['sprayDelay','方向喷溅 · 延迟','s','前方碎滴与背面方向喷溅共用；从命中计时，到期读取怪物当前位置。默认 0。'],
 ['sprayMode','方向喷溅 · 效果','0–2','0 扇形飞溅，1 集中射流，2 两者叠加。'],
 ['sprayJetShare','叠加 · 射流数量占比','比例','仅叠加模式生效；剩余数量分给扇形，总粒子数保持不变。'],
 ['sprayJetSpread','集中射流 · 半角','°','窄锥形射流的最大偏转角，默认 12。'],
 ['sprayFanSpread','扇形飞溅 · 半角','°','左右展开角，默认 55；垂直扩散较小，颗粒仍有厚度。'],
 ['sprayJetSpeedScale','集中射流 · 速度倍率','倍','在整体初速基础上独立调整射流速度。'],
 ['sprayJetSizeScale','集中射流 · 大小倍率','倍','在整体大小基础上独立调整射流颗粒。'],
 ['sprayFanSpeedScale','扇形飞溅 · 速度倍率','倍','在整体初速基础上独立调整扇形速度。'],
 ['sprayFanSizeScale','扇形飞溅 · 大小倍率','倍','在整体大小基础上独立调整扇形颗粒。'],
 ['sprayFlat','方向喷溅 · 俯视平铺','0/1','1 强制水平；0 竖直受重力（默认）。'],
 ['sprayGravity','方向喷溅 · 重力','u/s²','向下加速度大小；仅平铺关闭时生效，默认 9.8。'],
 ['sprayCount','方向喷溅 · 粒子数','个','默认 16。'],
 ['spraySpeed','方向喷溅 · 初速','u/s','默认 7.6。'],
 ['spraySpeedJitter','方向喷溅 · 初速±','u/s','默认 ±1.5。'],
 ['spraySize','方向喷溅 · 大小','u','默认 0.67。'],
 ['spraySizeJitter','方向喷溅 · 大小±','u','默认 ±0.15。'],
 ['sprayLife','方向喷溅 · 寿命','s','默认 1.30。'],
 ['sprayLifeJitter','方向喷溅 · 寿命±','s','默认 ±0.20。'],
 ['sprayRadius','方向喷溅 · 盘半径','u','喷出位置的横向分散范围；射流更集中。'],
 ['sprayHeight','方向喷溅 · 高度偏移','u','相对敌人 aimHeight；默认 +0.10。'],
 ['sprayCurve','方向喷溅 · 水平曲线','0–6','仅水平位移；与汁液同一套曲线编号。自定义时编辑下方速度曲线。'],
 ['sprayDragRel','方向喷溅 · 指数阻力','比例','仅指数阻力曲线生效；默认 0.55。'],
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

export const HIT_SPLASH_BACK_CONTROLS: typeof HIT_CONTROLS = [
 ['hitSplashBackEnabled','液体飞溅-背后 · 开关','0/1','复制液片飞溅；模式 0/1 在背面喷出，模式 2 改在箭击中点反向喷出。独立于方向粒子开关。'],
 ['hitSplashBackScale','背后飞溅 · 大小','倍','缩放背后液片和扩散范围。'],
 ['hitSplashBackSpeed','背后飞溅 · 播放速度','倍','液片运动、展开和消散的播放速度。'],
 ['hitSplashBackDelay','背后飞溅 · 延迟','s','从命中开始计时；生成位置沿用方向喷溅位置和高度偏移。'],
];
