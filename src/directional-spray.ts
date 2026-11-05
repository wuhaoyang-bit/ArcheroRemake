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
  juiceCurveFromSettings,
  juiceIntegrateRemain,
  juiceRemain,
  type JuiceCurveId,
} from './juice-particles.ts';
import { DEFAULT_JUICE_SPEED_CURVE, type JuiceSpeedPoint } from './juice-speed-curve.ts';
import type { HitSettings } from './hit-feedback-config.ts';

export type SprayMode = 'blood' | 'arterial' | 'quarks';

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

function spawnBlood(origin: T.Vector3, dir: T.Vector3, p: SprayEmitParams, flat: boolean): Particle[] {
  const base = dir.clone();
  if (flat) { base.y = 0; normalize(base); }
  else normalize(base);
  const yAxis = new T.Vector3(0, 1, 0);
  const zAxis = new T.Vector3(0, 0, 1);
  const spread = (Math.max(0, p.spreadDeg) * Math.PI) / 180;
  const out: Particle[] = [];
  const d = new T.Vector3();
  const n = Math.max(1, Math.round(p.count));
  for (let i = 0; i < n; i++) {
    const phi = (Math.random() - 0.5) * spread;
    const theta = Math.random() * Math.PI * 2;
    d.copy(base).applyAxisAngle(yAxis, phi).applyAxisAngle(zAxis, theta);
    if (flat) { d.y = 0; normalize(d); }
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
  const base = dir.clone();
  if (flat) { base.y = 0; normalize(base); }
  else normalize(base);
  const up = new T.Vector3(0, 1, 0);
  const axis = new T.Vector3().crossVectors(up, base);
  if (axis.lengthSq() < 1e-8) axis.set(1, 0, 0);
  else normalize(axis);
  const cone = (Math.max(0, p.spreadDeg) * Math.PI) / 180;
  const out: Particle[] = [];
  const d = new T.Vector3();
  const n = Math.max(1, Math.round(p.count));
  for (let i = 0; i < n; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * cone;
    d.copy(base).applyAxisAngle(axis, phi).applyAxisAngle(base, theta);
    if (flat) { d.y = 0; normalize(d); }
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
  let axisZ = dir.clone();
  if (flat) { axisZ.y = 0; }
  normalize(axisZ);
  let axisY = new T.Vector3().crossVectors(axisZ, new T.Vector3(0, 0, 1));
  if (axisY.lengthSq() < 1e-8) axisY.set(1, 0, 0);
  else normalize(axisY);
  const axisX = new T.Vector3().crossVectors(axisY, axisZ).normalize();
  axisY.crossVectors(axisZ, axisX).normalize();

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

type Wave = {
  mesh: T.InstancedMesh;
  particles: Particle[];
  color: number;
  followLast?: T.Vector3;
  curve: JuiceCurveId;
  dragRel: number;
  speedCurve: JuiceSpeedPoint[];
};

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
  private dummy = new T.Object3D();
  private followScratch = new T.Vector3();
  private texture: T.Texture;
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
  /** Shift active particles with the slime each frame (preview). */
  follow = true;
  resolveFollow?: (out: T.Vector3) => T.Vector3 | null;

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

  /** Seed curve knobs from juice HitSettings (optional sync). */
  applyCurveSettings(c: Pick<HitSettings, 'juiceCurve' | 'juiceDragRel' | 'juiceSpeedCurve'>) {
    this.curve = juiceCurveFromSettings(c as HitSettings);
    this.dragRel = c.juiceDragRel;
    this.speedCurve = c.juiceSpeedCurve.map((p) => ({ ...p }));
  }

  applyModePreset(mode: SprayMode = this.mode) {
    this.mode = mode;
    this.params = { ...SPRAY_MODE_PRESETS[mode] };
  }

  emit(origin: T.Vector3, direction: T.Vector3) {
    if (!this.enabled) return;
    let wave = this.waves.find((w) => w.particles.every((p) => p.age >= p.life));
    if (!wave) {
      const material = new T.MeshBasicMaterial({
        map: this.texture, transparent: true, depthWrite: false, side: T.DoubleSide,
      });
      const mesh = new T.InstancedMesh(new T.PlaneGeometry(1, 1), material, MAX);
      mesh.frustumCulled = false;
      mesh.renderOrder = 10;
      mesh.count = 0;
      this.scene.add(mesh);
      wave = {
        mesh,
        particles: [],
        color: 0xffe066,
        curve: this.curve,
        dragRel: this.dragRel,
        speedCurve: this.speedCurve.map((p) => ({ ...p })),
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
    wave.color =
      this.mode === 'blood' ? 0xffdd55
      : this.mode === 'arterial' ? 0xffe070
      : 0x9fe8ff;
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

  update(dt: number) {
    this.shiftFollowers();
    const flat = this.flatXZ;
    const g = this.gravity;
    for (const w of this.waves) {
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
    const flat = this.flatXZ;
    for (const w of this.waves) {
      let count = 0;
      for (const p of w.particles) {
        if (p.age >= p.life) continue;
        const sample = sampleSpray(p, w.curve, w.dragRel, w.speedCurve, flat);
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
    for (const w of this.waves) {
      w.particles = [];
      w.mesh.count = 0;
      w.followLast = undefined;
    }
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
