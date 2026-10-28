import { ARROW_TRAIL_DEFAULTS, type ArrowTrailSettings } from './arrow-trail-config.ts';
import { ArrowTrail } from './arrow-trail.ts';
import type { HitDebug } from './hit-debug.ts';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ARROW_SPEED = 50; // World units/second; independent of attack and Run speed.

type Arrow = {
  object: THREE.Object3D;
  trail: ArrowTrail;
  paint:THREE.Mesh;
  direction: THREE.Vector3;
  distance: number;
  active: boolean;
  pierce: boolean;
  /** Enemy ids already damaged by this arrow (pierce: once each; non-pierce: at most one). */
  hitIds: Set<string>;
};

export type ArrowHit = { id: string; point: THREE.Vector3; direction: THREE.Vector3 };

/**
 * Straight-line arrows with a tip trigger.
 * Despawn rules (only these two):
 * 1. Hit an enemy while pierce is off
 * 2. Tip leaves the room boundary wall AABB
 * Object-pool recycle never runs for any other reason while the arrow is flying.
 */
export class ArrowProjectiles {
  debug?:HitDebug;
  onHit?: (hit: ArrowHit) => void;
  onFire?: (position: THREE.Vector3, direction: THREE.Vector3, elapsed: number) => void;
  private pool: Arrow[] = [];
  private paintGeometry=new THREE.SphereGeometry(1,24,16);
  private paintMaterial=new THREE.MeshStandardNodeMaterial({color:ARROW_TRAIL_DEFAULTS.arrowPaintColor,roughness:.3,metalness:0});
  private targets: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private hits: THREE.Intersection[] = [];
  private origin = new THREE.Vector3();
  private tipPoint = new THREE.Vector3();
  private forward = new THREE.Vector3(0, 0, 1);
  private fired = 0;
  private hitCount = 0;
  private lastHit: string | null = null;
  private tip: number;
  private tail: number;
  private scale = 1;
  private speed = ARROW_SPEED;
  private pierce = false;
  /** Room boundary half-extents; tip outside this AABB despawns. */
  private wallX = Infinity;
  private wallZ = Infinity;

  static async load(scene: THREE.Scene) {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/archero-arrow.glb`);
    return new ArrowProjectiles(scene, gltf.scene);
  }

  constructor(private scene: THREE.Scene, private template: THREE.Object3D) {
    const box = new THREE.Box3().setFromObject(template);
    this.tip = box.max.z;
    this.tail = box.min.z;
    if (box.isEmpty() || !Number.isFinite(this.tip)) throw new Error('箭矢模型没有可用网格。');
    for (let i = 0; i < 4; i++) this.allocate();
  }

  private allocate() {
    const object = this.template.clone(true);
    object.name = 'ArcheroArrow';
    const paint=new THREE.Mesh(this.paintGeometry,this.paintMaterial);paint.name='ArrowPaintPayload';paint.position.z=this.tip;paint.scale.setScalar(ARROW_TRAIL_DEFAULTS.arrowPaintRadius);object.add(paint);
    object.visible = false;
    object.scale.setScalar(this.scale);
    this.scene.add(object);
    const trail=new ArrowTrail();this.scene.add(trail.mesh);
    const arrow: Arrow = {
      object,trail,paint,
      direction: new THREE.Vector3(),
      distance: 0,
      active: false,
      pierce: false,
      hitIds: new Set(),
    };
    this.pool.push(arrow);
    return arrow;
  }

  setSpeed(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('箭速必须为正数。');
    this.speed = speed;
  }

  setPierce(enabled: boolean) {
    this.pierce = !!enabled;
  }

  /**
   * Boundary wall = walkable room half-size, plus a small band so a bow near the
   * edge does not despawn on the first frame before the tip reaches the wall mesh.
   */
  setRoomBounds(width: number, length: number) {
    const margin = 1.25;
    this.wallX = Math.max(0, width / 2) + margin;
    this.wallZ = Math.max(0, length / 2) + margin;
  }

  setScale(scale: number) {
    if (scale === this.scale) return;
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('箭缩放必须为正数。');
    this.scale = scale;
    for (const arrow of this.pool) arrow.object.scale.setScalar(scale);
  }

  /** Replace hit proxies. Does not touch the pool — flying arrows keep flying. */
  setTargets(targets: THREE.Object3D[]) {
    this.targets = targets;
    this.debug?.setTargets(targets);
  }

  /** Explicit recycle of every pooled arrow (room rebuild / reset). */
  clear() {
    for (const arrow of this.pool) this.recycle(arrow);
  }

  private recycle(arrow: Arrow) {
    arrow.trail.clear();
    arrow.active = false;
    arrow.object.visible = false;
    arrow.hitIds.clear();
  }

  /**
   * Spawn along aim-origin at fire time. `range` is ignored for lifetime —
   * kept only so existing call sites compile.
   */
  fire(position: THREE.Vector3, aim: THREE.Vector3, _range = Infinity, elapsed = 0) {
    // Horizontal flight only: keep the bow height, aim on the XZ plane.
    const dx = aim.x - position.x;
    const dz = aim.z - position.z;
    if (dx * dx + dz * dz < 1e-12) return;
    const arrow = this.pool.find(a => !a.active) ?? this.allocate();
    arrow.direction.set(dx, 0, dz).normalize();
    arrow.object.position.copy(position);
    arrow.object.quaternion.setFromUnitVectors(this.forward, arrow.direction);
    arrow.distance = 0;
    arrow.pierce = this.pierce;
    arrow.hitIds.clear();
    arrow.active = true;
    arrow.object.visible = true;
    this.fired++;
    this.onFire?.(position, arrow.direction, elapsed);

    // Point-blank: shaft already overlapping an enemy at spawn.
    this.origin.copy(position).addScaledVector(arrow.direction, this.tail * this.scale);
    if (this.resolveTrigger(arrow, (this.tip - this.tail) * this.scale,'出生时箭身重叠')) return;
    if (elapsed > 0) this.advance(arrow, elapsed);
  }

  private targetId(start: THREE.Object3D): string | null {
    let object: THREE.Object3D | null = start;
    while (object) {
      const id = object.userData.practiceTarget;
      if (typeof id === 'string' && id.length) return id;
      object = object.parent;
    }
    return null;
  }

  private outsideWalls(point: THREE.Vector3) {
    return Math.abs(point.x) > this.wallX + 1e-6 || Math.abs(point.z) > this.wallZ + 1e-6;
  }

  /**
   * Sweep the tip trigger forward by `travel`.
   * @returns true when this advance must stop (recycled, or debug paused at contact).
   */
  private resolveTrigger(arrow: Arrow, travel: number,kind='箭尖扫掠'): boolean {
    if (!arrow.active || travel <= 0 || !this.targets.length) return false;
    if(this.debug?.enabled)this.debug.sweep(this.origin,this.origin.clone().addScaledVector(arrow.direction,travel));
    this.ray.set(this.origin, arrow.direction);
    this.ray.near = 0;
    this.ray.far = travel;
    this.hits.length = 0;
    this.ray.intersectObjects(this.targets, true, this.hits);
    if (!this.hits.length) return false;

    for (const intersection of this.hits) {
      const id = this.targetId(intersection.object);
      if (!id || arrow.hitIds.has(id)) continue;
      this.debug?.capture(arrow.object,arrow.direction,this.tip*this.scale,this.origin,travel,intersection.point,id,kind);
      arrow.hitIds.add(id);
      this.lastHit = id;
      this.hitCount++;
      const hit: ArrowHit = {
        id,
        point: intersection.point.clone(),
        direction: arrow.direction.clone(),
      };
      // Non-pierce: recycle before onHit so callers see an inactive arrow at contact.
      if (!arrow.pierce) {
        this.recycle(arrow);
        this.onHit?.(hit);
        return true;
      }
      this.onHit?.(hit);
      // In diagnostic pause mode preserve a piercing arrow at the first contact.
      if(this.debug?.enabled&&this.debug.paused){
        arrow.object.position.copy(intersection.point).addScaledVector(arrow.direction,-this.tip*this.scale);
        arrow.distance+=intersection.distance;
        return true;
      }
    }
    return false;
  }

  private advance(arrow: Arrow, dt: number) {
    if (!arrow.active || dt <= 0) return;
    const travel = this.speed * dt;

    // Trigger starts at the current tip and sweeps along the flight direction.
    this.origin.copy(arrow.object.position).addScaledVector(arrow.direction, this.tip * this.scale);
    if (this.resolveTrigger(arrow, travel)) return;

    arrow.object.position.addScaledVector(arrow.direction, travel);
    arrow.distance += travel;

    this.tipPoint.copy(arrow.object.position).addScaledVector(arrow.direction, this.tip * this.scale);
    if (this.outsideWalls(this.tipPoint)) this.recycle(arrow);
  }

  update(dt: number) {
    for (const arrow of this.pool){if(this.debug?.enabled&&this.debug.paused)break;this.advance(arrow, dt);}
  }

  prepare(camera:THREE.Camera,settings:ArrowTrailSettings=ARROW_TRAIL_DEFAULTS){
    this.paintMaterial.color.setHex(settings.arrowPaintColor);
    for(const arrow of this.pool){
      if(!arrow.active)continue;
      arrow.paint.visible=!!settings.arrowPaintEnabled;arrow.paint.scale.setScalar(settings.arrowPaintRadius);arrow.paint.position.set(0,0,this.tip+settings.arrowPaintOffset);
      this.tipPoint.copy(arrow.object.position).addScaledVector(arrow.direction,this.tail*this.scale);
      arrow.trail.update(this.tipPoint,arrow.direction,arrow.distance,this.scale,camera,settings);
    }
  }

  prepareWarmup(count:number,camera:THREE.Camera){
    while(this.pool.length<count)this.allocate();
    for(const arrow of this.pool){arrow.active=true;arrow.object.visible=true;arrow.object.position.set(0,1,0);arrow.direction.set(0,0,-1);arrow.object.quaternion.setFromUnitVectors(this.forward,arrow.direction);arrow.distance=2;}
    this.prepare(camera,ARROW_TRAIL_DEFAULTS);
  }

  snapshot() {
    return {
      scale: this.scale,
      speed: this.speed,
      pierce: this.pierce,
      fired: this.fired,
      hits: this.hitCount,
      lastHit: this.lastHit,
      allocated: this.pool.length,
      active: this.pool.filter(a => a.active).map(a => ({
        paint:{visible:a.paint.visible,radius:a.paint.scale.x*this.scale,color:this.paintMaterial.color.getHex(),position:a.paint.getWorldPosition(new THREE.Vector3()).toArray()},
        position: a.object.position.toArray(),
        tip:a.object.position.clone().addScaledVector(a.direction,this.tip*this.scale).toArray(),
        direction: a.direction.toArray(),
        distance: a.distance,
        pierce: a.pierce,
        hitIds: [...a.hitIds],
      })),
    };
  }
}
