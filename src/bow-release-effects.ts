import * as T from 'three/webgpu';
import { texture, uv, uniform, vec2, float } from 'three/tsl';
import { BOW_RELEASE_DEFAULTS, type BowReleaseSettings } from './bow-release-config.ts';
export async function loadBowReleaseTextures(){const loader=new T.TextureLoader();return Promise.all([loader.loadAsync(`${import.meta.env.BASE_URL}textures/bow-release/ring_a_streaks.png`),loader.loadAsync(`${import.meta.env.BASE_URL}textures/bow-release/cone_e.png`)]);}
/** Shared world-space geometry, masks and absolute-time animation for lab and game. */
export class BowReleaseVisual {
 readonly root=new T.Group();
 readonly ring:T.Mesh;
 readonly spikes:T.Group[];
 private ringFade;private spikeFade;private gain;private width;
 constructor(ringTex:T.Texture,spikeTex:T.Texture){
 const fx=this.root;
 const ringFade=uniform(1),gain=uniform(BOW_RELEASE_DEFAULTS.gain),width=uniform(BOW_RELEASE_DEFAULTS.thickness);
 const xy=uv().sub(.5),r=xy.length().max(.0001),sampleR=r.sub(.35).div(width).add(.35).max(0);
 const ringMat=new T.MeshBasicNodeMaterial({color:0xffffff,transparent:true,depthWrite:false,side:T.DoubleSide});
 ringMat.opacityNode=texture(ringTex,xy.div(r).mul(sampleR).add(.5)).r.mul(gain).clamp(0,1).mul(ringFade);
 const ring=new T.Mesh(new T.PlaneGeometry(2/.7,2/.7),ringMat);fx.add(ring);
 const spikeFade=uniform(1);const spikeMat=new T.MeshBasicNodeMaterial({color:0xffffff,transparent:true,depthWrite:false,side:T.DoubleSide});
 // Put the source triangle's bright point at the outward tip; use its grayscale as opacity.
 spikeMat.opacityNode=texture(spikeTex,vec2(uv().x,float(1).sub(uv().y))).r.mul(gain).clamp(0,1).mul(spikeFade);
 // Crossed world-space ribbons retain visibility around the axis without billboarding.
 const spikeGeometry=new T.PlaneGeometry(1,1);
 const spikes=Array.from({length:12},()=>{const group=new T.Group();for(const rotation of [0,Math.PI/2]){const ribbon=new T.Mesh(spikeGeometry,spikeMat);ribbon.rotation.y=rotation;group.add(ribbon)}fx.add(group);return group});

 this.ring=ring;this.spikes=spikes;this.ringFade=ringFade;this.spikeFade=spikeFade;this.gain=gain;this.width=width;
 }
 place(origin:T.Vector3,direction:T.Vector3,p:BowReleaseSettings=BOW_RELEASE_DEFAULTS){
  this.root.position.copy(origin).addScaledVector(direction,p.forward);this.root.position.y+=p.height;
  this.root.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),direction);
 }
 sample(elapsed:number,p:BowReleaseSettings=BOW_RELEASE_DEFAULTS,showRing=true,showSpikes=true,ringCurve: 'linear' | 'outCubic'='outCubic'){
  const {ring,spikes,ringFade,spikeFade,gain,width}=this;
  const age=elapsed-p.delay,u=T.MathUtils.clamp(age/p.ringLife,0,1),v=T.MathUtils.clamp(age/p.spikeLife,0,1);
  ring.visible=showRing&&age>=0&&age<p.ringLife;ring.rotation.set(0,0,.25*u);ring.scale.setScalar(p.radius+p.expand*(ringCurve==='linear'?u:1-(1-u)**3));ringFade.value=(1-u)**1.4;width.value=Math.max(.1,p.thickness*(1-.65*u));gain.value=p.gain;
  spikeFade.value=p.spikeOpacity*(1-v)**1.2;
  spikes.forEach((m,i)=>{
   m.visible=showSpikes&&age>=0&&age<p.spikeLife&&i<p.spikeCount;
   const angle=i/p.spikeCount*Math.PI*2,radial=new T.Vector3(Math.cos(angle),Math.sin(angle),0),tilt=T.MathUtils.degToRad(p.outwardAngle);
   const dir=radial.clone().multiplyScalar(Math.sin(tilt)).add(new T.Vector3(0,0,-Math.cos(tilt)));
   // Grow from exact A to B linearly; keep the base fixed while the tip extends.
   const growth=p.spikeGrowTime<=0?1:T.MathUtils.clamp(age/p.spikeGrowTime,0,1);
   const len=T.MathUtils.lerp(p.spikeStartLength,p.spikeLength,growth);
   m.scale.set(p.spikeWidth,len,p.spikeWidth);
   // Local Y points towards the rearward/outward tip; tangent X runs around the arrow axis.
   const tangent=new T.Vector3(-Math.sin(angle),Math.cos(angle),0);
   m.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(tangent,dir,tangent.clone().cross(dir)));
   m.position.copy(radial).multiplyScalar(p.spikeRadius).addScaledVector(dir,len*.5);
  });
 }
 snapshot(){return {position:this.root.position.toArray(),normal:new T.Vector3(0,0,1).applyQuaternion(this.root.quaternion).toArray(),ringVisible:this.ring.visible,ringScale:this.ring.scale.x,ringRotation:this.ring.rotation.z,ringFade:this.ringFade.value,spikeFade:this.spikeFade.value,width:this.width.value,gain:this.gain.value,spikes:this.spikes.filter(m=>m.visible).map(m=>({position:m.position.toArray(),scale:m.scale.toArray(),rotation:m.quaternion.toArray()}))};}
}
/** Independent pooled bursts: rapid / multi-arrow shots never restart an existing burst. */
export class BowReleaseEffects {
 private pool:{visual:BowReleaseVisual;age:number;active:boolean}[]=[];
 private emitted=0;
 constructor(private scene:T.Scene,private textures:[T.Texture,T.Texture]){}
 static async load(scene:T.Scene){return new BowReleaseEffects(scene,await loadBowReleaseTextures());}
 emit(origin:T.Vector3,direction:T.Vector3,elapsed=0){
  let entry=this.pool.find(e=>!e.active);
  if(!entry){entry={visual:new BowReleaseVisual(...this.textures),age:0,active:false};this.pool.push(entry);this.scene.add(entry.visual.root);}
  entry.age=Math.max(0,elapsed);entry.active=true;entry.visual.root.visible=true;entry.visual.place(origin,direction);entry.visual.sample(entry.age);this.emitted++;
 }
 update(dt:number){for(const e of this.pool){if(!e.active)continue;e.age+=dt;if(e.age>=BOW_RELEASE_DEFAULTS.delay+Math.max(BOW_RELEASE_DEFAULTS.ringLife,BOW_RELEASE_DEFAULTS.spikeLife)){e.active=false;e.visual.root.visible=false;}else e.visual.sample(e.age);}}
 clear(){for(const e of this.pool){e.active=false;e.visual.root.visible=false;}}
 snapshot(){return {emitted:this.emitted,allocated:this.pool.length,defaults:{...BOW_RELEASE_DEFAULTS},active:this.pool.filter(e=>e.active).map(e=>({age:e.age,...e.visual.snapshot()}))};}
}
