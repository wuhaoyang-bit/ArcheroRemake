import * as T from 'three';
import {ConvexGeometry} from 'three/addons/geometries/ConvexGeometry.js';
import {ConvexObjectBreaker} from 'three/addons/misc/ConvexObjectBreaker.js';
import {DestructibleMesh,FractureOptions} from '@dgreenheck/three-pinata';

export type ChunkMode='plane'|'voronoi';

export type ChunkPiece={
  mesh:T.Mesh;
  homePosition:T.Vector3;
  homeQuaternion:T.Quaternion;
};

function volumeOf(mesh:T.Object3D){
  const box=new T.Box3().setFromObject(mesh);
  const s=box.getSize(new T.Vector3());
  return Math.max(1e-8,s.x*s.y*s.z);
}

/** Bake a mesh's current world pose into a standalone BufferGeometry at the origin. */
export function bakeWorldGeometry(source:T.Mesh){
  source.updateWorldMatrix(true,true);
  const geometry=source.geometry.clone();
  if(geometry.index)geometry.toNonIndexed();
  geometry.applyMatrix4(source.matrixWorld);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function materialPair(source:T.Mesh){
  const base=(Array.isArray(source.material)?source.material[0]:source.material).clone() as T.MeshPhysicalMaterial;
  if('transmission' in base)base.transmission=Math.min(base.transmission??0,.35);
  base.transparent=true;
  base.opacity=Math.min(base.opacity??1,.92);
  base.side=T.DoubleSide;
  base.depthWrite=true;
  const inner=base.clone();
  inner.color=base.color.clone().multiplyScalar(.72);
  inner.transmission=0;
  inner.roughness=Math.min(1,(inner.roughness??.3)+.25);
  return {outer:base,inner};
}

/**
 * Slime body is BoxGeometry(2,2,2,16,16,16) → ~5k verts after inflate.
 * Feeding all of them into ConvexGeometry freezes the main thread (~1s+).
 * Voxel-bin downsample keeps the outer cage with tens of points.
 */
function downsampleConvexPoints(points:T.Vector3[],maxPoints=48):T.Vector3[]{
  if(points.length<=maxPoints)return points;
  const box=new T.Box3().setFromPoints(points);
  const size=box.getSize(new T.Vector3());
  const extent=Math.max(size.x,size.y,size.z,1e-4);
  const cells=Math.max(2,Math.ceil(Math.cbrt(maxPoints)));
  const cell=extent/cells;
  const bins=new Map<string,T.Vector3>();
  for(const p of points){
    const ix=Math.floor((p.x-box.min.x)/cell);
    const iy=Math.floor((p.y-box.min.y)/cell);
    const iz=Math.floor((p.z-box.min.z)/cell);
    const key=`${ix},${iy},${iz}`;
    if(!bins.has(key))bins.set(key,p.clone());
  }
  let out=[...bins.values()];
  if(out.length<4){
    const {min,max}=box;
    out=[
      new T.Vector3(min.x,min.y,min.z),new T.Vector3(max.x,min.y,min.z),
      new T.Vector3(min.x,max.y,min.z),new T.Vector3(max.x,max.y,min.z),
      new T.Vector3(min.x,min.y,max.z),new T.Vector3(max.x,min.y,max.z),
      new T.Vector3(min.x,max.y,max.z),new T.Vector3(max.x,max.y,max.z),
    ];
  }
  if(out.length>maxPoints)out=out.slice(0,maxPoints);
  return out;
}

function toConvexMesh(geometry:T.BufferGeometry,material:T.Material){
  const pos=geometry.getAttribute('position');
  const points:T.Vector3[]=[];
  const seen=new Set<string>();
  for(let i=0;i<pos.count;i++){
    const p=new T.Vector3().fromBufferAttribute(pos,i);
    const key=`${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
    if(seen.has(key))continue;
    seen.add(key);
    points.push(p);
  }
  const convex=new ConvexGeometry(downsampleConvexPoints(points,48));
  const mesh=new T.Mesh(convex,material);
  mesh.castShadow=true;
  mesh.receiveShadow=true;
  return mesh;
}

const UNEVEN=[.27,.36,.44,.31,.41,.22];

/** Recursive plane cuts via ConvexObjectBreaker → about `count` uneven convex shards. */
export function fractureByPlanes(source:T.Mesh,count=6,seed=1){
  const {outer}=materialPair(source);
  const baked=bakeWorldGeometry(source);
  let current=toConvexMesh(baked,outer);
  current.userData.cutPlanes=[];
  baked.dispose();
  const breaker=new ConvexObjectBreaker(.04,1e-4);
  breaker.prepareBreakableObject(current,1,new T.Vector3(),new T.Vector3(),true);
  const pieces:T.Mesh[]=[current];
  let rng=seed>>>0||1;
  const rand=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};

  let guard=0;
  while(pieces.length<count&&guard++<24){
    pieces.sort((a,b)=>volumeOf(b)-volumeOf(a));
    const big=pieces.shift()!;
    const box=new T.Box3().setFromObject(big);
    const size=box.getSize(new T.Vector3());
    const center=box.getCenter(new T.Vector3());
    const axis=size.x>=size.y&&size.x>=size.z?0:size.y>=size.z?1:2;
    const normal=new T.Vector3(axis===0?1:0,axis===1?1:0,axis===2?1:0);
    const tip=new T.Vector3(rand()-.5,rand()-.5,rand()-.5).multiplyScalar(.35);
    tip[axis===0?'x':axis===1?'y':'z']=0;
    normal.add(tip).normalize();
    const ratio=UNEVEN[(pieces.length+guard)%UNEVEN.length];
    const extent=axis===0?size.x:axis===1?size.y:size.z;
    const point=center.clone().addScaledVector(normal,(ratio-.5)*extent*.9);
    const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,point);
    breaker.prepareBreakableObject(big,1,new T.Vector3(),new T.Vector3(),true);
    const out={object1:null as T.Object3D|null,object2:null as T.Object3D|null};
    const n=breaker.cutByPlane(big,plane,out as {object1:T.Object3D;object2:T.Object3D});
    if(n<2||!(out.object1 instanceof T.Mesh)||!(out.object2 instanceof T.Mesh)){
      pieces.push(big);
      break;
    }
    const prior=(big.userData.cutPlanes as T.Plane[]|undefined)??[];
    big.geometry.dispose();
    for(const child of [out.object1,out.object2]){
      child.castShadow=true;
      child.receiveShadow=true;
      (child.material as T.Material)=outer.clone();
      child.userData.cutPlanes=[...prior.map(p=>p.clone()),plane.clone()];
      pieces.push(child);
    }
  }
  return finalizePieces(pieces.slice(0,count),outer);
}

function unevenSeeds(box:T.Box3,count:number,seed:number){
  const min=box.min,size=box.getSize(new T.Vector3());
  let rng=seed>>>0||1;
  const rand=()=>{rng=(Math.imul(rng,1664525)+1013904223)>>>0;return rng/4294967296;};
  const points:T.Vector3[]=[];
  for(let i=0;i<count;i++){
    const t=i/(count-1||1);
    const cluster=i<Math.ceil(count*.45);
    const jitter=cluster?.18:.42;
    const cx=cluster?.35+t*.15:.2+t*.65;
    const cy=.25+t*.45+(rand()-.5)*.2;
    const cz=cluster?.4+(rand()-.5)*.2:.25+t*.55;
    points.push(new T.Vector3(
      min.x+size.x*Math.min(.92,Math.max(.08,cx+(rand()-.5)*jitter)),
      min.y+size.y*Math.min(.92,Math.max(.08,cy+(rand()-.5)*jitter)),
      min.z+size.z*Math.min(.92,Math.max(.08,cz+(rand()-.5)*jitter)),
    ));
  }
  return points;
}

/** Voronoi fracture via three-pinata → about `count` shards with uneven seed placement. */
export function fractureByVoronoi(source:T.Mesh,count=6,seed=1){
  const {outer,inner}=materialPair(source);
  const geometry=bakeWorldGeometry(source);
  const box=geometry.boundingBox??new T.Box3().setFromBufferAttribute(geometry.getAttribute('position') as T.BufferAttribute);
  const mesh=new DestructibleMesh(geometry,outer,inner);
  const options=new FractureOptions({
    fractureMethod:'voronoi',
    fragmentCount:count,
    seed,
    voronoiOptions:{
      mode:'3D',
      seedPoints:unevenSeeds(box,count,seed),
    },
  });
  const fragments=mesh.fracture(options);
  mesh.geometry.dispose();
  return finalizePieces(fragments,outer);
}

function bakeMeshInPlace(mesh:T.Mesh){
  mesh.updateMatrixWorld(true);
  const cutPlanes=mesh.userData.cutPlanes as T.Plane[]|undefined;
  const world=bakeWorldGeometry(mesh);
  mesh.geometry.dispose();
  mesh.geometry=world;
  mesh.position.set(0,0,0);
  mesh.quaternion.identity();
  mesh.scale.set(1,1,1);
  if(cutPlanes)mesh.userData.cutPlanes=cutPlanes;
  mesh.updateMatrixWorld(true);
}

function finalizePieces(meshes:T.Mesh[],fallbackMat:T.Material){
  const palette=[0xffdd32,0xf0c42a,0xe8b820,0xffc94a,0xd4a017,0xffe066];
  const pieces:ChunkPiece[]=[];
  meshes.forEach((mesh,i)=>{
    bakeMeshInPlace(mesh);
    const base=((Array.isArray(mesh.material)?mesh.material[0]:mesh.material)||fallbackMat).clone() as T.MeshPhysicalMaterial;
    if('color' in base)base.color=new T.Color(palette[i%palette.length]);
    // Preview readability: slight emissive so shards stay visible inside lush FX.
    if('emissive' in base&&base.emissive){
      base.emissive=base.color.clone().multiplyScalar(0.35);
      if('emissiveIntensity' in base)(base as T.MeshStandardMaterial).emissiveIntensity=0.55;
    }
    if('transmission' in base)base.transmission=0;
    base.transparent=false;
    base.opacity=1;
    const hasInner=(mesh.geometry.groups??[]).some(g=>g.materialIndex===1);
    if(hasInner){
      const inner=base.clone();
      inner.color=base.color.clone().multiplyScalar(.78);
      if('transmission' in inner)inner.transmission=0;
      if('emissive' in inner&&inner.emissive)inner.emissive=inner.color.clone().multiplyScalar(0.25);
      mesh.material=[base,inner];
    }else mesh.material=base;
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.name=`SlimeChunk_${i+1}`;
    mesh.userData.chunkIndex=i;
    mesh.updateMatrixWorld(true);
    pieces.push({
      mesh,
      homePosition:mesh.position.clone(),
      homeQuaternion:mesh.quaternion.clone(),
    });
  });
  return pieces;
}

export function disposeChunks(pieces:ChunkPiece[]){
  for(const p of pieces){
    p.mesh.removeFromParent();
    p.mesh.geometry.dispose();
    const mats=Array.isArray(p.mesh.material)?p.mesh.material:[p.mesh.material];
    for(const m of mats)m.dispose();
  }
}
