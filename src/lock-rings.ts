import type { Settings } from './config.ts';

export type ProgressPoint = { time: number; progress: number };
export const DEFAULT_RING_CURVE: ProgressPoint[] = [0,10,25,50,75,90,100].map(time =>
  ({time, progress: Number((100*(1-(1-time/100)**3)).toFixed(3))}));
export function validateProgressCurve(raw: unknown): ProgressPoint[] {
  if (!Array.isArray(raw) || raw.length<2 || raw.length>128) throw new Error('曲线需要 2～128 个控制点');
  const points=raw.map(p=>{
    if(!p || typeof p.time!=='number' || typeof p.progress!=='number' || !Number.isFinite(p.time) || !Number.isFinite(p.progress)
      || p.time<0 || p.time>100 || p.progress<0 || p.progress>100) throw new Error('时间和完成度必须为 0～100%');
    return {time:p.time,progress:p.progress};
  }).sort((a,b)=>a.time-b.time);
  if(points[0].time!==0 || points[0].progress!==0 || points.at(-1)!.time!==100 || points.at(-1)!.progress!==100)
    throw new Error('起终点固定为 (0%, 0%) 和 (100%, 100%)');
  for(let i=1;i<points.length;i++) if(points[i].time<=points[i-1].time || points[i].progress<points[i-1].progress)
    throw new Error('时间不能重复，完成度不能倒退');
  return points;
}
export function progressAt(points: ProgressPoint[], fraction: number) {
  const time=Math.max(0,Math.min(100,fraction*100));
  for(let i=1;i<points.length;i++) if(time<=points[i].time){
    const a=points[i-1],b=points[i];return (a.progress+(b.progress-a.progress)*(time-a.time)/(b.time-a.time))/100;
  }
  return 1;
}
export type StrokePoint = { completion:number; width:number };
/** width is a percentage of ringTargetStroke; completion is geometric shrink completion. */
export const DEFAULT_STROKE_CURVE:StrokePoint[]=[{completion:0,width:100},{completion:100,width:100}];
export function validateStrokeCurve(raw:unknown):StrokePoint[]{
  if(!Array.isArray(raw)||raw.length<2||raw.length>128)throw new Error('粗细曲线需要 2～128 个点');
  const points=raw.map(p=>{
    if(!p||typeof p.completion!=='number'||typeof p.width!=='number'||!Number.isFinite(p.completion)||!Number.isFinite(p.width)||p.completion<0||p.completion>100||p.width<0||p.width>1000)throw new Error('完成度须为 0～100%，粗细须为 0～1000%');
    return {completion:p.completion,width:p.width};
  }).sort((a,b)=>a.completion-b.completion);
  if(points[0].completion!==0||points.at(-1)!.completion!==100||points.some((p,i)=>i>0&&p.completion<=points[i-1].completion))throw new Error('保留 0% 和 100% 端点，完成度不能重复');
  return points;
}
export function strokeAt(points:StrokePoint[],completion:number){
  const x=Math.max(0,Math.min(1,completion))*100;
  for(let i=1;i<points.length;i++)if(x<=points[i].completion){const a=points[i-1],b=points[i];return (a.width+(b.width-a.width)*(x-a.completion)/(b.completion-a.completion))/100;}
  return points.at(-1)!.width/100;
}
export const DEFAULT_LINK_ATTACK_CURVE:StrokePoint[]=[
  {completion:0,width:100},{completion:20,width:90},{completion:50.8,width:65},
  {completion:54,width:145},{completion:70,width:115},{completion:100,width:100},
];
export type AttackPhase={playing:boolean;time:number;duration:number;weight:number;releaseTime:number};
export function attackLinkMultiplier(curve:StrokePoint[],attack?:AttackPhase){
  if(!attack?.playing||attack.duration<=0)return 1;
  return 1+(strokeAt(curve,attack.time/attack.duration)-1)*Math.max(0,Math.min(1,attack.weight));
}
export const DEFAULT_SWITCH_CURVE:ProgressPoint[]=[{time:0,progress:0},{time:25,progress:100},{time:50,progress:45},{time:75,progress:10},{time:100,progress:0}];
export function validateSwitchCurve(raw:unknown):ProgressPoint[]{
  if(!Array.isArray(raw))throw new Error('换目标曲线格式无效');
  const points=validateStrokeCurve(raw.map(p=>({completion:p?.time,width:p?.progress})));
  if(points[0].width!==0||points.at(-1)!.width!==0||points.some(p=>p.width>100))throw new Error('换目标曲线首尾固定为 0，扩张量为 0～100%');
  return points.map(p=>({time:p.completion,progress:p.width}));
}
export type RingConfig = Pick<Settings,'ringPlayerDiameter'|'ringTargetDiameter'|'ringPlayerStroke'|'ringTargetStroke'|
  'ringPlayerHeight'|'ringTargetHeight'|'ringDuration'|'ringCurve'|'ringStrokeCurve'|'ringLinkThreshold'|'ringLinkStroke'|'ringLinkAttackCurve'|'ringSwitchDuration'|'ringSwitchAmount'|'ringSwitchCurve'>;
export const ringConfig=(s: RingConfig): RingConfig=>({
  ringSwitchDuration:s.ringSwitchDuration,ringSwitchAmount:s.ringSwitchAmount,ringSwitchCurve:validateSwitchCurve(s.ringSwitchCurve),
  ringLinkAttackCurve:validateStrokeCurve(s.ringLinkAttackCurve),ringLinkThreshold:s.ringLinkThreshold,ringLinkStroke:s.ringLinkStroke,
  ringPlayerDiameter:s.ringPlayerDiameter,ringTargetDiameter:s.ringTargetDiameter,
  ringPlayerStroke:s.ringPlayerStroke,ringTargetStroke:s.ringTargetStroke,
  ringPlayerHeight:s.ringPlayerHeight,ringTargetHeight:s.ringTargetHeight,
  ringDuration:s.ringDuration,ringCurve:validateProgressCurve(s.ringCurve),ringStrokeCurve:validateStrokeCurve(s.ringStrokeCurve),
});
/** Trim the center-to-center segment to both rings' outside edges. Butt caps prevent intrusion. */
export function ringLinkSegment(a:{x:number;y:number},b:{x:number;y:number},radiusA:number,radiusB:number){
  const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy);
  if(d<=radiusA+radiusB||d===0)return null;
  const ux=dx/d,uy=dy/d;
  return {x1:a.x+ux*radiusA,y1:a.y+uy*radiusA,x2:b.x-ux*radiusB,y2:b.y-uy*radiusB};
}
export class LockRings {
  targetId: string|null=null;
  config: RingConfig|null=null;
  elapsed=0;
  initialRadius=0;
  radius=0;
  completion=0;
  stroke=0;
  switchElapsed:number|null=null;
  switchStart=0;
  preview:number|null=null;
  seek(completion:number){if(this.targetId!==null&&Number.isFinite(completion)){this.preview=Math.max(0,Math.min(1,completion));this.switchElapsed=null;this.switchStart=0;}}
  resume(){
    if(this.preview===null||!this.config)return;
    // Invert the piecewise linear progress curve, choosing the earliest matching time.
    const points=this.config.ringCurve,wanted=this.preview*100;
    let time=100;
    for(let i=1;i<points.length;i++)if(wanted<=points[i].progress){
      const a=points[i-1],b=points[i];time=b.progress===a.progress?a.time:a.time+(b.time-a.time)*(wanted-a.progress)/(b.progress-a.progress);break;
    }
    this.elapsed=time/100*this.config.ringDuration;this.preview=null;
  }
  reset(){this.switchElapsed=null;this.switchStart=0;this.preview=null;this.completion=0;this.stroke=0;this.targetId=null;this.config=null;this.elapsed=0;this.initialRadius=0;this.radius=0;}
  update(dt:number,id:string|null,settings:RingConfig,center:{x:number;y:number},width:number,height:number){
    if(id===null){this.reset();return;}
    if(this.targetId===null){
      this.config=ringConfig(settings);this.elapsed=0;
      this.initialRadius=Math.max(...[0,width].flatMap(x=>[0,height].map(y=>Math.hypot(x-center.x,y-center.y))))
        +this.config.ringTargetStroke*strokeAt(this.config.ringStrokeCurve,0)/2+1;
      this.initialRadius=Math.max(this.initialRadius,this.config.ringTargetDiameter/2);
    }else if(this.preview===null&&Number.isFinite(dt)&&dt>0){this.elapsed=Math.min(this.config!.ringDuration,this.elapsed+dt);}
    const changed=this.targetId!==null&&this.targetId!==id;
    if(changed&&this.preview===null&&this.completion===1){
      this.switchStart=Math.max(0,this.radius-this.config!.ringTargetDiameter/2);this.switchElapsed=0;
    }else if(this.switchElapsed!==null&&Number.isFinite(dt)&&dt>0){
      this.switchElapsed=Math.min(this.config!.ringSwitchDuration,this.switchElapsed+dt);
    }
    this.targetId=id;
    const c=this.config!,p=this.preview??progressAt(c.ringCurve,this.elapsed/c.ringDuration);
    this.completion=p;this.stroke=c.ringTargetStroke*strokeAt(c.ringStrokeCurve,p);
    this.radius=c.ringTargetDiameter/2+(this.initialRadius-c.ringTargetDiameter/2)*(1-p);
    if(this.switchElapsed!==null&&this.preview===null){
      const u=this.switchElapsed/c.ringSwitchDuration,maximum=c.ringTargetDiameter/2*c.ringSwitchAmount/100;
      // Blend the current expansion into the new envelope, bounded by the configured peak.
      const start=Math.min(maximum,this.switchStart);
      this.radius+=start*(1-u)+(maximum-start)*progressAt(c.ringSwitchCurve,u);
      if(u>=1){this.switchElapsed=null;this.switchStart=0;}
    }
  }
  get linkVisible(){return this.targetId!==null&&this.config!==null&&this.completion>=this.config.ringLinkThreshold/100;}
  snapshot(){return {switchElapsed:this.switchElapsed,switchStart:this.switchStart,targetId:this.targetId,elapsed:this.elapsed,initialRadius:this.initialRadius,radius:this.radius,
    linkVisible:this.linkVisible,completion:this.completion,stroke:this.stroke,preview:this.preview,progress:this.config?Math.min(1,this.elapsed/this.config.ringDuration):0,config:this.config&&ringConfig(this.config)};}
}
