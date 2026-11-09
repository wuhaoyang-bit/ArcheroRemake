import * as T from 'three/webgpu';
import type {Settings} from './config.ts';
import {HitResponse} from './hit-response.ts';
import {SlimeBurstState} from './slime-burst-state.ts';
import {SlimeInflationState} from './slime-inflation-state.ts';
import {TrainingFeedback} from './training-feedback.ts';
import {monsterInstance} from './training-monster.ts';
import {BurstShockwaveEffects} from './burst-shockwave.ts';
import {LushBurstEffects} from './lush-burst-effects.ts';
import {CameraShakeFeedback} from './camera-shake.ts';
import {SlimeBurstDeathSfx,SlimeBurstWindupSfx} from './sfx.ts';
import {SlimeChunkFlight} from './slime-burst-chunk-flight.ts';
import {type ChunkMode,type ChunkPiece,disposeChunks,fractureByPlanes,fractureByVoronoi} from './slime-burst-chunks.ts';
import {reapplyChunkFaceBulges,type FaceBulgeDocument} from './slime-burst-face-bulge.ts';
import {buildChunkSoftbodyModel} from './slime-burst-centroid-fan.ts';

export const PLAYBACK_STEP=1/120;

export type PosePlaybackHooks={
  onChunkInfo?:(text:string)=>void;
  onMessage?:(text:string)=>void;
  onPhase?:(phase:string,detail:string)=>void;
  /** Optional softbody attach after hard-shell emit. */
  onSoftChunks?:(pieces:ChunkPiece[],center:T.Vector3)=>void|Promise<void>;
  /** Sync softbody world poses after kinematic flight (airborne). */
  onSoftSync?:(positions:T.Vector3[],grounded:boolean[])=>void;
  onSoftUpdate?:(dt:number,elapsed:number)=>void|Promise<void>;
};

/** Lab-style windup→burst timeline for pose-preview only (does not touch scene.ts). */
export class SlimeBurstPosePlayback{
  readonly chunkFlight=new SlimeChunkFlight();
  readonly cameraShake=new CameraShakeFeedback();
  readonly windupSfx=new SlimeBurstWindupSfx();
  readonly deathSfx=new SlimeBurstDeathSfx();
  frame=0;
  total=720;
  windFrame=0;
  burstFrame=0;
  playing=false;
  private accumulator=0;
  private last=0;
  private seekMode=false;
  private burstFired=false;
  private event:{center:T.Vector3;feet:T.Vector3;color?:T.Color;frame:number}|undefined;
  private seed=1;
  pieces:ChunkPiece[]=[];
  softbodyEnabled=true;
  showTetWire=false;
  private softDispose:(()=>void)|null=null;
  private camera:T.Camera|null=null;
  private elapsed=0;

  constructor(
    private feedback:TrainingFeedback,
    private effects:LushBurstEffects,
    private shockwave:BurstShockwaveEffects,
    private root:T.Object3D,
    private chunkRoot:T.Group,
    private getSettings:()=>Settings,
    private getChunkMode:()=>ChunkMode,
    private getFaceDoc:()=>FaceBulgeDocument,
    private getCutSeed:()=>number,
    private hooks:PosePlaybackHooks={},
  ){
    this.windupSfx.preload();
    this.deathSfx.preload();
    this.windupSfx.bindUnlock(document);
    this.deathSfx.bindUnlock(document);
    this.feedback.onWindup=()=>{
      try{this.windupSfx.play(this.getSettings());}catch{/* AudioContext locked */}
    };
    this.feedback.onBurst=(center,feet,burstCfg,color)=>{
      const c=this.getSettings();
      const t0=performance.now();
      try{this.windupSfx.stop();}catch{/* */}
      try{this.deathSfx.play(c);}catch{/* */}
      this.cameraShake.trigger(c);
      this.shockwave.emit(center,c);
      const tShock=performance.now();
      this.event={center:center.clone(),feet:feet.clone(),color:color?.clone(),frame:this.frame};
      if(!this.seekMode)this.effects.emit(center,feet,c,this.random(),color);
      const tLush=performance.now();
      this.burstFired=true;
      // Defer fracture/chunks to next frame so Lush+shockwave paint first (avoids stacked hitch).
      requestAnimationFrame(()=>{
        const tChunk=performance.now();
        void this.spawnFlyingChunks(center).then(()=>{
          console.info(`[perf] burst sfx+shock ${(tShock-t0)|0}ms · lush ${(tLush-tShock)|0}ms · chunks+soft ${((performance.now()-tChunk)|0)}ms`);
        });
      });
    };
  }

  private random(){
    let n=this.seed|0;
    return ()=>{n=(Math.imul(n,1664525)+1013904223)|0;return (n>>>0)/4294967296;};
  }

  setSeed(seed:number){this.seed=seed|0;}
  setCamera(camera:T.Camera){this.camera=camera;}

  private prefill(c:Settings){
    const state=monsterInstance(this.root)?.inflation?.state;
    if(!state)return;
    state.amount=Math.max(0,c.slimeCapacity-c.slimeInjectionAmount);
    state.colorFill=state.target=state.visual=state.amount/c.slimeCapacity;
  }

  clearChunks(){
    this.chunkFlight.clear();
    this.softDispose?.();
    this.softDispose=null;
    disposeChunks(this.pieces);
    this.pieces=[];
    this.chunkRoot.clear();
  }

  private async spawnFlyingChunks(center:T.Vector3){
    const c=this.getSettings();
    const inflation=monsterInstance(this.root)?.inflation;
    if(!inflation)return;
    this.clearChunks();
    // Root already hidden by TrainingFeedback; body still holds burst pose.
    this.root.visible=true;
    this.root.updateWorldMatrix(true,true);
    const body=inflation.body as unknown as import('three').Mesh;
    const seed=this.getCutSeed();
    // Playback always uses plane cuts: Voronoi at burst freezes the main thread (~0.5s+).
    // Soft path keeps 2 shards; hard path 4 (still cheaper than Voronoi×6).
    const mode:ChunkMode='plane';
    const shardCount=this.softbodyEnabled?2:4;
    try{
      const tCut=performance.now();
      const made=fractureByPlanes(body,shardCount,seed);
      console.info(`[perf] fractureByPlanes×${shardCount} ${((performance.now()-tCut)|0)}ms`);
      this.pieces=made;
      const faceDoc=this.getFaceDoc();
      if(faceDoc.cutMode===mode&&faceDoc.cutSeed===seed){
        for(const p of this.pieces){
          const idx=p.mesh.userData.chunkIndex as number;
          reapplyChunkFaceBulges(p.mesh,idx,faceDoc);
        }
      }
      for(const p of this.pieces)this.chunkRoot.add(p.mesh);
      this.root.visible=false;
      this.chunkFlight.emit(this.pieces.map(p=>p.mesh),center,this.chunkRoot,c);
      this.hooks.onChunkInfo?.(`播放爆开 · ${this.pieces.length} 块 · ${mode} · 种子 ${seed}`);
      if(this.softbodyEnabled){
        try{await this.hooks.onSoftChunks?.(this.pieces,center);}catch(e){console.warn('softbody attach skipped',e);}
      }
    }catch(e){
      console.error(e);
      this.root.visible=false;
      this.hooks.onMessage?.(`爆点切块失败：${e}`);
    }
  }

  measure(){
    const c=this.getSettings();
    const state=new SlimeInflationState();
    state.amount=Math.max(0,c.slimeCapacity-c.slimeInjectionAmount);
    state.colorFill=state.target=state.visual=state.amount/c.slimeCapacity;
    state.hit(c);
    const hit=new HitResponse({x:0,z:0},{x:12,z:12});
    hit.hit({x:0,z:-1},c);
    hit.update(0,c);
    const burst=new SlimeBurstState();
    const canBurst=state.amount>=c.slimeCapacity&&burst.fill(c);
    let ticks=0;
    this.windFrame=this.burstFrame=0;
    while(ticks<120*3600){
      ticks++;
      hit.update(PLAYBACK_STEP,c);
      state.update(PLAYBACK_STEP,c);
      const complete=hit.complete(c)&&!Number.isFinite(state.age);
      burst.update(PLAYBACK_STEP,complete,Math.max(hit.remaining(c),state.remaining));
      if(!this.windFrame&&burst.phase==='winding')this.windFrame=ticks;
      if(burst.phase==='gone'){this.burstFrame=ticks;break;}
      if(!canBurst&&complete)break;
    }
    this.total=(this.burstFrame||ticks)+Math.round(4*120);
    return {canBurst,windFrame:this.windFrame,burstFrame:this.burstFrame,total:this.total};
  }

  resetSim(){
    const c=this.getSettings();
    this.shockwave.clear();
    this.effects.clear();
    this.feedback.reset();
    this.feedback.eyeDebris.clear();
    this.cameraShake.reset();
    try{this.windupSfx.stop();this.deathSfx.stop();}catch{/* */}
    this.clearChunks();
    this.prefill(c);
    this.frame=0;
    this.event=undefined;
    this.burstFired=false;
    this.root.visible=true;
    this.feedback.hit('preview',{x:0,z:-1},c);
    this.feedback.refresh(c);
  }

  private syncSoft(){
    const snap=this.chunkFlight.snapshot();
    if(!snap.length)return;
    const positions=snap.map(s=>new T.Vector3(s.position[0],s.position[1],s.position[2]));
    const grounded=snap.map(s=>s.grounded);
    this.hooks.onSoftSync?.(positions,grounded);
  }

  private advance(){
    const c=this.getSettings();
    this.frame++;
    this.elapsed+=PLAYBACK_STEP;
    this.shockwave.update(PLAYBACK_STEP,c);
    this.feedback.update(PLAYBACK_STEP,c);
    // Lush + FEM are display-rate only (see tick). Calling them every 1/120 sim step
    // freezes Chrome when seek/catch-up runs dozens of advances in one rAF.
    this.chunkFlight.update(PLAYBACK_STEP);
    this.cameraShake.update(PLAYBACK_STEP,c);
  }

  seek(to:number,camera?:T.Camera){
    if(camera)this.camera=camera;
    const cam=this.camera;
    if(!cam)return;
    to=Math.max(0,Math.min(this.total,Math.round(to)));
    this.seekMode=true;
    this.playing=false;
    this.accumulator=0;
    this.elapsed=0;
    this.resetSim();
    while(this.frame<to)this.advance();
    this.seekMode=false;
    const c=this.getSettings();
    if(this.event){
      this.effects.update((this.event.frame-1)*PLAYBACK_STEP,c,24,24,cam);
      this.effects.emit(this.event.center,this.event.feet,c,this.random(),this.event.color);
      this.effects.update((this.frame-this.event.frame+1)*PLAYBACK_STEP,c,24,24,cam);
    }else{
      this.effects.update(this.frame*PLAYBACK_STEP,c,24,24,cam);
    }
    this.updateReadout();
    this.shockwave.render(c);
  }

  /** Jump to windup start and play. */
  playFromWindup(camera?:T.Camera){
    if(camera)this.camera=camera;
    this.measure();
    const start=this.windFrame||0;
    this.seek(start,this.camera??undefined);
    this.playing=true;
    this.last=0;
    this.hooks.onMessage?.('从蓄力开始播放');
  }

  stop(){this.playing=false;this.accumulator=0;}

  togglePlay(camera?:T.Camera){
    if(camera)this.camera=camera;
    if(this.playing){this.stop();return false;}
    if(this.frame>=this.total||this.frame<(this.windFrame||0)){
      this.playFromWindup(this.camera??undefined);
      return true;
    }
    this.playing=true;
    this.last=0;
    return true;
  }

  tick(now:number,speed:number,camera:T.Camera,loop:boolean){
    this.camera=camera;
    const c=this.getSettings();
    const dt=this.last?Math.min(.1,(now-this.last)/1000):0;
    this.last=now;
    if(this.playing){
      this.accumulator+=dt*speed;
      while(this.accumulator>=PLAYBACK_STEP&&this.frame<this.total){
        this.advance();
        this.accumulator-=PLAYBACK_STEP;
      }
      if(this.frame>=this.total){
        if(loop)this.playFromWindup(camera);
        else this.stop();
      }
      this.updateReadout();
      // One soft sync/update per display frame (not per 120Hz sim step).
      this.syncSoft();
      if(dt>0)void this.hooks.onSoftUpdate?.(dt,this.elapsed);
    }else if(dt>0&&this.pieces.length){
      this.chunkFlight.update(dt);
      this.syncSoft();
      this.elapsed+=dt;
      void this.hooks.onSoftUpdate?.(dt,this.elapsed);
      this.cameraShake.update(dt,c);
    }
    this.effects.update(Math.min(dt||PLAYBACK_STEP,.05),c,24,24,camera);
    this.shockwave.render(c);
  }

  updateReadout(){
    const snap=this.feedback.snapshot()[0];
    const phase=snap?.burst.phase??'alive';
    const names:Record<string,string>={
      alive:'待机',
      feedback:'最后一箭反馈',
      winding:'蓄爆中',
      gone:'已爆开',
    };
    const detail=snap
      ?`缩放 ${snap.scale.toFixed(3)}× · 帧 ${this.frame}/${this.total}`
      :`帧 ${this.frame}/${this.total}`;
    this.hooks.onPhase?.(names[phase]??phase,detail);
  }

  shakeOffset(){return this.cameraShake.offset();}

  /** Build softbody models for current pieces (caller attaches FEM). */
  buildSoftModels(){
    return this.pieces.map(p=>buildChunkSoftbodyModel(p.mesh.geometry));
  }

  dispose(){
    this.stop();
    this.clearChunks();
    try{this.windupSfx.dispose();this.deathSfx.dispose();}catch{/* */}
  }
}
