import * as T from 'three/webgpu';

export interface ArrowBodyAttachment {
  update(position:T.Vector3,rotation:T.Quaternion):boolean;
}

/** Bind once to the entry triangle, then sample just its three animated vertices.
 * Barycentric coordinates follow inflation, CPU deformation, morphs and skinning.
 * A rigid local frame moves the arrow without stretching the arrow itself. */
export function bindArrowToBody(mesh:T.Mesh,position:T.Vector3,rotation:T.Quaternion,direction:T.Vector3):ArrowBodyAttachment|null{
  const attribute=mesh.geometry.getAttribute('position');if(!attribute)return null;
  const index=mesh.geometry.index,count=index?.count??attribute.count;
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),point=new T.Vector3();
  const triangle=new T.Triangle(),ray=new T.Ray(position.clone().addScaledVector(direction,-1000),direction.clone().normalize());
  const bary=new T.Vector3(),ids=[0,0,0];let best=Infinity,found=false;
  const refresh=()=>{mesh.updateWorldMatrix(true,false);if(mesh instanceof T.SkinnedMesh)mesh.skeleton.update();};
  const vertex=(i:number,out:T.Vector3)=>mesh.getVertexPosition(i,out).applyMatrix4(mesh.matrixWorld);
  refresh();
  for(let i=0;i+2<count;i+=3){
    const ia=index?index.getX(i):i,ib=index?index.getX(i+1):i+1,ic=index?index.getX(i+2):i+2;
    vertex(ia,a);vertex(ib,b);vertex(ic,c);
    if(!ray.intersectTriangle(a,b,c,false,point))continue;
    const distance=point.distanceToSquared(ray.origin);
    if(distance>=best)continue;
    triangle.set(a,b,c);if(!triangle.getBarycoord(point,bary))continue;
    best=distance;ids[0]=ia;ids[1]=ib;ids[2]=ic;found=true;
  }
  if(!found)return null;
  const x=new T.Vector3(),y=new T.Vector3(),z=new T.Vector3(),anchor=new T.Vector3();
  const matrix=new T.Matrix4(),frame=new T.Quaternion();
  const sample=()=>{
    refresh();vertex(ids[0],a);vertex(ids[1],b);vertex(ids[2],c);
    anchor.copy(a).multiplyScalar(bary.x).addScaledVector(b,bary.y).addScaledVector(c,bary.z);
    x.subVectors(b,a);y.subVectors(c,a);z.crossVectors(x,y);
    if(x.lengthSq()<1e-12||z.lengthSq()<1e-12)return false;
    x.normalize();z.normalize();y.crossVectors(z,x).normalize();
    frame.setFromRotationMatrix(matrix.makeBasis(x,y,z));return true;
  };
  if(!sample())return null;
  const inverse=frame.clone().invert();
  const offset=position.clone().sub(anchor).applyQuaternion(inverse);
  const relativeRotation=inverse.multiply(rotation);
  return {update(outPosition,outRotation){
    if(!mesh.parent)return false;
    if(!sample())return true; // A briefly collapsed face keeps the last valid pose.
    outPosition.copy(offset).applyQuaternion(frame).add(anchor);
    outRotation.copy(frame).multiply(relativeRotation);return true;
  }};
}
