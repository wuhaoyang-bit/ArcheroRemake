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

test('constant speed and direction are independent of update rate; range recycles misses', () => {
  for (const hz of [30, 60, 120]) {
    const { arrows } = fixture(); arrows.fire(origin, aim, 20);
    aim.x = 10; // A later target change must not turn an existing arrow.
    for (let i = 0; i < hz / 5; i++) arrows.update(1 / hz);
    const active = arrows.snapshot().active;
    assert.equal(active.length, 1); near(active[0].position[2], ARROW_SPEED * .2); near(active[0].position[0], 0);
    arrows.update(1); assert.equal(arrows.snapshot().active.length, 0); aim.x = 0;
  }
});

test('arrow tip hits the first surface, with no tunnelling at large time steps', () => {
  const { scene, arrows } = fixture();
  const first = enemy(scene, 5, 'near'), second = enemy(scene, 10, 'far');
  arrows.setTargets([second, first]); arrows.fire(origin, aim, 30);
  arrows.update(.079); assert.equal(arrows.snapshot().active.length, 1);
  arrows.update(.002); assert.equal(arrows.snapshot().active.length, 0);
  assert.equal(arrows.snapshot().lastHit, 'near'); assert.equal(first.visible, true);
  arrows.fire(origin, aim, 30); arrows.update(.5);
  assert.equal(arrows.snapshot().lastHit, 'near'); assert.equal(arrows.snapshot().hits, 2);
});

test('pool reuses objects and shared resources, handles point blank and room replacement', () => {
  const { scene, arrows } = fixture();
  const target = enemy(scene, 1, 'close'); arrows.setTargets([target]);
  for (let i = 0; i < 40; i++) { arrows.fire(origin, aim, 30); arrows.update(.1); }
  assert.equal(arrows.snapshot().allocated, 4); assert.equal(arrows.snapshot().hits, 40);
  const objects = scene.children.filter(o => o.name === 'ArcheroArrow') as THREE.Mesh[];
  assert.ok(objects.every(o => o.geometry === objects[0].geometry && o.material === objects[0].material));
  arrows.setTargets([]); arrows.fire(origin, aim, 30); arrows.setTargets([]);
  assert.equal(arrows.snapshot().active.length, 0); assert.ok(objects.every(o => !o.visible));
});

test('new arrow advances only by time remaining after release', () => {
  const { arrows } = fixture(); arrows.fire(origin, aim, 30, .01);
  near(arrows.snapshot().active[0].distance, .5);
});


test('scaled arrows collide at the scaled tip and pooled arrows retain the new size', () => {
  const { scene, arrows } = fixture(); arrows.setTargets([enemy(scene, 5, 'near')]);
  arrows.setScale(6); arrows.fire(origin, aim, 30);
  arrows.update(.029); assert.equal(arrows.snapshot().active.length, 1);
  arrows.update(.002); assert.equal(arrows.snapshot().hits, 1);
  arrows.setScale(1.5); arrows.fire(origin, aim, 30);
  arrows.update(.06); assert.equal(arrows.snapshot().active.length, 1);
  arrows.setScale(6); assert.equal(arrows.snapshot().active.length, 0);
  assert.ok(scene.children.filter(o => o.name === 'ArcheroArrow').every(o => o.scale.x === 6));
});


test('speed changes apply to arrows already in flight and keep swept collision at maximum speed', () => {
  const { scene, arrows } = fixture(); arrows.setTargets([enemy(scene, 10, 'target')]);
  arrows.setSpeed(10); arrows.fire(origin, aim, 30); arrows.update(.2);
  near(arrows.snapshot().active[0].distance, 2);
  arrows.setSpeed(20); arrows.update(.1); near(arrows.snapshot().active[0].distance, 4);
  arrows.setSpeed(200); arrows.update(.1);
  assert.equal(arrows.snapshot().hits, 1); assert.equal(arrows.snapshot().active.length, 0);
});
