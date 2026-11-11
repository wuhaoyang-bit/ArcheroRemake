import * as T from 'three/webgpu';
import {pass,uniform,uv,vec2,float} from 'three/tsl';
import {DESIGN_WIDTH} from './config.ts';
import {MAX_SHOCKWAVES,ShockwaveState,sampleShockwave} from './burst-shockwave-state.ts';
import type {ShockwaveSettings} from './burst-shockwave-config.ts';

/** Refract the completed scene in a bounded radial band; HUD remains outside this render pass. */
export class BurstShockwaveEffects {
  readonly state=new ShockwaveState();
  private scenePass;
  private pipeline:T.RenderPipeline;
  private size=uniform(new T.Vector2(DESIGN_WIDTH,DESIGN_WIDTH));
  private bands=Array.from({length:MAX_SHOCKWAVES},()=>uniform(new T.Vector4(0,0,0,1)));
  private strengths=Array.from({length:MAX_SHOCKWAVES},()=>uniform(0));
  private screen=new T.Vector2();private center=new T.Vector3();private edge=new T.Vector3();private right=new T.Vector3();private view=new T.Vector3();
  private projected:{x:number;y:number;radius:number;width:number;strength:number}[]=[];
  constructor(private renderer:T.WebGPURenderer,private scene:T.Scene,private camera:T.Camera){
    this.scenePass=pass(scene,camera);
    const screenUv=uv();let offset=vec2(0).add(0);
    for(let i=0;i<MAX_SHOCKWAVES;i++){
      const band=this.bands[i],delta=screenUv.sub(band.xy).mul(this.size),distance=delta.length();
      const q=distance.sub(band.z).div(band.w.max(.001)).clamp(-1,1);
      // Bipolar compact wave: one side compresses, the other expands, with smooth zero edges.
      const profile=q.mul(float(1).sub(q.abs()).pow(2)).mul(6.75);
      offset=offset.add(delta.div(distance.max(.001)).mul(profile).mul(this.strengths[i]));
    }
    // Bound overlapping ripples without allocating additional passes or buffers per explosion.
    const limited=offset.mul(float(24).div(offset.length().max(24)));
    const distortedUv=screenUv.sub(limited.div(this.size)).clamp(vec2(0),vec2(1));
    this.pipeline=new T.RenderPipeline(renderer,this.scenePass.getTextureNode().sample(distortedUv));
  }
  emit(center:T.Vector3,c:ShockwaveSettings){this.state.emit(center,c);}
  update(dt:number,c:ShockwaveSettings){this.state.update(dt,c);}
  clear(){this.state.clear();this.projected=[];}
  render(c:ShockwaveSettings,_forcePass=false){
    this.state.update(0,c);this.renderer.getSize(this.screen);
    const height=DESIGN_WIDTH*this.screen.y/Math.max(1,this.screen.x);this.size.value.set(DESIGN_WIDTH,height);
    this.camera.updateMatrixWorld();this.right.set(1,0,0).applyQuaternion(this.camera.quaternion);this.projected=[];
    for(let i=0;i<MAX_SHOCKWAVES;i++){
      this.strengths[i].value=0;const wave=this.state.waves[i];if(!wave)continue;
      this.center.copy(wave.center);this.view.copy(this.center).applyMatrix4(this.camera.matrixWorldInverse);
      if(this.view.z>=0)continue;
      this.edge.copy(this.center).add(this.right).project(this.camera);this.center.project(this.camera);
      const pixelsPerUnit=Math.abs(this.edge.x-this.center.x)*DESIGN_WIDTH/2;
      const sample=sampleShockwave(wave.age,wave.config,wave.area);
      // QuadMesh UVs have their origin at the top left.
      const x=(this.center.x+1)/2,y=(1-this.center.y)/2,radius=sample.radius*pixelsPerUnit,width=wave.config.burstShockwaveWidth*pixelsPerUnit;
      this.bands[i].value.set(x,y,radius,width/2);this.strengths[i].value=sample.strength;
      this.projected.push({x,y,radius,width,strength:sample.strength});
    }
    // Keep one output path even at zero ripple strength. Switching between the
    // canvas and HDR pass also switches transmission framebuffer formats and
    // material contexts at the exact explosion boundary. A zero-offset pass is
    // visually neutral and avoids that intermittent render-state transition.
    this.pipeline.render();
  }
  // Render under the loading overlay: compiling this pass in isolation can allocate
  // transmission framebuffer textures in the canvas format before the HDR pass is active.
  warmup(c:ShockwaveSettings){this.render(c,true);}
  snapshot(){return {waves:this.state.snapshot(),screen:this.projected.map(w=>({...w}))};}
  dispose(){this.clear();this.pipeline.dispose();this.scenePass.dispose();}
}
