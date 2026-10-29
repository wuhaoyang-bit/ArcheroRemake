import * as T from 'three/webgpu';
export type EyeObstacle={id:string;box:T.Box3};
type Contact={time:number;normal:T.Vector3;push?:number};
export type EyePlayer={x:number;z:number;radius:number;height:number};
/** Swept sphere against a vertical player cylinder, including its top and bottom. */
export function eyePlayerContact(from:T.Vector3,to:T.Vector3,radius:number,player:EyePlayer):Contact|null{
 const x=from.x-player.x,z=from.z-player.z,dx=to.x-from.x,dz=to.z-from.z,dy=to.y-from.y;
 const r=radius+player.radius,low=-radius,high=player.height+radius,d=Math.hypot(x,z);
 if(d<r&&from.y>=low&&from.y<=high){
  const side=r-d,top=high-from.y,bottom=from.y-low;
  if(top<side&&top<bottom)return {time:0,normal:new T.Vector3(0,1,0),push:top};
  if(bottom<side)return {time:0,normal:new T.Vector3(0,-1,0),push:bottom};
  return {time:0,normal:d>1e-8?new T.Vector3(x/d,0,z/d):new T.Vector3(1,0,0),push:side};
 }
 let near=0,far=1,normal=new T.Vector3();
 const a=dx*dx+dz*dz,b=x*dx+z*dz,c=x*x+z*z-r*r;
 if(a<1e-12){if(c>0)return null;}else{
  const disc=b*b-a*c;if(disc<0)return null;
  const entry=(-b-Math.sqrt(disc))/a,exit=(-b+Math.sqrt(disc))/a;
  if(entry>=near){near=entry;normal.set(x+dx*near,0,z+dz*near).normalize();}far=Math.min(far,exit);
 }
 if(Math.abs(dy)<1e-12){if(from.y<low||from.y>high)return null;}else{
  let entry=(low-from.y)/dy,exit=(high-from.y)/dy,sign=-1;
  if(entry>exit){[entry,exit]=[exit,entry];sign=1;}
  if(entry>=near){near=entry;normal.set(0,sign,0);}far=Math.min(far,exit);
 }
 return near<=far&&near>=0&&near<=1&&normal.lengthSq()>0?{time:near,normal}:null;
}
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
