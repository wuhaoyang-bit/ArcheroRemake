import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { bowAttackClip } from './character-animation.ts';
import { attachBow, bowScaleTrack, bowRestTrack } from './bow.ts';

export async function loadCharacter() {
  const loader = new GLTFLoader();
  const [gltf, bow] = await Promise.all([
    loader.loadAsync(`${import.meta.env.BASE_URL}models/archero-default.glb`),
    loader.loadAsync(`${import.meta.env.BASE_URL}models/archero-red-bow.glb`),
  ]);
  const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle');
  const runClip = THREE.AnimationClip.findByName(gltf.animations, 'Run');
  if (!idleClip || !runClip) throw new Error('角色资源缺少 Idle 或 Run 动画。');
  const attackPrev = THREE.AnimationClip.findByName(gltf.animations, 'AttackPrev');
  const attackEnd = THREE.AnimationClip.findByName(gltf.animations, 'AttackEnd');
  if (!attackPrev || !attackEnd) throw new Error('角色资源缺少射箭攻击动画。');

  // The exported static parent already places the feet at y=0, normalizes body
  // height to 3.25, and preserves +Z forward. Do not rescale using the bow bounds.
  const model = gltf.scene;
  // Remove only the weapon mesh; retain the original character bones and clips.
  model.getObjectByName('Bow_WeaponHand101001')?.removeFromParent();
  attachBow(model, bow.scene);
  idleClip.tracks.push(bowRestTrack());
  runClip.tracks.push(bowRestTrack());
  model.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const idle = mixer.clipAction(idleClip).setLoop(THREE.LoopRepeat, Infinity).play();
  const run = mixer.clipAction(runClip).setLoop(THREE.LoopRepeat, Infinity).play();
  idle.setEffectiveWeight(1);
  run.setEffectiveWeight(0);
  const attackClip = bowAttackClip(attackPrev, attackEnd);
  const attackReleaseTime = attackPrev.duration + 1 / 60;
  attackClip.tracks.push(bowScaleTrack(bow.animations, attackReleaseTime, attackClip.duration));
  const attack = mixer.clipAction(attackClip).setEffectiveWeight(0);
  mixer.update(0);
  return { model, mixer, idle, run, attack, attackReleaseTime };
}
