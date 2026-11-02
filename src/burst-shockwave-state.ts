import {sampleJuiceSpeedCurve,validateJuiceSpeedCurve} from './juice-speed-curve.ts';
import type {ShockwaveSettings} from './burst-shockwave-config.ts';

export const MAX_SHOCKWAVES=10;
type Point={x:number;y:number;z:number};
export type Shockwave={center:Point;age:number;config:ShockwaveSettings;area:number};
const smooth=(u:number)=>{u=Math.max(0,Math.min(1,u));return u*u*(3-2*u);};
/** Analytic speed integration keeps radius independent of render/simulation step size. */
export function sampleShockwave(age:number,c:ShockwaveSettings,area=sampleJuiceSpeedCurve(c.burstShockwaveSpeedCurve,1).integral){
  const u=Math.max(0,Math.min(1,age/c.burstShockwaveDuration));
  const sample=sampleJuiceSpeedCurve(c.burstShockwaveSpeedCurve,u);
  const progress=area>0?sample.integral/area:0;
  return {progress,radius:c.burstShockwaveRadius*progress,
    speed:area>0&&u<1?c.burstShockwaveRadius/c.burstShockwaveDuration*sample.speed/area:0,
    strength:age>=0&&u<1&&area>0?c.burstShockwaveStrength*smooth(u/.08)*(1-u)**c.burstShockwaveFadePower:0};
}
export class ShockwaveState {
  readonly waves:Shockwave[]=[];
  emit(center:Point,c:ShockwaveSettings){
    if(!c.burstShockwaveEnabled||c.burstShockwaveStrength<=0)return;
    const curve=validateJuiceSpeedCurve(c.burstShockwaveSpeedCurve),area=sampleJuiceSpeedCurve(curve,1).integral;
    if(area<=0)return;
    if(this.waves.length>=MAX_SHOCKWAVES)this.waves.shift();
    this.waves.push({center:{...center},age:0,area,config:{
      burstShockwaveEnabled:1,burstShockwaveRadius:c.burstShockwaveRadius,burstShockwaveDuration:c.burstShockwaveDuration,
      burstShockwaveWidth:c.burstShockwaveWidth,burstShockwaveStrength:c.burstShockwaveStrength,
      burstShockwaveFadePower:c.burstShockwaveFadePower,burstShockwaveSpeedCurve:curve,
    }});
  }
  update(dt:number,c:ShockwaveSettings){
    if(!c.burstShockwaveEnabled){this.clear();return;}
    if(!Number.isFinite(dt)||dt<0)return;
    for(let i=this.waves.length-1;i>=0;i--){const w=this.waves[i];w.age+=dt;if(w.age+1e-9>=w.config.burstShockwaveDuration)this.waves.splice(i,1);}
  }
  clear(){this.waves.length=0;}
  snapshot(){return this.waves.map(w=>({center:{...w.center},age:w.age,width:w.config.burstShockwaveWidth,...sampleShockwave(w.age,w.config,w.area)}));}
}
