/**
 * Directional hit-spray layer for slime hit previews.
 * Cone spawn algorithms from:
 * - Hack23/blacktrigram BloodParticles3D (wide cone ±π/3)
 * - Hack23/blacktrigram ArterialSpray3D (narrow ~π/12)
 * - Alchemist0823/three.quarks ConeEmitter
 * Speed / size over lifetime share JuiceParticles curves
 * (juiceRemain / juiceIntegrateRemain + juiceCurve / juiceSpeedCurve / juiceDragRel).
 */
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

function spawnBlood(origin: T.Vector3, dir: T.Vector3, p: SprayEmitParams, flat: boolean): Particle[] {
  const { axisX, axisY, axisZ } = coneBasis(dir, flat);
  const spread = (Math.max(0, p.spreadDeg) * Math.PI) / 180;
  const out: Particle[] = [];
  const d = new T.Vector3();
  const n = Math.max(1, Math.round(p.count));
  for (let i = 0; i < n; i++) {
    // Uniform-ish in cone: |phi| ≤ spread/2 (half-angle), full spin.
    const phi = (Math.random() - 0.5) * spread;
    const theta = Math.random() * Math.PI * 2;
    coneDir(axisX, axisY, axisZ, Math.abs(phi), theta, d);
    if (flat) { d.y = 0; normalize(d); }
    else normalize(d);
    pushParticle(
      out, origin, d,
      randAround(p.speed, p.speedJitter),
      Math.max(0.05, randAround(p.life, p.lifeJitter)),
      Math.max(0.02, randAround(p.size, p.sizeJitter)),
      'blood', flat,
    );
  }
  return out;
}

function spawnArterial(origin: T.Vector3, dir: T.Vector3, p: SprayEmitParams, flat: boolean): Particle[] {
  const { axisX, axisY, axisZ } = coneBasis(dir, flat);
  const cone = (Math.max(0, p.spreadDeg) * Math.PI) / 180;
  const out: Particle[] = [];
  const d = new T.Vector3();
  const n = Math.max(1, Math.round(p.count));
  for (let i = 0; i < n; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * cone;
    coneDir(axisX, axisY, axisZ, phi, theta, d);
    if (flat) { d.y = 0; normalize(d); }
    else normalize(d);
    pushParticle(
      out, origin, d,
      randAround(p.speed, p.speedJitter),
      Math.max(0.05, randAround(p.life, p.lifeJitter)),
      Math.max(0.02, randAround(p.size, p.sizeJitter)),
      'arterial', flat,
    );
  }
  return out;
}

function spawnQuarks(origin: T.Vector3, dir: T.Vector3, p: SprayEmitParams, flat: boolean): Particle[] {
  const { axisX, axisY, axisZ } = coneBasis(dir, flat);
  const radius = Math.max(0, p.radius);
  const angle = (Math.max(0, p.spreadDeg) * Math.PI) / 180;
  const out: Particle[] = [];
  const n = Math.max(1, Math.round(p.count));
  for (let i = 0; i < n; i++) {
    const u = Math.random();
    const rand = Math.sqrt(Math.random());
    const theta = u * Math.PI * 2;
    const r = rand;
    const lx = r * Math.cos(theta);
    const ly = r * Math.sin(theta);
    const ang = angle * r;
    let vx = lx * Math.sin(ang);
    let vy = ly * Math.sin(ang);
    let vz = Math.cos(ang);
    const vl = Math.hypot(vx, vy, vz) || 1;
    const speed0 = randAround(p.speed, p.speedJitter);
    vx = (vx / vl) * speed0;
    vy = (vy / vl) * speed0;
    vz = (vz / vl) * speed0;
    const px = lx * radius;
    const py = ly * radius;
    const worldP = origin.clone()
      .addScaledVector(axisX, px)
      .addScaledVector(axisY, py);
    const worldV = new T.Vector3()
      .addScaledVector(axisX, vx)
      .addScaledVector(axisY, vy)
      .addScaledVector(axisZ, vz);
    if (flat) worldV.y = 0;
    pushParticle(
      out,
      worldP,
      worldV,
      worldV.length() || speed0,
      Math.max(0.05, randAround(p.life, p.lifeJitter)),
      Math.max(0.02, randAround(p.size, p.sizeJitter)),
      'quarks',
      flat,
    );
  }
  return out;
}

const SPRAY_DEBUG_COLOR = 0xff2020;

function sprayModeColor(mode: SprayMode) {
  return mode === 'blood' ? 0xffdd55
    : mode === 'arterial' ? 0xffe070
    : 0x9fe8ff;
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
  private texture: T.Texture;
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
  /** When on, force spray particles bright red so spawn side / cone are obvious. */
  debugDir = false;

  setDebugDir(on: boolean) {
    this.debugDir = on;
    this.refreshWaveColors();
  }

  get count() { return this.params.count; }
  set count(n: number) { this.params.count = n; }

  private constructor(private scene: T.Scene, texture: T.Texture) {
    this.texture = texture;
    this.texture.colorSpace = T.SRGBColorSpace;
  }

  static async load(scene: T.Scene, baseUrl = import.meta.env.BASE_URL) {
    const texture = await new T.TextureLoader().loadAsync(`${baseUrl}juice-lab/juice-mask.png`);
    return new DirectionalSpray(scene, texture);
  }

  /** Seed curve knobs from juice HitSettings (lab sync). */
  applyCurveSettings(c: Pick<HitSettings, 'juiceCurve' | 'juiceDragRel' | 'juiceSpeedCurve'>) {
    this.curve = juiceCurveFromSettings(c as HitSettings);
    this.dragRel = c.juiceDragRel;
    this.speedCurve = c.juiceSpeedCurve.map((p) => ({ ...p }));
  }

  /** Apply all spray knobs from game HitSettings. */
  applyFromSettings(c: HitSettings) {
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
      w.color = this.debugDir ? SPRAY_DEBUG_COLOR : sprayModeColor(w.mode);
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

  private fireResolved(id: string, snap: HitSettings, resolve: SprayAnchorResolve) {
    if (!resolve(id, this.originScratch, this.dirScratch)) return;
    this.applyFromSettings(snap);
    const at = this.originScratch.clone();
    at.y += snap.sprayHeight;
    this.emit(at, this.dirScratch);
  }

  emit(origin: T.Vector3, direction: T.Vector3) {
    if (!this.enabled) return;
    this.lastEmit = {
      origin: [origin.x, origin.y, origin.z],
      dir: [direction.x, direction.y, direction.z],
    };
    let wave = this.waves.find((w) => w.particles.every((p) => p.age >= p.life));
    if (!wave) {
      const material = new T.MeshBasicMaterial({
        map: this.texture, transparent: true, depthWrite: false, side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), material, MAX);
      mesh.name = 'Directional spray';
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
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
    wave.particles =
      this.mode === 'blood' ? spawnBlood(origin, dir, p, flat)
      : this.mode === 'arterial' ? spawnArterial(origin, dir, p, flat)
      : spawnQuarks(origin, dir, p, flat);
    wave.followLast = origin.clone();
    wave.curve = this.curve;
    wave.dragRel = this.dragRel;
    wave.speedCurve = this.speedCurve.map((pt) => ({ ...pt }));
    wave.gravity = this.gravity;
    wave.flat = flat;
    wave.mode = this.mode;
    wave.color = this.debugDir ? SPRAY_DEBUG_COLOR : sprayModeColor(this.mode);
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
      if (!resolve) continue;
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
  }

  prepare(camera: T.Camera) {
    for (const w of this.waves) {
      let count = 0;
      for (const p of w.particles) {
        if (p.age >= p.life) continue;
        const sample = sampleSpray(p, w.curve, w.dragRel, w.speedCurve, w.flat);
        this.dummy.position.set(sample.x, sample.y, sample.z);
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

  /** Current tint of the first live wave (debug / snapshots). */
  liveColorHex() {
    for (const w of this.waves) {
      if (w.particles.some((p) => p.age < p.life)) return w.color;
    }
    return this.debugDir ? SPRAY_DEBUG_COLOR : sprayModeColor(this.mode);
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
