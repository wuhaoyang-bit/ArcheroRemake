import {eyeDeformation,directionalScale,eyeSupport,type EyeImpact,type EyeApproach} from './eye-deformation.ts';
import {eyeContact,eyePlayerContact,type EyeObstacle,type EyePlayer} from './eye-collision.ts';
import {type JuiceSpeedPoint} from './juice-speed-curve.ts';
import {DEFAULT_EYE_SPEED_CURVE} from './slime-eyes-config.ts';
import * as T from 'three/webgpu';
import {slimeFlight as eyeFlight} from './slime-flight-motion.ts';
export {slimeFlight as eyeFlight} from './slime-flight-motion.ts';
import type {SlimeEyesSettings} from './slime-eyes-config.ts';
type EyeMotionSettings=SlimeEyesSettings&{slimeEyeSpeedCurve?:JuiceSpeedPoint[]};
type Fragment={impact?:EyeImpact;sourceId?:string;ballistic:boolean;age:number;origin:T.Vector3;direction:T.Vector3;landed:boolean;grounded:boolean;object:T.Object3D;velocity:T.Vector3;spin:T.Vector3;radius:number;settled:boolean;settings:EyeMotionSettings};
/** Eyes respond to contacts without blocking player or monster movement. */
export class SlimeEyeDebris{
 private fragments:Fragment[]=[];
 private shapeMatrix=new T.Matrix4();private rotationMatrix=new T.Matrix4();
 private width=Infinity;private length=Infinity;private obstacles:EyeObstacle[]=[];
 private player?:EyePlayer;
 get active(){return this.fragments.some(f=>!f.settled);}
 setCollisions(width:number,length:number,obstacles:EyeObstacle[]){this.width=width;this.length=length;this.obstacles=obstacles;}
 setPlayer(player:EyePlayer){this.player={...player};}
 /** Sweep actual player displacement, so resting eyes wake up and fast movement cannot skip them. */
 kickPlayer(from:EyePlayer,to:EyePlayer,dt:number,moving:boolean,strength=1){
  this.setPlayer(to);if(dt<=0)return;
  const delta=new T.Vector3(to.x-from.x,0,to.z-from.z),speed=delta.length()/dt;
  if(speed<.01)return;
  for(const f of this.fragments){
   const p=f.object.position,hit=eyePlayerContact(p,p.clone().sub(delta),f.radius,from);if(!hit)continue;
   const incoming=delta.dot(hit.normal)/dt;
   if(incoming<=0)continue;
   // Place outside the player's final position; subsequent ground/wall collisions remain authoritative.
   p.addScaledVector(hit.normal,(1-hit.time)*delta.dot(hit.normal)+(hit.push??0)+.001);
   if(moving&&strength>0){
    const direction=delta.clone().normalize();f.velocity.copy(direction).multiplyScalar(Math.max(4,speed*1.8)*strength);
    f.velocity.y=Math.max(2,Math.min(5,speed*.65))*strength;
    f.spin.set(direction.z,0,-direction.x).multiplyScalar(f.settings.slimeEyeEjectSpin);
   }else f.velocity.addScaledVector(hit.normal,Math.max(0,incoming-f.velocity.dot(hit.normal)));
   f.ballistic=true;f.settled=false;f.grounded=false;
   this.recordImpact(f,hit.normal,incoming,p);this.deform(f);
  }
 }
 constructor(private parent:T.Object3D){}
 emit(eyes:T.Object3D[],center:T.Vector3,c:EyeMotionSettings,sourceId?:string){if(!c.slimeEyeEjectEnabled)return;this.parent.updateWorldMatrix(true,false);const inverse=this.parent.matrixWorld.clone().invert(),localCenter=this.parent.worldToLocal(center.clone());
 for(const source of eyes){if(!source.parent?.visible||!source.visible)continue;source.updateWorldMatrix(true,true);const object=source.clone(true);object.name='DetachedSlimeEye';object.matrix.copy(inverse).multiply(source.matrixWorld);object.matrix.decompose(object.position,object.quaternion,object.scale);object.matrixAutoUpdate=true;
 object.traverse(o=>{if(!(o instanceof T.Mesh))return;const sourceMat=o.material as T.MeshPhysicalNodeMaterial;const mat=sourceMat.clone();mat.emissiveNode=null;mat.emissive.set(0);o.material=mat;o.castShadow=true;o.receiveShadow=true;});this.parent.add(object);
 const direction=object.position.clone().sub(localCenter);if(direction.lengthSq()<1e-12)direction.set(0,1,0);direction.normalize();
 // Each eye contains a unit sphere. A rotated bounding BOX inflates its contact radius and makes it hover.
 const radius=Math.max(Math.abs(object.scale.x),Math.abs(object.scale.y),Math.abs(object.scale.z));
 this.fragments.push({sourceId,ballistic:false,landed:false,grounded:false,age:0,origin:object.position.clone(),direction:direction.clone(),object,velocity:direction.multiplyScalar(eyeFlight(0,c).speed),spin:new T.Vector3(c.slimeEyeEjectSpin,c.slimeEyeEjectSpin*.6,c.slimeEyeEjectSpin*.3),radius,settled:false,settings:{...c,slimeEyeSpeedCurve:(c.slimeEyeSpeedCurve??DEFAULT_EYE_SPEED_CURVE).map(p=>({...p}))}});
 }}
 private impact(f:Fragment){const c=f.settings,incoming=Math.max(0,-f.velocity.y);f.landed=true;f.ballistic=true;f.object.position.y=f.radius;
  const bounce=Math.max(0,-f.velocity.y)*c.slimeEyeEjectBounce;f.grounded=bounce<.25;f.velocity.y=f.grounded?0:bounce;
  f.velocity.x*=1-c.slimeEyeGroundFriction;f.velocity.z*=1-c.slimeEyeGroundFriction;
  this.recordImpact(f,new T.Vector3(0,1,0),incoming,f.object.position);
 }
 private recordImpact(f:Fragment,normal:T.Vector3,speed:number,point:T.Vector3){
  // A weaker simultaneous corner contact must not rotate/restart the main squash pose.
  if(speed<=.05||(f.impact&&f.age-f.impact.age<1e-6&&speed<f.impact.speed))return;
  f.impact={age:f.age,normal:normal.clone(),speed,point:point.clone(),outgoing:f.velocity.clone()};
 }
 private approach(f:Fragment):EyeApproach|undefined{
  const c=f.settings,horizon=c.slimeEyeAnticipationTime;
  if(!c.slimeEyeDeformEnabled||f.settled)return;
  let result:EyeApproach|undefined;
  if(!f.grounded&&f.velocity.y<0){
   const h=Math.max(0,f.object.position.y-f.radius),g=c.slimeEyeEjectGravity,v=-f.velocity.y;
   const time=g>0?2*h/(Math.sqrt(v*v+2*g*h)+v):h/v;
   if(time<horizon)result={time,speed:v+g*time,normal:new T.Vector3(0,1,0)};
  }
  const end=f.object.position.clone().addScaledVector(f.velocity,horizon);
  end.y-=.5*c.slimeEyeEjectGravity*horizon*horizon;
  const hit=eyeContact(f.object.position,end,f.radius,c.slimeEyeWallCollision?this.width:Infinity,c.slimeEyeWallCollision?this.length:Infinity,c.slimeEyeMonsterCollision?this.obstacles:[],f.sourceId);
  if(hit&&f.velocity.dot(hit.normal)<0&&(!result||hit.time*horizon<result.time))result={time:hit.time*horizon,speed:-f.velocity.dot(hit.normal),normal:hit.normal};
  return result;
 }
 private deform(f:Fragment){
  const d=eyeDeformation({age:f.age,velocity:f.velocity,grounded:f.grounded,impact:f.impact,approach:this.approach(f)},f.settings);
  directionalScale(this.shapeMatrix,d.axis,d.scale);
  this.rotationMatrix.compose(new T.Vector3(),f.object.quaternion,f.object.scale);f.object.matrix.copy(this.shapeMatrix).multiply(this.rotationMatrix);
  const position=f.object.position.clone();
  if(f.settings.slimeEyeDeformEnabled){
   if(f.impact&&['squash','rebound','settle'].includes(d.phase)){
    const {normal,point}=f.impact,support=eyeSupport(f.object.matrix,normal),distance=position.clone().sub(point).dot(normal);
    // Keep the compressed pose on its contact plane briefly, without pausing physical motion.
    position.addScaledVector(normal,(support-f.radius-distance)*d.pin);
    const gap=position.clone().sub(point).dot(normal)+f.radius-support;
    if(gap<0)position.addScaledVector(normal,-gap);
   }
   // The visible ellipsoid can extend outside its spherical collider during anticipation/stretch.
   position.y=Math.max(position.y,eyeSupport(f.object.matrix,new T.Vector3(0,1,0)));
   if(f.settings.slimeEyeWallCollision){
    const x=Math.max(0,this.width/2-.155-eyeSupport(f.object.matrix,new T.Vector3(1,0,0))),z=Math.max(0,this.length/2-.155-eyeSupport(f.object.matrix,new T.Vector3(0,0,1)));
    position.x=T.MathUtils.clamp(position.x,-x,x);position.z=T.MathUtils.clamp(position.z,-z,z);
   }
  }
  f.object.matrix.setPosition(position);f.object.matrixAutoUpdate=false;f.object.matrixWorldNeedsUpdate=true;
 }
 update(dt:number){if(dt<=0)return;const steps=Math.max(1,Math.ceil(dt/(1/120))),step=dt/steps;
 for(let i=0;i<steps;i++)for(const f of this.fragments){if(f.settled){f.age+=step;this.deform(f);continue;}const c=f.settings;f.age+=step;const previous=f.object.position.clone();
 if(!f.ballistic){const motion=eyeFlight(f.age,c);f.object.position.copy(f.origin).addScaledVector(f.direction,motion.distance);f.object.position.y-=motion.drop;f.velocity.copy(f.direction).multiplyScalar(motion.speed);f.velocity.y-=motion.fallSpeed;
  if(f.object.position.y<=f.radius&&f.velocity.y<=0)this.impact(f);
 }else if(!f.grounded){
  // After first impact, continue with the actual reflected velocity, not the launch curve.
  const height=Math.max(0,f.object.position.y-f.radius),g=c.slimeEyeEjectGravity,vy=f.velocity.y;
  const contact=g>0?(vy+Math.sqrt(vy*vy+2*g*height))/g:vy<0?height/-vy:Infinity;
  const travel=Math.min(step,contact);f.object.position.addScaledVector(f.velocity,travel);f.object.position.y-=.5*g*travel*travel;f.velocity.y-=g*travel;
  // Resolve at the actual impact time: stepping below the floor would inject energy into tiny bounces.
  if(contact<=step)this.impact(f);
 }else{const drag=c.slimeEyeRollDrag,factor=Math.exp(-drag*step),travel=drag>0?(1-factor)/drag:step;f.object.position.addScaledVector(f.velocity,travel);f.velocity.multiplyScalar(factor);f.object.position.y=f.radius;
  if(f.velocity.length()<.08){f.settled=true;f.velocity.set(0,0,0);}
 }
 // Only the eye responds: the obstacle roster and monster positions are read-only.
 let start=previous,remaining=step;
 for(let attempt=0;attempt<4;attempt++){let hit=eyeContact(start,f.object.position,f.radius,c.slimeEyeWallCollision?this.width:Infinity,c.slimeEyeWallCollision?this.length:Infinity,c.slimeEyeMonsterCollision?this.obstacles:[],f.sourceId);
 const playerHit=this.player?eyePlayerContact(start,f.object.position,f.radius,this.player):null;
 if(playerHit&&(!hit||playerHit.time<hit.time))hit=playerHit;if(!hit)break;
 const point=start.clone().lerp(f.object.position,hit.time).addScaledVector(hit.normal,(hit.push??0)+.0001),incoming=f.velocity.dot(hit.normal);
 if(incoming<0){f.velocity.addScaledVector(hit.normal,-(1+c.slimeEyeCollisionBounce)*incoming);this.recordImpact(f,hit.normal,-incoming,point);}
 f.ballistic=true;f.settled=false;if(hit.normal.y>.5){f.landed=true;f.grounded=false;}
 remaining*=1-hit.time;start=point;f.object.position.copy(point).addScaledVector(f.velocity,remaining);
 }
 if(f.object.position.y<f.radius){f.object.position.y=f.radius;if(f.velocity.y<0)this.impact(f);}
 if(f.impact&&Math.abs(f.age-f.impact.age)<1e-6)f.impact.outgoing.copy(f.velocity);
 if(f.grounded){const horizontal=new T.Vector3(f.velocity.x,0,f.velocity.z),speed=horizontal.length();if(speed>0)f.object.rotateOnWorldAxis(new T.Vector3(0,1,0).cross(horizontal).normalize(),speed*step/Math.max(.01,f.radius));}
 else{f.object.rotateX(f.spin.x*step);f.object.rotateY(f.spin.y*step);f.object.rotateZ(f.spin.z*step);}
 this.deform(f);
 }}
 clear(){for(const f of this.fragments){f.object.removeFromParent();f.object.traverse(o=>{if(o instanceof T.Mesh)(o.material as T.Material).dispose();});}this.fragments=[];}
 snapshot(){return this.fragments.map(f=>({position:f.object.position.toArray(),velocity:f.velocity.toArray(),settled:f.settled,landed:f.landed,grounded:f.grounded}));}
}
