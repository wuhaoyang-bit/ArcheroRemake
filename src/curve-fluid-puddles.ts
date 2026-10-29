import * as T from 'three/webgpu';
import {attribute} from 'three/tsl';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {puddleRenderKey,type PuddleState} from './puddle-live-settings.ts';
import type {BurstSettings} from './slime-burst-config.ts';

export const MAX_CURVE_PUDDLES=128;
export type CurvePuddle=PuddleState;

/** Three shared meshes, instanced per shape. No canvas stamps or floor overlay. */
export class CurveFluidPuddles {
 private batches:T.InstancedMesh[]=[];
 private morphs:T.Mesh[]=[];
 private transform=new T.Object3D();
 private color=new T.Color();
 private previous:string[]=[];
 private activeCounts=[0,0,0];
 private constructor(scene:T.Scene,geometries:T.BufferGeometry[],environment:T.Texture|null){
  for(const [i,geometry] of geometries.entries()){
   geometry.setAttribute('puddleOpacity',new T.InstancedBufferAttribute(new Float32Array(MAX_CURVE_PUDDLES).fill(1),1));
   const material=new T.MeshPhysicalNodeMaterial({color:0xffffff,roughness:.08,metalness:0,ior:1.45,envMap:environment,envMapIntensity:1,alphaHash:true});
   material.opacityNode=attribute('puddleOpacity','float');
   const batch=new T.InstancedMesh(geometry,material,MAX_CURVE_PUDDLES);
   batch.name=`CurveFluidPuddle${i+1}`;batch.frustumCulled=false;
   batch.castShadow=true;batch.receiveShadow=true;batch.instanceMatrix.setUsage(T.DynamicDrawUsage);
   const morph=new T.Mesh(geometry,material);morph.morphTargetInfluences![0]=0;
   // Allocate the morph texture before shader warmup, including initially empty batches.
   batch.setMorphAt(0,morph);batch.setColorAt(0,this.color.set(0xffffff));batch.count=0;batch.visible=false;
   scene.add(batch);this.batches.push(batch);this.morphs.push(morph);
  }
 }
 static async load(scene:T.Scene,environment:T.Texture|null){
  const loader=new GLTFLoader();
  const geometries=await Promise.all([1,2,3].map(async i=>{
   const gltf=await loader.loadAsync(`${import.meta.env.BASE_URL}assets/curve-fluid/puddle-${i}.glb`);
   let geometry:T.BufferGeometry|undefined;
   gltf.scene.updateMatrixWorld(true);
   gltf.scene.traverse(o=>{if(o instanceof T.Mesh){const g=o.geometry as T.BufferGeometry;g.applyMatrix4(o.matrixWorld);geometry=g;for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});
   if(!geometry?.morphAttributes.position?.length)throw Error(`CurveFluid ${i}: missing mesh/morph`);
   return geometry;
  }));
  return new CurveFluidPuddles(scene,geometries,environment);
 }
 update(puddles:CurvePuddle[],settings:BurstSettings){
  for(const b of this.batches){(b.material as T.MeshPhysicalNodeMaterial).roughness=T.MathUtils.clamp(settings.puddleRoughness,.025,1);b.castShadow=!!settings.puddleShadowEnabled;}
  // Settled residues keep their GPU buffers; no per-frame canvas/mesh upload.
  const keys=settings.puddleEnabled?puddles.map(puddleRenderKey):[];
  if(keys.length===this.previous.length&&keys.every((key,i)=>key===this.previous[i]))return;
  this.previous=keys;
  for(const b of this.batches)b.count=0;
  for(const p of settings.puddleEnabled?puddles:[]){
   if(p.age<0||p.scale<1e-6||p.opacity<=0)continue;
   const shape=T.MathUtils.clamp(p.shape,0,2),batch=this.batches[shape],index=batch.count++;
   const progress=T.MathUtils.clamp(p.scale,0,1);
   this.transform.position.set(p.x,.008,p.z);this.transform.rotation.set(0,p.angle,0);
   this.transform.scale.set(p.size*p.scale,p.size*(1+.3*(1-progress)),p.size*p.scale);
   this.transform.updateMatrix();batch.setMatrixAt(index,this.transform.matrix);
   batch.setColorAt(index,this.color.setRGB(p.c.puddleColorR,p.c.puddleColorG,p.c.puddleColorB));
   this.morphs[shape].morphTargetInfluences![0]=1-progress;batch.setMorphAt(index,this.morphs[shape]);
   (batch.geometry.getAttribute('puddleOpacity') as T.InstancedBufferAttribute).setX(index,p.opacity);
  }
  for(const [i,b] of this.batches.entries()){
   this.activeCounts[i]=b.count;b.visible=b.count>0;
   // Three r186 selects its instanced morph shader only when count > 1.
   // Pad a single residue with one off-camera instance, keeping this shader path stable.
   if(b.count===1){
    this.transform.position.set(0,-10000,0);this.transform.scale.setScalar(1);this.transform.updateMatrix();
    b.setMatrixAt(1,this.transform.matrix);b.setMorphAt(1,this.morphs[i]);b.setColorAt(1,this.color.set(0xffffff));
    (b.geometry.getAttribute('puddleOpacity') as T.InstancedBufferAttribute).setX(1,0);b.count=2;
   }
   b.instanceMatrix.needsUpdate=true;b.instanceColor!.needsUpdate=true;b.morphTexture!.needsUpdate=true;b.geometry.getAttribute('puddleOpacity').needsUpdate=true;
  }
 }
 clear(){this.previous=[];this.activeCounts.fill(0);for(const b of this.batches){b.count=0;b.visible=false;}}
 snapshot(){return {renderer:'curve-fluid-mesh',instances:this.activeCounts.reduce((n,c)=>n+c,0),batches:this.batches.filter(b=>b.visible).length,maxPuddles:MAX_CURVE_PUDDLES,triangles:this.batches.reduce((n,b,i)=>n+this.activeCounts[i]*(b.geometry.index?.count??b.geometry.getAttribute('position').count)/3,0)};}
}
