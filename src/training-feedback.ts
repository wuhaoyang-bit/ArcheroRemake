import * as T from 'three/webgpu';
import { normalView, positionView, uniform, float } from 'three/tsl';
import { HitResponse, type Point } from './hit-response.ts';
import type { HitSettings } from './hit-feedback-config.ts';
const floatUniform=()=>uniform(0);
type Dummy={root:T.Object3D;visual:T.Group;proxy:T.Group;response:HitResponse;initial:Point;initialRotation:T.Quaternion;rim:ReturnType<typeof floatUniform>;brightness:ReturnType<typeof floatUniform>;power:ReturnType<typeof floatUniform>};
/** One response per whole dummy; immutable-scale proxy meshes retain its original silhouette. */
export class TrainingFeedback {
  private dummies:Dummy[]=[];
  constructor(group:T.Group,targets:({id:string}&Point)[],width:number,length:number){
    for(const root of group.children.filter(o=>o.userData.practiceTarget)){
      const target=targets.find(t=>t.id===root.userData.practiceTarget)!;
      const visual=new T.Group();visual.name='WholeDummyVisual';while(root.children.length)visual.add(root.children[0]);root.add(visual);
      const proxy=visual.clone(true);proxy.name='UnscaledHitProxy';proxy.visible=false;proxy.userData.practiceTarget=target.id;root.add(proxy);
      root.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(visual),halfX=Math.max(root.position.x-box.min.x,box.max.x-root.position.x),halfZ=Math.max(root.position.z-box.min.z,box.max.z-root.position.z);
      const rim=uniform(0),brightness=uniform(2),power=uniform(1.5);
      // Preserve the original material colours. All parts share the SAME hit uniform.
      const materials=new Map<T.Material,T.MeshStandardNodeMaterial>();visual.traverse(o=>{if(!(o instanceof T.Mesh))return;const original=o.material as T.MeshStandardMaterial;let material=materials.get(original);if(!material){material=new T.MeshStandardNodeMaterial({color:original.color,roughness:original.roughness,metalness:original.metalness});const edge=float(1).sub(normalView.normalize().dot(positionView.negate().normalize()).abs()).clamp().pow(power);material.emissiveNode=edge.mul(rim).mul(brightness);materials.set(original,material);}o.material=material;});
      const response=new HitResponse(target,{x:Math.max(0,width/2-.155-halfX),z:Math.max(0,length/2-.155-halfZ)});
      this.dummies.push({root,visual,proxy,response,initial:{x:target.x,z:target.z},initialRotation:root.quaternion.clone(),rim,brightness,power});
    }
  }
  get proxies(){return this.dummies.map(d=>d.proxy);}
  hit(id:string,direction:Point,settings:HitSettings){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return false;d.response.hit(direction,settings);d.response.update(0,settings);this.apply(d,settings);return true;}
  private apply(d:Dummy,c:HitSettings){d.root.position.set(d.response.position.x,0,d.response.position.z);d.visual.scale.setScalar(c.hitSquashEnabled?d.response.scale:1);d.rim.value=d.response.rim(c);d.brightness.value=c.hitRimBrightness;d.power.value=8*Math.pow(.05,(c.hitRimWidth-.1)/.9);d.root.updateWorldMatrix(true,true);}
  update(dt:number,c:HitSettings){for(const d of this.dummies){d.response.update(dt,c);this.apply(d,c);}}
  pursue(dt:number,player:Point,speed:number,c:HitSettings){for(const d of this.dummies){
    const p=d.response.position,dx=player.x-p.x,dz=player.z-p.z,distance=Math.hypot(dx,dz);
    if(distance>1e-8){d.root.rotation.y=Math.atan2(dx,dz);if(!d.response.knockingBack){const step=Math.min(distance,speed*dt);p.x+=dx/distance*step;p.z+=dz/distance*step;}}
    this.apply(d,c);
  }}
  refresh(c:HitSettings){for(const d of this.dummies)this.apply(d,c);}
  reset(){for(const d of this.dummies){Object.assign(d.response.position,d.initial);d.response.reset();d.root.position.set(d.initial.x,0,d.initial.z);d.root.quaternion.copy(d.initialRotation);d.visual.scale.setScalar(1);d.rim.value=0;d.root.updateWorldMatrix(true,true);}}
  snapshot(){return this.dummies.map(d=>({id:d.root.userData.practiceTarget as string,position:{...d.response.position},age:Number.isFinite(d.response.age)?d.response.age:null,scale:d.visual.scale.x,rim:d.rim.value,compression:d.response.x,blocked:d.response.blocked,bounds:{...d.response.bounds},proxyScale:d.proxy.scale.toArray(),parts:d.visual.children.length}));}
}
