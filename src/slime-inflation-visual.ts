import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {inflatePoint} from './slime-inflation-shape.ts';
import type {createYellowSlimeModel} from './yellow-slime-model.ts';
import {SlimeInflationState} from './slime-inflation-state.ts';
import type {SlimeInflationSettings} from './slime-inflation-config.ts';
/** Inner geometry carries permanent growth; the outer feedback matrix carries transient squash. */
export class SlimeInflationVisual{
 readonly state=new SlimeInflationState();extent=1;settledExtent=1;
 private base:T.BufferAttribute;private positions:T.BufferAttribute;private geometry:T.BufferGeometry;private baseVolume:number;private radius=0;
 private startColor=new T.Color();private endColor=new T.Color();private originalAttenuation:T.Color;
 private faceBase:T.Vector3[];private key='';private settledKey='';
 private p=new T.Vector3();private out=new T.Vector3();private a=new T.Vector3();private b=new T.Vector3();private c=new T.Vector3();
 constructor(private model:ReturnType<typeof createYellowSlimeModel>,private size=1.8){
  this.originalAttenuation=model.material.attenuationColor.clone();
  const g=new T.BoxGeometry(2,2,2,16,16,16),p=g.getAttribute('position'),inner=new T.Vector3();
  for(let i=0;i<p.count;i++){this.p.fromBufferAttribute(p,i);inner.copy(this.p).clampScalar(-.76,.76);this.out.copy(this.p).sub(inner).normalize().multiplyScalar(.24).add(inner);p.setXYZ(i,this.out.x,this.out.y,this.out.z);}
  g.deleteAttribute('normal');g.deleteAttribute('uv');this.geometry=mergeVertices(g,1e-5);g.dispose();model.body.geometry.dispose();(model.body as T.Mesh<T.BufferGeometry>).geometry=this.geometry;
  this.positions=this.geometry.getAttribute('position') as T.BufferAttribute;this.positions.setUsage(T.DynamicDrawUsage);this.base=this.positions.clone();this.baseVolume=this.volume();
  for(let i=0;i<this.base.count;i++)this.radius=Math.max(this.radius,this.p.fromBufferAttribute(this.base,i).length());
  this.faceBase=model.face.children.map(o=>o.position.clone().add(new T.Vector3(0,-1,0)));model.body.position.y=0;
 }
 private volume(){const idx=this.geometry.index!;let v=0;for(let i=0;i<idx.count;i+=3){this.a.fromBufferAttribute(this.positions,idx.getX(i));this.b.fromBufferAttribute(this.positions,idx.getX(i+1));this.c.fromBufferAttribute(this.positions,idx.getX(i+2));v+=this.a.dot(this.b.cross(this.c))/6;}return Math.abs(v);}
 private shape(fill:number,c:SlimeInflationSettings){const bulge=Math.min(c.slimeBulge,1/Math.max(1,fill));for(let i=0;i<this.base.count;i++){this.p.fromBufferAttribute(this.base,i);inflatePoint(this.out,this.p,'bulge',fill,bulge,3,this.radius);this.positions.setXYZ(i,this.out.x,this.out.y,this.out.z);}const scale=(1+(c.slimeMaxScale-1)*fill)*Math.cbrt(this.baseVolume/this.volume());return {scale,bulge,extent:scale*(1+bulge*fill*(this.radius-1))};}
 apply(c:SlimeInflationSettings){
  const material=this.model.body.material as T.MeshPhysicalMaterial;
  this.startColor.setRGB(c.slimeColorStartR/255,c.slimeColorStartG/255,c.slimeColorStartB/255,T.SRGBColorSpace);
  this.endColor.setRGB(c.slimeColorEndR/255,c.slimeColorEndG/255,c.slimeColorEndB/255,T.SRGBColorSpace);
  const colorProgress=c.slimeColorEnabled?Math.pow(T.MathUtils.clamp(this.state.colorFill,0,1),c.slimeColorPower):1;
  material.color.copy(this.startColor).lerp(this.endColor,colorProgress);
  material.attenuationColor.copy(this.startColor).lerp(this.originalAttenuation,colorProgress);

  const fill=c.slimeInflationEnabled?this.state.visual:0,target=c.slimeInflationEnabled?this.state.target:0;
  const settledKey=[target,c.slimeMaxScale,c.slimeBulge].join();
  if(settledKey!==this.settledKey){this.settledExtent=this.shape(target,c).extent;this.settledKey=settledKey;this.key='';}
  const key=[fill,c.slimeMaxScale,c.slimeBulge].join();if(key===this.key)return;this.key=key;
  const {scale,bulge,extent}=this.shape(fill,c);this.extent=extent;
  this.positions.needsUpdate=true;this.geometry.computeVertexNormals();this.geometry.computeBoundingBox();this.geometry.computeBoundingSphere();
  this.model.root.scale.setScalar(this.size/2*scale);this.model.root.position.y=this.size/2*extent;
  this.model.face.children.forEach((eye,i)=>{inflatePoint(this.out,this.faceBase[i],'bulge',fill,bulge,3,this.radius);eye.position.copy(this.out);});
 }
 snapshot(){return {color:(this.model.body.material as T.MeshPhysicalMaterial).color.getHex(),colorFill:this.state.colorFill,amount:this.state.amount,target:this.state.target,visual:this.state.visual,extent:this.extent,settledExtent:this.settledExtent};}
}
