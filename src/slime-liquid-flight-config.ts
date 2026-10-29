import type {JuiceSpeedPoint} from './juice-speed-curve.ts';
import type {FlightSettings} from './slime-flight-motion.ts';

// Independent liquid flight; base speed, gravity and curve initialized from the tuned eyes.
export const LIQUID_FLIGHT_DEFAULTS={liquidEjectSpeed:20,liquidSpeedJitter:3,liquidGravity:20,liquidCurveTime:.9};
export const DEFAULT_LIQUID_SPEED_CURVE:JuiceSpeedPoint[]=[{time:0,progress:120},{time:100,progress:8}];
export type LiquidFlightSettings=typeof LIQUID_FLIGHT_DEFAULTS&{liquidSpeedCurve?:JuiceSpeedPoint[]};
export const LIQUID_FLIGHT_LIMITS:Record<keyof typeof LIQUID_FLIGHT_DEFAULTS,[number,number,number]>={
 liquidEjectSpeed:[0,40,.1],liquidSpeedJitter:[0,40,.1],liquidGravity:[0,30,.1],liquidCurveTime:[.02,2,.01],
};
export const LIQUID_FLIGHT_CONTROLS:[keyof typeof LIQUID_FLIGHT_DEFAULTS,string,string,string][]=[
 ['liquidEjectSpeed','液滴弹出速度','u/s','随机偏移前的基础速度，再乘速度曲线。用于融合液面模式，修改后下次爆炸生效。'],
 ['liquidSpeedJitter','液滴速度随机偏移','±u/s','每滴喷出时在基础速度 ± 此值内随机一次，最低为 0，再乘速度曲线。0 关闭随机；修改后下次爆炸生效。'],
 ['liquidGravity','液滴下落重力','u/s²','从液滴喷出的第一帧就生效，首次触地变成液滩。新生成的二次飞溅和踩踏液滴也使用此重力。'],
 ['liquidCurveTime','液滴曲线时长','s','液滴速度曲线的 0–100% 对应这段时间，结束后保持末端速度。修改后下次爆炸生效。'],
];

/** Adapt independent liquid tuning to the shared airborne integrator; snapshot the curve at birth. */
export function liquidFlightSettings(c:Partial<LiquidFlightSettings>):FlightSettings{
 return {
  slimeEyeEjectSpeed:c.liquidEjectSpeed??LIQUID_FLIGHT_DEFAULTS.liquidEjectSpeed,
  slimeEyeEjectGravity:c.liquidGravity??LIQUID_FLIGHT_DEFAULTS.liquidGravity,
  slimeEyeCurveTime:c.liquidCurveTime??LIQUID_FLIGHT_DEFAULTS.liquidCurveTime,
  slimeEyeSpeedCurve:(c.liquidSpeedCurve??DEFAULT_LIQUID_SPEED_CURVE).map(p=>({...p})),
 };
}
