import * as THREE from 'three/webgpu';
import { AnimationBlend, type Mode } from './controller.ts';

/** Join the supplied 60 FPS phases, retaining every key including both seam poses. */
export function bowAttackClip(prev: THREE.AnimationClip, end: THREE.AnimationClip) {
  const offset = prev.duration + 1 / 60;
  const endTracks = new Map(end.tracks.map(track => [track.name, track]));
  if (prev.tracks.length !== end.tracks.length) throw new Error('射箭动画的两段骨骼轨道不匹配。');
  const tracks = prev.tracks.map(track => {
    const next = endTracks.get(track.name);
    if (!next || next.ValueTypeName !== track.ValueTypeName || next.getValueSize() !== track.getValueSize()
      || !canJoin(track) || !canJoin(next)) throw new Error(`射箭动画轨道不匹配：${track.name}`);
    const joined = track.clone();
    // Blender optimizes constant channels to STEP independently in each phase.
    // Linear interpolation preserves those constants and bridges the seam in one frame.
    joined.setInterpolation(THREE.InterpolateLinear);
    joined.times = new Float32Array([...track.times, ...Array.from(next.times, time => offset + time)]);
    joined.values = new Float32Array([...track.values, ...next.values]);
    return joined;
  });
  return new THREE.AnimationClip('BowAttack', offset + end.duration, tracks);
}

function canJoin(track: THREE.KeyframeTrack) {
  if (track.getInterpolation() === THREE.InterpolateLinear) return true;
  const size = track.getValueSize();
  return track.getInterpolation() === THREE.InterpolateDiscrete
    && track.values.every((value, index) => Math.abs(value - track.values[index % size]) < 1e-6);
}

/** Animation only: release requests never move the player or choose its facing. */
export class CharacterAnimation {
  readonly blend = new AnimationBlend();
  private attackBlend = new AnimationBlend();
  private handledRequest: number | null = null;
  private playing = false;

  constructor(readonly mixer: THREE.AnimationMixer, readonly idle: THREE.AnimationAction,
    readonly run: THREE.AnimationAction, readonly attack: THREE.AnimationAction, readonly releaseTime=0.55) {
    attack.setLoop(THREE.LoopRepeat, Infinity);
    attack.clampWhenFinished = false;
    attack.setEffectiveWeight(0);
  }

  update(dt: number, mode: Mode, request: number | null, blendDuration: number, runSpeed: number, onRelease?: (remaining: number) => void, attackSpeed = 1) {
    const speed = Number.isFinite(attackSpeed) ? Math.max(.25, Math.min(6, attackSpeed)) : 1;
    if (request === null && this.playing) {
      // Pressing interrupts immediately; losing the target returns to Idle.
      this.attack.stop(); this.attack.setEffectiveWeight(0);
      this.playing = false; this.handledRequest = null;
      this.attackBlend.reset(0);
      this.blend.reset(mode === 'idle' ? 0 : 1);
    }
    if (request !== null && request !== this.handledRequest) {
      this.handledRequest = request;
      this.attack.reset().play();
      this.playing = true;
      this.attackBlend.setTarget(1, blendDuration);
    }

    this.blend.setTarget(mode === 'idle' ? 0 : 1, blendDuration);
    const runWeight = this.blend.update(dt), attackWeight = this.attackBlend.update(dt);
    this.idle.setEffectiveWeight((1 - runWeight) * (1 - attackWeight));
    this.run.setEffectiveWeight(runWeight * (1 - attackWeight)).setEffectiveTimeScale(runSpeed);
    this.attack.setEffectiveWeight(attackWeight).setEffectiveTimeScale(speed);
    // Sample the hand at the release pose, even when an update crosses the event.
    // The callback receives only the post-release flight time left in this update.
    let remaining = dt;
    if (this.playing && onRelease && dt > 0) {
      const duration = this.attack.getClip().duration;
      let untilRelease = this.releaseTime - this.attack.time;
      if (untilRelease <= 1e-9) untilRelease += duration;
      untilRelease /= speed;
      while (untilRelease <= remaining + 1e-9) {
        const step = Math.min(untilRelease, remaining);
        this.mixer.update(step);
        remaining = Math.max(0, remaining - step);
        onRelease(remaining);
        untilRelease = duration / speed;
      }
    }
    this.mixer.update(remaining);

  }

  snapshot() {
    return { speed:this.attack.getEffectiveTimeScale(), releaseTime:this.releaseTime, playing: this.playing, time: this.attack.time,
      duration: this.attack.getClip().duration, weight: this.attack.getEffectiveWeight(),
      idleWeight: this.idle.getEffectiveWeight(), runWeight: this.run.getEffectiveWeight() };
  }
}
