import * as T from 'three/webgpu';
import {texture,uv,uniform,uniformArray,vec2,vec3,Fn,If,normalMap,smoothstep} from 'three/tsl';
import {SlimeLiquidField,type LiquidMark} from './slime-liquid-field.ts';
import {puddleRenderKey,type PuddleState} from './puddle-live-settings.ts';
import type {BurstSettings} from './slime-burst-config.ts';
import {SlimeLiquidDrops} from './slime-liquid-drops.ts';
import {slimeFlight,type FlightSettings} from './slime-flight-motion.ts';
import {liquidFlightSettings,type LiquidFlightSettings} from './slime-liquid-flight-config.ts';
import {SlimeGroundTrail,type SlimeTrailBody} from './slime-ground-trail.ts';
import type {SlimeTrailSettings} from './slime-trail-config.ts';
import {createSlimeLiquidMaterial} from './slime-liquid-material.ts';
export type LiquidSettings=BurstSettings&LiquidFlightSettings;
type DropSpawn={p:T.Vector3;v:T.Vector3;radius:number;color:T.Color;paint:boolean;seed:number};
type Drop=DropSpawn&{age:number;origin:T.Vector3;direction:T.Vector3;ballistic:boolean;settings:FlightSettings};
type Deposit={x:number;z:number;radius:number;color:number[];born:number;seed:number};
const MAX_DROPS=384,MAX_MARKS=256,MAX_WAVES=16;
/** WebGPU implementation of continuous ink coverage, impact waves and wet footsteps.
 * Architecture inspired by INKWAVE; implemented for our TSL renderer and monster colours.
 */
export class UnifiedSlimeLiquid{
 readonly field=new SlimeLiquidField();
 readonly trail:SlimeGroundTrail;
 private trailBodies:readonly SlimeTrailBody[]=[];
 private map=new T.DataTexture(this.field.data,this.field.nx,this.field.nz);
 private floor:T.Mesh;private dropRenderer:SlimeLiquidDrops;
 private time=uniform(0);private room=uniform(new T.Vector2(16,38));
 private waves=Array.from({length:MAX_WAVES},()=>new T.Vector4(0,0,-100,0));private waveNode=uniformArray(this.waves,'vec4' as const);private waveIndex=0;
 private drops:Drop[]=[];private deposits:Deposit[]=[];private clock=0;private drawClock=0;private signature='';private dirty=true;private enabled=false;
 private stepDistance=0;private footSide=1;private hits=0;private steps=0;
 private pendingDrops=0;
 constructor(scene:T.Scene){
  this.map.colorSpace=T.NoColorSpace;this.map.minFilter=this.map.magFilter=T.LinearFilter;this.map.generateMipmaps=false;
  const mat=createSlimeLiquidMaterial();
  const tex=texture(this.map,vec2(uv().x,uv().y.oneMinus())),coverage=smoothstep(.13,.25,tex.a);
  mat.colorNode=tex.rgb;mat.opacityNode=coverage;mat.alphaTest=.01;
  const normal=Fn(()=>{
   const coord=vec2(uv().x,uv().y.oneMinus()),du=vec2(1/this.field.nx,0),dv=vec2(0,1/this.field.nz);
   const h=(u:any)=>smoothstep(.13,.85,texture(this.map,u).a).mul(.07);
   const gx=h(coord.add(du)).sub(h(coord.sub(du))).div(this.room.x.mul(2/this.field.nx));
   const gy=h(coord.add(dv)).sub(h(coord.sub(dv))).div(this.room.y.mul(2/this.field.nz));
   const gradient=vec2(gx,gy).toVar();const world=coord.sub(.5).mul(this.room);
   for(let i=0;i<MAX_WAVES;i++){
    const w=this.waveNode.element(i),age=this.time.sub(w.z).max(0);
    // Most path pixels have no active impact wave. Skip its expensive trig/exponential work.
    If(age.lessThan(1.2).and(w.w.greaterThan(0)),()=>{
     const delta=world.sub(w.xy),distance=delta.length().max(.01),front=distance.sub(age.mul(2));
     const envelope=front.mul(front).mul(-12).exp().mul(age.div(1.2).oneMinus().clamp()).mul(w.w);
     gradient.addAssign(delta.div(distance).mul(front.mul(24).cos()).mul(envelope).mul(coverage));
    });
   }
   return vec3(gradient.x.negate(),gradient.y,1).normalize().mul(.5).add(.5);
  })();
  mat.normalNode=normalMap(normal);
  this.floor=new T.Mesh(new T.PlaneGeometry(1,1),mat);this.floor.name='UnifiedSlimeSurface';this.floor.rotation.x=-Math.PI/2;this.floor.position.y=.042;this.floor.receiveShadow=true;this.floor.visible=false;scene.add(this.floor);
  this.dropRenderer=new SlimeLiquidDrops(scene,MAX_DROPS);
  this.trail=new SlimeGroundTrail(scene);
 }
 emit(center:T.Vector3,c:LiquidSettings,random:()=>number,color?:T.Color){
  const tint=color?.clone()??new T.Color(c.puddleColorR,c.puddleColorG,c.puddleColorB);
  const motion=liquidFlightSettings(c);
  // Centre height tracks the actual inflated body, so a large monster releases larger drops.
  const volumeScale=T.MathUtils.clamp(center.y/1.1,.65,2.8),count=Math.round(c.liquidDropCount*Math.sqrt(volumeScale));
  for(let i=0;i<count;i++){
   const a=(i+random()*.7)/count*Math.PI*2,r=(.09+random()*.14)*volumeScale;
   const direction=new T.Vector3(Math.cos(a),.15+random()*.65,Math.sin(a)).normalize();
   // Choose each drop's base speed once; retain that offset throughout its flight curve.
   const dropMotion={...motion,slimeEyeEjectSpeed:Math.max(0,motion.slimeEyeEjectSpeed+(random()*2-1)*c.liquidSpeedJitter)};
   this.addDrop({p:center.clone(),v:direction.clone().multiplyScalar(slimeFlight(0,dropMotion).speed),radius:r,color:tint.clone(),paint:true,seed:random()*6.28},dropMotion,false,direction);
  }
 }
 private addDrop(d:DropSpawn,settings:FlightSettings,ballistic=true,direction=d.v.clone().normalize()){
  if(this.drops.length+this.pendingDrops<MAX_DROPS)this.drops.push({...d,origin:d.p.clone(),direction:direction.clone().normalize(),age:0,ballistic,settings});
 }
 private ripple(x:number,z:number,strength:number){this.waves[this.waveIndex++%MAX_WAVES].set(x,z,this.clock,Math.min(.25,strength));}
 private land(d:Drop,c:BurstSettings){
  this.hits++;this.ripple(d.p.x,d.p.z,c.liquidRippleStrength*(.08+d.radius*.4)*(d.paint?1:.3));
  if(!d.paint)return;
  this.deposits.push({x:d.p.x,z:d.p.z,radius:d.radius*2.6,color:d.color.toArray(),born:this.clock,seed:d.seed});if(this.deposits.length>MAX_MARKS)this.deposits.shift();this.dirty=true;
  // Secondary drops are cosmetic, preventing recursive creation of new liquid.
  for(let i=0;i<2;i++){const a=d.seed+i*2.8;this.addDrop({p:d.p.clone().setY(d.radius*.3+.06),v:new T.Vector3(Math.cos(a)*1.2,1.3+i*.35,Math.sin(a)*1.2),radius:d.radius*.28,color:d.color,paint:false,seed:a},d.settings);}
 }
 setTrailBodies(bodies:readonly SlimeTrailBody[]){this.trailBodies=bodies;}
 update(dt:number,puddles:PuddleState[],c:BurstSettings&Partial<SlimeTrailSettings>,width:number,length:number){
  const endTime=this.clock+dt;this.time.value=endTime;this.enabled=c.puddleRenderer===2&&!!c.puddleEnabled;
  if(this.trail.update(dt,this.trailBodies,c))this.dirty=true;
  this.floor.visible=this.enabled;

  if(this.field.width!==width||this.field.length!==length){this.field.width=width;this.field.length=length;this.dirty=true;}
  this.room.value.set(width,length);this.floor.scale.set(width,length,1);(this.floor.material as T.MeshPhysicalNodeMaterial).roughness=c.puddleRoughness;
  const steps=Math.ceil(dt*120),step=steps?dt/steps:0;
  for(let i=0;i<steps;i++){
   this.clock+=step;
   const flying=this.drops;this.drops=[];this.pendingDrops=flying.length;
   for(const d of flying){
    d.age+=step;
    if(!d.ballistic){
     const motion=slimeFlight(d.age,d.settings);
     d.p.copy(d.origin).addScaledVector(d.direction,motion.distance);d.p.y-=motion.drop;
     d.v.copy(d.direction).multiplyScalar(motion.speed);d.v.y-=motion.fallSpeed;
    }else{
     const gravity=d.settings.slimeEyeEjectGravity;
     d.p.addScaledVector(d.v,step);d.p.y-=.5*gravity*step*step;d.v.y-=gravity*step;
    }
    // Liquid has no restitution: an arena wall stops outward motion, then it falls.
    for(const [axis,extent] of [['x',Math.max(0,width/2-.16-d.radius)],['z',Math.max(0,length/2-.16-d.radius)]] as const){
     if(Math.abs(d.p[axis])>extent){d.p[axis]=Math.sign(d.p[axis])*extent;d.v[axis]=0;d.ballistic=true;}
    }
    this.pendingDrops--;
    if(d.p.y<=d.radius+.04){d.p.y=.045;this.land(d,c);}
    else if(d.age<5)this.drops.push(d);
   }

  }
  this.clock=endTime;
  const previousDeposits=this.deposits.length;
  this.deposits=this.deposits.filter(d=>!c.puddleLifetime||this.clock-d.born<c.puddleLifetime+c.puddleFade);
  if(this.deposits.length!==previousDeposits)this.dirty=true;
  if(!this.enabled){this.dropRenderer.update(this.drops,false,!!c.puddleShadowEnabled);this.dirty=true;return;}
  const key=puddles.map(puddleRenderKey).join('|')+'/'+[c.puddleSize,c.puddleX,c.puddleZ,c.puddleLifetime,c.puddleFade].join('/');
  if(key!==this.signature){this.signature=key;this.dirty=true;}
  if(this.deposits.some(d=>this.clock-d.born<.3||(c.puddleLifetime>0&&this.clock-d.born>c.puddleLifetime)))this.dirty=true;
  this.drawClock+=dt;
  if(this.dirty&&(this.drawClock>=1/30||dt===0)){
   const marks:LiquidMark[]=puddles.slice(-128).filter(p=>p.age>=0).map(p=>({x:p.x,z:p.z,radius:p.size*p.scale*.5*(1+.2*((p.origin.liquidScale??1)-1)),opacity:p.opacity,color:[p.c.puddleColorR,p.c.puddleColorG,p.c.puddleColorB],seed:p.angle+p.shape*2}));
   for(const d of this.deposits){const age=this.clock-d.born,grow=1-Math.pow(1-Math.min(1,Math.max(0,age)/.28),3),opacity=c.puddleLifetime>0&&age>c.puddleLifetime?Math.max(0,1-(age-c.puddleLifetime)/Math.max(.001,c.puddleFade)):1;
    marks.push({x:d.x+c.puddleX,z:d.z+c.puddleZ,radius:d.radius*(c.puddleSize/6)*(.35+.65*grow),opacity,color:d.color,seed:d.seed});}
   this.trail.appendMarks(marks);
   if(this.field.rebuild(marks))this.map.needsUpdate=true;this.dirty=false;this.drawClock=0;
  }
  this.dropRenderer.update(this.drops,true,!!c.puddleShadowEnabled);
 }
 playerStep(from:{x:number;z:number},to:{x:number;z:number},dt:number,c:LiquidSettings){
  if(!this.enabled||dt<=0||!c.liquidFootsteps)return;const dx=to.x-from.x,dz=to.z-from.z,d=Math.hypot(dx,dz);
  if(d<1e-5)return;this.stepDistance+=d;if(this.stepDistance<.65)return;this.stepDistance%=.65;
  const x=to.x+dz/d*.18*this.footSide,z=to.z-dx/d*.18*this.footSide;this.footSide*=-1;
  if(this.field.sample(x,z)<.25)return;
  this.steps++;const speed=d/dt;this.ripple(x,z,c.liquidRippleStrength*(.06+Math.min(.18,speed*.018)));
  const color=new T.Color().setRGB(...this.field.color(x,z) as [number,number,number]);
  const motion=liquidFlightSettings(c);
  for(let i=0;i<3;i++){const side=i-1;this.addDrop({p:new T.Vector3(x,.07,z),v:new T.Vector3(dx/d*.6+dz/d*side,1+i*.25,dz/d*.6-dx/d*side),radius:.035+i*.008,color,paint:false,seed:i},motion);}
 }
 clear(){this.trail.clear();this.trailBodies=[];this.drops=[];this.deposits=[];this.field.rebuild([]);this.map.needsUpdate=true;this.clock=0;this.time.value=0;this.signature='';this.dirty=true;this.dropRenderer.clear();this.floor.visible=false;this.stepDistance=0;this.hits=this.steps=0;this.waves.forEach(w=>w.set(0,0,-100,0));}
 snapshot(){return {renderer:'unified-slime',drops:this.drops.length,deposits:this.deposits.length,impacts:this.hits,footsteps:this.steps,ripples:this.waves.filter(w=>this.clock-w.z<1.2).length,instances:1,trail:this.trail.snapshot()};}
}
