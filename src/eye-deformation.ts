import * as T from 'three/webgpu';
import type {SlimeEyesSettings} from './slime-eyes-config.ts';

export type EyeImpact={age:number;normal:T.Vector3;speed:number;point:T.Vector3;outgoing:T.Vector3};
export type EyeApproach={time:number;speed:number;normal:T.Vector3};
export type EyeDeformState={age:number;velocity:T.Vector3;grounded:boolean;impact?:EyeImpact;approach?:EyeApproach};
export type EyePose={axis:T.Vector3;scale:number;pin:number;phase:'round'|'approach'|'squash'|'rebound'|'settle'|'launch'};
const up=new T.Vector3(0,1,0);
const ease=(t:number)=>T.MathUtils.smoothstep(t,0,1);
const unit=(v:T.Vector3)=>v.lengthSq()>1e-12?v.clone().normalize():up.clone();

export function impactStrength(speed:number,c:SlimeEyesSettings){
 return Math.pow(T.MathUtils.clamp(speed/c.slimeEyeDeformSpeed,0,1),c.slimeEyeDeformPower);
}

/** Short key poses, not a continuously velocity-stretched ball. Tiny bounces finish before their apex. */
export function eyeImpactTiming(hit:EyeImpact,c:SlimeEyesSettings){
 const strength=impactStrength(hit.speed,c),tempo=T.MathUtils.lerp(.55,1,strength);
 let squash=c.slimeEyeSquashTime*tempo,recover=c.slimeEyeRecoverTime*tempo;
 if(hit.normal.y>.5&&hit.outgoing.y>0&&c.slimeEyeEjectGravity>0){
  const apex=hit.outgoing.y/c.slimeEyeEjectGravity,factor=Math.min(1,.85*apex/(squash+recover));
  squash*=factor;recover*=factor;
 }
 return {squash,recover,strength};
}

/** One deformation axis at a time. Switch axes only at a round pose; texture rotation stays independent. */
export function eyeDeformation(state:EyeDeformState,c:SlimeEyesSettings):EyePose{
 const {age,velocity,impact,approach,grounded}=state;
 const round:EyePose={axis:up,scale:1,pin:0,phase:'round'};
 if(!c.slimeEyeDeformEnabled)return round;
 if(impact){
  const t=Math.max(0,age-impact.age),{squash,recover,strength}=eyeImpactTiming(impact,c);
  if(t<squash){
   const q=t/squash,release=ease((q-c.slimeEyeSquashHold)/(1-c.slimeEyeSquashHold));
   return {axis:impact.normal,scale:1-c.slimeEyeSquash*strength*(1-release),pin:1-release,phase:'squash'};
  }
  const q=(t-squash)/recover;
  if(q<1){
   // A quick stretch peak followed by one small opposite settle, with zero slopes at every key.
   const peak=c.slimeEyeReboundPeak,end=.72;
   const envelope=q<peak?ease(q/peak):q<end?1-ease((q-peak)/(end-peak)):-c.slimeEyeSettle*Math.sin(Math.PI*(q-end)/(1-end))**2;
   return {axis:unit(impact.outgoing.lengthSq()>1e-8?impact.outgoing:impact.normal),scale:1+c.slimeEyeReboundStretch*strength*envelope,pin:0,phase:q<end?'rebound':'settle'};
  }
 }
 if(!grounded&&approach&&approach.time<c.slimeEyeAnticipationTime){
  // Only a closing contact stretches the ball; tangential speed cannot exaggerate a light graze.
  const closing=Math.max(0,-velocity.dot(approach.normal));
  const amount=c.slimeEyeFlightStretch*impactStrength(Math.min(closing,approach.speed),c)*ease(1-approach.time/c.slimeEyeAnticipationTime);
  return {axis:unit(velocity),scale:1+amount,pin:0,phase:'approach'};
 }
 if(!impact&&!grounded&&age<c.slimeEyeRecoverTime){
  const q=age/c.slimeEyeRecoverTime,amount=c.slimeEyeFlightStretch*impactStrength(velocity.length(),c)*Math.sin(Math.PI*q)**2;
  return {axis:unit(velocity),scale:1+amount,pin:0,phase:'launch'};
 }
 return round;
}

/** Symmetric scale along an arena-space axis; perpendicular compensation keeps volume exactly constant. */
export function directionalScale(out:T.Matrix4,axis:T.Vector3,scale:number){
 const {x,y,z}=unit(axis),p=1/Math.sqrt(scale),d=scale-p;
 return out.set(p+d*x*x,d*x*y,d*x*z,0,d*y*x,p+d*y*y,d*y*z,0,d*z*x,d*z*y,p+d*z*z,0,0,0,0,1);
}

/** Support radius of the transformed unit sphere, including base eye size and independent rolling. */
export function eyeSupport(matrix:T.Matrix4,normal:T.Vector3){
 const e=matrix.elements,{x,y,z}=normal;
 return Math.hypot(e[0]*x+e[1]*y+e[2]*z,e[4]*x+e[5]*y+e[6]*z,e[8]*x+e[9]*y+e[10]*z);
}
