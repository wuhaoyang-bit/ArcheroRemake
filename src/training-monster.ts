import * as T from 'three/webgpu';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import { DUMMY_RADIUS } from './monster-training.ts';

/** Unscaled hit volume tall enough for horizontal bow-height arrows (~1.5). */
const MONSTER_HIT_HEIGHT = 2.4;

type State = 'Idle' | 'Run' | 'Hitted';
/** Independent source animation playback for each monster. Dead is retained, but no death rules are invented. */
export class MonsterAnimation {
  private mixer:T.AnimationMixer;
  private actions:Record<State,T.AnimationAction>;
  private state:State='Idle';
  private hitRemaining=0;
  constructor(model:T.Object3D,private clips:T.AnimationClip[]){
    this.mixer=new T.AnimationMixer(model);
    const action=(name:State)=>{
      const clip=T.AnimationClip.findByName(clips,name);if(!clip)throw new Error(`蜘蛛缺少 ${name} 动画`);
      return this.mixer.clipAction(clip);
    };
    this.actions={Idle:action('Idle'),Run:action('Run'),Hitted:action('Hitted')};
    this.actions.Hitted.setLoop(T.LoopOnce,1);this.actions.Hitted.clampWhenFinished=true;
    this.actions.Idle.play();this.mixer.update(0);
  }
  private switchTo(state:State){
    if(state===this.state)return;
    const from=this.actions[this.state],to=this.actions[state];
    to.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    from.crossFadeTo(to,.06,false);this.state=state;
  }
  hit(speed=1){
    const rate=Number.isFinite(speed)?Math.max(.25,Math.min(6,speed)):1;
    if(this.state==='Hitted')this.actions.Hitted.reset().setEffectiveWeight(1).play();
    else this.switchTo('Hitted');
    this.actions.Hitted.setEffectiveTimeScale(rate);
    this.hitRemaining=this.actions.Hitted.getClip().duration/rate;
  }
  update(dt:number,moving:boolean){
    const held=Math.min(dt,this.hitRemaining);
    if(held>0){this.mixer.update(held);this.hitRemaining=Math.max(0,this.hitRemaining-held);}
    if(this.hitRemaining===0){this.switchTo(moving?'Run':'Idle');this.mixer.update(dt-held);}
  }
  reset(){this.mixer.stopAllAction();this.state='Idle';this.hitRemaining=0;this.actions.Idle.reset().setEffectiveWeight(1).play();this.mixer.update(0);}
  /** Preview-only deterministic sampling; hold the final pose instead of looping. */
  preview(name:string,time:number){
    const clip=T.AnimationClip.findByName(this.clips,name);if(!clip)throw new Error(`缺少动画 ${name}`);
    this.mixer.stopAllAction();const action=this.mixer.clipAction(clip);
    action.reset().setLoop(T.LoopOnce,1).setEffectiveTimeScale(1).setEffectiveWeight(1).play();action.clampWhenFinished=true;
    this.mixer.setTime(Math.max(0,Math.min(time,clip.duration)));
  }
  durations(){return Object.fromEntries(this.clips.map(c=>[c.name,c.duration]));}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.mixer.getRoot());}
  snapshot(){return {state:this.state,time:this.actions[this.state].time,hitRemaining:this.hitRemaining};}
}
export type MonsterInstance={animation:MonsterAnimation;proxy:T.Group;aimHeight:number};
const instances=new WeakMap<T.Object3D,MonsterInstance>();
export const monsterInstance=(root:T.Object3D)=>instances.get(root);

export class TrainingMonsterFactory {
  static async load(){return new TrainingMonsterFactory(await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/archero-spider.glb`));}
  constructor(private gltf:Pick<GLTF,'scene'|'animations'>){}
  create(){
    const root=new T.Group();root.name='ArcheroSpider3043';
    const model=clone(this.gltf.scene);root.add(model);
    model.traverse(o=>{if(o instanceof T.Mesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();o.castShadow=o.receiveShadow=true;o.frustumCulled=false;}});
    const animation=new MonsterAnimation(model,this.gltf.animations);root.updateMatrixWorld(true);
    // Fit the existing 1.3 u collision circle with room for the confirmed squash rebound.
    const vertex=new T.Vector3();let radius=0;
    model.traverse(o=>{if(o instanceof T.Mesh)for(let i=0;i<o.geometry.attributes.position.count;i++){o.getVertexPosition(i,vertex).applyMatrix4(o.matrixWorld);radius=Math.max(radius,Math.hypot(vertex.x,vertex.z));}});
    const scale=1.12/Math.max(radius,.001);const wrapper=new T.Group();root.remove(model);wrapper.add(model);wrapper.scale.setScalar(scale);root.add(wrapper);root.updateMatrixWorld(true);
    const box=new T.Box3().setFromObject(root);wrapper.position.y-=box.min.y;root.updateMatrixWorld(true);
    // Bake the idle silhouette once: hit tests do not shrink or wobble with visual animations.
    const proxy=new T.Group();proxy.name='UnscaledHitProxy';
    model.traverse(o=>{if(!(o instanceof T.Mesh))return;const geometry=o.geometry.clone(),positions=geometry.attributes.position;
      for(let i=0;i<positions.count;i++){o.getVertexPosition(i,vertex).applyMatrix4(o.matrixWorld);positions.setXYZ(i,vertex.x,vertex.y,vertex.z);}
      geometry.computeBoundingBox();geometry.computeBoundingSphere();
      proxy.add(new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide})));
    });
    const height=new T.Box3().setFromObject(root).max.y;
    // Spider mesh is short; horizontal arrows fly at bow height (~1.5) and would miss.
    // Add a tall cylinder so the trigger covers from the ground up past bow height.
    const hitTop=Math.max(height, MONSTER_HIT_HEIGHT);
    const hitBody=new T.Mesh(
      new T.CylinderGeometry(DUMMY_RADIUS * .85, DUMMY_RADIUS * .85, hitTop, 16),
      new T.MeshBasicMaterial({side:T.DoubleSide}),
    );
    hitBody.position.y = hitTop * .5;
    proxy.add(hitBody);
    // aimHeight follows the visible mesh (for FX / lock rings), not the tall hit cylinder.
    instances.set(root,{animation,proxy,aimHeight:height*.55});root.userData.monsterModel='3043_01';
    return root;
  }
}
