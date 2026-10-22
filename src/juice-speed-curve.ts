export type JuiceSpeedPoint={time:number;progress:number};
export const DEFAULT_JUICE_SPEED_CURVE:JuiceSpeedPoint[]=[{time:0,progress:100},{time:10,progress:60},{time:30,progress:20},{time:60,progress:8},{time:100,progress:4}];
export function validateJuiceSpeedCurve(raw:unknown):JuiceSpeedPoint[]{
 if(!Array.isArray(raw)||raw.length<2||raw.length>64)throw new Error('速度曲线需要 2–64 个控制点');
 const points=raw.map(p=>{if(!p||!Number.isFinite(p.time)||!Number.isFinite(p.progress)||p.time<0||p.time>100||p.progress<0||p.progress>300)throw new Error('时间必须为 0–100%，速度必须为 0–300%');return {time:p.time as number,progress:p.progress as number};}).sort((a,b)=>a.time-b.time);
 if(points[0].time!==0||points.at(-1)!.time!==100||points.some((p,i)=>i>0&&p.time<=points[i-1].time))throw new Error('时间点不能重复，且必须包含 0% 和 100%');
 return points;
}
/** Linear speed interpolation and exact integrated distance in normalized lifetime units. */
export function sampleJuiceSpeedCurve(points:JuiceSpeedPoint[],u:number){
 const t=Math.max(0,Math.min(1,u))*100;let area=0;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],end=Math.min(t,b.time),span=Math.max(0,end-a.time),speed=a.progress+(b.progress-a.progress)*span/(b.time-a.time);
  area+=(a.progress+speed)*.5*span/10000;
  if(t<=b.time)return {speed:speed/100,integral:area};
 }
 return {speed:points.at(-1)!.progress/100,integral:area};
}
