import { DEFAULT_JUICE_SPEED_CURVE, sampleJuiceSpeedCurve, type JuiceSpeedPoint } from './juice-speed-curve.ts';
/** Shared lab/game green juice. World-unit size, seeded disk burst, horizontal motion. */
import * as T from 'three/webgpu';
import type { HitSettings } from './hit-feedback-config.ts';
export const JUICE_MAX=128;
export type JuiceCurveId =
  | 'linear'
  | 'easeOutQuad'
  | 'easeOutCubic'
  | 'easeOutExpo'
  | 'smoothstep'
  | 'dragHalfLife'
  | 'custom';

export const JUICE_CURVE_IDS: JuiceCurveId[] = [
  'linear',
  'easeOutQuad',
  'easeOutCubic',
  'easeOutExpo',
  'smoothstep',
  'dragHalfLife',
  'custom',
];

function easeProgress(id: JuiceCurveId, u: number, dragRel: number): number {
  const x = Math.min(1, Math.max(0, u));
  switch (id) {
    case 'custom': return 1-sampleJuiceSpeedCurve(DEFAULT_JUICE_SPEED_CURVE,x).speed;
    case 'linear': return x;
    case 'easeOutQuad': return 1 - (1 - x) * (1 - x);
    case 'easeOutCubic': return 1 - (1 - x) ** 3;
    case 'easeOutExpo': return x >= 1 ? 1 : 1 - 2 ** (-10 * x);
    case 'smoothstep': return x * x * (3 - 2 * x);
    case 'dragHalfLife': return 1 - 2 ** (-x / Math.max(0.05, dragRel));
  }
}

export function juiceRemain(id: JuiceCurveId, u: number, dragRel: number,points=DEFAULT_JUICE_SPEED_CURVE): number {
  if(id==='custom')return sampleJuiceSpeedCurve(points,u).speed;
  return 1 - easeProgress(id, u, dragRel);
}

export function juiceIntegrateRemain(id: JuiceCurveId, u: number, life: number, dragRel: number,points=DEFAULT_JUICE_SPEED_CURVE): number {
  if(id==='custom')return life*sampleJuiceSpeedCurve(points,u).integral;
  const uu = Math.min(1, Math.max(0, u));
  let integral = 0;
  switch (id) {
    case 'linear':
      integral = uu - (uu * uu) / 2;
      break;
    case 'easeOutQuad':
      integral = (1 - (1 - uu) ** 3) / 3;
      break;
    case 'easeOutCubic':
      integral = (1 - (1 - uu) ** 4) / 4;
      break;
    case 'easeOutExpo': {
      const ln2 = Math.LN2;
      integral = uu >= 1 ? 1 / (10 * ln2) : (1 - 2 ** (-10 * uu)) / (10 * ln2);
      break;
    }
    default: {
      const N = 24;
      let acc = 0;
      for (let i = 0; i < N; i++) {
        const a = (i / N) * uu;
        const b = ((i + 1) / N) * uu;
        acc += juiceRemain(id, (a + b) * 0.5, dragRel) * (b - a);
      }
      integral = acc;
      break;
    }
  }
  return life * integral;
}

export function juiceCurveFromSettings(c: HitSettings): JuiceCurveId {
  const i = Math.round(c.juiceCurve);
  return JUICE_CURVE_IDS[Math.max(0, Math.min(JUICE_CURVE_IDS.length - 1, i))] ?? 'easeOutQuad';
}

function mulberry32(a: number) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type JuiceEmitParams={count:number;speed:number;speedJitter:number;radius:number;life:number;size:number;sizeJitter:number;seed:number};
export type JuiceSpawn={ox:number;oy:number;oz:number;dirX:number;dirZ:number;speed0:number;s0:number;life:number};
export function buildJuiceSpawns(origin:T.Vector3,p:JuiceEmitParams):JuiceSpawn[]{
 const rnd=mulberry32(p.seed*9973+13),out:JuiceSpawn[]=[];
 for(let i=0;i<Math.round(p.count);i++){
  const angle=rnd()*Math.PI*2,r=Math.sqrt(rnd())*p.radius,dir=rnd()*Math.PI*2;
  const size=Math.max(.001,p.size-p.sizeJitter+rnd()*2*p.sizeJitter);
  out.push({ox:origin.x+Math.cos(angle)*r,oy:origin.y,oz:origin.z+Math.sin(angle)*r,dirX:Math.cos(dir),dirZ:Math.sin(dir),speed0:Math.max(0,p.speed-p.speedJitter+rnd()*2*p.speedJitter),s0:size,life:p.life*(.88+rnd()*.24)});
 }
 return out;
}
export const newJuiceSeed=()=>Math.floor(Math.random()*0x100000000);
export function juiceParams(c:HitSettings,seed=newJuiceSeed()):JuiceEmitParams{return {count:c.juiceCount,speed:c.juiceSpeed,speedJitter:c.juiceSpeedJitter,radius:c.juiceRadius,life:c.juiceLife,size:c.juiceSize,sizeJitter:c.juiceSizeJitter,seed};}
export function sampleJuice(p:JuiceSpawn,age:number,curve:JuiceCurveId,drag:number,points:JuiceSpeedPoint[]=DEFAULT_JUICE_SPEED_CURVE){
 const u=age/p.life,remain=juiceRemain(curve,u,drag,points),sizeRemain=juiceRemain(curve==='custom'?'easeOutCubic':curve,u,drag),travel=p.speed0*juiceIntegrateRemain(curve,u,p.life,drag,points);
 return {position:[p.ox+p.dirX*travel,p.oy,p.oz+p.dirZ*travel],size:Math.max(.01,p.s0*sizeRemain),speed:p.speed0*remain,remain};
}
type Wave={mesh:T.InstancedMesh;spawns:JuiceSpawn[];age:number;settings:HitSettings};
type Pending={id:string;remaining:number;settings:HitSettings};
/** Reusable wave pool: each hit retains its own settings; rapid hits never postpone earlier bursts. */
export class JuiceParticles{
 private waves:Wave[]=[];private pending:Pending[]=[];private dummy=new T.Object3D();emitted=0;
 private constructor(private scene:T.Scene,private texture:T.Texture){texture.colorSpace=T.SRGBColorSpace;}
 static async load(scene:T.Scene,baseUrl=import.meta.env.BASE_URL){return new JuiceParticles(scene,await new T.TextureLoader().loadAsync(`${baseUrl}juice-lab/juice.png`));}
 static createForTest(scene:T.Scene){const tex=new T.DataTexture(new Uint8Array([255,255,255,255]),1,1);tex.needsUpdate=true;return new JuiceParticles(scene,tex);}
 schedule(id:string,c:HitSettings,resolve:(id:string)=>T.Vector3|null){
  if(!c.juiceEnabled)return;
  if(c.juiceDelay<=0){const p=resolve(id);if(p)this.emit(p.clone().add(new T.Vector3(0,c.juiceHeight,0)),c);}
  else this.pending.push({id,remaining:c.juiceDelay,settings:{...c,juiceSpeedCurve:c.juiceSpeedCurve.map(p=>({...p}))}});
 }
 emit(origin:T.Vector3,c:HitSettings,age=0,seed=newJuiceSeed()){
  if(!c.juiceEnabled)return;
  let wave=this.waves.find(w=>w.spawns.every(p=>w.age>=p.life));
  if(!wave){const material=new T.MeshBasicMaterial({map:this.texture,transparent:true,depthWrite:false,side:T.DoubleSide});const mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),material,JUICE_MAX);mesh.name='Green juice burst';mesh.frustumCulled=false;mesh.renderOrder=9;mesh.count=0;this.scene.add(mesh);wave={mesh,spawns:[],age:0,settings:{...c,juiceSpeedCurve:c.juiceSpeedCurve.map(p=>({...p}))}};this.waves.push(wave);}
  wave.age=age;wave.settings={...c,juiceSpeedCurve:c.juiceSpeedCurve.map(p=>({...p}))};wave.spawns=buildJuiceSpawns(origin,juiceParams(c,seed));
  const material=wave.mesh.material as T.MeshBasicMaterial;material.color.set(c.juiceColor);material.depthTest=!!c.juiceDepthTest;
  this.emitted+=wave.spawns.length;
 }
 update(dt:number,resolve?:(id:string)=>T.Vector3|null){
  for(const w of this.waves)w.age+=dt;
  const ready:Pending[]=[];for(const p of this.pending){p.remaining-=dt;if(p.remaining<=1e-9)ready.push(p);}
  this.pending=this.pending.filter(p=>p.remaining>1e-9);
  for(const p of ready){const origin=resolve?.(p.id);if(origin)this.emit(origin.clone().add(new T.Vector3(0,p.settings.juiceHeight,0)),p.settings,Math.max(0,-p.remaining));}
 }
 prepare(camera:T.Camera,c:HitSettings){
  for(const w of this.waves){let count=0;if(c.juiceEnabled)for(const p of w.spawns){if(w.age>=p.life)continue;const sample=sampleJuice(p,w.age,juiceCurveFromSettings(w.settings),w.settings.juiceDragRel,w.settings.juiceSpeedCurve);this.dummy.position.fromArray(sample.position);this.dummy.quaternion.copy(camera.quaternion);this.dummy.scale.setScalar(sample.size);this.dummy.updateMatrix();w.mesh.setMatrixAt(count++,this.dummy.matrix);}w.mesh.count=count;w.mesh.instanceMatrix.needsUpdate=true;}
 }
 clear(){this.pending=[];for(const w of this.waves){w.spawns=[];w.mesh.count=0;}}
 snapshot(){const particles=this.waves.flatMap(w=>w.spawns.filter(p=>w.age<p.life).map(p=>({...p,age:w.age,origin:[p.ox,p.oy,p.oz],...sampleJuice(p,w.age,juiceCurveFromSettings(w.settings),w.settings.juiceDragRel,w.settings.juiceSpeedCurve)})));return {active:particles.length,capacity:this.waves.length*JUICE_MAX,emitted:this.emitted,pending:this.pending.map(p=>({id:p.id,remaining:p.remaining})),particles};}
}
