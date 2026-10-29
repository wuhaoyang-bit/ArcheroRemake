import {DEFAULT_EYE_SPEED_CURVE,type SlimeEyesSettings} from './slime-eyes-config.ts';
import {sampleJuiceSpeedCurve,type JuiceSpeedPoint} from './juice-speed-curve.ts';

export type FlightSettings=Pick<SlimeEyesSettings,'slimeEyeEjectSpeed'|'slimeEyeEjectGravity'|'slimeEyeCurveTime'> & {slimeEyeSpeedCurve?:JuiceSpeedPoint[]};
/** Exact integral of the editable radial speed curve; gravity acts from birth. */
export function slimeFlight(age:number,c:FlightSettings){
 const t=Math.max(0,age),duration=c.slimeEyeCurveTime,curve=c.slimeEyeSpeedCurve??DEFAULT_EYE_SPEED_CURVE,sample=sampleJuiceSpeedCurve(curve,t/duration);
 return {speed:c.slimeEyeEjectSpeed*sample.speed,distance:c.slimeEyeEjectSpeed*(duration*sample.integral+Math.max(0,t-duration)*curve.at(-1)!.progress/100),drop:.5*c.slimeEyeEjectGravity*t*t,fallSpeed:c.slimeEyeEjectGravity*t};
}
