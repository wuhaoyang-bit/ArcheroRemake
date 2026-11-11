import {ScreenSpringFeedback} from './camera-shake-spring.ts';
import {SHAKE_TIERS, shakeKey, type CameraShakeSettings, type ShakeTierId} from './camera-shake-config.ts';

export type ShakeTier = {formula: number; A0: number; duration: number; omega: number; p: number; n: number; decayPerFrame: number};
export function readShakeTier(c: CameraShakeSettings, id: ShakeTierId): ShakeTier {
  return {formula:c[shakeKey(id,'Formula')],A0:c[shakeKey(id,'A0')],duration:c[shakeKey(id,'Duration')],
    omega:c[shakeKey(id,'Omega')],p:c[shakeKey(id,'P')],n:c[shakeKey(id,'N')],decayPerFrame:c[shakeKey(id,'Decay')]};
}
// Ported from SmashBroCER/src/combat/cam-shake.ts (envelopeA / camOffset).
export function shakeEnvelope(t: ShakeTier, i: number): number {
  const M = Math.max(1, Math.floor(t.duration));
  if (i < 0 || i >= M) return 0;
  return t.formula === 0 ? t.A0 * ((M-i)/M) ** t.p : t.A0 * Math.max(0,1-i*t.decayPerFrame) ** t.n;
}
export function shakeOffset(t: ShakeTier, i: number, kind: ShakeTierId, phase=0): {x:number;y:number} {
  const A=shakeEnvelope(t,i),w=t.omega*i;
  if(kind==='weak')return {x:0,y:A*Math.sin(w)};
  if(kind==='mid')return {x:A*Math.sin(w*1.5+phase),y:A*Math.sin(w+phase)};
  return {x:A*Math.cos(w+phase),y:A*Math.sin(w+phase)};
}

/** One pulse, restarted by each explosion. Visual state never changes gameplay coordinates. */
export class CameraShakeFeedback {
  readonly extra=new ScreenSpringFeedback();
  private config: ShakeTier | null=null;
  private tier: ShakeTierId='mid';
  private age=0;
  private phase=0;
  private triggers=0;
  trigger(c: CameraShakeSettings, tier=SHAKE_TIERS[c.cameraShakeTier], random=Math.random) {
    if(!c.cameraShakeEnabled)return;
    this.extra.trigger(c);
    this.tier=tier;this.config=readShakeTier(c,tier);this.age=0;
    this.phase=tier==='weak'?0:random()*Math.PI*2;this.triggers++;
  }
  update(dt: number, c: CameraShakeSettings) {
    if(!c.cameraShakeEnabled){this.extra.reset();this.config=null;this.age=0;return;}
    if(!Number.isFinite(dt)||dt<0)return;
    this.extra.update(dt);
    if(!this.config)return;
    this.age+=dt;
    if(this.frame>=this.config.duration)this.config=null;
  }
  private get frame(){return Math.floor(this.age*60+1e-8);}
  offset(){return this.config?shakeOffset(this.config,this.frame,this.tier,this.phase):{x:0,y:0};}
  reset(){this.extra.reset();this.config=null;this.age=0;this.phase=0;this.triggers=0;}
  snapshot(){return {extra:this.extra.snapshot(),active:!!this.config||this.extra.snapshot().active,tier:this.tier,frame:this.frame,phase:this.phase,offset:this.offset(),triggers:this.triggers};}
}
