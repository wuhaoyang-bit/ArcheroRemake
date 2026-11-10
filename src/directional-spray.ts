/** Two independent, unlit billboard spray layers: focused jet and broad horizontal fan. */
import * as T from 'three/webgpu';
import {
  JUICE_CURVE_IDS,
  juiceCurveFromSettings,
  juiceIntegrateRemain,
  juiceRemain,
  type JuiceCurveId,
} from './juice-particles.ts';
import { DEFAULT_JUICE_SPEED_CURVE, type JuiceSpeedPoint } from './juice-speed-curve.ts';
import type { HitSettings } from './hit-feedback-config.ts';

// Retain persisted mode IDs: blood=fan, arterial=jet, quarks=both.
export type SprayMode = 'blood' | 'arterial' | 'quarks';
export const SPRAY_MODE_IDS: SprayMode[] = ['blood', 'arterial', 'quarks'];

export function sprayModeFromSettings(c: Pick<HitSettings, 'sprayMode'>): SprayMode {
  const i = Math.round(c.sprayMode);
  return SPRAY_MODE_IDS[Math.max(0, Math.min(SPRAY_MODE_IDS.length - 1, i))] ?? 'blood';
}

export function sprayParamsFromSettings(c: HitSettings): SprayEmitParams {
  return {
    count: c.sprayCount,
    speed: c.spraySpeed,
    speedJitter: c.spraySpeedJitter,
    size: c.spraySize,
    sizeJitter: c.spraySizeJitter,
    life: c.sprayLife,
    lifeJitter: c.sprayLifeJitter,
    spreadDeg: c.spraySpreadDeg,
    radius: c.sprayRadius,
  };
}

export function sprayCurveFromSettings(c: Pick<HitSettings, 'sprayCurve'>): JuiceCurveId {
  const i = Math.round(c.sprayCurve);
  return JUICE_CURVE_IDS[Math.max(0, Math.min(JUICE_CURVE_IDS.length - 1, i))] ?? 'easeOutCubic';
}

/** Tunables for directional spray (lab / future game wiring). */
export type SprayEmitParams = {
  count: number;
  speed: number;
  speedJitter: number;
  size: number;
  sizeJitter: number;
  life: number;
  lifeJitter: number;
  /** Cone half-angle in degrees (Blood/Arterial); quarks max cone angle. */
  spreadDeg: number;
  /** Quarks disk spawn radius (world units). */
  radius: number;
};

/** Mode baselines matching the extracted Blood / Arterial / quarks ranges. */
export const SPRAY_MODE_PRESETS: Record<SprayMode, SprayEmitParams> = {
  blood: {
    count: 12, speed: 3.5, speedJitter: 1.5,
    size: 0.37, sizeJitter: 0.09, life: 1.3, lifeJitter: 0.2,
    spreadDeg: 60, radius: 0.1,
  },
  arterial: {
    count: 12, speed: 6.9, speedJitter: 1.4,
    size: 0.27, sizeJitter: 0.07, life: 0.88, lifeJitter: 0.18,
    spreadDeg: 15, radius: 0.1,
  },
  quarks: {
    count: 12, speed: 5.5, speedJitter: 0,
    size: 0.28, sizeJitter: 0.06, life: 1.15, lifeJitter: 0.15,
    spreadDeg: 30, radius: 0.1,
  },
};

/** Lab / preview defaults (refresh baseline). */
export const DEFAULT_SPRAY_PARAMS: SprayEmitParams = {
  count: 16,
  speed: 7.6,
  speedJitter: 1.5,
  size: 0.67,
  sizeJitter: 0.15,
  life: 1.3,
  lifeJitter: 0.2,
  spreadDeg: 45,
  radius: 0.3,
};

function randAround(base: number, jitter: number) {
  return Math.max(0, base - jitter + Math.random() * 2 * jitter);
}

type Particle = {
  /** Follow-shifted spawn origin (oy = spawn height). */
  ox: number; oy: number; oz: number;
  /** Unit horizontal direction (XZ). Curve integrates along this only. */
  dirHX: number; dirHZ: number;
  /** Initial horizontal speed (u/s). */
  speedH0: number;
  /** Initial / live vertical velocity (u/s). Flat mode keeps 0. */
  vy0: number;
  vy: number;
  /** Live Y when gravity is on; flat mode stays at oy. */
  cy: number;
  life: number;
  age: number;
  size0: number;
  mode: SprayMode;
};

const MAX = 128;
/** Default downward gravity (u/s²), matching earlier Arterial spray. */
export const DEFAULT_SPRAY_GRAVITY = -9.8;

function normalize(v: T.Vector3) {
  const L = v.length() || 1;
  return v.multiplyScalar(1 / L);
}

const WORLD_UP = new T.Vector3(0, 1, 0);

/**
 * Orthonormal frame for a spray cone around `dir` (slime back-face outward).
 * axisZ = cone axis; axisX = right; axisY ≈ world-up projected orthogonal to axisZ.
 * Check: dir=(0,0,-1) → axisX=(1,0,0), axisY=(0,1,0); dir=(-1,0,0) → axisX=(0,0,-1).
 * Never rotate around fixed world Z — that made Blood ignore slime yaw.
 */
function coneBasis(dir: T.Vector3, flat: boolean) {
  const axisZ = dir.clone();
  if (flat) axisZ.y = 0;
  normalize(axisZ);
  // forward × up = right
  const axisX = new T.Vector3().crossVectors(axisZ, WORLD_UP);
  if (axisX.lengthSq() < 1e-8) axisX.set(1, 0, 0);
  else normalize(axisX);
  const axisY = new T.Vector3().crossVectors(axisX, axisZ);
  normalize(axisY);
  return { axisX, axisY, axisZ };
}

function pushParticle(
  out: Particle[],
  origin: T.Vector3,
  dir: T.Vector3,
  speed: number,
  life: number,
  size0: number,
  mode: SprayMode,
  flat: boolean,
) {
  const L = dir.length() || 1;
  const dx = dir.x / L;
  const dy = dir.y / L;
  const dz = dir.z / L;
  const hLen = Math.hypot(dx, dz);
  // Flat: full speed on XZ. Non-flat: curve only on horizontal component of 3D velocity.
  const speedH0 = flat ? speed : speed * hLen;
  const dirHX = hLen > 1e-8 ? dx / hLen : 0;
  const dirHZ = hLen > 1e-8 ? dz / hLen : 0;
  const vy0 = flat ? 0 : speed * dy;
  out.push({
    ox: origin.x, oy: origin.y, oz: origin.z,
    dirHX, dirHZ, speedH0,
    vy0, vy: vy0, cy: origin.y,
    life, age: 0, size0, mode,
  });
}

/** Unit direction inside a cone around axisZ (local spherical). */
function coneDir(
  axisX: T.Vector3,
  axisY: T.Vector3,
  axisZ: T.Vector3,
  phi: number,
  theta: number,
  out: T.Vector3,
) {
  const s = Math.sin(phi);
  return out
    .set(0, 0, 0)
    .addScaledVector(axisX, s * Math.cos(theta))
    .addScaledVector(axisY, s * Math.sin(theta))
    .addScaledVector(axisZ, Math.cos(phi));
}

/** Stratified fan angles avoid evenly spaced spokes; jet leaders are larger and faster. */
export function spawnJellySpray(origin:T.Vector3,dir:T.Vector3,p:SprayEmitParams,flat:boolean,jet:boolean):Particle[]{
  const {axisX,axisY,axisZ}=coneBasis(dir,flat);
  const out:Particle[]=[],d=new T.Vector3();
  const n=Math.min(MAX,Math.max(0,Math.round(p.count)));
  const spread=Math.min(85,Math.max(0,p.spreadDeg))*Math.PI/180;
  for(let i=0;i<n;i++){
    const leader=jet&&i<Math.max(1,Math.round(n*.25));
    if(jet){
      coneDir(axisX,axisY,axisZ,Math.random()*spread*(leader?.3:1),Math.random()*Math.PI*2,d);
    }else{
      const yaw=((i+Math.random())/n*2-1)*spread;
      d.copy(axisZ).multiplyScalar(Math.cos(yaw)).addScaledVector(axisX,Math.sin(yaw));
      if(!flat)d.addScaledVector(axisY,(Math.random()-.35)*Math.sin(spread)*.3);
    }
    if(flat)d.y=0;normalize(d);
    const at=origin.clone().addScaledVector(axisX,(Math.random()-.5)*p.radius*(jet?.25:1));
    pushParticle(out,at,d,randAround(p.speed,p.speedJitter)*(leader?1.2:jet?.8:.65+Math.random()*.35),
      Math.max(.05,randAround(p.life,p.lifeJitter)),
      Math.max(.02,randAround(p.size,p.sizeJitter)*(leader?1:jet?.45+Math.random()*.25:.45+Math.random()*.45)),
      jet?'arterial':'blood',flat);
  }
  return out;
}

export function sprayModeColor(mode:SprayMode,debug=false){
  return debug?(mode==='arterial'?0x16cfff:0xff6338):0xffd34d;
}

type Wave = {
  mesh: T.InstancedMesh;
  particles: Particle[];
  color: number;
  mode: SprayMode;
  followLast?: T.Vector3;
  curve: JuiceCurveId;
  dragRel: number;
  speedCurve: JuiceSpeedPoint[];
  gravity: number;
  flat: boolean;
};

type Pending = {
  front?: boolean;
  id: string;
  remaining: number;
  settings: HitSettings;
};

/** Fills back-face origin (aimHeight) and outward normal; return false if target gone. */
export type SprayAnchorResolve = (id: string, outOrigin: T.Vector3, outDir: T.Vector3) => boolean;

function sampleSpray(
  p: Particle,
  curve: JuiceCurveId,
  dragRel: number,
  points: JuiceSpeedPoint[],
  flat: boolean,
) {
  const u = p.age / p.life;
  const remain = juiceRemain(curve, u, dragRel, points);
  const sizeCurve: JuiceCurveId = curve === 'custom' ? 'easeOutCubic' : curve;
  const sizeRemain = juiceRemain(sizeCurve, u, dragRel);
  // Curve drives horizontal travel only (same as JuiceParticles XZ).
  const travelH = p.speedH0 * juiceIntegrateRemain(curve, u, p.life, dragRel, points);
  return {
    x: p.ox + p.dirHX * travelH,
    y: flat ? p.oy : p.cy,
    z: p.oz + p.dirHZ * travelH,
    size: Math.max(0.02, p.size0 * sizeRemain),
    speedH: p.speedH0 * remain,
    remain,
  };
}

/** Extra directional spray layered on top of radial JuiceParticles. */
export class DirectionalSpray {
  private waves: Wave[] = [];
  private pending: Pending[] = [];
  private dummy = new T.Object3D();
  private followScratch = new T.Vector3();
  private originScratch = new T.Vector3();
  private dirScratch = new T.Vector3();
  private geometry=new T.PlaneGeometry(1,1);
  private jetShare=.4;
  private jetSpeedScale=1;
  private fanSpeedScale=1;
  private jetSizeScale=1;
  private fanSizeScale=1;
  jetSpread=12;
  fanSpread=55;
  /** Last emit anchor for debug snapshots. */
  lastEmit: { origin: [number, number, number]; dir: [number, number, number] } | null = null;
  mode: SprayMode = 'blood';
  flatXZ = false;
  enabled = true;
  params: SprayEmitParams = { ...DEFAULT_SPRAY_PARAMS };
  /**
   * Vertical gravity (u/s²). Applied only when flatXZ is off.
   * Negative = downward. Lab-adjustable; default −9.8.
   */
  gravity = DEFAULT_SPRAY_GRAVITY;
  /** Horizontal speed curve — same helpers as JuiceParticles; independently tunable. */
  curve: JuiceCurveId = 'easeOutCubic';
  dragRel = 0.55;
  speedCurve: JuiceSpeedPoint[] = DEFAULT_JUICE_SPEED_CURVE.map((p) => ({ ...p }));
  /** Shift active particles with the slime each frame (preview on; game default off). */
  follow = false;
  resolveFollow?: (out: T.Vector3) => T.Vector3 | null;
  /** Cyan jet / orange fan in direction debug mode. */
  debugDir = false;

  setDebugDir(on: boolean) {
    this.debugDir = on;
    this.refreshWaveColors();
  }

  get count() { return this.params.count; }
  set count(n: number) { this.params.count = n; }

  constructor(private scene:T.Scene,private texture:T.Texture=new T.Texture()) {
    this.texture.colorSpace=T.SRGBColorSpace;
  }

  static async load(scene:T.Scene,baseUrl=import.meta.env.BASE_URL){
    const texture=await new T.TextureLoader().loadAsync(`${baseUrl}juice-lab/juice-mask.png`);
    return new DirectionalSpray(scene,texture);
  }

  /** Seed curve knobs from juice HitSettings (lab sync). */
  applyCurveSettings(c: Pick<HitSettings, 'juiceCurve' | 'juiceDragRel' | 'juiceSpeedCurve'>) {
    this.curve = juiceCurveFromSettings(c as HitSettings);
    this.dragRel = c.juiceDragRel;
    this.speedCurve = c.juiceSpeedCurve.map((p) => ({ ...p }));
  }

  /** Apply all spray knobs from game HitSettings. */
  applyFromSettings(c: HitSettings) {
    this.jetSpeedScale=c.sprayJetSpeedScale;this.fanSpeedScale=c.sprayFanSpeedScale;
    this.jetSizeScale=c.sprayJetSizeScale;this.fanSizeScale=c.sprayFanSizeScale;
    this.jetShare=c.sprayJetShare;
    this.jetSpread=c.sprayJetSpread;
    this.fanSpread=c.sprayFanSpread;
    this.enabled = !!c.sprayEnabled;
    this.mode = sprayModeFromSettings(c);
    this.flatXZ = !!c.sprayFlat;
    this.gravity = -Math.abs(c.sprayGravity);
    this.params = sprayParamsFromSettings(c);
    this.curve = sprayCurveFromSettings(c);
    this.dragRel = c.sprayDragRel;
    this.speedCurve = c.spraySpeedCurve.map((p) => ({ ...p }));
    this.debugDir = !!c.sprayDebugDir;
    this.refreshWaveColors();
  }

  private refreshWaveColors() {
    for (const w of this.waves) {
      w.color = sprayModeColor(w.mode,this.debugDir);
      (w.mesh.material as T.MeshBasicMaterial).color.set(w.color);
    }
  }

  applyModePreset(mode: SprayMode = this.mode) {
    this.mode = mode;
    this.params = { ...SPRAY_MODE_PRESETS[mode] };
  }

  /**
   * Arm delayed / immediate spray from the model back face.
   * `resolve` must fill back-face center (at aimHeight) and outward normal (−facing).
   * `sprayHeight` is added on Y at emit time.
   */
  schedule(id: string, c: HitSettings, resolve: SprayAnchorResolve) {
    if (!c.sprayEnabled) return;
    const snap: HitSettings = {
      ...c,
      juiceSpeedCurve: c.juiceSpeedCurve.map((p) => ({ ...p })),
      spraySpeedCurve: c.spraySpeedCurve.map((p) => ({ ...p })),
    };
    if (c.sprayDelay <= 0) {
      this.fireResolved(id, snap, resolve);
      return;
    }
    this.pending.push({ id, remaining: c.sprayDelay, settings: snap });
  }

  scheduleFront(id:string,c:HitSettings,resolve:SprayAnchorResolve){
    if(!c.sprayFrontEnabled)return;
    const settings={...c,juiceSpeedCurve:c.juiceSpeedCurve.map(p=>({...p})),spraySpeedCurve:c.spraySpeedCurve.map(p=>({...p}))};
    if(c.sprayDelay<=0)this.fireFrontResolved(id,settings,resolve);
    else this.pending.push({id,remaining:c.sprayDelay,settings,front:true});
  }

  private fireFrontResolved(id:string,c:HitSettings,resolve:SprayAnchorResolve){
    if(!resolve(id,this.originScratch,this.dirScratch))return;
    // Resolver returns the current outward front normal; emitFront expects inward.
    this.emitFront(this.originScratch,this.dirScratch.clone().negate(),c);
  }

  private fireResolved(id: string, snap: HitSettings, resolve: SprayAnchorResolve) {
    if (!resolve(id, this.originScratch, this.dirScratch)) return;
    this.applyFromSettings(snap);
    const at = this.originScratch.clone();
    at.y += snap.sprayHeight;
    this.emit(at, this.dirScratch);
  }

  /** Separate pool/state, shared original sprite texture. */
  createSibling(){return new DirectionalSpray(this.scene,this.texture);}

  /** Contact-point side droplets, split left/right with a slight outward bias. */
  emitFront(point:T.Vector3,incoming:T.Vector3,c:HitSettings){
    if(!c.sprayFrontEnabled)return;
    this.applyFromSettings({...c,sprayEnabled:1,sprayMode:0,sprayFlat:0,sprayDelay:0,
      sprayCount:c.sprayFrontCount,spraySpeed:c.spraySpeed*c.sprayFrontSpeedScale,
      spraySpeedJitter:c.spraySpeedJitter*c.sprayFrontSpeedScale,
      spraySize:c.spraySize*c.sprayFrontSizeScale,spraySizeJitter:c.spraySizeJitter*c.sprayFrontSizeScale,
      sprayLife:c.sprayFrontLife,sprayLifeJitter:Math.min(.04,c.sprayFrontLife*.15),
      sprayRadius:0,sprayFanSpread:12,sprayFanSpeedScale:1,sprayFanSizeScale:1});
    const forward=incoming.clone().setY(0).normalize();
    if(forward.lengthSq()<1e-8)forward.set(0,0,1);
    const side=new T.Vector3().crossVectors(forward,WORLD_UP).normalize();
    const origin=point.clone().addScaledVector(forward,-.04);
    const count=Math.max(1,Math.round(c.sprayFrontCount));
    for(const [sign,n] of [[1,Math.ceil(count/2)],[-1,Math.floor(count/2)]]){
      if(!n)continue;
      const direction=side.clone().multiplyScalar(sign).addScaledVector(forward,-.4).addScaledVector(WORLD_UP,.15).normalize();
      this.emitLayer(origin,direction,'blood',n);
    }
  }

  emit(origin:T.Vector3,direction:T.Vector3){
    const n=Math.max(1,Math.round(this.params.count));
    if(this.mode==='quarks'){
      const jet=Math.round(n*this.jetShare);
      if(jet)this.emitLayer(origin,direction,'arterial',jet);
      if(n-jet)this.emitLayer(origin,direction,'blood',n-jet);
    }else this.emitLayer(origin,direction,this.mode,n);
  }

  private emitLayer(origin: T.Vector3, direction: T.Vector3,mode:SprayMode,count:number) {
    if (!this.enabled) return;
    this.lastEmit = {
      origin: [origin.x, origin.y, origin.z],
      dir: [direction.x, direction.y, direction.z],
    };
    let wave = this.waves.find((w) => w.particles.every((p) => p.age >= p.life));
    if (!wave) {
      const material = new T.MeshBasicMaterial({color:0xffd34d,map:this.texture,transparent:true,depthWrite:false,side:T.DoubleSide});
      const mesh = new T.InstancedMesh(this.geometry, material, MAX);
      mesh.name = 'Directional spray';
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      mesh.castShadow=false;mesh.receiveShadow=false;
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.count = 0;
      this.scene.add(mesh);
      wave = {
        mesh,
        particles: [],
        color: 0xffe066,
        mode: this.mode,
        curve: this.curve,
        dragRel: this.dragRel,
        speedCurve: this.speedCurve.map((p) => ({ ...p })),
        gravity: this.gravity,
        flat: this.flatXZ,
      };
      this.waves.push(wave);
    }
    const dir = direction.clone();
    if (dir.lengthSq() < 1e-8) dir.set(0, 0, 1);
    const flat = this.flatXZ;
    const p = this.params;
    wave.particles=spawnJellySpray(origin,dir,{...p,count,speed:p.speed*(mode==='arterial'?this.jetSpeedScale:this.fanSpeedScale),size:p.size*(mode==='arterial'?this.jetSizeScale:this.fanSizeScale),spreadDeg:mode==='arterial'?this.jetSpread:this.fanSpread},flat,mode==='arterial');
    wave.followLast = origin.clone();
    wave.curve = this.curve;
    wave.dragRel = this.dragRel;
    wave.speedCurve = this.speedCurve.map((pt) => ({ ...pt }));
    wave.gravity = this.gravity;
    wave.flat = flat;
    wave.mode = mode;
    wave.color = sprayModeColor(mode,this.debugDir);
    (wave.mesh.material as T.MeshBasicMaterial).color.set(wave.color);
  }

  private shiftFollowers() {
    if (!this.follow || !this.resolveFollow) return;
    const cur = this.resolveFollow(this.followScratch);
    if (!cur) return;
    for (const w of this.waves) {
      if (!w.particles.length) continue;
      if (!w.followLast) {
        w.followLast = cur.clone();
        continue;
      }
      const dx = cur.x - w.followLast.x;
      const dy = cur.y - w.followLast.y;
      const dz = cur.z - w.followLast.z;
      if (dx || dy || dz) {
        for (const p of w.particles) {
          if (p.age >= p.life) continue;
          p.ox += dx;
          p.oy += dy;
          p.oz += dz;
          p.cy += dy;
        }
      }
      w.followLast.copy(cur);
    }
  }

  update(dt: number, resolve?: SprayAnchorResolve) {
    const ready: Pending[] = [];
    for (const p of this.pending) {
      p.remaining -= dt;
      if (p.remaining <= 1e-9) ready.push(p);
    }
    this.pending = this.pending.filter((p) => p.remaining > 1e-9);
    for (const p of ready) {
      if (!resolve||p.front) continue;
      this.fireResolved(p.id, p.settings, resolve);
    }

    this.shiftFollowers();
    for (const w of this.waves) {
      const flat = w.flat;
      const g = w.gravity;
      for (const p of w.particles) {
        if (p.age >= p.life) continue;
        p.age += dt;
        if (flat) {
          p.cy = p.oy;
          p.vy = 0;
          continue;
        }
        // Vertical only: constant gravity (curve does not touch Y).
        p.vy += g * dt;
        p.cy += p.vy * dt;
        if (p.cy < 0.02) {
          p.cy = 0.02;
          p.vy *= -0.12;
        }
      }
    }
    // Newly due front droplets start at the freshly resolved position, age zero.
    if(resolve)for(const p of ready)if(p.front)this.fireFrontResolved(p.id,p.settings,resolve);
  }

  prepare(camera: T.Camera) {
    for (const w of this.waves) {
      let count = 0;
      for (const p of w.particles) {
        if (p.age >= p.life) continue;
        const sample = sampleSpray(p, w.curve, w.dragRel, w.speedCurve, w.flat);
        this.dummy.position.set(sample.x, sample.y, sample.z);
        // Original spray rendering: unlit mask, camera-facing quad, uniform size.
        this.dummy.quaternion.copy(camera.quaternion);
        this.dummy.scale.setScalar(sample.size);
        this.dummy.updateMatrix();
        w.mesh.setMatrixAt(count++, this.dummy.matrix);
      }
      w.mesh.count = count;
      w.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  clear() {
    this.pending = [];
    for (const w of this.waves) {
      w.particles = [];
      w.mesh.count = 0;
      w.followLast = undefined;
    }
  }

  prepareWarmup(count: number, c: HitSettings, camera: T.Camera) {
    const warm = { ...c, sprayEnabled: 1, sprayDelay: 0, sprayCount: 64, sprayLife: 1.8 };
    this.applyFromSettings(warm);
    for (let i = 0; i < count; i++) {
      this.emit(new T.Vector3(), new T.Vector3(0, 0, 1));
    }
    this.prepare(camera);
  }

  finishWarmup() {
    this.clear();
  }

  activeCount() {
    let n = 0;
    for (const w of this.waves) {
      for (const p of w.particles) {
        if (p.age < p.life) n++;
      }
    }
    return n;
  }

  layerSnapshot(){return this.waves.filter(w=>w.particles.some(p=>p.age<p.life)).map(w=>({
    kind:w.mode==='arterial'?'jet':'fan',color:w.color,count:w.particles.filter(p=>p.age<p.life).length,
  }));}

  /** Current tint of the first live wave (debug / snapshots). */
  liveColorHex() {
    for (const w of this.waves) {
      if (w.particles.some((p) => p.age < p.life)) return w.color;
    }
    return sprayModeColor(this.mode,this.debugDir);
  }

  /** Debug: horizontal speed remain + vertical state for first live particle. */
  sampleRemain(ageOverride?: number) {
    for (const w of this.waves) {
      for (const p of w.particles) {
        if (p.age >= p.life) continue;
        const age = ageOverride ?? p.age;
        const u = age / p.life;
        return {
          curve: w.curve,
          remain: juiceRemain(w.curve, u, w.dragRel, w.speedCurve),
          u,
          speedH0: p.speedH0,
          vy0: p.vy0,
          vy: p.vy,
          cy: p.cy,
          flat: this.flatXZ,
          gravity: this.gravity,
        };
      }
    }
    return null;
  }
}
