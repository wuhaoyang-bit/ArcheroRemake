import * as T from 'three/webgpu';
import type {LiquidMark} from './slime-liquid-field.ts';
import {createSlimeLiquidMaterial,slimeLiquidRimNormal} from './slime-liquid-material.ts';
import {SLIME_TRAIL_DEFAULTS,type SlimeTrailSettings} from './slime-trail-config.ts';

export interface SlimeTrailBody{
 id:string;active:boolean;position:T.Vector3;radius:number;color:T.Color;
 /** Sample the deformed body's low surface in the direction of a world-space ground anchor. */
 footToward:(ground:T.Vector3,out:T.Vector3)=>T.Vector3;
}
type Config=Partial<SlimeTrailSettings>&{puddleEnabled:number;puddleRenderer:number;puddleSize:number;puddleRoughness:number};
type TrailMark={id:number;x:number;z:number;radius:number;color:number[];born:number;seed:number};
type BodyState={previous:T.Vector3;carry:number;idle:number;travel:number;recent:TrailMark[];lastMark:number};
type Strand={body:SlimeTrailBody;mark:TrailMark;ground:T.Vector3;tip:T.Vector3;breakPoint:T.Vector3;radius:number;seed:number;lane:number;age:number;breaking:number;neck:number;length:number};
export const MAX_TRAIL_MARKS=640,MAX_SLIME_STRANDS=48;
const ROWS=12,SIDES=8,VERTICES=(ROWS+1)*SIDES+2,INDICES=ROWS*SIDES*6+SIDES*6,PIECES=MAX_SLIME_STRANDS*2,FLOOR=.042;
const keys=Object.keys(SLIME_TRAIL_DEFAULTS) as (keyof SlimeTrailSettings)[];
const smooth=(t:number)=>t*t*(3-2*t);

/** World-anchored, distance-sampled residue and capped liquid bridges; one draw for all strands. */
export class SlimeGroundTrail{
 readonly mesh:T.Mesh<T.BufferGeometry,T.MeshPhysicalNodeMaterial>;
 private states=new Map<string,BodyState>();private marks:TrailMark[]=[];private strands:Strand[]=[];
 private clock=0;private serial=0;private config={...SLIME_TRAIL_DEFAULTS};private enabled=false;private scale=1;
 private signature='';private broken=0;private renderedPieces=0;
 private position:T.BufferAttribute;private normal:T.BufferAttribute;private color:T.BufferAttribute;
 private a=new T.Vector3();private b=new T.Vector3();private middle=new T.Vector3();private along=new T.Vector3();private around=new T.Vector3();
 private footTarget=new T.Vector3();
 private dir=new T.Vector3();private side=new T.Vector3();private up=new T.Vector3();private point=new T.Vector3();private norm=new T.Vector3();
 private tempColor=new T.Color();private ringAngles=Array.from({length:SIDES},(_,i)=>[Math.cos(i/SIDES*Math.PI*2),Math.sin(i/SIDES*Math.PI*2)]);
 constructor(scene:T.Scene){
  const geo=new T.BufferGeometry();
  this.position=new T.BufferAttribute(new Float32Array(PIECES*VERTICES*3),3).setUsage(T.DynamicDrawUsage);
  this.normal=new T.BufferAttribute(new Float32Array(PIECES*VERTICES*3),3).setUsage(T.DynamicDrawUsage);
  this.color=new T.BufferAttribute(new Float32Array(PIECES*VERTICES*3),3).setUsage(T.DynamicDrawUsage);
  const indices:number[]=[];
  for(let p=0;p<PIECES;p++){
   const start=p*VERTICES;
   for(let row=0;row<ROWS;row++)for(let k=0;k<SIDES;k++){const a=start+row*SIDES+k,b=start+row*SIDES+(k+1)%SIDES;indices.push(a,b,a+SIDES,b,b+SIDES,a+SIDES);}
   for(let k=0;k<SIDES;k++){indices.push(start+(ROWS+1)*SIDES,start+(k+1)%SIDES,start+k);const end=start+ROWS*SIDES;indices.push(start+(ROWS+1)*SIDES+1,end+k,end+(k+1)%SIDES);}
  }
  geo.setAttribute('position',this.position);geo.setAttribute('normal',this.normal);geo.setAttribute('color',this.color);geo.setIndex(indices);geo.setDrawRange(0,0);
  const mat=createSlimeLiquidMaterial();mat.vertexColors=true;mat.normalNode=slimeLiquidRimNormal();mat.name='Slime liquid / ground strands';
  this.mesh=new T.Mesh(geo,mat);this.mesh.name='SlimeGroundStrands';this.mesh.frustumCulled=false;
  this.mesh.receiveShadow=true;this.mesh.visible=false;scene.add(this.mesh);
 }
 private addMark(body:SlimeTrailBody,x:number,z:number,state:BodyState){
  const mark={id:++this.serial,x,z,radius:body.radius,color:body.color.toArray(),born:this.clock,seed:this.serial*2.399963};
  this.marks.push(mark);state.recent.push(mark);if(state.recent.length>40)state.recent.shift();
  return mark;
 }
 private markRadius(mark:TrailMark){return Math.max(.06,mark.radius*this.config.slimeTrailWidth*this.scale);}
 private opacity(mark:TrailMark){return T.MathUtils.clamp(1-(this.clock-mark.born-this.config.slimeTrailLifetime)/this.config.slimeTrailFade,0,1);}
 private spawn(body:SlimeTrailBody,state:BodyState){
  if(this.strands.length>=MAX_SLIME_STRANDS)return;
  // The anchor is an actual stamp, just behind the body's footprint, never a moving fake tail.
  const mark=[...state.recent].reverse().find(m=>m.id>state.lastMark&&this.opacity(m)>.8&&Math.hypot(body.position.x-m.x,body.position.z-m.z)>body.radius*.98);
  if(!mark)return;
  const seed=Math.sin(mark.seed*7.13)*.5+.5,radius=body.radius;
  const occupied=new Set(this.strands.filter(s=>s.body.id===body.id&&s.breaking<0).map(s=>s.lane));
  const lane=[-1,1,0].find(l=>!occupied.has(l))??0;
  this.dir.set(mark.x-body.position.x,0,mark.z-body.position.z).normalize();
  const lateral=(lane*.45+(seed-.5)*.12)*this.markRadius(mark);
  const ground=new T.Vector3(mark.x-this.dir.z*lateral,FLOOR+.001,mark.z+this.dir.x*lateral),tip=this.sampleTip(body,ground,lane,new T.Vector3());
  const length=ground.distanceTo(tip);
  if(length>radius*this.config.slimeStrandLength*1.1)return;
  state.lastMark=mark.id;
  this.strands.push({body,mark,ground,tip,breakPoint:new T.Vector3(),radius,seed,lane,age:0,breaking:-1,neck:.48+seed*.12,length});
 }
 private sampleTip(body:SlimeTrailBody,ground:T.Vector3,lane:number,out:T.Vector3){
  const dx=ground.x-body.position.x,dz=ground.z-body.position.z;
  this.footTarget.copy(ground);this.footTarget.x-=dz*lane*.42;this.footTarget.z+=dx*lane*.42;
  return body.footToward(this.footTarget,out);
 }
 private center(out:T.Vector3,start:T.Vector3,end:T.Vector3,t:number){
  out.lerpVectors(start,end,t);out.y=start.y+(end.y-start.y)*t*t;
  return out;
 }
 private break(strand:Strand){
  if(strand.breaking>=0)return;
  this.center(strand.breakPoint,strand.ground,strand.tip,strand.neck);strand.breaking=0;this.broken++;
 }
 update(dt:number,bodies:readonly SlimeTrailBody[],input:Config){
  const c=this.config;for(const k of keys)c[k]=input[k]??SLIME_TRAIL_DEFAULTS[k];
  dt=Math.max(0,dt);this.clock+=dt;this.enabled=!!c.slimeTrailEnabled&&!!input.puddleEnabled&&input.puddleRenderer===2;
  this.scale=Math.max(.05,input.puddleSize/6);this.mesh.material.roughness=input.puddleRoughness;
  const signature=[this.enabled,c.slimeTrailWidth,c.slimeTrailLifetime,c.slimeTrailFade,this.scale].join('/');
  let dirty=signature!==this.signature;this.signature=signature;
  const before=this.marks.length;this.marks=this.marks.filter(m=>this.opacity(m)>0);
  if(this.marks.length!==before)dirty=true;
  const active=new Map(bodies.filter(b=>b.active&&this.enabled).map(b=>[b.id,b]));
  for(const id of this.states.keys())if(!active.has(id))this.states.delete(id);
  for(const body of active.values()){
   let state=this.states.get(body.id);
   if(!state){state={previous:body.position.clone(),carry:0,idle:0,travel:0,recent:[],lastMark:0};this.states.set(body.id,state);}
   if(dt<=0)continue;
   const distance=state.previous.distanceTo(body.position);
   if(distance>Math.max(4,body.radius*5)){
    state.previous.copy(body.position);state.carry=0;state.recent=[];state.travel=0;
    this.strands=this.strands.filter(s=>s.body.id!==body.id);continue;
   }
   state.idle=distance>1e-5?0:state.idle+dt;
   if(distance>1e-5){
    const spacing=Math.max(.045,body.radius*c.slimeTrailWidth*this.scale*.55);
    if(!state.recent.length){this.addMark(body,state.previous.x,state.previous.z,state);dirty=true;}
    let offset=Math.max(0,spacing-state.carry);
    for(;offset<=distance+1e-8;offset+=spacing){const f=Math.min(1,offset/distance);this.addMark(body,T.MathUtils.lerp(state.previous.x,body.position.x,f),T.MathUtils.lerp(state.previous.z,body.position.z,f),state);dirty=true;}
    state.carry=(state.carry+distance)%spacing;state.travel+=distance;
    if(c.slimeStrandEnabled&&state.travel>body.radius*.28&&this.strands.filter(s=>s.body.id===body.id&&s.breaking<0).length<Math.round(c.slimeStrandCount)){
     const n=this.strands.length;this.spawn(body,state);if(this.strands.length>n)state.travel=0;
    }
   }
   state.previous.copy(body.position);
  }
  if(this.marks.length>MAX_TRAIL_MARKS){this.marks.splice(0,this.marks.length-MAX_TRAIL_MARKS);dirty=true;}
  const retained=new Set(this.marks);
  this.strands=this.strands.filter(s=>active.has(s.body.id)&&retained.has(s.mark)&&this.opacity(s.mark)>.5&&!!c.slimeStrandEnabled&&Math.hypot(s.ground.x-s.mark.x,s.ground.z-s.mark.z)<this.markRadius(s.mark)*.8);
  const counts=new Map<string,number>();
  for(const s of this.strands){
   s.body=active.get(s.body.id)!;this.sampleTip(s.body,s.ground,s.lane,s.tip);s.radius=s.body.radius;s.length=s.ground.distanceTo(s.tip);s.age+=dt;
   if(s.breaking<0){const order=(counts.get(s.body.id)??0)+1;counts.set(s.body.id,order);
    if(s.length>s.radius*c.slimeStrandLength*(.86+s.seed*.28)||s.age>1.4||this.states.get(s.body.id)!.idle>.12||order>c.slimeStrandCount)this.break(s);
   }
   if(s.breaking>=0)s.breaking+=dt;
  }
  this.strands=this.strands.filter(s=>s.breaking<c.slimeStrandRetract);
  this.renderedPieces=0;
  for(const s of this.strands)this.drawStrand(s);
  this.mesh.geometry.setDrawRange(0,this.renderedPieces*INDICES);this.mesh.visible=this.enabled&&this.renderedPieces>0;
  if(this.mesh.visible)for(const attr of [this.position,this.normal,this.color]){attr.clearUpdateRanges();attr.addUpdateRange(0,this.renderedPieces*VERTICES*3);attr.needsUpdate=true;}
  return dirty||this.marks.some(m=>this.clock-m.born>c.slimeTrailLifetime);
 }
 appendMarks(out:LiquidMark[]){
  if(!this.enabled)return;
  for(const m of this.marks)out.push({x:m.x,z:m.z,radius:this.markRadius(m),opacity:this.opacity(m),color:m.color,seed:m.seed});
 }
 private drawStrand(s:Strand){
  const c=this.config,width=s.radius*c.slimeStrandWidth*Math.sqrt(this.scale),stretch=T.MathUtils.clamp(s.length/(s.radius*c.slimeStrandLength),0,1);
  const neck=width*(.42-.36*stretch),groundWidth=Math.min(this.markRadius(s.mark)*.65,width*1.9),bodyWidth=width*1.35;
  if(s.breaking<0){this.piece(s.ground,s.tip,groundWidth,bodyWidth,neck,s.mark.color,s.body.color,0,1);return;}
  const t=smooth(T.MathUtils.clamp(s.breaking/c.slimeStrandRetract,0,1)),shrink=1-t;
  this.a.lerpVectors(s.breakPoint,s.ground,t);this.a.y=Math.max(FLOOR+.001,this.a.y);
  this.b.lerpVectors(s.breakPoint,s.tip,t);
  this.piece(s.ground,this.a,groundWidth*shrink,.001,neck*shrink,s.mark.color,s.body.color,0,s.neck);
  this.piece(this.b,s.tip,.001,bodyWidth*shrink,neck*shrink,s.mark.color,s.body.color,s.neck,1);
 }
 private piece(start:T.Vector3,end:T.Vector3,root:number,tip:number,neck:number,groundColor:number[],bodyColor:T.Color,colorFrom:number,colorTo:number){
  if(this.renderedPieces>=PIECES)return;
  const offset=this.renderedPieces++*VERTICES;
  this.dir.subVectors(end,start);const horizontal=Math.hypot(this.dir.x,this.dir.z);
  if(horizontal>1e-6)this.side.set(this.dir.z/horizontal,0,-this.dir.x/horizontal);else this.side.set(1,0,0);
  for(let row=0;row<=ROWS;row++){
   const t=row/ROWS,width=Math.max(.001,neck+root*(1-t)**3+tip*t**3);
   this.center(this.point,start,end,t);
   this.dir.set(end.x-start.x,2*(end.y-start.y)*t,end.z-start.z).normalize();
   if(this.dir.lengthSq()<.01)this.dir.set(0,0,1);
   this.up.crossVectors(this.dir,this.side).normalize();if(this.up.y<0)this.up.negate();
   const flatten=(this.point.y-FLOOR)/.16,flat=T.MathUtils.clamp(flatten,.055,.8),height=Math.max(.001,width*flat);
   const widthSlope=-3*root*(1-t)**2+3*tip*t*t;
   const heightSlope=widthSlope*flat+(flatten>.055&&flatten<.8?width*2*(end.y-start.y)*t/.16:0);
   const mix=T.MathUtils.lerp(colorFrom,colorTo,t);this.tempColor.setRGB(groundColor[0],groundColor[1],groundColor[2]).lerp(bodyColor,mix);
   for(let k=0;k<SIDES;k++){
    const [cos,sin]=this.ringAngles[k],i=offset+row*SIDES+k;
    this.middle.copy(this.point).addScaledVector(this.side,cos*width).addScaledVector(this.up,sin*height);
    // Include the widening ends in the normals so highlights follow a liquid sheet, not a uniform pipe.
    this.along.set(end.x-start.x,2*(end.y-start.y)*t,end.z-start.z).addScaledVector(this.side,cos*widthSlope).addScaledVector(this.up,sin*heightSlope);
    this.around.copy(this.side).multiplyScalar(-sin*width).addScaledVector(this.up,cos*height);
    this.norm.crossVectors(this.around,this.along).normalize();if(this.norm.lengthSq()<.01)this.norm.copy(this.up);
    this.position.setXYZ(i,this.middle.x,this.middle.y,this.middle.z);this.normal.setXYZ(i,this.norm.x,this.norm.y,this.norm.z);this.color.setXYZ(i,this.tempColor.r,this.tempColor.g,this.tempColor.b);
   }
  }
  for(let cap=0;cap<2;cap++){
   const p=cap?end:start,i=offset+(ROWS+1)*SIDES+cap;
   this.position.setXYZ(i,p.x,p.y,p.z);this.dir.subVectors(end,start).normalize().multiplyScalar(cap?1:-1);this.normal.setXYZ(i,this.dir.x,this.dir.y,this.dir.z);
   this.tempColor.setRGB(...groundColor as [number,number,number]).lerp(bodyColor,cap?colorTo:colorFrom);this.color.setXYZ(i,this.tempColor.r,this.tempColor.g,this.tempColor.b);
  }
 }
 prepareWarmup(){
  this.renderedPieces=0;this.piece(new T.Vector3(0,FLOOR,0),new T.Vector3(0,.18,1),.2,.18,.035,[1,.7,.03],new T.Color(1,.7,.03),0,1);
  this.mesh.geometry.setDrawRange(0,INDICES);this.mesh.visible=true;
  for(const attr of [this.position,this.normal,this.color])attr.needsUpdate=true;
 }
 clear(){this.states.clear();this.marks=[];this.strands=[];this.clock=0;this.serial=0;this.broken=0;this.renderedPieces=0;this.signature='';this.mesh.visible=false;this.mesh.geometry.setDrawRange(0,0);}
 snapshot(){return {enabled:this.enabled,marks:this.marks.length,strands:this.strands.length,attached:this.strands.filter(s=>s.breaking<0).length,breaking:this.strands.filter(s=>s.breaking>=0).length,broken:this.broken,triangles:this.renderedPieces*INDICES/3,roughness:this.mesh.material.roughness,anchors:this.strands.map(s=>({id:s.body.id,ground:s.ground.toArray(),body:s.tip.toArray(),markId:s.mark.id,mark:[s.mark.x,s.mark.z,this.markRadius(s.mark)],color:s.mark.color.slice(),length:s.length,breaking:s.breaking}))};}
}
