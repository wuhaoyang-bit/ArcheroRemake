import * as THREE from 'three/webgpu';

export const BOW_NODE = 'WeaponHand1001_gong';

/** Attach at BodyMask.LeftWeapon, with the grip origin unchanged.
 * Flip around the imported bow's long axis so its concave side faces the character.
 * See docs/bow-attachment.md for the resource and native-code evidence.
 */
export function attachBow(character: THREE.Object3D, bow: THREE.Object3D) {
  const hand = character.getObjectByName('left');
  const mesh = bow.getObjectByName(BOW_NODE);
  if (!hand || !mesh) throw new Error('红弓资源缺少持握挂点或 gong 网格。');
  const grip = new THREE.Group();
  grip.name = 'RedBowGrip';
  grip.rotation.z = Math.PI;

  hand.add(grip);
  grip.add(bow);
  return mesh;
}

/** Preserve the source phase speeds; place draw immediately before release,
 * then play the original recoil and hold its final reset through recovery.
 */
export function bowScaleTrack(clips: THREE.AnimationClip[], release: number, duration: number) {
  const phase = (name: string) => {
    const clip = THREE.AnimationClip.findByName(clips, name);
    if (!clip || clip.tracks.length !== 1 || clip.tracks[0].name !== `${BOW_NODE}.scale`
      || clip.tracks[0].getValueSize() !== 3
      || clip.tracks[0].getInterpolation() !== THREE.InterpolateLinear) {
      throw new Error(`红弓缩放动画缺失或格式不符：${name}`);
    }
    return clip;
  };
  const prev = phase('weapon1001_prev'), end = phase('weapon1001_end');
  const reset = phase('weapon1001_reset').tracks[0];
  const start = release - prev.duration;
  if (start < 0 || release + end.duration > duration) throw new Error('角色攻击时长不足以容纳红弓动画。');
  const times: number[] = [], values: number[] = [];
  const append = (time: number, value: ArrayLike<number>) => {
    if (times.length && Math.abs(time - times[times.length - 1]) < 1e-6) {
      times.pop(); values.splice(values.length - 3, 3);
    }
    times.push(time); values.push(value[0], value[1], value[2]);
  };
  append(0, reset.values);
  for (const [clip, offset] of [[prev, start], [end, release]] as const) {
    const track = clip.tracks[0];
    track.times.forEach((t, i) => append(t + offset, track.values.slice(i * 3, i * 3 + 3)));
  }
  append(duration, reset.values);
  return new THREE.VectorKeyframeTrack(`${BOW_NODE}.scale`, times, values);
}

export function bowRestTrack() {
  return new THREE.VectorKeyframeTrack(`${BOW_NODE}.scale`, [0], [1, 1, 1]);
}
