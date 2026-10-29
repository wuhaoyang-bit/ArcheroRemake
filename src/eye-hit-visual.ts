import * as T from 'three';
import {EyeHitMotion} from './eye-hit-motion.ts';
import type {EyeHitSettings} from './eye-hit-config.ts';
const up=new T.Vector3(0,1,0);
/** Eye matrices carry transient offsets; position/scale remain the inflation system's clean anchors. */
export class EyeHitVisual{
 readonly motions:EyeHitMotion[];readonly surfaces:T.Vector3[];readonly normals:T.Vector3[];
 private tethers:T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>[];
 private group=new T.Group();private inverse=new T.Matrix4();private normalMatrix=new T.Matrix3();
 constructor(private eyes:T.Object3D[],parent:T.Object3D){
  this.motions=eyes.map(()=>new EyeHitMotion());this.surfaces=eyes.map(()=>new T.Vector3());this.normals=eyes.map(()=>new T.Vector3(0,0,1));
  this.group.name='EyeGelConnections';parent.add(this.group);
  this.tethers=eyes.map(()=>{
   const rows=12,sides=16,g=new T.BufferGeometry(),p=new Float32Array((rows+1)*(sides+1)*3),indices:number[]=[];
   for(let j=0;j<rows;j++)for(let i=0;i<sides;i++){const a=j*(sides+1)+i,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
   // Visual-only connections must not enlarge monster collision or effect-center bounds.
   g.boundingBox=new T.Box3(new T.Vector3(),new T.Vector3());
   g.setAttribute('position',new T.BufferAttribute(p,3).setUsage(T.DynamicDrawUsage));g.setIndex(indices);g.computeVertexNormals();
   const mesh=new T.Mesh(g,new T.MeshPhysicalMaterial({color:0xffdd32,roughness:.3,clearcoat:.7,clearcoatRoughness:.22,side:T.DoubleSide}));mesh.name='EyeGelTether';mesh.visible=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;this.group.add(mesh);return mesh;
  });
 }
 private normal(i:number){return this.normals[i].clone().applyMatrix3(this.normalMatrix.getNormalMatrix(this.eyes[i].parent!.matrixWorld)).normalize();}
 private radius(eye:T.Object3D){const scale=new T.Vector3();eye.parent!.getWorldScale(scale);return Math.max(.001,Math.max(Math.abs(scale.x*eye.scale.x),Math.abs(scale.y*eye.scale.y),Math.abs(scale.z*eye.scale.z)));}
 hit(direction:T.Vector3,strength:number,c:EyeHitSettings){if(!c.eyeHitEnabled)return;this.eyes[0].parent!.updateWorldMatrix(true,false);this.eyes.forEach((eye,i)=>this.motions[i].hit(direction,this.normal(i),this.radius(eye),strength,c));}
 update(dt:number){for(const m of this.motions)m.update(dt);}
 apply(c:EyeHitSettings,color:T.Color,burst?:{weight:number;out:number;angle:number}){
  this.group.updateWorldMatrix(true,false);this.inverse.copy(this.group.matrixWorld).invert();
  this.eyes.forEach((eye,i)=>{
   const motion=this.motions[i];if(!c.eyeHitEnabled)motion.reset();
   const normal=this.normal(i),sample=motion.sample(normal),base=eye.parent!.localToWorld(eye.position.clone()),weight=burst?.weight??0;
   const position=base.clone().addScaledVector(sample.offset,1-weight).addScaledVector(normal,this.radius(eye)*(burst?.out??0)*weight);
   // Texture pupil faces +Z. A single diagonal-axis rotation gives exactly the configured total angle.
   const rotation=eye.quaternion.clone();
   if(weight>0)rotation.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(-1,i===0?-1:1,0).normalize(),T.MathUtils.degToRad(burst!.angle)*weight));
   const local=eye.parent!.worldToLocal(position.clone());eye.matrix.compose(local,rotation,eye.scale);eye.matrixAutoUpdate=false;eye.matrixWorldNeedsUpdate=true;
   const tether=this.tethers[i],config=motion.settings??c;
   tether.material.color.copy(color);
   const root=eye.parent!.localToWorld(this.surfaces[i].clone()),radius=this.radius(eye),delta=position.clone().sub(root),length=delta.length();
   tether.visible=!!(eye.visible&&eye.parent!.visible&&c.eyeHitEnabled&&c.eyeHitTetherEnabled&&config.eyeHitTetherEnabled&&sample.phase!=='idle'&&delta.dot(normal)>0&&length>radius*.65);
   if(!tether.visible)return;
   const direction=delta.normalize(),end=position.clone().addScaledVector(direction,-radius*.55),start=root.addScaledVector(normal,-radius*.12);
   const side=new T.Vector3().crossVectors(direction,Math.abs(direction.dot(up))>.95?new T.Vector3(1,0,0):up).normalize(),other=new T.Vector3().crossVectors(direction,side).normalize();
   const p=tether.geometry.getAttribute('position') as T.BufferAttribute;
   for(let j=0;j<=12;j++){
    const u=j/12,neck=config.eyeHitTetherNeck/Math.sqrt(Math.max(1,length/radius)),width=radius*(neck+(config.eyeHitTetherRoot-neck)*(1-u)**3+(config.eyeHitTetherTip-neck)*u**4);
    const center=start.clone().lerp(end,u).addScaledVector(normal,Math.sin(Math.PI*u)*Math.min(radius*.25,length*.12));
    for(let k=0;k<=16;k++){const a=k/16*Math.PI*2,v=center.clone().addScaledVector(side,Math.cos(a)*width).addScaledVector(other,Math.sin(a)*width).applyMatrix4(this.inverse);p.setXYZ(j*17+k,v.x,v.y,v.z);}
   }
   p.needsUpdate=true;tether.geometry.computeVertexNormals();
  });
 }
 reset(){this.motions.forEach(m=>m.reset());this.tethers.forEach(m=>m.visible=false);this.eyes.forEach(eye=>{eye.matrixAutoUpdate=true;eye.updateMatrix();});}
 snapshot(){return this.motions.map((m,i)=>{const s=m.sample(this.normal(i));return {age:Number.isFinite(m.age)?m.age:null,phase:s.phase,progress:s.progress,offset:s.offset.toArray(),tether:this.tethers[i].visible};});}
}
