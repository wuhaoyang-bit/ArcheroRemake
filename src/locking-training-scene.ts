import * as THREE from 'three/webgpu';
import { lockingTargets } from './training.ts';

/** A stationary wood-and-straw practice dummy; no selection or combat state. */
function practiceDummy() {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x81502d, roughness: .95 });
  const straw = new THREE.MeshStandardMaterial({ color: 0xe5b76a, roughness: 1 });
  const rope = new THREE.MeshStandardMaterial({ color: 0x9d6939, roughness: 1 });
  const canvas = new THREE.MeshStandardMaterial({ color: 0xffefcd, roughness: .95 });
  const red = new THREE.MeshStandardMaterial({ color: 0xc45640, roughness: .9 });
  const mesh = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
    group.add(object); return object;
  };
  mesh(new THREE.CylinderGeometry(.68, .78, .18, 24), wood, 0, .09, 0);
  mesh(new THREE.CylinderGeometry(.13, .18, 2.1, 12), wood, 0, 1.1, 0);
  mesh(new THREE.CylinderGeometry(.45, .53, 1.12, 16), straw, 0, 1.65, 0);
  for (const y of [1.18, 2.1]) mesh(new THREE.CylinderGeometry(.47, .48, .09, 16), rope, 0, y, 0);
  const arms = mesh(new THREE.CylinderGeometry(.14, .17, 2.05, 12), wood, 0, 1.92, 0);
  arms.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    const sleeve = mesh(new THREE.CylinderGeometry(.23, .25, .43, 12), straw, side * .76, 1.92, 0);
    sleeve.rotation.z = Math.PI / 2;
  }
  mesh(new THREE.SphereGeometry(.39, 20, 14), straw, 0, 2.59, 0).scale.set(1, 1.12, .94);
  mesh(new THREE.CylinderGeometry(.4, .4, .065, 20), rope, 0, 2.66, 0);
  // The painted bullseye faces the center of the field; it is part of the prop.
  const target = mesh(new THREE.CylinderGeometry(.38, .38, .08, 32), canvas, 0, 1.68, .48);
  target.rotation.x = Math.PI / 2;
  mesh(new THREE.RingGeometry(.20, .29, 32), red, 0, 1.68, .526);
  mesh(new THREE.CircleGeometry(.10, 24), red, 0, 1.68, .528);
  return group;
}

export function buildLockingTraining(width: number, length: number, targets = lockingTargets(width,length)) {
  const group = new THREE.Group(); group.name = 'locking-training';
  const dummy = practiceDummy();
  for (const target of targets) {
    const prop = dummy.clone(true);
    prop.name = `practice-dummy-${target.id}`;
    prop.userData.practiceTarget = target.id;
    prop.position.set(target.x, 0, target.z);
    prop.rotation.y = Math.atan2(-target.x, -target.z);
    group.add(prop);
  }
  // A painted origin marker makes the arrangement readable while walking around.
  const paint = new THREE.MeshBasicMaterial({ color: 0xfff6d5, transparent: true, opacity: .65, depthWrite: false });
  const center = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.41, 64), paint);
  center.rotation.x = -Math.PI / 2; center.position.y = .04; group.add(center);
  const tickGeometry = new THREE.PlaneGeometry(.07, .28);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4, tick = new THREE.Mesh(tickGeometry, paint);
    tick.rotation.set(-Math.PI / 2, 0, -angle);
    tick.position.set(Math.sin(angle) * 1.64, .04, Math.cos(angle) * 1.64);
    group.add(tick);
  }
  return group;
}
