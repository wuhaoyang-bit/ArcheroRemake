import { Matrix4, Quaternion, Vector3 } from 'three/webgpu';
import type { Point } from './hit-response.ts';
const axis=new Vector3(),size=new Vector3(),inverse=new Quaternion();
/** R^-1 D R: preserve the monster's heading while deforming along a world-space arrow. */
export function hitDeformation(out:Matrix4,scale:number,modelScale:number,mode:number,compensation:number,direction:Point,worldRotation:Quaternion){
 if(mode!==1||Math.hypot(direction.x,direction.z)<1e-8)return out.makeScale(scale*modelScale,scale*modelScale,scale*modelScale);
 axis.set(direction.x,0,direction.z).normalize().applyQuaternion(inverse.copy(worldRotation).invert());
 const {x,y,z}=axis,k=scale**(-compensation/2),d=scale-k;
 out.set(k+d*x*x,d*x*y,d*x*z,0,d*y*x,k+d*y*y,d*y*z,0,d*z*x,d*z*y,k+d*z*z,0,0,0,0,1);
 return out.scale(size.setScalar(modelScale));
}
