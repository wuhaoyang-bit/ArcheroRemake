import * as T from 'three';
import {inflatePoint} from './slime-inflation-shape.ts';

/** Per-face knobs — same meanings as slime inflation bulge/fill. */
export type FaceBulgeParams={
  enabled:boolean;
  /** slimeBulge-style 0–1; default 0.65 */
  bulge:number;
  /** fill 0–1; default 1 */
  fill:number;
  /** in-plane densify rings (like BoxGeometry face segments); default 6 */
  rings:number;
};

export const DEFAULT_FACE_BULGE:FaceBulgeParams={
  enabled:false,
  bulge:.65,
  fill:1,
  rings:6,
};

export type FaceBulgeEntry={
  id:string;
  chunkIndex:number;
  normal:[number,number,number];
  point:[number,number,number];
  params:FaceBulgeParams;
};

export type FaceBulgeDocument={
  version:1;
  cutMode:'plane'|'voronoi';
  /** Seed that produced the chunks these faces bind to. */
  cutSeed:number;
  faces:FaceBulgeEntry[];
};

export function emptyFaceBulgeDoc(cutMode:'plane'|'voronoi'='voronoi',cutSeed=1):FaceBulgeDocument{
  return {version:1,cutMode,cutSeed,faces:[]};
}

export function cloneFaceBulgeDoc(doc:FaceBulgeDocument):FaceBulgeDocument{
  return {
    version:1,
    cutMode:doc.cutMode,
    cutSeed:doc.cutSeed,
    faces:doc.faces.map(f=>({
      id:f.id,
      chunkIndex:f.chunkIndex,
      normal:[...f.normal] as [number,number,number],
      point:[...f.point] as [number,number,number],
      params:{...f.params},
    })),
  };
}

function round3(n:number){return Math.round(n*1e3)/1e3;}

export function faceIdFromPlane(chunkIndex:number,normal:T.Vector3,point:T.Vector3){
  const d=-normal.dot(point);
  return `c${chunkIndex}_n${round3(normal.x)}_${round3(normal.y)}_${round3(normal.z)}_d${round3(d)}`;
}

type FacePatch={
  triIndices:number[];
  normal:T.Vector3;
  point:T.Vector3;
  loop:number[];
};

const _a=new T.Vector3(),_b=new T.Vector3(),_c=new T.Vector3(),_ab=new T.Vector3(),_ac=new T.Vector3(),_n=new T.Vector3(),_ctr=new T.Vector3();

function readTris(geometry:T.BufferGeometry){
  const pos=geometry.getAttribute('position') as T.BufferAttribute;
  const tris:number[][]=[];
  if(geometry.index){
    const idx=geometry.index;
    for(let i=0;i<idx.count;i+=3)tris.push([idx.getX(i),idx.getX(i+1),idx.getX(i+2)]);
  }else{
    for(let i=0;i<pos.count;i+=3)tris.push([i,i+1,i+2]);
  }
  return {pos,tris};
}

function faceNormal(pos:T.BufferAttribute,i0:number,i1:number,i2:number){
  _a.fromBufferAttribute(pos,i0);_b.fromBufferAttribute(pos,i1);_c.fromBufferAttribute(pos,i2);
  return _n.crossVectors(_ab.subVectors(_b,_a),_ac.subVectors(_c,_a)).normalize();
}

function faceCenter(pos:T.BufferAttribute,i0:number,i1:number,i2:number){
  _a.fromBufferAttribute(pos,i0);_b.fromBufferAttribute(pos,i1);_c.fromBufferAttribute(pos,i2);
  return _ctr.copy(_a).add(_b).add(_c).multiplyScalar(1/3);
}

/** Grow coplanar triangles from a raycast faceIndex into one selectable face. */
export function findFacePatch(mesh:T.Mesh,faceIndex:number):FacePatch|null{
  const {pos,tris}=readTris(mesh.geometry);
  if(faceIndex<0||faceIndex>=tris.length)return null;
  const [i0,i1,i2]=tris[faceIndex];
  const baseN=faceNormal(pos,i0,i1,i2).clone();
  if(baseN.lengthSq()<1e-10)return null;
  const baseP=faceCenter(pos,i0,i1,i2).clone();
  const plane=new T.Plane().setFromNormalAndCoplanarPoint(baseN,baseP);

  const list=[faceIndex];
  const assigned=new Set([faceIndex]);
  for(let t=0;t<tris.length;t++){
    if(assigned.has(t))continue;
    const [j0,j1,j2]=tris[t];
    const on=faceNormal(pos,j0,j1,j2);
    const oc=faceCenter(pos,j0,j1,j2);
    if(Math.abs(on.dot(baseN))>.97&&Math.abs(plane.distanceToPoint(oc))<.04){
      list.push(t);assigned.add(t);
    }
  }

  const edgeCount=new Map<string,[number,number]>();
  const edgeKey=(u:number,v:number)=>u<v?`${u},${v}`:`${v},${u}`;
  for(const t of list){
    const [a,b,c]=tris[t];
    for(const [u,v] of [[a,b],[b,c],[c,a]] as [number,number][]){
      const k=edgeKey(u,v);
      if(edgeCount.has(k))edgeCount.delete(k);
      else edgeCount.set(k,[u,v]);
    }
  }
  const edges=[...edgeCount.values()];
  if(edges.length<3)return null;

  const adj=new Map<number,number[]>();
  for(const [u,v] of edges){
    if(!adj.has(u))adj.set(u,[]);
    if(!adj.has(v))adj.set(v,[]);
    adj.get(u)!.push(v);adj.get(v)!.push(u);
  }
  const start=edges[0][0];
  const loop=[start];
  let prev=-1,cur=start;
  for(let guard=0;guard<edges.length;guard++){
    const next=(adj.get(cur)||[]).find(x=>x!==prev);
    if(next===undefined||next===start)break;
    loop.push(next);prev=cur;cur=next;
  }
  if(loop.length<3)return null;

  _a.fromBufferAttribute(pos,loop[0]);
  _b.fromBufferAttribute(pos,loop[1]);
  _c.fromBufferAttribute(pos,loop[2]);
  const loopN=_n.crossVectors(_ab.subVectors(_b,_a),_ac.subVectors(_c,_a));
  if(loopN.dot(baseN)<0)loop.reverse();

  return {triIndices:list,normal:baseN,point:baseP,loop};
}

type MeshBulgeState={
  /** Full geometry positions before any face bulge (after densify edits baked into rest). */
  rest:Float32Array;
  /** Face id → interior vertex indices created for densify (rim stays shared). */
  faceInterior:Map<string,number[]>;
  /** Face id → rim loop indices (stable after densify). */
  faceLoops:Map<string,number[]>;
  densified:Set<string>;
};

function meshState(mesh:T.Mesh):MeshBulgeState{
  let s=mesh.userData.faceBulgeState as MeshBulgeState|undefined;
  if(!s){
    const pos=mesh.geometry.getAttribute('position') as T.BufferAttribute;
    s={
      rest:Float32Array.from(pos.array as Float32Array),
      faceInterior:new Map(),
      faceLoops:new Map(),
      densified:new Set(),
    };
    mesh.userData.faceBulgeState=s;
  }
  return s;
}

function ensureRestMatches(mesh:T.Mesh,state:MeshBulgeState){
  const pos=mesh.geometry.getAttribute('position') as T.BufferAttribute;
  if(state.rest.length===pos.array.length)return;
  state.rest=Float32Array.from(pos.array as Float32Array);
}

export function restoreMeshRest(mesh:T.Mesh){
  const state=mesh.userData.faceBulgeState as MeshBulgeState|undefined;
  if(!state)return;
  const attr=mesh.geometry.getAttribute('position') as T.BufferAttribute;
  if(state.rest.length!==attr.array.length)return;
  (attr.array as Float32Array).set(state.rest);
  attr.needsUpdate=true;
}

/** Densify one coplanar face in-plane; rim vertex indices reused (no shell cracks). */
function densifyFace(mesh:T.Mesh,patch:FacePatch,faceId:string,rings:number){
  const state=meshState(mesh);
  if(state.densified.has(faceId))return;
  // Always densify from rest so other faces' bulge does not bake in.
  restoreMeshRest(mesh);
  const geometry=mesh.geometry;
  const {pos,tris}=readTris(geometry);
  // Re-resolve coplanar tris on current (rest) topology via plane, not stale triIndices.
  const plane=new T.Plane().setFromNormalAndCoplanarPoint(patch.normal,patch.point);
  const drop=new Set<number>();
  for(let t=0;t<tris.length;t++){
    const [j0,j1,j2]=tris[t];
    const on=faceNormal(pos,j0,j1,j2);
    const oc=faceCenter(pos,j0,j1,j2);
    if(Math.abs(on.dot(patch.normal))>.97&&Math.abs(plane.distanceToPoint(oc))<.04)drop.add(t);
  }
  const keep:number[][]=[];
  for(let t=0;t<tris.length;t++)if(!drop.has(t))keep.push(tris[t]);

  const positions=Array.from(pos.array as Float32Array);
  const addVertex=(v:T.Vector3)=>{
    positions.push(v.x,v.y,v.z);
    return positions.length/3-1;
  };

  const faceCtr=new T.Vector3();
  for(const i of patch.loop){
    faceCtr.x+=positions[i*3];
    faceCtr.y+=positions[i*3+1];
    faceCtr.z+=positions[i*3+2];
  }
  faceCtr.multiplyScalar(1/patch.loop.length);
  faceCtr.addScaledVector(patch.normal,-plane.distanceToPoint(faceCtr));

  const ringCount=Math.max(2,Math.floor(rings));
  const centerIndex=addVertex(faceCtr);
  const interior=[centerIndex];
  const ringIdx:number[][]=[[centerIndex]];
  const scratch=new T.Vector3();
  for(let r=1;r<ringCount;r++){
    const t=r/ringCount;
    const row:number[]=[];
    for(const i of patch.loop){
      scratch.set(positions[i*3],positions[i*3+1],positions[i*3+2]);
      const idx=addVertex(faceCtr.clone().lerp(scratch,t));
      row.push(idx);
      interior.push(idx);
    }
    ringIdx.push(row);
  }
  ringIdx.push(patch.loop);

  const newCap:number[][]=[];
  for(let i=0;i<patch.loop.length;i++){
    const j=(i+1)%patch.loop.length;
    newCap.push([centerIndex,ringIdx[1][i],ringIdx[1][j]]);
  }
  for(let r=1;r<ringCount;r++){
    const inner=ringIdx[r],outer=ringIdx[r+1];
    for(let i=0;i<patch.loop.length;i++){
      const j=(i+1)%patch.loop.length;
      newCap.push([inner[i],outer[i],outer[j]]);
      newCap.push([inner[i],outer[j],inner[j]]);
    }
  }

  const allTris=[...keep,...newCap];
  const newPos=new Float32Array(positions);
  const newIndex=new Uint32Array(allTris.length*3);
  allTris.forEach((f,i)=>{newIndex[i*3]=f[0];newIndex[i*3+1]=f[1];newIndex[i*3+2]=f[2];});
  geometry.setAttribute('position',new T.BufferAttribute(newPos,3));
  geometry.setIndex(new T.BufferAttribute(newIndex,1));
  geometry.clearGroups();
  geometry.addGroup(0,allTris.length*3,0);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  state.rest=Float32Array.from(newPos);
  state.faceInterior.set(faceId,interior);
  state.faceLoops.set(faceId,patch.loop.slice());
  state.densified.add(faceId);
}

/**
 * Apply slime inflatePoint('bulge') on one already-densified face.
 * Local frame mirrors a unit-cube face: origin behind the face, radius = half*√3.
 * Does not restore other faces — call restoreMeshRest + densify pass first when batching.
 */
function inflateFaceInterior(mesh:T.Mesh,patch:FacePatch,faceId:string,params:FaceBulgeParams){
  const state=meshState(mesh);
  ensureRestMatches(mesh,state);
  const attr=mesh.geometry.getAttribute('position') as T.BufferAttribute;
  const interior=state.faceInterior.get(faceId)??[];
  for(const i of interior){
    attr.setXYZ(i,state.rest[i*3],state.rest[i*3+1],state.rest[i*3+2]);
  }

  if(!params.enabled||params.bulge<=0||params.fill<=0||!interior.length){
    attr.needsUpdate=true;
    return;
  }

  const faceCtr=new T.Vector3();
  for(const i of patch.loop){
    faceCtr.x+=state.rest[i*3];
    faceCtr.y+=state.rest[i*3+1];
    faceCtr.z+=state.rest[i*3+2];
  }
  faceCtr.multiplyScalar(1/patch.loop.length);
  const plane=new T.Plane().setFromNormalAndCoplanarPoint(patch.normal,patch.point);
  faceCtr.addScaledVector(patch.normal,-plane.distanceToPoint(faceCtr));

  let half=0;
  const scratch=new T.Vector3();
  for(const i of patch.loop){
    scratch.set(state.rest[i*3],state.rest[i*3+1],state.rest[i*3+2]).sub(faceCtr);
    scratch.addScaledVector(patch.normal,-scratch.dot(patch.normal));
    half=Math.max(half,scratch.length());
  }
  if(half<1e-6)return;

  const localOrigin=faceCtr.clone().addScaledVector(patch.normal,-half);
  const localRadius=half*Math.sqrt(3);
  const amount=Math.min(params.bulge,1/Math.max(1,params.fill));
  const local=new T.Vector3(),out=new T.Vector3();
  for(const i of interior){
    local.set(state.rest[i*3],state.rest[i*3+1],state.rest[i*3+2]).sub(localOrigin);
    inflatePoint(out,local,'bulge',params.fill,amount,3,localRadius);
    attr.setXYZ(i,out.x+localOrigin.x,out.y+localOrigin.y,out.z+localOrigin.z);
  }
  attr.needsUpdate=true;
}

/** Re-find patch by stored plane on a chunk mesh (after cut with matching seed). */
export function findPatchByPlane(mesh:T.Mesh,normal:T.Vector3,point:T.Vector3):FacePatch|null{
  const {pos,tris}=readTris(mesh.geometry);
  const plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,point);
  for(let t=0;t<tris.length;t++){
    const [i0,i1,i2]=tris[t];
    const fn=faceNormal(pos,i0,i1,i2);
    const fc=faceCenter(pos,i0,i1,i2);
    if(Math.abs(fn.dot(normal))>.97&&Math.abs(plane.distanceToPoint(fc))<.05){
      return findFacePatch(mesh,t);
    }
  }
  return null;
}

/** Restore chunk to rest, densify faces that need it, then inflate every entry for that chunk. */
export function reapplyChunkFaceBulges(mesh:T.Mesh,chunkIndex:number,doc:FaceBulgeDocument){
  const entries=doc.faces.filter(f=>f.chunkIndex===chunkIndex);
  restoreMeshRest(mesh);
  for(const entry of entries){
    const normal=new T.Vector3().fromArray(entry.normal);
    const point=new T.Vector3().fromArray(entry.point);
    const patch=findPatchByPlane(mesh,normal,point);
    if(!patch)continue;
    densifyFace(mesh,patch,entry.id,entry.params.rings);
  }
  for(const entry of entries){
    const normal=new T.Vector3().fromArray(entry.normal);
    const point=new T.Vector3().fromArray(entry.point);
    const patch=findPatchByPlane(mesh,normal,point);
    if(!patch)continue;
    inflateFaceInterior(mesh,patch,entry.id,entry.params);
  }
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  mesh.geometry.computeBoundingSphere();
}

export function applyFacePatch(mesh:T.Mesh,chunkIndex:number,patch:FacePatch,params:FaceBulgeParams,doc:FaceBulgeDocument){
  const id=faceIdFromPlane(chunkIndex,patch.normal,patch.point);
  densifyFace(mesh,patch,id,params.rings);
  // Re-run whole chunk so sibling faces stay correct.
  reapplyChunkFaceBulges(mesh,chunkIndex,doc);
  return id;
}

/** Build a simple highlight helper for the selected face loop. */
export function makeFaceHighlight(mesh:T.Mesh,loop:number[]){
  const pos=mesh.geometry.getAttribute('position') as T.BufferAttribute;
  const pts:T.Vector3[]=[];
  for(const i of loop)pts.push(new T.Vector3().fromBufferAttribute(pos,i));
  if(pts.length)pts.push(pts[0].clone());
  const geom=new T.BufferGeometry().setFromPoints(pts);
  const line=new T.Line(geom,new T.LineBasicMaterial({color:0x2a6dff,depthTest:false}));
  line.renderOrder=10;
  line.userData.faceHighlight=true;
  return line;
}

export function faceLoopFor(mesh:T.Mesh,faceId:string,fallback?:number[]){
  const s=mesh.userData.faceBulgeState as MeshBulgeState|undefined;
  return s?.faceLoops.get(faceId)??fallback??[];
}
