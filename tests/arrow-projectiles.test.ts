import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three/webgpu';
import { ArrowProjectiles, ARROW_SPEED } from '../src/arrow-projectiles.ts';

const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`);
function fixture() {
  const scene = new THREE.Scene();
  const template = new THREE.Mesh(new THREE.BoxGeometry(.1, .1, 1), new THREE.MeshBasicMaterial());
  return { scene, arrows: new ArrowProjectiles(scene, template) };
}
function enemy(scene: THREE.Scene, z: number, id: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshBasicMaterial());
  mesh.position.set(0, 1, z); mesh.userData.practiceTarget = id; scene.add(mesh); mesh.updateMatrixWorld(); return mesh;
}
const origin = new THREE.Vector3(0, 1, 0), aim = new THREE.Vector3(0, 1, 20);

test('constant speed and direction are independent of update rate; wall recycles misses', () => {
  for (const hz of [30, 60, 120]) {
    const { arrows } = fixture();
    arrows.setRoomBounds(16, 38);
    arrows.fire(origin, aim, Infinity);
    aim.x = 10; // A later target change must not turn an existing arrow.
    for (let i = 0; i < hz / 5; i++) arrows.update(1 / hz);
    const active = arrows.snapshot().active;
    assert.equal(active.length, 1); near(active[0].position[2], ARROW_SPEED * .2); near(active[0].position[0], 0);
    // Tip past ±roomLength/2 despawns; no range budget.
    for (let i = 0; i < hz; i++) arrows.update(1 / hz);
    assert.equal(arrows.snapshot().active.length, 0); aim.x = 0;
  }
});

test('arrow tip hits the first surface, with no tunnelling at large time steps', () => {
  const { scene, arrows } = fixture();
  const first = enemy(scene, 5, 'near'), second = enemy(scene, 10, 'far');
  arrows.setRoomBounds(16, 38);
  arrows.setTargets([second, first]); arrows.fire(origin, aim, Infinity);
  arrows.update(.079); assert.equal(arrows.snapshot().active.length, 1);
  arrows.update(.002); assert.equal(arrows.snapshot().active.length, 0);
  assert.equal(arrows.snapshot().lastHit, 'near'); assert.equal(first.visible, true);
  arrows.fire(origin, aim, Infinity); arrows.update(.5);
  assert.equal(arrows.snapshot().lastHit, 'near'); assert.equal(arrows.snapshot().hits, 2);
});

test('pool reuses objects and shared resources; setTargets does not clear flying arrows', () => {
  const { scene, arrows } = fixture();
  const target = enemy(scene, 1, 'close'); arrows.setTargets([target]);
  arrows.setRoomBounds(16, 38);
  for (let i = 0; i < 40; i++) { arrows.fire(origin, aim, Infinity); arrows.update(.1); }
  assert.equal(arrows.snapshot().allocated, 4); assert.equal(arrows.snapshot().hits, 40);
  const objects = scene.children.filter(o => o.name === 'ArcheroArrow') as THREE.Mesh[];
  assert.ok(objects.every(o => o.geometry === objects[0].geometry && o.material === objects[0].material));
  arrows.setTargets([]); // Empty targets so the next shot is not point-blank recycled.
  arrows.fire(origin, new THREE.Vector3(0, 1, 20), Infinity);
  assert.equal(arrows.snapshot().active.length, 1);
  arrows.setTargets([target]); // Must not recycle mid-flight arrows.
  assert.equal(arrows.snapshot().active.length, 1);
  arrows.clear();
  assert.equal(arrows.snapshot().active.length, 0); assert.ok(objects.every(o => !o.visible));
});

test('new arrow advances only by time remaining after release', () => {
  const { arrows } = fixture(); arrows.setRoomBounds(16, 38); arrows.fire(origin, aim, Infinity, .01);
  near(arrows.snapshot().active[0].distance, .5);
});

test('scaled arrows collide at the scaled tip and pooled arrows retain the new size', () => {
  const { scene, arrows } = fixture();
  arrows.setRoomBounds(16, 38);
  arrows.setTargets([enemy(scene, 5, 'near')]);
  arrows.setScale(6); arrows.fire(origin, aim, Infinity);
  arrows.update(.029); assert.equal(arrows.snapshot().active.length, 1);
  arrows.update(.002); assert.equal(arrows.snapshot().hits, 1);
  arrows.setScale(1.5); arrows.fire(origin, aim, Infinity);
  arrows.update(.06); assert.equal(arrows.snapshot().active.length, 1);
  arrows.update(1);
  assert.equal(arrows.snapshot().hits, 2);
  assert.ok(scene.children.filter(o => o.name === 'ArcheroArrow').every(o => o.scale.x === 1.5));
});

test('speed changes apply to arrows already in flight and keep swept collision at maximum speed', () => {
  const { scene, arrows } = fixture();
  arrows.setRoomBounds(16, 38);
  arrows.setTargets([enemy(scene, 10, 'target')]);
  arrows.setSpeed(10); arrows.fire(origin, aim, Infinity); arrows.update(.2);
  near(arrows.snapshot().active[0].distance, 2);
  arrows.setSpeed(20); arrows.update(.1); near(arrows.snapshot().active[0].distance, 4);
  arrows.setSpeed(200); arrows.update(.1);
  assert.equal(arrows.snapshot().hits, 1); assert.equal(arrows.snapshot().active.length, 0);
});

test('pierce damages each enemy once, keeps flying, and only despawns on the room wall', () => {
  const { scene, arrows } = fixture();
  const hits: string[] = [];
  arrows.onHit = hit => hits.push(hit.id);
  arrows.setPierce(true);
  arrows.setRoomBounds(16, 20);
  arrows.setTargets([enemy(scene, 5, 'near'), enemy(scene, 10, 'far')]);
  arrows.fire(origin, aim, 32); // Short legacy range must not matter.
  for (let i = 0; i < 40; i++) arrows.update(.05);
  assert.deepEqual(hits, ['near', 'far']);
  assert.equal(arrows.snapshot().hits, 2);
  assert.equal(arrows.snapshot().active.length, 0);
});

test('pierce still hits a far mid-flight enemy beyond the old range budget', () => {
  const { scene, arrows } = fixture();
  const hits: string[] = [];
  arrows.onHit = hit => hits.push(hit.id);
  arrows.setPierce(true);
  arrows.setRoomBounds(16, 38);
  arrows.setTargets([enemy(scene, -17, 'far')]);
  arrows.fire(new THREE.Vector3(0, 1, 16), new THREE.Vector3(0, 1, -17), 32);
  for (let i = 0; i < 80; i++) arrows.update(.02);
  assert.deepEqual(hits, ['far']);
  assert.equal(arrows.snapshot().active.length, 0);
});

test('without pierce a mid-flight hit deals damage then the arrow disappears', () => {
  const { scene, arrows } = fixture();
  const hits: string[] = [];
  arrows.onHit = hit => hits.push(hit.id);
  arrows.setPierce(false);
  arrows.setRoomBounds(16, 38);
  arrows.setTargets([enemy(scene, 8, 'near'), enemy(scene, 14, 'far')]);
  arrows.fire(origin, aim, Infinity);
  arrows.update(.1);
  assert.equal(arrows.snapshot().active.length, 1);
  assert.deepEqual(hits, []);
  arrows.update(.06);
  assert.deepEqual(hits, ['near']);
  assert.equal(arrows.snapshot().lastHit, 'near');
  assert.equal(arrows.snapshot().hits, 1);
  assert.equal(arrows.snapshot().active.length, 0);
});

test('arrow never despawns from range alone when walls are unbounded', () => {
  const { arrows } = fixture();
  arrows.setPierce(true);
  arrows.fire(origin, aim, 5);
  for (let i = 0; i < 60; i++) arrows.update(.05);
  assert.equal(arrows.snapshot().active.length, 1);
  assert.ok(arrows.snapshot().active[0].distance > 5);
});

test('flight stays horizontal at bow height even when aim height differs', () => {
  const { arrows } = fixture();
  arrows.setRoomBounds(16, 38);
  const from = new THREE.Vector3(0, 2.4, 0);
  arrows.fire(from, new THREE.Vector3(0, 0.2, 10), Infinity);
  const first = arrows.snapshot().active[0];
  assert.equal(first.direction[1], 0);
  near(first.direction[2], 1);
  near(first.position[1], 2.4);
  arrows.update(.2);
  const next = arrows.snapshot().active[0];
  near(next.position[1], 2.4);
  near(next.position[2], ARROW_SPEED * .2);
});

test('trail grows from the actual scaled tail, tapers to a point and clears on recycle',()=>{
  const {scene,arrows}=fixture(),camera=new THREE.PerspectiveCamera();camera.position.set(0,24,24);
  arrows.setScale(2);arrows.fire(origin,aim);arrows.prepare(camera);
  const trails=scene.children.filter(o=>o.name==='ArrowTailTrail') as THREE.Mesh[];
  assert.equal(trails.filter(t=>t.visible).length,0);
  arrows.update(.01);arrows.prepare(camera);
  const trail=trails.find(t=>t.visible)!;near(trail.position.z,-.5);
  const p=trail.geometry.getAttribute('position');
  near(Math.hypot(p.getX(0)-p.getX(1),p.getY(0)-p.getY(1),p.getZ(0)-p.getZ(1)),.36);
  near(p.getZ(24),-.5);near(p.getX(24),p.getX(25));near(p.getY(24),p.getY(25));
  arrows.update(1);arrows.prepare(camera);near(p.getZ(24),-6.4);
  arrows.clear();assert.equal(trails.some(t=>t.visible),false);
  arrows.fire(origin,aim);arrows.prepare(camera);assert.equal(trails.some(t=>t.visible),false);
});
