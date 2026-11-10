import * as T from 'three/webgpu';
export type PoseBinding={ids:Uint16Array;weights:Float32Array};
export type ReferenceBody={positions:number[];indices:number[]};
/** Star tetrahedra transfer the accepted cuts to the live body, including bending,
 * inflation, world scale and rotation. No fixed-size bounding-box approximation. */
export class FragmentPoseMapper{
 private inverses:T.Matrix3[]=[];
 private world:Float64Array;
 private center=new T.Vector3();
 private normals:Float64Array;
 private point=new T.Vector3();
 constructor(private reference:ReferenceBody){
  const p=reference.positions,center=new T.Vector3();for(let i=0;i<p.length;i+=3)center.add(new T.Vector3(p[i],p[i+1],p[i+2]));center.multiplyScalar(3/p.length);
  for(let t=0;t<reference.indices.length;t+=3){const [a,b,c]=reference.indices.slice(t,t+3).map(i=>new T.Vector3().fromArray(p,i*3).sub(center));this.inverses.push(new T.Matrix3().set(a.x,b.x,c.x,a.y,b.y,c.y,a.z,b.z,c.z).invert());}
  this.world=new Float64Array(p.length);this.normals=new Float64Array(this.inverses.length*9);
 }
 capture(body:T.Mesh){
  const p=body.geometry.getAttribute('position');if(p.count*3!==this.world.length)throw Error('史莱姆碎块与身体网格拓扑不匹配');
  body.updateWorldMatrix(true,false);this.center.set(0,0,0);
  for(let i=0;i<p.count;i++){this.point.fromBufferAttribute(p,i).applyMatrix4(body.matrixWorld);this.world.set(this.point.toArray(),i*3);this.center.add(this.point);}this.center.multiplyScalar(1/p.count);
  const basis=new T.Matrix3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let t=0;t<this.inverses.length;t++){
   a.fromArray(this.world,this.reference.indices[t*3]*3).sub(this.center);b.fromArray(this.world,this.reference.indices[t*3+1]*3).sub(this.center);c.fromArray(this.world,this.reference.indices[t*3+2]*3).sub(this.center);
   basis.set(a.x,b.x,c.x,a.y,b.y,c.y,a.z,b.z,c.z).multiply(this.inverses[t]).invert().transpose();this.normals.set(basis.elements,t*9);
  }
  return this.center.clone();
 }
 positions(binding:PoseBinding){
  const out=new Float32Array(binding.ids.length*3),idx=this.reference.indices,w=binding.weights,p=this.world,c=this.center;
  for(let i=0,j=0;i<binding.ids.length;i++,j+=3){const t=binding.ids[i]*3,a=idx[t]*3,b=idx[t+1]*3,d=idx[t+2]*3,wa=w[j],wb=w[j+1],wd=w[j+2];
   out[j]=c.x+wa*(p[a]-c.x)+wb*(p[b]-c.x)+wd*(p[d]-c.x);
   out[j+1]=c.y+wa*(p[a+1]-c.y)+wb*(p[b+1]-c.y)+wd*(p[d+1]-c.y);
   out[j+2]=c.z+wa*(p[a+2]-c.z)+wb*(p[b+2]-c.z)+wd*(p[d+2]-c.z);
  }
  return out;
 }
 transformNormals(source:Float32Array,binding:PoseBinding){
  const out=new Float32Array(source.length),m=this.normals;
  for(let i=0;i<binding.ids.length;i++){const j=binding.ids[i]*9,x=source[i*3],y=source[i*3+1],z=source[i*3+2],a=m[j]*x+m[j+3]*y+m[j+6]*z,b=m[j+1]*x+m[j+4]*y+m[j+7]*z,c=m[j+2]*x+m[j+5]*y+m[j+8]*z,l=Math.sqrt(a*a+b*b+c*c)||1;out[i*3]=a/l;out[i*3+1]=b/l;out[i*3+2]=c/l;}
  return out;
 }
}
