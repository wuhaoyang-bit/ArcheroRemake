import {sampleJuiceSpeedCurve,type JuiceSpeedPoint} from './juice-speed-curve.ts';
import {DEFAULT_EYE_SPEED_CURVE} from './slime-eyes-config.ts';
import * as T from 'three/webgpu';
import type {SlimeEyesSettings} from './slime-eyes-config.ts';
type EyeMotionSettings=SlimeEyesSettings&{slimeEyeSpeedCurve?:JuiceSpeedPoint[]};
type Fragment={age:number;origin:T.Vector3;direction:T.Vector3;landed:boolean;grounded:boolean;object:T.Object3D;velocity:T.Vector3;spin:T.Vector3;radius:number;settled:boolean;settings:EyeMotionSettings};
/** Visual debris only: no registration in player/monster movement collision. */
export class SlimeEyeDebris{
 private fragments:Fragment[]=[];
 constructor(private parent:T.Object3D){}
 emit(eyes:T.Object3D[],center:T.Vector3,c:EyeMotionSettings){if(!c.slimeEyeEjectEnabled)return;this.parent.updateWorldMatrix(true,false);const inverse=this.parent.matrixWorld.clone().invert(),localCenter=this.parent.worldToLocal(center.clone());
 for(const source of eyes){if(!source.parent?.visible||!source.visible)continue;source.updateWorldMatrix(true,true);const object=source.clone(true);object.name='DetachedSlimeEye';object.matrix.copy(inverse).multiply(source.matrixWorld);object.matrix.decompose(object.position,object.quaternion,object.scale);object.matrixAutoUpdate=true;
 object.traverse(o=>{if(!(o instanceof T.Mesh))return;const sourceMat=o.material as T.MeshPhysicalNodeMaterial;const mat=sourceMat.clone();mat.emissiveNode=null;mat.emissive.set(0);o.material=mat;o.castShadow=true;o.receiveShadow=true;});this.parent.add(object);
 const direction=object.position.clone().sub(localCenter);if(direction.lengthSq()<1e-12)direction.set(0,1,0);direction.normalize();const bounds=new T.Box3().setFromObject(object).getSize(new T.Vector3()),radius=Math.max(bounds.x,bounds.y,bounds.z)/2;
 this.fragments.push({landed:false,grounded:false,age:0,origin:object.position.clone(),direction:direction.clone(),object,velocity:direction.multiplyScalar(eyeFlight(0,c).speed),spin:new T.Vector3(c.slimeEyeEjectSpin,c.slimeEyeEjectSpin*.6,c.slimeEyeEjectSpin*.3),radius,settled:false,settings:{...c,slimeEyeSpeedCurve:(c.slimeEyeSpeedCurve??DEFAULT_EYE_SPEED_CURVE).map(p=>({...p}))}});
 }}
 private impact(f:Fragment){const c=f.settings;f.landed=true;f.object.position.y=f.radius;
  const bounce=Math.max(0,-f.velocity.y)*c.slimeEyeEjectBounce;f.grounded=bounce<.25;f.velocity.y=f.grounded?0:bounce;
  f.velocity.x*=1-c.slimeEyeGroundFriction;f.velocity.z*=1-c.slimeEyeGroundFriction;
 }
 update(dt:number){if(dt<=0)return;const steps=Math.max(1,Math.ceil(dt/(1/120))),step=dt/steps;
 for(let i=0;i<steps;i++)for(const f of this.fragments){if(f.settled)continue;const c=f.settings;f.age+=step;
 if(!f.landed){const motion=eyeFlight(f.age,c);f.object.position.copy(f.origin).addScaledVector(f.direction,motion.distance);f.object.position.y-=motion.drop;f.velocity.copy(f.direction).multiplyScalar(motion.speed);f.velocity.y-=motion.fallSpeed;
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
 if(f.grounded){const horizontal=new T.Vector3(f.velocity.x,0,f.velocity.z),speed=horizontal.length();if(speed>0)f.object.rotateOnWorldAxis(new T.Vector3(0,1,0).cross(horizontal).normalize(),speed*step/Math.max(.01,f.radius));}
 else{f.object.rotateX(f.spin.x*step);f.object.rotateY(f.spin.y*step);f.object.rotateZ(f.spin.z*step);}
 }}
 clear(){for(const f of this.fragments){f.object.removeFromParent();f.object.traverse(o=>{if(o instanceof T.Mesh)(o.material as T.Material).dispose();});}this.fragments=[];}
 snapshot(){return this.fragments.map(f=>({position:f.object.position.toArray(),velocity:f.velocity.toArray(),settled:f.settled,landed:f.landed,grounded:f.grounded}));}
}

/** Integrate the editable radial curve exactly; gravity is independent from launch timing. */
export function eyeFlight(age:number,c:EyeMotionSettings){const t=Math.max(0,age),duration=c.slimeEyeCurveTime,curve=c.slimeEyeSpeedCurve??DEFAULT_EYE_SPEED_CURVE,sample=sampleJuiceSpeedCurve(curve,t/duration);return {speed:c.slimeEyeEjectSpeed*sample.speed,distance:c.slimeEyeEjectSpeed*(duration*sample.integral+Math.max(0,t-duration)*curve.at(-1)!.progress/100),drop:.5*c.slimeEyeEjectGravity*t*t,fallSpeed:c.slimeEyeEjectGravity*t};}
