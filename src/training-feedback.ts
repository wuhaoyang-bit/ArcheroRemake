import type {SprayAnchorResolve} from './directional-spray.ts';
import {bindArrowToBody} from './arrow-body-attachment.ts';
import {SlimeEyeDebris} from './slime-eye-debris.ts';
import {SlimeWalkBreath,gaitLocalState,slimeMoveGaitMultiplier,slimeSpeedMultiplier} from './slime-fullness.ts';
import { SlimeBurstState, burstSample, burstEyePose } from './slime-burst-state.ts';
import type { BurstSettings } from './slime-burst-config.ts';
import { hitDeformation } from './hit-deformation.ts';
import { DEFAULTS } from './config.ts';
import { monsterInstance, type MonsterInstance } from './training-monster.ts';
import * as T from 'three/webgpu';
import { normalView, positionView, uniform, float } from 'three/tsl';
import { HitResponse, knockInitialSpeed, type Point } from './hit-response.ts';
import type { HitSettings } from './hit-feedback-config.ts';
import type {SlimeTrailBody} from './slime-ground-trail.ts';
import { snapshotHitBend, type HitBendSettings } from './hit-bend-config.ts';
import { applyHorizontalBend, calculateBendWeights, horizontalBendAmount, hitBendReturnTravel } from './hit-bend.ts';
import {
  SlimeWalkDeform,
  applyWalkShear,
  bodyWidthFromBendBase,
  walkFootLocalBottom,
} from './slime-walk-deform.ts';
type FeedbackSettings = HitSettings & {monsterScale?:number;monsterHitSpeed?:number;monsterHitRadius?:number};
const floatUniform=()=>uniform(0);
type Dummy={walkFrom:Point;breath:SlimeWalkBreath;burst:SlimeBurstState;burstBase?:FeedbackSettings;monster?:MonsterInstance;lastPosition:Point;root:T.Object3D;visual:T.Group;proxy:T.Group;response:HitResponse;initial:Point;initialRotation:T.Quaternion;rim:ReturnType<typeof floatUniform>;brightness:ReturnType<typeof floatUniform>;power:ReturnType<typeof floatUniform>;bendSnap:HitBendSettings|null;bendApplied:boolean;moveCycleAge:number;moveWasBlocked:boolean;walkDeform:SlimeWalkDeform;walkMoving:boolean};
/** One response per whole dummy; immutable-scale proxy meshes retain its original silhouette. */
export class TrainingFeedback {
  private dummies:Dummy[]=[];
  private trailBodies:SlimeTrailBody[]=[];
  readonly eyeDebris:SlimeEyeDebris;
  onFilled?:(id:string)=>void;
  /** Fires once when a dummy leaves feedback and enters winding. */
  onWindup?:(id:string)=>void;
  onBurst?:(center:T.Vector3,feet:T.Vector3,settings:BurstSettings,color?:T.Color,body?:T.Mesh)=>void;
  private worldRotation=new T.Quaternion();
  private bendLocalDir=new T.Vector3();
  private bendInverseRot=new T.Quaternion();
  private walkScaleMatrix=new T.Matrix4();
  private sprayFwd=new T.Vector3();
  private sprayLocal=new T.Vector3();
  constructor(group:T.Group,targets:({id:string}&Point)[],private width:number,private length:number,private options:{allowFullBurst:boolean|'settings'}={allowFullBurst:true}){
    this.eyeDebris=new SlimeEyeDebris(group);
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
      this.dummies.push({walkFrom:{x:target.x,z:target.z},breath:new SlimeWalkBreath(),burst:new SlimeBurstState(),monster,lastPosition:{x:target.x,z:target.z},root,visual,proxy,response,initial:{x:target.x,z:target.z},initialRotation:root.quaternion.clone(),rim,brightness,power,bendSnap:null,bendApplied:false,moveCycleAge:0,moveWasBlocked:false,walkDeform:new SlimeWalkDeform(),walkMoving:false});
      if(monster?.inflation){const inflation=monster.inflation;this.trailBodies.push({id:target.id,active:true,position:new T.Vector3(target.x,0,target.z),radius:1,color:new T.Color(),footToward:(ground,out)=>inflation.groundContact(ground,out)});}
    }
  }
  private isYellowSlime(d:Dummy){return d.root.userData.monsterModel==='yellow-slime'&&!!d.monster?.inflation;}
  /** True when the live practice target is a yellow slime with inflation. */
  isYellowSlimeTarget(id:string){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);return !!d&&this.isYellowSlime(d);}
  /** PLAN §3: bend after inflation write, before hitDeformation matrix. */
  private applyHitBend(d:Dummy,c:FeedbackSettings){
    const inflation=d.monster?.inflation;if(!this.isYellowSlime(d)||!inflation)return;
    const walk=d.walkDeform;
    const walkEyeX=c.slimeWalkEnabled?walk.eyeFollowX:0;
    const walkEyeZ=c.slimeWalkEnabled?walk.eyeFollowZ:0;
    if(!c.hitBendEnabled){
      if(d.bendApplied){d.bendApplied=false;d.bendSnap=null;}
      // G4: keep walk eye offset when hit-bend off
      inflation.bendFace.position.set(walkEyeX,0,walkEyeZ);
      return;
    }
    if(!d.bendSnap||!Number.isFinite(d.response.age)){
      inflation.bendFace.position.set(walkEyeX,0,walkEyeZ);
      return;
    }
    const snap=d.bendSnap;
    const {belly,upper}=calculateBendWeights(d.response.age,snap);
    d.root.getWorldQuaternion(this.worldRotation);
    this.bendLocalDir.set(d.response.direction.x,0,d.response.direction.z).normalize()
      .applyQuaternion(this.bendInverseRot.copy(this.worldRotation).invert());
    this.bendLocalDir.y=0;
    if(this.bendLocalDir.lengthSq()<1e-12)this.bendLocalDir.set(0,0,1);else this.bendLocalDir.normalize();
    applyHorizontalBend(inflation.bendPositions,inflation.bendBase,this.bendLocalDir.x,this.bendLocalDir.z,belly,upper,snap);
    const eyeHoriz=horizontalBendAmount(snap.hitBendPeakY,belly,upper,snap);
    // G4: walk eye + hit eye (different directions allowed)
    inflation.bendFace.position.set(
      walkEyeX+this.bendLocalDir.x*eyeHoriz,
      0,
      walkEyeZ+this.bendLocalDir.z*eyeHoriz,
    );
    d.bendApplied=true;
  }

  /** Walk outer-arch shear + eye spring target (终版 AABCAA M6/M6b). */
  private applyWalkLean(d:Dummy,c:FeedbackSettings,_dt=0){
    const inflation=d.monster?.inflation;
    const walk=d.walkDeform;
    if(!this.isYellowSlime(d)||!inflation||!c.slimeWalkEnabled){
      walk.applied=false;
      walk.eyeFollowX=walk.eyeFollowZ=0;
      return;
    }
    const width=bodyWidthFromBendBase(inflation.bendBase);
    if(!(width>1e-8)){
      // G3: cannot read bodyWidth — skip shear this frame (do not invent width)
      walk.applied=false;
      return;
    }
    walk.bodyWidth=width;
    const maxLean=c.slimeWalkMaxLean;
    walk.shearTop=walk.leanUpper01*maxLean*width;
    walk.shearBelly=walk.lean01*maxLean*width*0.55;
    // Forward in local XZ (monster facing)
    const fy=d.root.rotation.y;
    const worldFwdX=Math.sin(fy),worldFwdZ=Math.cos(fy);
    d.root.getWorldQuaternion(this.worldRotation);
    this.bendLocalDir.set(worldFwdX,0,worldFwdZ)
      .applyQuaternion(this.bendInverseRot.copy(this.worldRotation).invert());
    this.bendLocalDir.y=0;
    if(this.bendLocalDir.lengthSq()<1e-12)this.bendLocalDir.set(0,0,1);else this.bendLocalDir.normalize();
    applyWalkShear(
      inflation.bendPositions,
      inflation.bendBase,
      this.bendLocalDir.x,
      this.bendLocalDir.z,
      walk.shearBelly,
      walk.shearTop,
    );
    walk.projectEyeFollow(this.bendLocalDir.x,this.bendLocalDir.z);
    walk.applied=true;
  }
  get proxies(){return this.dummies.filter(d=>d.burst.phase==='alive').map(d=>d.proxy);}
  willHitTriggerBurst(id:string,c:FeedbackSettings){
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id),state=d?.monster?.inflation?.state;
    const allowed=this.options.allowFullBurst==='settings'?!c.burstSuppressed:this.options.allowFullBurst&&!!c.burstEnabled;
    if(!allowed||!state||d?.burst.phase!=='alive')return false;
    const added=c.slimeInflationEnabled?Math.min(Math.max(0,c.slimeInjectionAmount),Math.max(0,c.slimeCapacity-state.amount)):0;
    return state.amount+added>=c.slimeCapacity;
  }
  hit(id:string,direction:Point,settings:FeedbackSettings){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d||d.burst.phase!=='alive')return false;d.monster?.animation?.hit(settings.monsterHitSpeed ?? 1);d.monster?.inflation?.state.hit(settings);d.response.hit(direction,settings);d.bendSnap=this.isYellowSlime(d)?snapshotHitBend(settings):null;d.response.update(0,settings);this.apply(d,settings);
    const v=new T.Vector3(d.response.direction.x,0,d.response.direction.z),p=d.response.position,b=d.response.bounds;
    let travel=settings.hitKnockDistance;
    for(const [pos,dir,bound] of [[p.x,v.x,b.x],[p.z,v.z,b.z]])if(Math.abs(dir)>1e-8)travel=Math.min(travel,Math.max(0,((dir>0?bound:-bound)-pos)/dir));
    const speed=knockInitialSpeed(travel,settings),strength=Math.max(settings.eyeHitMinimumStrength,Math.min(1,speed/settings.eyeHitReferenceSpeed));
    d.monster?.inflation?.eyeHit.hit(v,strength,settings);this.apply(d,settings);
    if((this.options.allowFullBurst==='settings'?!settings.burstSuppressed:this.options.allowFullBurst)&&d.monster?.inflation&&d.monster.inflation.state.amount>=settings.slimeCapacity&&d.burst.fill(this.options.allowFullBurst==='settings'?{...settings,burstEnabled:1}:settings))this.onFilled?.(id);return true;}
  cancelSuppressedBursts(c:FeedbackSettings){
    const restored:string[]=[];
    if(this.options.allowFullBurst!=='settings'||!c.burstSuppressed)return restored;
    for(const d of this.dummies){
      if(d.burst.phase!=='feedback'&&d.burst.phase!=='winding')continue;
      d.burst.reset();d.burstBase=undefined;d.monster?.inflation?.invalidateShape();
      this.apply(d,c);restored.push(d.root.userData.practiceTarget);
    }
    return restored;
  }
  private apply(d:Dummy,c:FeedbackSettings,dt=0){
    let burstScale=1,colorLightness=0;let shape=c;
    if(d.burst.phase==='winding'||d.burst.phase==='gone'){const b=d.burst.config!,v=burstSample(d.burst.age,b),base=d.burstBase!;burstScale=v.scale;if(d.burst.phase==='winding')colorLightness=v.colorLightness;shape={...base,slimeBulge:base.slimeBulge+(Math.max(base.slimeBulge,b.burstBulge)-base.slimeBulge)*v.bulgeProgress};}
    else d.monster?.inflation?.state.update(0,c);
    // Rebuild from base once, then walk shear → hit bend (no accumulation).
    if(this.isYellowSlime(d)){
      const inflation=d.monster!.inflation!;
      const needBend=!!(c.hitBendEnabled&&d.bendSnap);
      const needWalk=!!c.slimeWalkEnabled;
      if(needBend||needWalk||d.bendApplied||d.walkDeform.applied)inflation.invalidateShape();
      if(!c.hitBendEnabled&&d.bendApplied){d.bendApplied=false;d.bendSnap=null;}
    }
    d.monster?.inflation?.apply(shape,colorLightness);
    this.applyWalkLean(d,c,dt);
    this.applyHitBend(d,c);
    d.root.position.set(d.response.position.x,0,d.response.position.z);const modelScale=d.monster ? (c.monsterScale ?? 1) : 1;d.proxy.scale.setScalar(modelScale*(d.monster?.inflation?.settledExtent??1));if(d.monster){const radius=c.monsterHitRadius??DEFAULTS.monsterHitRadius;d.monster.hitBody.scale.set(radius,1,radius);}const squash=(c.hitSquashEnabled?d.response.scale:1);
    const walkOn=this.isYellowSlime(d)&&!!c.slimeWalkEnabled;
    const wx=walkOn?d.walkDeform.sx:1;
    const wy=walkOn?d.walkDeform.sy:1;
    const uniformBase=modelScale*burstScale*d.breath.scale;
    d.root.getWorldQuaternion(this.worldRotation);
    hitDeformation(d.visual.matrix,squash,uniformBase,c.hitSquashMode,c.hitSquashCompensation,d.response.direction,this.worldRotation);
    if(walkOn){
      this.walkScaleMatrix.makeScale(wx,wy,wx);
      d.visual.matrix.premultiply(this.walkScaleMatrix);
      // G2: inflation places model.root so foot≈0 at visual scale 1; after Sy pin foot to y=0
      const slimeRoot=d.monster!.inflation!.modelRoot;
      const L=walkFootLocalBottom(slimeRoot.position.y,slimeRoot.scale.y);
      const syTotal=d.visual.matrix.elements[5];
      d.visual.matrix.elements[13]=-syTotal*L;
    }
    d.visual.scale.set(1,1,1);
    d.visual.matrixWorldNeedsUpdate=true;d.rim.value=d.response.rim(c);d.brightness.value=c.hitRimBrightness;d.power.value=8*Math.pow(.05,(c.hitRimWidth-.1)/.9);d.root.updateWorldMatrix(true,true);if(d.monster?.inflation){d.monster.inflation.eyeHit.apply(c,d.monster.inflation.copyColor(new T.Color()),d.burst.phase==='winding'||d.burst.phase==='gone'?burstEyePose(d.burst.age,d.burst.config!):undefined);d.root.updateWorldMatrix(true,true);}}
  update(dt:number,c:FeedbackSettings){if(this.eyeDebris.active)this.eyeDebris.setCollisions(this.width,this.length,this.dummies.filter(d=>d.burst.phase!=='gone'&&d.root.visible).map(d=>({id:d.root.userData.practiceTarget as string,box:new T.Box3().setFromObject(d.visual)})));this.eyeDebris.update(dt);for(const d of this.dummies){
    if(d.burst.phase==='gone')continue;
    const previousHitAge=d.response.age;
    d.monster?.inflation?.eyeHit.update(dt);d.response.update(dt,c);d.monster?.inflation?.state.update(dt,c);
    if(this.isYellowSlime(d)&&c.hitBendEnabled&&d.bendSnap){
      const travel=hitBendReturnTravel(d.response.age,d.bendSnap)-hitBendReturnTravel(previousHitAge,d.bendSnap);
      // Move the shared target position so collision, embedded arrows and effects follow the body.
      const p=d.response.position,b=d.response.bounds,dir=d.response.direction;
      const dx=-dir.x*travel,dz=-dir.z*travel;let fraction=1;
      for(const [v,delta,limit] of [[p.x,dx,b.x],[p.z,dz,b.z]]){
        if(delta>0)fraction=Math.min(fraction,(limit-v)/delta);
        else if(delta<0)fraction=Math.min(fraction,(-limit-v)/delta);
      }
      fraction=Math.max(0,fraction);p.x+=dx*fraction;p.z+=dz*fraction;
    }
    const complete=d.response.complete(c)&&(!d.monster?.inflation||!Number.isFinite(d.monster.inflation.state.age))&&!(d.monster?.animation?.snapshot().hitRemaining);
    const remaining=Math.max(d.response.remaining(c),d.monster?.inflation?.state.remaining??0,d.monster?.animation?.snapshot().hitRemaining??0);
    const wasWaiting=d.burst.phase==='feedback';
    const exploded=d.burst.update(dt,complete,remaining);
    if(wasWaiting&&d.burst.phase==='winding'){
      d.burstBase={...c};
      this.onWindup?.(d.root.userData.practiceTarget as string);
    }
    this.apply(d,c,dt);
    if(exploded){const center=new T.Box3().setFromObject(d.visual).getCenter(new T.Vector3());const feet=new T.Vector3(d.response.position.x,.025,d.response.position.z);if(d.monster?.inflation)this.eyeDebris.emit(d.monster.inflation.eyes,center,c,d.root.userData.practiceTarget);d.monster?.inflation?.eyeHit.reset();d.root.visible=false;this.onBurst?.(center,feet,d.burst.config!,d.monster?.inflation?.copyColor(new T.Color()),d.monster?.inflation?.body);}
  }}
  /** Yellow slime only: knock travel or post-knock stun blocks voluntary chase. Other displacement still applies. */
  private blocksSlimeWalk(d:Dummy){return d.response.knockingBack||(this.isYellowSlime(d)&&d.response.afterKnockStun);}
  pursue(dt:number,player:Point,speed:number,c:FeedbackSettings,resolveContacts?:()=>void){
    for(const d of this.dummies){
      Object.assign(d.walkFrom,d.response.position);
      if(d.burst.phase!=='alive')continue;
      const fill=d.monster?.inflation?Math.min(1,d.monster.inflation.state.amount/c.slimeCapacity):0;
      const blocked=this.blocksSlimeWalk(d);
      if(blocked){d.moveCycleAge=0;d.moveWasBlocked=true;}
      else if(d.moveWasBlocked){d.moveCycleAge=0;d.moveWasBlocked=false;}
      const p=d.response.position,dx=player.x-p.x,dz=player.z-p.z,distance=Math.hypot(dx,dz);
      if(distance>1e-8){
        d.root.rotation.y=Math.atan2(dx,dz);
        if(!blocked){
          const heavy=slimeSpeedMultiplier(fill,c);
          const gait=this.isYellowSlime(d)?slimeMoveGaitMultiplier(d.moveCycleAge,c):1;
          const step=Math.min(distance,speed*heavy*gait*dt);
          if(step>1e-8){
            if(this.isYellowSlime(d))d.moveCycleAge+=dt;
            p.x+=dx/distance*step;p.z+=dz/distance*step;
          }else if(this.isYellowSlime(d))d.moveCycleAge=0;
        }
      }else if(this.isYellowSlime(d))d.moveCycleAge=0;
    }
    resolveContacts?.();
    for(const d of this.dummies){
      const fill=d.monster?.inflation?Math.min(1,d.monster.inflation.state.amount/c.slimeCapacity):0;
      const stepLen=Math.hypot(d.response.position.x-d.walkFrom.x,d.response.position.z-d.walkFrom.z);
      // 6A: alive && !blocked && speed*heavy>0 && horizontal step > ε
      const moving=d.burst.phase==='alive'&&!this.blocksSlimeWalk(d)&&speed*slimeSpeedMultiplier(fill,c)>0&&stepLen>1e-8;
      d.walkMoving=moving;
      if(this.isYellowSlime(d)){
        if(!moving)d.moveCycleAge=0;
        const st=gaitLocalState(d.moveCycleAge,c);
        d.walkDeform.update(dt,st,moving,c);
      }
      d.breath.update(dt,moving&&!!d.monster?.inflation,fill,c);this.apply(d,c,dt);
    }
  }
  refresh(c:FeedbackSettings){for(const d of this.dummies)this.apply(d,c);}
  slimeTrailBodies(){
    for(const body of this.trailBodies){const d=this.dummies.find(d=>d.root.userData.practiceTarget===body.id)!,inflation=d.monster!.inflation!;
      body.active=d.root.visible&&d.burst.phase!=='gone';d.root.getWorldPosition(body.position);body.radius=inflation.groundRadius();inflation.copyColor(body.color);
    }
    return this.trailBodies;
  }
  animate(dt:number,c:FeedbackSettings){for(const d of this.dummies){const p=d.response.position,moved=Math.hypot(p.x-d.lastPosition.x,p.z-d.lastPosition.z)>1e-5;d.monster?.animation?.update(dt,moved&&!d.response.knockingBack);Object.assign(d.lastPosition,p);this.apply(d,c);}}
  aimHeight(id:string){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);return d?.monster ? d.monster.aimHeight*d.proxy.scale.y : 1.65;}
  /** Enemy foot anchor slightly above the ground plane for hit FX. */
  currentColor(id:string,out:T.Color){return this.dummies.find(d=>d.root.userData.practiceTarget===id)?.monster?.inflation?.copyColor(out)??null;}
  feetOrigin(id:string,out:T.Vector3){const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return null;const p=d.response.position;return out.set(p.x,.05,p.z);}
  /**
   * Model cube back-face center for directional spray (yellow slime).
   * Eyes on body local +Z; outDir = −facing from root.rotation.y (slime-local, XZ).
   * outOrigin = body −Z face center in world (follows cube + squash), not hit capsule.
   * Check: root.rotation.y=0 → outDir (0,0,−1); y=π/2 → outDir (−1,0,0).
   * Non-slime fallback: hit-cylinder radius along −facing at aimHeight.
   */
  bindArrow(id:string,position:T.Vector3,rotation:T.Quaternion,direction:T.Vector3){
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);
    if(!d)return null;
    const body=d.monster?.inflation?.body;
    return body?bindArrowToBody(body,position,rotation,direction):null;
  }
  /** Per-hit anchor: simultaneous arrows must never overwrite one another. */
  hitSprayAnchor(id:string,point:T.Vector3,incoming:T.Vector3):SprayAnchorResolve|null{
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return null;
    const outward=incoming.clone().normalize().negate();
    const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),outward);
    const binding=this.bindArrow(id,point,rotation,incoming);
    d.visual.updateWorldMatrix(true,false);
    const localPoint=d.visual.worldToLocal(point.clone());
    const localDirection=outward.clone().transformDirection(d.visual.matrixWorld.clone().invert());
    const position=point.clone();
    return (_id,outOrigin,outDir)=>{
      if(!d.root.visible||d.burst.phase==='gone')return false;
      if(binding){
        if(!binding.update(position,rotation))return false;
        outOrigin.copy(position);outDir.set(0,0,1).applyQuaternion(rotation).normalize();
      }else{
        d.visual.updateWorldMatrix(true,false);
        outOrigin.copy(localPoint).applyMatrix4(d.visual.matrixWorld);
        outDir.copy(localDirection).transformDirection(d.visual.matrixWorld);
      }
      return true;
    };
  }
  sprayFrontAnchor(id:string,outOrigin:T.Vector3,outDir:T.Vector3){
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);
    if(!d||d.burst.phase!=='alive'||!d.root.visible)return false;
    return this.sprayBackAnchor(id,outOrigin,outDir,true);
  }
  sprayBackAnchor(id:string,outOrigin:T.Vector3,outDir:T.Vector3,front=false){
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return false;
    d.root.updateWorldMatrix(true,true);
    // Facing from root yaw only — same basis as walk lean; independent of hit squash matrix.
    const fy=d.root.rotation.y;
    this.sprayFwd.set(Math.sin(fy),0,Math.cos(fy));
    if(this.sprayFwd.lengthSq()<1e-12)this.sprayFwd.set(0,0,1);else this.sprayFwd.normalize();
    outDir.copy(this.sprayFwd).multiplyScalar(front?1:-1);
    if(this.isYellowSlime(d)&&d.monster?.inflation){
      const body=d.monster.inflation.body;
      body.updateWorldMatrix(true,false);
      const geo=body.geometry;
      if(!geo.boundingBox)geo.computeBoundingBox();
      const box=geo.boundingBox!;
      // Face center of the −Z side (opposite eyes on +Z), in body local → world.
      this.sprayLocal.set(
        (box.min.x+box.max.x)*.5,
        (box.min.y+box.max.y)*.5,
        front?box.max.z:box.min.z,
      );
      outOrigin.copy(this.sprayLocal).applyMatrix4(body.matrixWorld);
      return true;
    }
    const radius=d.monster
      ? d.monster.hitBody.scale.x*d.proxy.scale.x
      : DEFAULTS.monsterHitRadius;
    const p=d.response.position;
    const y=this.aimHeight(id);
    outOrigin.set(p.x+outDir.x*radius,y,p.z+outDir.z*radius);
    return true;
  }
  /** World-space center of the visible model (for juice burst origin). */
  modelCenter(id:string,out:T.Vector3){
    const d=this.dummies.find(d=>d.root.userData.practiceTarget===id);if(!d)return null;
    d.root.updateWorldMatrix(true,true);
    new T.Box3().setFromObject(d.visual).getCenter(out);
    return out;
  }
  prepareEyeDebris(c:FeedbackSettings){for(const d of this.dummies)if(d.monster?.inflation){const warm={...c,eyeHitEnabled:1,eyeHitTetherEnabled:1,eyeHitPull:2,eyeHitPullTime:.07,eyeHitMinimumStrength:1,slimeEyesEnabled:1};const direction=new T.Vector3(0,0,-1).applyQuaternion(d.root.getWorldQuaternion(new T.Quaternion()));this.hit(d.root.userData.practiceTarget,{x:direction.x,z:direction.z},warm);d.monster.inflation.eyeHit.update(.07);this.apply(d,warm);d.root.updateWorldMatrix(true,true);this.eyeDebris.emit(d.monster.inflation.eyes,new T.Box3().setFromObject(d.visual).getCenter(new T.Vector3()),{...c,slimeEyeEjectEnabled:1});}}
  dispose(){this.eyeDebris.clear();for(const d of this.dummies){d.monster?.animation?.dispose();d.visual.traverse(o=>{if(o instanceof T.SkinnedMesh)o.skeleton.dispose();});}}
  reset(){this.eyeDebris.clear();for(const d of this.dummies){d.breath.reset();d.monster?.inflation?.eyeHit.reset();d.burst.reset();d.burstBase=undefined;d.bendSnap=null;d.bendApplied=false;d.moveCycleAge=0;d.moveWasBlocked=false;d.walkMoving=false;d.walkDeform.reset();if(d.monster?.inflation){d.monster.inflation.invalidateShape();d.monster.inflation.bendFace.position.set(0,0,0);}d.root.visible=true;const baseScale=d.proxy.scale.x/(d.monster?.inflation?.settledExtent??1);d.proxy.scale.setScalar(baseScale);Object.assign(d.response.position,d.initial);d.response.reset();d.monster?.inflation?.state.reset();if(d.monster?.inflation)d.monster.inflation.apply(DEFAULTS);d.monster?.animation?.reset();Object.assign(d.lastPosition,d.initial);d.root.position.set(d.initial.x,0,d.initial.z);d.root.quaternion.copy(d.initialRotation);d.visual.scale.setScalar(d.proxy.scale.x);d.visual.matrix.makeScale(d.proxy.scale.x,d.proxy.scale.x,d.proxy.scale.x);d.visual.matrixWorldNeedsUpdate=true;d.rim.value=0;d.root.updateWorldMatrix(true,true);}}
  snapshot(){return this.dummies.map(d=>({id:d.root.userData.practiceTarget as string,breathing:{scale:d.breath.scale,weight:d.breath.weight},burst:{phase:d.burst.phase,age:d.burst.age},model:d.root.userData.monsterModel ?? 'dummy',animation:d.monster?.animation?.snapshot(),inflation:d.monster?.inflation?.snapshot(),eyeHit:d.monster?.inflation?.eyeHit.snapshot(),aimHeight:d.monster ? d.monster.aimHeight*d.proxy.scale.y : undefined,modelScale:d.proxy.scale.x,hitRadius:d.monster ? d.monster.hitBody.scale.x*d.proxy.scale.x : undefined,position:{...d.response.position},age:Number.isFinite(d.response.age)?d.response.age:null,scale:d.visual.scale.x,rim:d.rim.value,compression:d.response.x,direction:{...d.response.direction},visualMatrix:d.visual.matrix.toArray(),blocked:d.response.blocked,bounds:{...d.response.bounds},proxyScale:d.proxy.scale.toArray(),parts:d.visual.children.length}));}
}
