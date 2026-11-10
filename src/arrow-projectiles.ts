import { ARROW_TRAIL_DEFAULTS, type ArrowTrailSettings } from './arrow-trail-config.ts';
import { ArrowTrail } from './arrow-trail.ts';
import type { HitDebug } from './hit-debug.ts';
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ARROW_GRAVITY = 9.8;
export const ARROW_SPEED = 50; // World units/second; independent of attack and Run speed.

type Arrow = {
  object: THREE.Object3D;
  trail: ArrowTrail;
  paint:THREE.Mesh;
  direction: THREE.Vector3;
  distance: number;
  /** Per-arrow flight speed (base or after-pierce). */
  speed: number;
  active: boolean;
  gravityArmed:boolean;
  verticalSpeed:number;
  grounded:boolean;
  groundRemaining:number;
  pierce: boolean;
  /** Seconds left pinned at the hit point before recycle; 0 means flying normally. */
  lingerRemaining: number;
  /** Entry resistance: moves slowly while following body translation (seconds). */
  piercePauseRemaining: number;
  piercePauseTarget: THREE.Object3D | null;
  piercePauseTargetPosition: THREE.Vector3;
  /** First pierce body; cleared after after-pierce speed applies. */
  pierceExitTarget: THREE.Object3D | null;
  /** World point on the far AABB face along flight; tip must reach it before slowdown. */
  pierceExitPoint: THREE.Vector3 | null;
  /** True once tip passed the first pierce body (or that target vanished). */
  afterPierceApplied: boolean;
  /** Enemy ids already damaged by this arrow (pierce: once each; non-pierce: at most one). */
  hitIds: Set<string>;
};

export type ArrowHit = { id: string; point: THREE.Vector3; direction: THREE.Vector3 };

/**
 * Straight-line arrows with a tip trigger.
 * Despawn rules (only these):
 * 1. Non-pierce enemy hit — optional linger pin, then recycle
 * 2. Arrow mesh and its complete trail leave the camera view
 * 3. Embedded arrows remain for three seconds, then recycle
 * 4. Explicit clear() on room rebuild / reset
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
  private exitBox = new THREE.Box3();
  private exitRay = new THREE.Ray();
  private exitScratch = new THREE.Vector3();
  private forward = new THREE.Vector3(0, 0, 1);
  private fired = 0;
  private hitCount = 0;
  private lastHit: string | null = null;
  private tip: number;
  private tail: number;
  private scale = 1;
  private speed = ARROW_SPEED;
  /** Absolute speed after tip leaves the first pierced body. */
  private speedAfterPierce = ARROW_SPEED;
  private pierce = false;
  /** Non-pierce hit linger before recycle (seconds). 0 = immediate despawn. */
  private hitLinger = 1 / 60;
  private piercePause = .04;
  private pierceEntrySpeed = 20;
  private pierceGravity = false;
  private gravity = ARROW_GRAVITY;
  private viewFrustum = new THREE.Frustum();
  private viewProjection = new THREE.Matrix4();
  private visibleBounds = new THREE.Box3();
  private meshBounds = new THREE.Box3();

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
    const paint=new THREE.Mesh(this.paintGeometry,this.paintMaterial);paint.name='ArrowPaintPayload';paint.visible=!!ARROW_TRAIL_DEFAULTS.arrowPaintEnabled;paint.position.z=this.tip;paint.scale.setScalar(ARROW_TRAIL_DEFAULTS.arrowPaintRadius);object.add(paint);
    object.visible = false;
    object.scale.setScalar(this.scale);
    this.scene.add(object);
    const trail=new ArrowTrail();this.scene.add(trail.mesh);
    const arrow: Arrow = {
      object,trail,paint,
      direction: new THREE.Vector3(),
      distance: 0,
      speed: this.speed,
      active: false,
      gravityArmed:false,verticalSpeed:0,grounded:false,groundRemaining:0,
      pierce: false,
      lingerRemaining: 0,
      piercePauseRemaining: 0,
      piercePauseTarget: null,
      piercePauseTargetPosition: new THREE.Vector3(),
      pierceExitTarget: null,
      pierceExitPoint: null,
      afterPierceApplied: false,
      hitIds: new Set(),
    };
    this.pool.push(arrow);
    return arrow;
  }

  setSpeed(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('箭速必须为正数。');
    this.speed = speed;
    // Live arrows that have not yet taken after-pierce speed follow the new base.
    for (const arrow of this.pool) {
      if (arrow.active && !arrow.afterPierceApplied) arrow.speed = speed;
    }
  }

  setSpeedAfterPierce(speed: number) {
    if (!Number.isFinite(speed) || speed <= 0) throw new Error('穿透后箭速必须为正数。');
    this.speedAfterPierce = speed;
    for (const arrow of this.pool) {
      if (arrow.active && arrow.afterPierceApplied) arrow.speed = speed;
    }
  }

  setPierce(enabled: boolean) {
    this.pierce = !!enabled;
  }

  setHitLinger(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) throw new Error('命中停顿时长必须为非负秒数。');
    this.hitLinger = seconds;
  }


  setPiercePause(milliseconds:number){
    if(!Number.isFinite(milliseconds)||milliseconds<0)throw new Error('穿透入体停顿必须为非负毫秒数。');
    this.piercePause=milliseconds/1000;
  }

  setPierceEntrySpeed(speed:number){
    if(!Number.isFinite(speed)||speed<0)throw new Error('穿透入体速度必须为非负数。');
    this.pierceEntrySpeed=speed;
  }

  setPierceGravity(enabled:boolean){this.pierceGravity=!!enabled;}

  setGravity(gravity:number){
    if(!Number.isFinite(gravity)||gravity<0)throw new Error('入体后重力必须为非负数。');
    this.gravity=gravity;
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
    arrow.lingerRemaining = 0;
    arrow.gravityArmed=false;arrow.verticalSpeed=0;arrow.grounded=false;arrow.groundRemaining=0;
    arrow.piercePauseRemaining = 0;
    arrow.piercePauseTarget = null;
    arrow.pierceExitTarget = null;
    arrow.pierceExitPoint = null;
    arrow.afterPierceApplied = false;
    arrow.speed = this.speed;
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
    arrow.speed = this.speed;
    arrow.pierce = this.pierce;
    arrow.lingerRemaining = 0;
    arrow.gravityArmed=false;arrow.verticalSpeed=0;arrow.grounded=false;arrow.groundRemaining=0;
    arrow.piercePauseRemaining = 0;
    arrow.piercePauseTarget = null;
    arrow.pierceExitTarget = null;
    arrow.pierceExitPoint = null;
    arrow.afterPierceApplied = false;
    arrow.hitIds.clear();
    arrow.active = true;
    arrow.object.visible = true;
    this.fired++;
    this.onFire?.(position, arrow.direction, elapsed);

    // Point-blank: shaft already overlapping an enemy at spawn.
    this.origin.copy(position).addScaledVector(arrow.direction, this.tail * this.scale);
    const contact=this.resolveTrigger(arrow, (this.tip - this.tail) * this.scale,'出生时箭身重叠');
    if(contact!==null&&(!arrow.pierce||!arrow.active||(this.debug?.enabled&&this.debug.paused)))return;
    if (elapsed > 0) this.advance(arrow, elapsed);
  }

  private targetId(start: THREE.Object3D): string | null {
    const root = this.practiceRoot(start);
    const id = root?.userData.practiceTarget;
    return typeof id === 'string' && id.length ? id : null;
  }

  /** Object that owns `userData.practiceTarget` (hit proxy root). */
  private practiceRoot(start: THREE.Object3D): THREE.Object3D | null {
    let object: THREE.Object3D | null = start;
    while (object) {
      const id = object.userData.practiceTarget;
      if (typeof id === 'string' && id.length) return object;
      object = object.parent;
    }
    return null;
  }


  /** Far-face exit along `dir` from a contact point on/inside the AABB. */
  private farFaceExit(target: THREE.Object3D, contact: THREE.Vector3, dir: THREE.Vector3) {
    this.exitBox.setFromObject(target);
    this.exitRay.origin.copy(contact).addScaledVector(dir, 1e-3);
    this.exitRay.direction.copy(dir);
    if (this.exitRay.intersectBox(this.exitBox, this.exitScratch)) return this.exitScratch.clone();
    return contact.clone();
  }

  /** Tip reached/passed the far face, or the pierce target vanished. */
  private pierceExitReady(arrow: Arrow, tip: THREE.Vector3) {
    const target = arrow.pierceExitTarget;
    if (!target) return false;
    if (!target.parent || !this.targets.includes(target)) return true;
    const exit = arrow.pierceExitPoint;
    if (!exit) return true;
    return this.exitScratch.copy(tip).sub(exit).dot(arrow.direction) >= -1e-4;
  }

  private tryApplyAfterPierceSpeed(arrow: Arrow) {
    if (!arrow.pierce || arrow.afterPierceApplied || !arrow.pierceExitTarget) return;
    this.tipPoint.copy(arrow.object.position).addScaledVector(arrow.direction, this.tip * this.scale);
    if (!this.pierceExitReady(arrow, this.tipPoint)) return;
    arrow.speed = this.speedAfterPierce;
    arrow.afterPierceApplied = true;
    arrow.pierceExitTarget = null;
    arrow.pierceExitPoint = null;
  }

  private beginPierceExitWatch(arrow: Arrow, hitObject: THREE.Object3D, contact: THREE.Vector3) {
    if (arrow.afterPierceApplied || arrow.pierceExitTarget) return;
    const root = this.practiceRoot(hitObject);
    if (!root) return;
    arrow.pierceExitTarget = root;
    arrow.pierceExitPoint = this.farFaceExit(root, contact, arrow.direction);
  }

  /** Sweep to the next new enemy. Return distance consumed at contact, or null.
   * Each contact is a time event, so both pause and exit slowdown use only the
   * remaining simulation time, even with multiple targets in a long frame. */
  private resolveTrigger(arrow:Arrow,travel:number,kind='箭尖扫掠'):number|null{
    if(!arrow.active||travel<=0||!this.targets.length)return null;
    if(this.debug?.enabled)this.debug.sweep(this.origin,this.origin.clone().addScaledVector(arrow.direction,travel));
    this.ray.set(this.origin,arrow.direction);this.ray.near=0;this.ray.far=travel;
    this.hits.length=0;this.ray.intersectObjects(this.targets,true,this.hits);
    const atBirth=kind==='出生时箭身重叠';let birthContact=false;
    for(const intersection of this.hits){
      const id=this.targetId(intersection.object);if(!id||arrow.hitIds.has(id))continue;
      this.debug?.capture(arrow.object,arrow.direction,this.tip*this.scale,this.origin,travel,intersection.point,id,kind);
      arrow.hitIds.add(id);this.lastHit=id;this.hitCount++;
      const hit:ArrowHit={id,point:intersection.point.clone(),direction:arrow.direction.clone()};
      if(!arrow.pierce){
        arrow.object.position.copy(intersection.point).addScaledVector(arrow.direction,-this.tip*this.scale);
        arrow.distance+=intersection.distance;
        if(this.hitLinger<=0)this.recycle(arrow);else arrow.lingerRemaining=this.hitLinger;
        this.onHit?.(hit);return intersection.distance;
      }
      this.beginPierceExitWatch(arrow,intersection.object,intersection.point);
      // A point-blank arrow can be born with its shaft already inside a body.
      // Never rewind it to that surface or count overlap length as travelled.
      if(!atBirth){
        arrow.object.position.copy(intersection.point).addScaledVector(arrow.direction,-this.tip*this.scale);
        arrow.distance+=intersection.distance;
      }
      if(this.pierceGravity)arrow.gravityArmed=true;
      arrow.piercePauseRemaining+=this.piercePause;
      if(this.piercePause>0){
        arrow.piercePauseTarget=this.practiceRoot(intersection.object);
        arrow.piercePauseTarget?.getWorldPosition(arrow.piercePauseTargetPosition);
      }
      this.onHit?.(hit);
      if(!atBirth||!arrow.active||(this.debug?.enabled&&this.debug.paused))return atBirth?0:intersection.distance;
      birthContact=true;
    }
    return birthContact?0:null;
  }

  /** Follow translation only: recoil must not rotate or scale the arrow.
   * Capture before onHit so immediate recoil is included, including parent movement. */
  private followPausedTarget(arrow:Arrow){
    const target=arrow.piercePauseTarget;
    if(!target)return;
    if(!target.parent||!this.targets.includes(target)){
      arrow.piercePauseTarget=null;
      return;
    }
    target.getWorldPosition(this.exitScratch);
    this.exitScratch.sub(arrow.piercePauseTargetPosition);
    arrow.object.position.add(this.exitScratch);
    // Keep the watched far face aligned: recoil alone must not count as exiting.
    if(arrow.pierceExitTarget===target)arrow.pierceExitPoint?.add(this.exitScratch);
    arrow.piercePauseTargetPosition.add(this.exitScratch);
  }

  /** Integrate the tip ballistically; short swept segments retain enemy collision.
   * The model follows velocity, then remains at its impact angle in the ground. */
  private advanceGravity(arrow:Arrow,dt:number){
    const start=arrow.object.position.clone().addScaledVector(arrow.direction,this.tip*this.scale);
    const horizontal=arrow.direction.clone().setY(0).normalize();
    const vy=arrow.verticalSpeed,g=this.gravity;
    const groundTime=start.y<=0?0:g>0?(vy+Math.sqrt(vy*vy+2*g*start.y))/g:vy<0?-start.y/vy:Infinity;
    const step=Math.min(dt,1/120,groundTime);
    const end=start.clone().addScaledVector(horizontal,arrow.speed*step);
    end.y+=vy*step-.5*g*step*step;
    const delta=end.clone().sub(start),travel=delta.length();
    if(travel>1e-12)arrow.direction.copy(delta).divideScalar(travel);
    this.origin.copy(start);
    const contact=this.resolveTrigger(arrow,travel);
    const spent=contact===null?step:step*contact/travel;
    arrow.verticalSpeed=vy-g*spent;
    const tip=contact===null?end:arrow.object.position.clone().addScaledVector(arrow.direction,this.tip*this.scale);
    arrow.direction.copy(horizontal).multiplyScalar(arrow.speed);arrow.direction.y=arrow.verticalSpeed;arrow.direction.normalize();
    arrow.object.quaternion.setFromUnitVectors(this.forward,arrow.direction);
    arrow.object.position.copy(tip).addScaledVector(arrow.direction,-this.tip*this.scale);
    if(contact===null){
      arrow.distance+=travel;
      if(groundTime<=step+1e-10){
        tip.y=0;
        const depth=Math.min(.18,(this.tip-this.tail)*this.scale*.12);
        arrow.object.position.copy(tip).addScaledVector(arrow.direction,depth-this.tip*this.scale);
        arrow.grounded=true;arrow.groundRemaining=3;arrow.trail.clear();
        arrow.pierceExitTarget=null;arrow.pierceExitPoint=null;
      }
    }
    return spent;
  }

  private advance(arrow:Arrow,dt:number){
    if(!arrow.active||dt<=0)return;
    if(arrow.lingerRemaining>0){arrow.lingerRemaining-=dt;if(arrow.lingerRemaining<=0)this.recycle(arrow);return;}
    let remaining=dt;
    while(arrow.active&&remaining>1e-12){
      if(arrow.grounded){arrow.groundRemaining-=remaining;if(arrow.groundRemaining<=0)this.recycle(arrow);return;}

      // A disappearing target still applies its exit speed, but does not cancel
      // the entry pause that is already in progress.
      if(arrow.piercePauseRemaining>0)this.followPausedTarget(arrow);
      this.tryApplyAfterPierceSpeed(arrow);
      const resisting=arrow.piercePauseRemaining>0;
      if(arrow.gravityArmed&&!resisting){
        remaining=Math.max(0,remaining-this.advanceGravity(arrow,remaining));
        if(this.debug?.enabled&&this.debug.paused)return;
        this.tryApplyAfterPierceSpeed(arrow);
        continue;
      }
      this.origin.copy(arrow.object.position).addScaledVector(arrow.direction,this.tip*this.scale);
      const speed=resisting?this.pierceEntrySpeed:arrow.speed;
      let flightTime=resisting?Math.min(remaining,arrow.piercePauseRemaining):remaining;
      if(arrow.pierceExitPoint&&speed>0){
        const untilExit=this.exitScratch.copy(arrow.pierceExitPoint).sub(this.origin).dot(arrow.direction)/speed;
        if(untilExit>0)flightTime=Math.min(flightTime,untilExit);
      }
      // Consume only elapsed time, even if a new body interrupts this segment.
      const pauseBefore=arrow.piercePauseRemaining;
      const travel=speed*flightTime,contact=this.resolveTrigger(arrow,travel);
      const spent=contact!==null?contact/speed:flightTime;
      if(resisting&&arrow.active){
        arrow.piercePauseRemaining=Math.max(0,arrow.piercePauseRemaining-Math.min(spent,pauseBefore));
        if(arrow.piercePauseRemaining<=1e-12){arrow.piercePauseRemaining=0;arrow.piercePauseTarget=null;}
      }
      if(contact!==null){
        if(!arrow.active||!arrow.pierce||(this.debug?.enabled&&this.debug.paused))return;
        remaining=Math.max(0,remaining-contact/speed);
        continue;
      }
      arrow.object.position.addScaledVector(arrow.direction,travel);arrow.distance+=travel;
      remaining=Math.max(0,remaining-flightTime);this.tryApplyAfterPierceSpeed(arrow);
    }
  }

  update(dt: number) {
    for (const arrow of this.pool){if(this.debug?.enabled&&this.debug.paused)break;this.advance(arrow, dt);}
  }

  prepare(camera:THREE.Camera,settings:ArrowTrailSettings=ARROW_TRAIL_DEFAULTS,recycleOffscreen=true){
    camera.updateWorldMatrix(true,false);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection,camera.coordinateSystem,camera.reversedDepth);
    this.paintMaterial.color.setHex(settings.arrowPaintColor);
    for(const arrow of this.pool){
      if(!arrow.active)continue;
      arrow.paint.visible=!!settings.arrowPaintEnabled;arrow.paint.scale.setScalar(settings.arrowPaintRadius);arrow.paint.position.set(0,0,this.tip+settings.arrowPaintOffset);
      this.tipPoint.copy(arrow.object.position).addScaledVector(arrow.direction,this.tail*this.scale);
      if(arrow.grounded)arrow.trail.clear();
      else arrow.trail.update(this.tipPoint,arrow.direction,arrow.distance,this.scale,camera,settings);
      // Check after rebuilding the ribbon, using the current render camera (including
      // zoom/aspect changes). Crossing the room boundary does not end flight.
      if(recycleOffscreen&&!this.intersectsView(arrow.object)&&!this.intersectsView(arrow.trail.mesh))this.recycle(arrow);
    }
  }

  private intersectsView(object:THREE.Object3D){
    if(!object.visible)return false;
    object.updateWorldMatrix(true,true);
    this.visibleBounds.makeEmpty();
    object.traverseVisible(child=>{
      if(!(child instanceof THREE.Mesh))return;
      const geometry=child.geometry;
      if(!geometry.boundingBox)geometry.computeBoundingBox();
      this.meshBounds.copy(geometry.boundingBox!).applyMatrix4(child.matrixWorld);
      this.visibleBounds.union(this.meshBounds);
    });
    return !this.visibleBounds.isEmpty()&&this.viewFrustum.intersectsBox(this.visibleBounds);
  }

  prepareWarmup(count:number,camera:THREE.Camera){
    while(this.pool.length<count)this.allocate();
    for(const arrow of this.pool){arrow.active=true;arrow.object.visible=true;arrow.object.position.set(0,1,0);arrow.direction.set(0,0,-1);arrow.object.quaternion.setFromUnitVectors(this.forward,arrow.direction);arrow.distance=2;}
    this.prepare(camera,ARROW_TRAIL_DEFAULTS,false);
  }

  snapshot() {
    return {
      scale: this.scale,
      speed: this.speed,
      speedAfterPierce: this.speedAfterPierce,
      pierce: this.pierce,
      hitLinger: this.hitLinger,
      piercePauseMs:this.piercePause*1000,
      pierceEntrySpeed:this.pierceEntrySpeed,
      pierceGravity:this.pierceGravity,
      gravity:this.gravity,
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
        speed: a.speed,
        pierce: a.pierce,
        gravityArmed:a.gravityArmed,verticalSpeed:a.verticalSpeed,grounded:a.grounded,groundRemaining:a.groundRemaining,
        afterPierceApplied: a.afterPierceApplied,
        lingerRemaining: a.lingerRemaining,
        piercePauseRemaining:a.piercePauseRemaining,
        hitIds: [...a.hitIds],
      })),
    };
  }
}
