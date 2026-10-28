import { spring } from './hit-response.ts';
import type { CameraZoomSettings } from './camera-zoom-config.ts';
type Trigger='shot'|'hit';
class ZoomPulse {
 offset=0;
 private age=0;
 private from=0;
 private peak=0;
 private config:CameraZoomSettings|null=null;
 trigger(amount:number,c:CameraZoomSettings,elapsed:number){
  this.from=this.offset;this.peak=Math.max(this.offset,amount/100);this.age=0;this.config={...c};
  this.update(elapsed);
 }
 update(dt:number){
  if(!this.config)return;
  this.age+=Math.max(0,dt);const c=this.config;
  if(c.cameraZoomAttack>0&&this.age<c.cameraZoomAttack){
   const u=this.age/c.cameraZoomAttack;this.offset=this.from+(this.peak-this.from)*(1-(1-u)**c.cameraZoomPower);return;
  }
  const t=this.age-c.cameraZoomAttack-c.cameraZoomHold;
  if(t<0){this.offset=this.peak;return;}
  const state=spring(this.peak,0,t,c.cameraZoomFrequency,c.cameraZoomDamping);this.offset=state.x;
  if(Math.abs(state.x)<1e-5&&Math.abs(state.v)<1e-4)this.reset();
 }
 reset(){this.offset=0;this.age=0;this.config=null;}
 snapshot(){return {offset:this.offset,active:this.config!==null,age:this.age};}
}
/** Independent shot/hit channels; bounded sum around the camera's baseline zoom. */
export class CameraZoomFeedback {
 private shot=new ZoomPulse();private hit=new ZoomPulse();
 private counts={shot:0,hit:0};
 private enabled(kind:Trigger,c:CameraZoomSettings){return !!(kind==='shot'?c.cameraZoomShotEnabled:c.cameraZoomHitEnabled);}
 trigger(kind:Trigger,c:CameraZoomSettings,elapsed=0){
  if(!this.enabled(kind,c))return;
  const amount=kind==='shot'?c.cameraZoomShotAmount:c.cameraZoomHitAmount;
  if(amount<=0)return;
  this[kind].trigger(amount,c,Math.max(0,elapsed));this.counts[kind]++;
 }
 update(dt:number,c:CameraZoomSettings){
  if(!Number.isFinite(dt)||dt<0)return;
  for(const kind of ['shot','hit'] as const){if(!this.enabled(kind,c))this[kind].reset();else this[kind].update(dt);}
 }
 value(c:CameraZoomSettings){const limit=c.cameraZoomMaxAmount/100;return 1+Math.max(-limit,Math.min(limit,this.shot.offset+this.hit.offset));}
 reset(){this.shot.reset();this.hit.reset();this.counts={shot:0,hit:0};}
 snapshot(c:CameraZoomSettings){return {zoom:this.value(c),shot:this.shot.snapshot(),hit:this.hit.snapshot(),triggers:{...this.counts}};}
}
