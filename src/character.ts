import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function loadCharacter() {
  const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/archero-default.glb`);
  const idleClip = THREE.AnimationClip.findByName(gltf.animations, 'Idle');
  const runClip = THREE.AnimationClip.findByName(gltf.animations, 'Run');
  if (!idleClip || !runClip) throw new Error('角色资源缺少 Idle 或 Run 动画。');

  // The exported static parent already places the feet at y=0, normalizes body
  // height to 3.25, and preserves +Z forward. Do not rescale using the bow bounds.
  const model = gltf.scene;
  const bow = model.getObjectByName('Bow_WeaponHand101001');
  if (bow instanceof THREE.SkinnedMesh) {
    const handIndex = bow.skeleton.bones.findIndex(bone => bone.name === 'right');
    if (handIndex < 0) throw new Error('弓模型缺少手部挂点。');
    // The supplied bow faces backwards. Turn it around its longitudinal axis
    // in the attachment's bind space, preserving the grip and all skin weights.
    // Use the original bind matrix: the live bindMatrixInverse includes the
    // model's current world scale and would incorrectly shrink the weapon.
    const meshToHand = bow.skeleton.boneInverses[handIndex].clone().multiply(bow.bindMatrix);
    const correction = meshToHand.clone().invert()
      .multiply(new THREE.Matrix4().makeRotationZ(Math.PI)).multiply(meshToHand);
    bow.geometry.applyMatrix4(correction);
  }
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
  mixer.update(0);
  return { model, mixer, idle, run };
}
