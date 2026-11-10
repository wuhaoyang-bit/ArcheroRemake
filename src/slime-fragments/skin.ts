import * as T from 'three/webgpu';
import {attribute,storage,vec3,varying,transformNormalToView} from 'three/tsl';
import {ShapeMatchingBody as Body} from './shape-matching.ts';
/** One pair of small GPU buffers shared by all nine pieces of a burst.
 * Binding attributes stay on the GPU; only node displacements and tet cofactors
 * change each frame. Surface detail no longer determines CPU skinning cost. */
export class SkinBuffers{
 readonly displacement:T.StorageBufferAttribute;
 readonly normals:T.StorageBufferAttribute;
 constructor(nodeCount:number,tetCount:number,material:T.MeshPhysicalNodeMaterial){
  this.displacement=new T.StorageBufferAttribute(new Float32Array(nodeCount*4),4).setUsage(T.DynamicDrawUsage);
  this.normals=new T.StorageBufferAttribute(new Float32Array(tetCount*12),4).setUsage(T.DynamicDrawUsage);
  const delta=storage(this.displacement,'vec4',nodeCount).toReadOnly(),cofactor=storage(this.normals,'vec4',tetCount*3).toReadOnly();
  const ids=attribute('fragmentNodes','uvec4'),w=attribute('fragmentWeights','vec4');
  material.positionNode=attribute('position','vec3')
   .add(delta.element(ids.x).xyz.mul(w.x)).add(delta.element(ids.y).xyz.mul(w.y))
   .add(delta.element(ids.z).xyz.mul(w.z)).add(delta.element(ids.w).xyz.mul(w.w));
  const tet=attribute('fragmentTet','uint').mul(3),n=attribute('normal','vec3');
  const deformedNormal=vec3(cofactor.element(tet).xyz.dot(n),cofactor.element(tet.add(1)).xyz.dot(n),cofactor.element(tet.add(2)).xyz.dot(n)).normalize();
  material.normalNode=transformNormalToView(varying(deformedNormal)).normalize();
 }
}
export class Skin{
 mesh:T.Mesh;original:Float32Array;originalNormals:Float32Array;tetIndices:Uint32Array;normalMatrices:Float64Array;ids:Uint32Array;weights:Float32Array;offset=new T.Vector3();
 constructor(public body:Body,positions:Float32Array,normals:Float32Array,index:Uint32Array,ids:Uint32Array,weights:Float32Array,material:T.Material,private gpu?:SkinBuffers,private nodeOffset=0,private tetOffset=0){this.original=positions.slice();this.originalNormals=normals.slice();const lookup=new Map(body.elements.map((e,i)=>[e.ids.join(),i]));this.tetIndices=new Uint32Array(positions.length/3);for(let i=0;i<this.tetIndices.length;i++)this.tetIndices[i]=lookup.get(Array.from(ids.slice(i*4,i*4+4)).join())!;this.normalMatrices=new Float64Array(body.elements.length*9);this.ids=ids;this.weights=weights;const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3).setUsage(T.DynamicDrawUsage));g.setAttribute('normal',new T.BufferAttribute(normals,3).setUsage(T.DynamicDrawUsage));g.setIndex(new T.BufferAttribute(index,1));if(gpu){
 const nodeIds=new Uint32Array(ids.length);for(let i=0;i<ids.length;i++)nodeIds[i]=ids[i]+nodeOffset;
 const tetIds=new Uint32Array(this.tetIndices.length);for(let i=0;i<tetIds.length;i++)tetIds[i]=this.tetIndices[i]+tetOffset;
 const nodes=new T.Uint32BufferAttribute(nodeIds,4),tets=new T.Uint32BufferAttribute(tetIds,1);nodes.gpuType=T.IntType;tets.gpuType=T.IntType;
 g.setAttribute('fragmentNodes',nodes);g.setAttribute('fragmentWeights',new T.BufferAttribute(weights,4));g.setAttribute('fragmentTet',tets);
 }this.mesh=new T.Mesh(g,material);this.mesh.frustumCulled=false;this.mesh.castShadow=true;this.mesh.receiveShadow=true;this.mesh.visible=false;}
 private f=new Float64Array(9);
 private displacement:Float64Array|undefined;
 /** Upload the posed rest surface once at birth, not on every simulation step. */
 syncRestPose(){if(!this.gpu)return;const g=this.mesh.geometry;g.attributes.position.array.set(this.original);g.attributes.normal.array.set(this.originalNormals);g.attributes.position.needsUpdate=true;g.attributes.normal.needsUpdate=true;}
 positionError(expected:Float32Array,samples=Infinity){let error=0;const stride=Math.max(1,Math.ceil(expected.length/3/samples));for(let vertex=0;vertex<expected.length/3;vertex+=stride)for(let axis=0;axis<3;axis++){const i=vertex*3+axis;let value=this.original[i];for(let j=0;j<4;j++){const id=this.ids[vertex*4+j]*3+axis;value+=this.weights[vertex*4+j]*(this.body.x[id]-this.body.rest[id]);}error=Math.max(error,Math.abs(Math.fround(value)-expected[i]));}return error;}
 updateGPU(){
  const gpu=this.gpu!,b=this.body,d=gpu.displacement.array,m=gpu.normals.array,f=this.f;
  for(let i=0,j=this.nodeOffset*4;i<b.x.length;i+=3,j+=4){d[j]=b.x[i]-b.rest[i];d[j+1]=b.x[i+1]-b.rest[i+1];d[j+2]=b.x[i+2]-b.rest[i+2];}
  for(let i=0,j=this.tetOffset*12;i<b.elements.length;i++,j+=12){
   b.F(b.elements[i],f);
   m[j]=f[4]*f[8]-f[5]*f[7];m[j+1]=f[5]*f[6]-f[3]*f[8];m[j+2]=f[3]*f[7]-f[4]*f[6];
   m[j+4]=f[2]*f[7]-f[1]*f[8];m[j+5]=f[0]*f[8]-f[2]*f[6];m[j+6]=f[1]*f[6]-f[0]*f[7];
   m[j+8]=f[1]*f[5]-f[2]*f[4];m[j+9]=f[2]*f[3]-f[0]*f[5];m[j+10]=f[0]*f[4]-f[1]*f[3];
  }
  gpu.displacement.needsUpdate=true;gpu.normals.needsUpdate=true;
 }
 update(){
  if(this.gpu){this.updateGPU();return;}
  const p=this.mesh.geometry.attributes.position as T.BufferAttribute,a=p.array,b=this.body;
  const delta=this.displacement??=new Float64Array(b.x.length);
  for(let i=0;i<delta.length;i++)delta[i]=b.x[i]-b.rest[i];
  const ids=this.ids,w=this.weights,original=this.original;
  for(let i=0,j=0,t=0;i<p.count;i++,j+=3,t+=4){
   const a0=ids[t]*3,a1=ids[t+1]*3,a2=ids[t+2]*3,a3=ids[t+3]*3,w0=w[t],w1=w[t+1],w2=w[t+2],w3=w[t+3];
   a[j]=original[j]+w0*delta[a0]+w1*delta[a1]+w2*delta[a2]+w3*delta[a3];
   a[j+1]=original[j+1]+w0*delta[a0+1]+w1*delta[a1+1]+w2*delta[a2+1]+w3*delta[a3+1];
   a[j+2]=original[j+2]+w0*delta[a0+2]+w1*delta[a1+2]+w2*delta[a2+2]+w3*delta[a3+2];
  }
  p.needsUpdate=true;
  const normal=this.mesh.geometry.attributes.normal as T.BufferAttribute,n=normal.array,f=this.f,m=this.normalMatrices;
  for(let i=0;i<b.elements.length;i++){
   b.F(b.elements[i],f);const j=i*9;
   m[j]=f[4]*f[8]-f[5]*f[7];m[j+1]=f[5]*f[6]-f[3]*f[8];m[j+2]=f[3]*f[7]-f[4]*f[6];
   m[j+3]=f[2]*f[7]-f[1]*f[8];m[j+4]=f[0]*f[8]-f[2]*f[6];m[j+5]=f[1]*f[6]-f[0]*f[7];
   m[j+6]=f[1]*f[5]-f[2]*f[4];m[j+7]=f[2]*f[3]-f[0]*f[5];m[j+8]=f[0]*f[4]-f[1]*f[3];
  }
  const normals=this.originalNormals;
  for(let i=0,k=0;i<p.count;i++,k+=3){
   const j=this.tetIndices[i]*9,x=normals[k],y=normals[k+1],z=normals[k+2],nx=m[j]*x+m[j+1]*y+m[j+2]*z,ny=m[j+3]*x+m[j+4]*y+m[j+5]*z,nz=m[j+6]*x+m[j+7]*y+m[j+8]*z;
   const invLength=1/(Math.sqrt(nx*nx+ny*ny+nz*nz)||1);n[k]=nx*invLength;n[k+1]=ny*invLength;n[k+2]=nz*invLength;
  }
  normal.needsUpdate=true;
 }
}
