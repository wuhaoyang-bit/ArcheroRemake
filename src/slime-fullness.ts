import type {SlimeFullnessSettings} from './slime-fullness-config.ts';

export function slimeSpeedMultiplier(fill:number,c:SlimeFullnessSettings){return c.slimeSlowEnabled&&fill>c.slimeHeavyThreshold?c.slimeSlowMultiplier:1;}

/** Smooth 0→1→0 envelope with peak at peakAt (0–1). Uses smoothstep on each flank. */
export function slimeMoveHump(u:number,peakAt:number){
  const q=Math.min(1,Math.max(0,u));
  const p=Math.min(.95,Math.max(.05,peakAt));
  const w=q<=p?q/p:(1-q)/Math.max(1e-6,1-p);
  return w*w*(3-2*w);
}

/**
 * Yellow-slime chase gait multiplier over a cycle clock.
 * [0, period): valley↔peak hump; [period, period+pause): full stop 0; then caller wraps age.
 */
export function slimeMoveGaitMultiplier(age:number,c:Pick<SlimeFullnessSettings,'slimeMovePeriod'|'slimeMovePause'|'slimeMovePeak'|'slimeMoveValley'|'slimeMovePeakAt'>){
  const period=Math.max(1e-6,c.slimeMovePeriod);
  const pause=Math.max(0,c.slimeMovePause);
  const t=Math.max(0,age);
  const cycle=period+pause;
  const local=cycle>0?t%cycle:0;
  if(local>=period)return 0;
  const e=slimeMoveHump(local/period,c.slimeMovePeakAt);
  return c.slimeMoveValley+(c.slimeMovePeak-c.slimeMoveValley)*e;
}

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
