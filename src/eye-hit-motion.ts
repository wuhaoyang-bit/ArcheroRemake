import {Vector3} from 'three';
import {EYE_HIT_CURVES,EYE_HIT_CURVE_KEYS,type EyeHitSettings} from './eye-hit-config.ts';
import {sampleJuiceSpeedCurve,type JuiceSpeedPoint} from './juice-speed-curve.ts';
export type EyeHitPhase='idle'|'pull'|'taut'|'return'|'absorb'|'restore';
const progress=(curve:JuiceSpeedPoint[],t:number)=>sampleJuiceSpeedCurve(curve,t).integral/sampleJuiceSpeedCurve(curve,1).integral;
/** Deterministic authored inertia: speed envelopes integrate to fixed distances. Restore is strictly linear. */
export class EyeHitMotion{
 age=Infinity;radius=1;strength=0;private from=new Vector3();private peak=new Vector3();private config?:EyeHitSettings;
 hit(direction:Vector3,normal:Vector3,radius:number,strength:number,c:EyeHitSettings){
  const current=this.sample(normal).offset;this.radius=Math.max(.001,radius);this.from.copy(current);this.strength=Math.max(0,Math.min(1,strength));
  this.config={...c};for(const k of EYE_HIT_CURVE_KEYS)this.config[k]=(c[k]??EYE_HIT_CURVES[k]).map(p=>({...p}));
  this.peak.copy(direction).normalize().multiplyScalar(-c.eyeHitPull*this.radius*this.strength);
  const inward=this.peak.dot(normal),limit=-.2*this.radius;
  if(inward<limit)this.peak.addScaledVector(normal,limit-inward);
  this.age=0;
 }
 update(dt:number){if(Number.isFinite(this.age))this.age+=Math.max(0,dt);}
 sample(normal:Vector3):{offset:Vector3;phase:EyeHitPhase;progress:number}{
  const c=this.config,offset=new Vector3();if(!c||!c.eyeHitEnabled||!Number.isFinite(this.age))return {offset,phase:'idle',progress:1};
  let t=this.age;
  if(t<c.eyeHitPullTime){const p=progress(c.eyeHitPullCurve!,t/c.eyeHitPullTime);return {offset:offset.copy(this.from).lerp(this.peak,p),phase:'pull',progress:t/c.eyeHitPullTime};}t-=c.eyeHitPullTime;
  if(t<c.eyeHitHoldTime)return {offset:offset.copy(this.peak),phase:'taut',progress:t/c.eyeHitHoldTime};t-=c.eyeHitHoldTime;
  if(t<c.eyeHitReturnTime){
   const u=progress(c.eyeHitReturnCurve!,t/c.eyeHitReturnTime),v=1-u;
   // Curve a side-pull back toward the face: the final tangent points into the gel, not sideways.
   if(this.peak.dot(normal)>=0)offset.copy(this.peak).multiplyScalar(v*v*v+2*v*v*u).addScaledVector(normal,this.peak.length()*v*u*u);
   else offset.copy(this.peak).multiplyScalar(v);
   return {offset,phase:'return',progress:t/c.eyeHitReturnTime};
  }t-=c.eyeHitReturnTime;
  const depth=c.eyeHitDepth*this.radius*this.strength;
  if(t<c.eyeHitAbsorbTime)return {offset:offset.copy(normal).multiplyScalar(-depth*progress(c.eyeHitAbsorbCurve!,t/c.eyeHitAbsorbTime)),phase:'absorb',progress:t/c.eyeHitAbsorbTime};t-=c.eyeHitAbsorbTime;
  const distance=Math.max(0,depth-t*c.eyeHitRestoreSpeed*this.radius);
  return {offset:offset.copy(normal).multiplyScalar(-distance),phase:distance>0?'restore':'idle',progress:depth>0?1-distance/depth:1};
 }
 get settings(){return this.config;}
 reset(){this.age=Infinity;this.config=undefined;}
}
