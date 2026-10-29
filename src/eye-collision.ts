import * as T from 'three/webgpu';
export type EyeObstacle={id:string;box:T.Box3};
type Contact={time:number;normal:T.Vector3;push?:number};
/** Segment vs expanded box; catches fast small eyes and ignores objects above/below the flight. */
function sweepBox(from:T.Vector3,to:T.Vector3,box:T.Box3):Contact|null{
 if(box.containsPoint(from)){let gap=Infinity,normal=new T.Vector3();for(const axis of ['x','y','z'] as const)for(const sign of [-1,1]){const d=sign<0?from[axis]-box.min[axis]:box.max[axis]-from[axis];if(d<gap){gap=d;normal.set(0,0,0);normal[axis]=sign;}}return {time:0,normal,push:gap};}
 let near=0,far=1,normal=new T.Vector3();for(const axis of ['x','y','z'] as const){const delta=to[axis]-from[axis];if(Math.abs(delta)<1e-12){if(from[axis]<box.min[axis]||from[axis]>box.max[axis])return null;continue;}let a=(box.min[axis]-from[axis])/delta,b=(box.max[axis]-from[axis])/delta,sign=-1;if(a>b){[a,b]=[b,a];sign=1;}if(a>near){near=a;normal.set(0,0,0);normal[axis]=sign;}far=Math.min(far,b);if(near>far)return null;}return near>=0&&near<=1&&normal.lengthSq()>0?{time:near,normal}:null;
}
export function eyeContact(from:T.Vector3,to:T.Vector3,radius:number,width:number,length:number,obstacles:EyeObstacle[],sourceId?:string):Contact|null{
 let best:Contact|null=null;const add=(hit:Contact|null)=>{if(hit&&(!best||hit.time<best.time))best=hit;};
 for(const [axis,extent] of [['x',width/2-.155-radius],['z',length/2-.155-radius]] as const){if(!Number.isFinite(extent))continue;const edge=Math.max(0,extent);for(const sign of [-1,1]){const d0=sign*from[axis]-edge,d1=sign*to[axis]-edge;if(d1>0){const normal=new T.Vector3();normal[axis]=-sign;add({time:d0>0?0:Math.max(0,-d0/(d1-d0)),normal,push:Math.max(0,d0)});}}}
 for(const obstacle of obstacles)if(obstacle.id!==sourceId)add(sweepBox(from,to,obstacle.box.clone().expandByScalar(radius)));
 return best;
}
