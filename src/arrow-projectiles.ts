import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ARROW_SPEED = 50; // World units/second; independent of attack and Run speed.
type Arrow = { object: THREE.Object3D; direction: THREE.Vector3; distance: number; range: number; active: boolean };

/** Straight flight, shared immutable geometry/materials, and swept arrow-tip collision. */
export type ArrowHit = {id:string;point:THREE.Vector3;direction:THREE.Vector3};
export class ArrowProjectiles {
  onHit?: (hit:ArrowHit)=>void;
  private pool: Arrow[] = [];
  private targets: THREE.Object3D[] = [];
  private ray = new THREE.Raycaster();
  private hits: THREE.Intersection[] = [];
  private origin = new THREE.Vector3();
  private forward = new THREE.Vector3(0, 0, 1);
  private fired = 0;
  private hitCount = 0;
  private lastHit: string | null = null;
  private tip: number;
  private tail: number;
  private scale = 1;
  private speed = ARROW_SPEED;

  static async load(scene: THREE.Scene) {
    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/archero-arrow.glb`);
    return new ArrowProjectiles(scene, gltf.scene);
  }

  constructor(private scene: THREE.Scene, private template: THREE.Object3D) {
    // The source prefab already points its white arrowhead along +Z.
    const box = new THREE.Box3().setFromObject(template);
    this.tip = box.max.z; this.tail = box.min.z;
    if (box.isEmpty() || !Number.isFinite(this.tip)) throw new Error('箭矢模型没有可用网格。');
    for (let i = 0; i < 4; i++) this.allocate();
  }

  private allocate() {
    const object = this.template.clone(true);
    object.name = 'ArcheroArrow'; object.visible = false;
    object.scale.setScalar(this.scale);
    this.scene.add(object);
    const arrow: Arrow = { object, direction: new THREE.Vector3(), distance: 0, range: 0, active: false };
    this.pool.push(arrow); return arrow;
  }

  setSpeed(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('箭速必须为正数。');
    this.speed = speed;
  }

  setScale(scale: number) {
    if (scale === this.scale) return;
    if (!Number.isFinite(scale) || scale <= 0) throw new Error('箭缩放必须为正数。');
    this.scale = scale;
    for (const arrow of this.pool) {
      arrow.object.scale.setScalar(scale);
      if (arrow.active) {
        this.origin.copy(arrow.object.position).addScaledVector(arrow.direction, this.tail * scale);
        this.collides(arrow, (this.tip - this.tail) * scale);
      }
    }
  }

  setTargets(targets: THREE.Object3D[]) { this.clear(); this.targets = targets; }
  clear() { for (const arrow of this.pool) this.recycle(arrow); }
  private recycle(arrow: Arrow) { arrow.active = false; arrow.object.visible = false; }

  fire(position: THREE.Vector3, aim: THREE.Vector3, range: number, elapsed = 0) {
    if (position.distanceToSquared(aim) < 1e-12) return;
    const arrow = this.pool.find(a => !a.active) ?? this.allocate();
    arrow.direction.subVectors(aim, position).normalize();
    arrow.object.position.copy(position);
    arrow.object.quaternion.setFromUnitVectors(this.forward, arrow.direction);
    arrow.distance = 0; arrow.range = Math.max(0, range);
    arrow.active = arrow.object.visible = true; this.fired++;
    // Also detect a point-blank target already overlapping the newly spawned shaft.
    this.origin.copy(position).addScaledVector(arrow.direction, this.tail * this.scale);
    if (this.collides(arrow, (this.tip - this.tail) * this.scale)) return;
    this.advance(arrow, elapsed);
  }

  private collides(arrow: Arrow, distance: number) {
    this.ray.set(this.origin, arrow.direction); this.ray.near = 0; this.ray.far = distance;
    this.hits.length = 0;
    this.ray.intersectObjects(this.targets, true, this.hits);
    if (!this.hits.length) return false;
    let object: THREE.Object3D | null = this.hits[0].object;
    while (object && !object.userData.practiceTarget) object = object.parent;
    this.lastHit = object?.userData.practiceTarget ?? null;
    const hit = this.lastHit ? {id:this.lastHit,point:this.hits[0].point.clone(),direction:arrow.direction.clone()} : null;
    this.hitCount++; this.recycle(arrow);
    if(hit)this.onHit?.(hit);
    return true;
  }

  private advance(arrow: Arrow, dt: number) {
    if (!arrow.active || dt <= 0) return;
    const distance = Math.min(this.speed * dt, arrow.range - arrow.distance);
    this.origin.copy(arrow.object.position).addScaledVector(arrow.direction, this.tip * this.scale);
    if (this.collides(arrow, distance)) return;
    arrow.object.position.addScaledVector(arrow.direction, distance);
    arrow.distance += distance;
    if (arrow.distance >= arrow.range) this.recycle(arrow);
  }

  update(dt: number) { for (const arrow of this.pool) this.advance(arrow, dt); }

  snapshot() {
    return { scale: this.scale, speed: this.speed, fired: this.fired, hits: this.hitCount, lastHit: this.lastHit,
      allocated: this.pool.length, active: this.pool.filter(a => a.active).map(a => ({
        position: a.object.position.toArray(), direction: a.direction.toArray(), distance: a.distance,
      })) };
  }
}
