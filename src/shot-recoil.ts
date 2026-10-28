import { sampleJuiceSpeedCurve, validateJuiceSpeedCurve, type JuiceSpeedPoint } from './juice-speed-curve.ts';
export const DEFAULT_RECOIL_CURVE:JuiceSpeedPoint[]=[{time:0,progress:100},{time:25,progress:56.25},{time:50,progress:25},{time:75,progress:6.25},{time:100,progress:0}];
type Point={x:number;z:number};
type RecoilSettings={recoilEnabled:number;recoilDistance:number;recoilDuration:number;recoilSpeedCurve:JuiceSpeedPoint[]};
/** Integrate speed exactly and normalize its area so distance remains independently tunable. */
export class ShotRecoil {
  private elapsed=0;
  private duration=0;
  private distance=0;
  private area=0;
  private curve=DEFAULT_RECOIL_CURVE;
  private direction:Point={x:0,z:0};
  trigger(shot:Point,c:RecoilSettings){
    this.reset();
    const length=Math.hypot(shot.x,shot.z);
    if(!c.recoilEnabled||length<1e-8)return;
    this.curve=validateJuiceSpeedCurve(c.recoilSpeedCurve);
    this.area=sampleJuiceSpeedCurve(this.curve,1).integral;
    if(this.area<=0)return;
    this.direction={x:-shot.x/length,z:-shot.z/length};
    this.duration=c.recoilDuration;this.distance=c.recoilDistance;
  }
  update(dt:number):Point{
    if(!this.active||!Number.isFinite(dt)||dt<=0)return {x:0,z:0};
    const before=sampleJuiceSpeedCurve(this.curve,this.elapsed/this.duration).integral;
    this.elapsed=Math.min(this.duration,this.elapsed+dt);
    const step=this.distance*(sampleJuiceSpeedCurve(this.curve,this.elapsed/this.duration).integral-before)/this.area;
    return {x:this.direction.x*step,z:this.direction.z*step};
  }
  get active(){return this.elapsed<this.duration;}
  reset(){this.elapsed=this.duration=0;}
  snapshot(){return {active:this.active,elapsed:this.elapsed,duration:this.duration,direction:{...this.direction}};}
}
