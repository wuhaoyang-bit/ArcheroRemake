import type {SlimeFullnessSettings} from './slime-fullness-config.ts';
export function slimeSpeedMultiplier(fill:number,c:SlimeFullnessSettings){return c.slimeSlowEnabled&&fill>c.slimeHeavyThreshold?c.slimeSlowMultiplier:1;}
export class SlimeWalkBreath{
 phase=0;weight=0;scale=1;
 update(dt:number,moving:boolean,fill:number,c:SlimeFullnessSettings){
  const active=!!c.slimeBreathEnabled&&moving&&fill>c.slimeHeavyThreshold;
  const step=c.slimeBreathFade>0?Math.max(0,dt)/c.slimeBreathFade:1;
  this.weight=active?Math.min(1,this.weight+step):Math.max(0,this.weight-step);
  if(this.weight>0)this.phase=(this.phase+Math.max(0,dt)*c.slimeBreathFrequency*Math.PI*2)%(Math.PI*2);else this.phase=0;
  const envelope=this.weight*this.weight*(3-2*this.weight);
  this.scale=1+Math.sin(this.phase)*c.slimeBreathAmplitude*envelope;
 }
 reset(){this.phase=this.weight=0;this.scale=1;}
}
