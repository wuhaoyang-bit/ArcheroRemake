import * as T from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {ShapeMatchingBody,type FragmentMeshData,type Params} from './slime-fragments/shape-matching.ts';
import {Skin,SkinBuffers} from './slime-fragments/skin.ts';
import {configureFragmentMaterial,fragmentInteriorMask,type FragmentSurfaceGroup} from './slime-fragments/material.ts';
import {FragmentPoseMapper,type PoseBinding,type ReferenceBody} from './slime-fragments/pose.ts';
import type {SlimeFragmentsSettings} from './slime-fragments-config.ts';
import {slimeFlight,type FlightSettings} from './slime-flight-motion.ts';

type Settings=SlimeFragmentsSettings&FlightSettings;
type Asset={data:FragmentMeshData&{surfaceGroups:FragmentSurfaceGroup[]};positions:Float32Array;normals:Float32Array;index:Uint32Array;ids:Uint32Array;weights:Float32Array;surfacePose:PoseBinding;nodesPose:PoseBinding};
type Burst={skins:Skin[];mesh:T.Mesh;material:T.MeshPhysicalNodeMaterial;active:boolean;age:number;serial:number;flight:FlightSettings;launchSpeed:number;dirty:boolean};
const ROOT=`${import.meta.env.BASE_URL}assets/slime-fragments/`;
async function read(name:string){const r=await fetch(ROOT+name);if(!r.ok)throw Error(`碎块资源加载失败：${name}`);return r;}
export function fragmentParams(c:SlimeFragmentsSettings):Params{return {softness:c.slimeFragmentsSoftness*.01,volume:c.slimeFragmentsVolume*.0001,damping:c.slimeFragmentsDamping,impactDamping:c.slimeFragmentsImpactDamping,settleDamping:c.slimeFragmentsSettleDamping,substeps:c.slimeFragmentsSubsteps,iterations:c.slimeFragmentsIterations,gravity:c.slimeFragmentsGravity,friction:c.slimeFragmentsFriction,bounce:c.slimeFragmentsBounce,speed:c.slimeFragmentsSpeed,stretch:c.slimeFragmentsStretch,spin:c.slimeFragmentsSpin,groupFilter:c.slimeFragmentsGroupFilter};}

/** Scheme D only. A bounded reusable pool; physics runs at 60 Hz and the high-detail
 * surface is updated once per render, not once for each 120 Hz gameplay tick. */
export class SlimeFragmentEffects{
 private pool:Burst[]=[];
 private accumulator=0;
 private serial=0;
 private pose:FragmentPoseMapper;
 private lastSolveMs=0;
 private lastSkinMs=0;
 private lastEmitMs=0;
 private emitted=0;
 private maxInitialError=0;
 private failed=0;
 constructor(private scene:T.Scene,private assets:Asset[],reference:ReferenceBody,private environment:T.Texture|null=null){this.pose=new FragmentPoseMapper(reference);}
 static async load(scene:T.Scene,environment:T.Texture|null=null){
  const reference=await(await read('reference-body.json')).json() as ReferenceBody;
  const assets=await Promise.all(Array.from({length:9},async(_,i)=>{
   const data=await(await read(`${i}-sim.json`)).json() as Asset['data'];
   const names=['skin-pos','skin-normal','skin-index','bind-ids','bind-weights','surface-pose-ids','surface-pose-weights','nodes-pose-ids','nodes-pose-weights'];
   const a=await Promise.all(names.map(async name=>(await read(`${i}-${name}.bin`)).arrayBuffer()));
   return {data,positions:new Float32Array(a[0]),normals:new Float32Array(a[1]),index:new Uint32Array(a[2]),ids:new Uint32Array(a[3]),weights:new Float32Array(a[4]),surfacePose:{ids:new Uint16Array(a[5]),weights:new Float32Array(a[6])},nodesPose:{ids:new Uint16Array(a[7]),weights:new Float32Array(a[8])}};
  }));return new SlimeFragmentEffects(scene,assets,reference,environment);
 }
 private allocate():Burst{
  const material=new T.MeshPhysicalNodeMaterial({color:0xffdd32,roughness:.19,metalness:0,transmission:.65,thickness:1.8,ior:1.36,attenuationColor:0xffcc20,attenuationDistance:2.6,clearcoat:.8,clearcoatRoughness:.15,envMap:this.environment,transparent:true});
  configureFragmentMaterial(material);
  const gpu=new SkinBuffers(this.assets.reduce((sum,a)=>sum+a.data.nodes.length/3,0),this.assets.reduce((sum,a)=>sum+a.data.tets.length/4,0),material);
  let nodeOffset=0,tetOffset=0;
  const skins=this.assets.map((a,i)=>{const skin=new Skin(new ShapeMatchingBody(a.data),a.positions.slice(),a.normals.slice(),a.index,a.ids,a.weights,material,gpu,nodeOffset,tetOffset);nodeOffset+=a.data.nodes.length/3;tetOffset+=a.data.tets.length/4;skin.mesh.name=`SlimeSoftFragment-${i+1}`;skin.mesh.geometry.setAttribute('fragmentInterior',new T.BufferAttribute(fragmentInteriorMask(a.positions.length/3,a.index,a.data.surfaceGroups),1));return skin;});
  // All pieces share one material and GPU state: submit one mesh per burst,
  // including transmission and shadow passes, instead of nine separate draws.
  const geometry=mergeGeometries(skins.map(s=>s.mesh.geometry))!,mesh=new T.Mesh(geometry,material);
  mesh.name='SlimeSoftFragments';mesh.frustumCulled=false;mesh.castShadow=true;mesh.receiveShadow=true;mesh.visible=false;this.scene.add(mesh);
  let vertexOffset=0;
  for(const skin of skins){const g=skin.mesh.geometry,count=g.attributes.position.count;
   for(const name of ['position','normal'])g.setAttribute(name,new T.BufferAttribute((geometry.attributes[name].array as Float32Array).subarray(vertexOffset*3,(vertexOffset+count)*3),3));
   vertexOffset+=count;
  }
  const slot:Burst={skins,mesh,material,active:false,age:0,serial:0,flight:{slimeEyeEjectSpeed:0,slimeEyeEjectGravity:0,slimeEyeCurveTime:1},launchSpeed:1,dirty:false};this.pool.push(slot);return slot;
 }
 private recycle(slot:Burst){slot.mesh.visible=false;slot.active=false;slot.dirty=false;for(const s of slot.skins){s.mesh.visible=false;s.body.active=false;}}
 clear(){for(const slot of this.pool)this.recycle(slot);this.accumulator=0;}
 emit(body:T.Mesh,c:Settings,color?:T.Color){
  if(!c.slimeFragmentsEnabled)return;
  const start=performance.now();
  const cap=Math.max(1,Math.round(c.slimeFragmentsMaxBursts));
  const active=this.pool.filter(s=>s.active).sort((a,b)=>a.serial-b.serial);
  while(active.length>=cap)this.recycle(active.shift()!);
  const slot=this.pool.find(s=>!s.active)??this.allocate(),center=this.pose.capture(body),p=fragmentParams(c);
  const source=body.material as T.MeshPhysicalMaterial;
  // Keep the warmed shader layout; only transfer surface properties and body colour.
  if(source.color)slot.material.color.copy(color??source.color);
  for(const key of ['roughness','metalness','transmission','thickness','ior','attenuationDistance','clearcoat','clearcoatRoughness'] as const)if(typeof source[key]==='number')slot.material[key]=source[key];
  if(source.attenuationColor)slot.material.attenuationColor.copy(source.attenuationColor);
  slot.material.opacity=1;slot.material.wireframe=!!c.slimeFragmentsWireEnabled;
  slot.flight={slimeEyeEjectSpeed:c.slimeEyeEjectSpeed,slimeEyeEjectGravity:c.slimeEyeEjectGravity,slimeEyeCurveTime:c.slimeEyeCurveTime,slimeEyeSpeedCurve:c.slimeEyeSpeedCurve?.map(p=>({...p}))};slot.launchSpeed=p.speed;
  for(let i=0;i<this.assets.length;i++){
   const a=this.assets[i],skin=slot.skins[i],nodes=this.pose.positions(a.nodesPose),surface=this.pose.positions(a.surfacePose),normals=this.pose.transformNormals(a.normals,a.surfacePose),home=new T.Vector3();
   for(let j=0;j<nodes.length;j+=3)home.add(new T.Vector3(nodes[j],nodes[j+1],nodes[j+2]));home.multiplyScalar(3/nodes.length);
   skin.body.setRestPose(nodes,home);
   for(let j=0;j<surface.length;j++)skin.original[j]=surface[j]-home.getComponent(j%3);
   skin.originalNormals.set(normals);skin.syncRestPose();skin.body.spawn(new T.Vector3(),center,slimeFlight(0,slot.flight).speed,p);skin.update();skin.mesh.visible=true;
   this.maxInitialError=Math.max(this.maxInitialError,skin.positionError(surface,128));
  }
  slot.mesh.geometry.attributes.position.needsUpdate=true;slot.mesh.geometry.attributes.normal.needsUpdate=true;slot.mesh.visible=true;
  slot.active=true;slot.age=0;slot.serial=++this.serial;slot.dirty=false;this.emitted++;this.lastEmitMs=performance.now()-start;
 }
 update(dt:number,c:Settings){
  if(!c.slimeFragmentsEnabled){this.clear();return;}
  const active=this.pool.filter(s=>s.active).sort((a,b)=>a.serial-b.serial);while(active.length>c.slimeFragmentsMaxBursts)this.recycle(active.shift()!);
  if(!active.length){this.accumulator=0;return;}
  this.accumulator+=Math.max(0,dt);const p=fragmentParams(c),step=1/60,start=performance.now();
  while(this.accumulator+1e-10>=step){this.accumulator-=step;
   for(const slot of active){if(!slot.active)continue;
    if(slot.age+step>=c.slimeFragmentsLifetime){this.recycle(slot);continue;}
    const acc=(slimeFlight(slot.age+step,slot.flight).speed-slimeFlight(slot.age,slot.flight).speed)/step;
    for(const skin of slot.skins)skin.body.step(step,{...p,speed:slot.launchSpeed},acc);
    slot.age+=step;slot.dirty=true;
    if(slot.skins.some(s=>!s.body.x.every(Number.isFinite))){this.failed++;this.recycle(slot);console.warn('史莱姆碎块参数导致模拟失稳，已回收该组碎块');}
   }
  }
  this.lastSolveMs=performance.now()-start;
 }
 prepare(c:SlimeFragmentsSettings){
  this.lastSkinMs=0;const start=performance.now();
  if(!c.slimeFragmentsEnabled){this.clear();return;}
  for(const slot of this.pool){if(!slot.active)continue;slot.material.opacity=Math.max(0,Math.min(1,(c.slimeFragmentsLifetime-slot.age)/.5));slot.material.wireframe=!!c.slimeFragmentsWireEnabled;if(slot.dirty){for(const skin of slot.skins)skin.update();slot.dirty=false;}}
  this.lastSkinMs=performance.now()-start;
 }
 prepareWarmup(count=1){while(this.pool.length<count)this.allocate();for(const slot of this.pool){for(const skin of slot.skins)skin.update();slot.mesh.visible=true;slot.mesh.position.set(0,2,0);}}
 finishWarmup(){for(const slot of this.pool)slot.mesh.position.set(0,0,0);this.clear();}
 snapshot(){return {scheme:'D / Physically Based Shape Matching',allocated:this.pool.length,active:this.pool.filter(b=>b.active).length,emitted:this.emitted,failed:this.failed,solveMs:this.lastSolveMs,skinMs:this.lastSkinMs,emitMs:this.lastEmitMs,maxInitialError:this.maxInitialError,initialPoseSamplesPerPiece:128,bursts:this.pool.filter(b=>b.active).map(b=>({age:b.age,color:b.material.color.getHex(),opacity:b.material.opacity,pieces:b.skins.map(s=>s.body.snapshot())}))};}
}
