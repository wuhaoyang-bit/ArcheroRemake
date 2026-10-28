import { hitDeformation } from './hit-deformation.ts';
import { DEFAULTS } from './config.ts';
import { monsterInstance, type MonsterInstance } from './training-monster.ts';
import * as T from 'three/webgpu';
import { normalView, positionView, uniform, float } from 'three/tsl';
import { HitResponse, type Point } from './hit-response.ts';
import type { HitSettings } from './hit-feedback-config.ts';
type FeedbackSettings = HitSettings & {monsterScale?:number;monsterHitSpeed?:number;monsterHitRadius?:number};
const floatUniform=()=>uniform(0);
type Dummy={monster?:MonsterInstance;lastPosition:Point;root:T.Object3D;visual:T.Group;proxy:T.Group;response:HitResponse;initial:Point;initialRotation:T.Quaternion;rim:ReturnType<typeof floatUniform>;brightness:ReturnType<typeof floatUniform>;power:ReturnType<typeof floatUniform>};
/** One response per whole dummy; immutable-scale proxy meshes retain its original silhouette. */
export class TrainingFeedback {
  private dummies:Dummy[]=[];
  private worldRotation=new T.Quaternion();
  constructor(group:T.Group,targets:({id:string}&Point)[],width:number,length:number){
    for(const root of group.children.filter(o=>o.userData.practiceTarget)){
      const target=targets.find(t=>t.id===root.userData.practiceTarget)!;
      const visual=new T.Group();visual.name='WholeDummyVisual';visual.matrixAutoUpdate=false;while(root.children.length)visual.add(root.children[0]);root.add(visual);
      const monster=monsterInstance(root);
      const proxy=monster?.proxy ?? visual.clone(true);proxy.name='UnscaledHitProxy';proxy.matrixAutoUpdate=true;proxy.visible=false;proxy.userData.practiceTarget=target.id;root.add(proxy);
      root.updateWorldMatrix(true,true);const box=new T.Box3().setFromObject(visual),halfX=Math.max(root.position.x-box.min.x,box.max.x-root.position.x),halfZ=Math.max(root.position.z-box.min.z,box.max.z-root.position.z);
      const rim=uniform(0),brightness=uniform(2),power=uniform(1.5);
      // Preserve the original material colours. All parts share the SAME hit uniform.
      const materials=new Map<T.Material,T.MeshStandardNodeMaterial>();visual.traverse(o=>{if(!(o instanceof T.Mesh))return;const original=o.material as T.MeshStandardMaterial;let material=materials.get(original);if(!material){const properties={color:original.color,roughness:original.roughness??.35,metalness:original.metalness??0,map:original.map??null,normalMap:original.normalMap??null,side:original.side};
        if(original instanceof T.MeshPhysicalMaterial){material=new T.MeshPhysicalNodeMaterial({...properties,transmission:original.transmission,thickness:original.thickness,ior:original.ior,attenuationColor:original.attenuationColor,attenuationDistance:original.attenuationDistance,clearcoat:original.clearcoat,clearcoatRoughness:original.clearcoatRoughness,envMap:original.envMap});}
        else material=new T.MeshStandardNodeMaterial(properties);const edge=float(1).sub(normalView.normalize().dot(positionView.negate().normalize()).abs()).clamp().pow(power);material.emissiveNode=edge.mul(rim).mul(brightness);materials.set(original,material);}o.material=material;});
      const response=new HitResponse(target,{x:Math.max(0,width/2-.155-halfX),z:Math.max(0,length/2-.155-halfZ)});
      this.dummies.push({monster,lastPosition:{x:target.x,z:target.z},root,visual,proxy,response,initial:{x:target.x,z:target.z},initialRotation:root.quaternion.clone(),rim,brightness,power});
    }
  }
  get proxies(){return this.dummies.map(d=>d.proxy);}
  hit(id:string,direction:Point,settings:FeedbackSettings){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return false;d.monster?.animation?.hit(settings.monsterHitSpeed ?? 1);d.monster?.inflation?.state.hit(settings);d.response.hit(direction,settings);d.response.update(0,settings);this.apply(d,settings);return true;}
  private apply(d:Dummy,c:FeedbackSettings){d.monster?.inflation?.state.update(0,c);d.monster?.inflation?.apply(c);d.root.position.set(d.response.position.x,0,d.response.position.z);const modelScale=d.monster ? (c.monsterScale ?? 1) : 1;d.proxy.scale.setScalar(modelScale*(d.monster?.inflation?.settledExtent??1));if(d.monster){const radius=c.monsterHitRadius??DEFAULTS.monsterHitRadius;d.monster.hitBody.scale.set(radius,1,radius);}const squash=c.hitSquashEnabled?d.response.scale:1;
    d.visual.scale.setScalar(modelScale*squash);
    d.root.getWorldQuaternion(this.worldRotation);
    hitDeformation(d.visual.matrix,squash,modelScale,c.hitSquashMode,c.hitSquashCompensation,d.response.direction,this.worldRotation);
    d.visual.matrixWorldNeedsUpdate=true;d.rim.value=d.response.rim(c);d.brightness.value=c.hitRimBrightness;d.power.value=8*Math.pow(.05,(c.hitRimWidth-.1)/.9);d.root.updateWorldMatrix(true,true);}
  update(dt:number,c:FeedbackSettings){for(const d of this.dummies){d.response.update(dt,c);d.monster?.inflation?.state.update(dt,c);this.apply(d,c);}}
  pursue(dt:number,player:Point,speed:number,c:FeedbackSettings){for(const d of this.dummies){
    const p=d.response.position,dx=player.x-p.x,dz=player.z-p.z,distance=Math.hypot(dx,dz);
    if(distance>1e-8){d.root.rotation.y=Math.atan2(dx,dz);if(!d.response.knockingBack){const step=Math.min(distance,speed*dt);p.x+=dx/distance*step;p.z+=dz/distance*step;}}
    this.apply(d,c);
  }}
  refresh(c:FeedbackSettings){for(const d of this.dummies)this.apply(d,c);}
  animate(dt:number,c:FeedbackSettings){for(const d of this.dummies){const p=d.response.position,moved=Math.hypot(p.x-d.lastPosition.x,p.z-d.lastPosition.z)>1e-5;d.monster?.animation?.update(dt,moved&&!d.response.knockingBack);Object.assign(d.lastPosition,p);this.apply(d,c);}}
  aimHeight(id:string){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);return d?.monster ? d.monster.aimHeight*d.proxy.scale.y : 1.65;}
  /** Enemy foot anchor slightly above the ground plane for hit FX. */
  feetOrigin(id:string,out:T.Vector3){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return null;const p=d.response.position;return out.set(p.x,.05,p.z);}
  /** World-space center of the visible model (for juice burst origin). */
  modelCenter(id:string,out:T.Vector3){
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return null;
    d.root.updateWorldMatrix(true,true);
    new T.Box3().setFromObject(d.visual).getCenter(out);
    return out;
  }
  dispose(){for(const d of this.dummies){d.monster?.animation?.dispose();d.visual.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.dispose();});}}
  reset(){for(const d of this.dummies){const baseScale=d.proxy.scale.x/(d.monster?.inflation?.settledExtent??1);d.proxy.scale.setScalar(baseScale);Object.assign(d.response.position,d.initial);d.response.reset();d.monster?.inflation?.state.reset();if(d.monster?.inflation)d.monster.inflation.apply(DEFAULTS);d.monster?.animation?.reset();Object.assign(d.lastPosition,d.initial);d.root.position.set(d.initial.x,0,d.initial.z);d.root.quaternion.copy(d.initialRotation);d.visual.scale.setScalar(d.proxy.scale.x);d.visual.matrix.makeScale(d.proxy.scale.x,d.proxy.scale.x,d.proxy.scale.x);d.visual.matrixWorldNeedsUpdate=true;d.rim.value=0;d.root.updateWorldMatrix(true,true);}}
  snapshot(){return this.dummies.map(d=>({id:d.root.userData.practiceTarget as string,model:d.root.userData.monsterModel ?? 'dummy',animation:d.monster?.animation?.snapshot(),inflation:d.monster?.inflation?.snapshot(),aimHeight:d.monster ? d.monster.aimHeight*d.proxy.scale.y : undefined,modelScale:d.proxy.scale.x,hitRadius:d.monster ? d.monster.hitBody.scale.x*d.proxy.scale.x : undefined,position:{...d.response.position},age:Number.isFinite(d.response.age)?d.response.age:null,scale:d.visual.scale.x,rim:d.rim.value,compression:d.response.x,direction:{...d.response.direction},visualMatrix:d.visual.matrix.toArray(),blocked:d.response.blocked,bounds:{...d.response.bounds},proxyScale:d.proxy.scale.toArray(),parts:d.visual.children.length}));}
}
