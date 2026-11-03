/**
 * Yellow-slime walk deform (PLAN-EXEC 终版 AABCAA).
 * Lean/scale/eye springs via hit-response.spring; shear via preview shearAtHeight.
 */
import type { BufferAttribute } from 'three';
import { spring } from './hit-response.ts';
import { HIT_BEND_BODY_HEIGHT, yBaseFromRestY } from './hit-bend.ts';
import type { GaitLocalState } from './slime-fullness.ts';
import type { SlimeWalkDeformSettings } from './slime-walk-deform-config.ts';

export type WalkDeformSettings = SlimeWalkDeformSettings & { slimeEyeY?: number };

function springToward(x: number, v: number, target: number, dt: number, f: number, z: number) {
  const s = spring(x - target, v, dt, f, z);
  return { x: s.x + target, v: s.v };
}

/** Preview pauseBlendWeight: 0→1→0 smoothstep envelope over pause. */
export function pauseBlendWeight(st: GaitLocalState) {
  if (!st.inPause || st.pause <= 1e-6) return 0;
  let t = (st.local - st.period) / st.pause;
  t = Math.min(1, Math.max(0, t));
  const rise = t < 0.5 ? t * 2 : (1 - t) * 2;
  const u = Math.min(1, Math.max(0, rise));
  return u * u * (3 - 2 * u);
}

/** Preview shearAtHeight — outward belly, clamp ≤ top. */
export function shearAtHeight(t: number, shearBelly: number, shearTop: number) {
  t = Math.min(1, Math.max(0, t));
  const easeOut = 1 - (1 - t) * (1 - t);
  const base = easeOut * shearTop;
  const bellyVal = Math.max(0, shearBelly) * 0.35 * (4 * t * (1 - t));
  return Math.min(shearTop, base + bellyVal);
}

/** Horizontal body width (diameter) from bendBase xz; PLAN G3. */
export function bodyWidthFromBendBase(yBaseAttr: BufferAttribute) {
  let maxR = 0;
  for (let i = 0; i < yBaseAttr.count; i++) {
    const x = yBaseAttr.getX(i);
    const z = yBaseAttr.getZ(i);
    maxR = Math.max(maxR, Math.hypot(x, z));
  }
  return maxR * 2;
}

/**
 * Apply walk outer-arch shear onto positions (post-inflation).
 * Loop structure mirrors applyHorizontalBend; profile is shearAtHeight only.
 */
export function applyWalkShear(
  positionAttr: BufferAttribute,
  yBaseAttr: BufferAttribute,
  outDirX: number,
  outDirZ: number,
  shearBelly: number,
  shearTop: number,
) {
  const len = Math.hypot(outDirX, outDirZ);
  const ox = len > 1e-8 ? outDirX / len : 0;
  const oz = len > 1e-8 ? outDirZ / len : 0;
  const count = Math.min(positionAttr.count, yBaseAttr.count);
  for (let i = 0; i < count; i++) {
    const px = positionAttr.getX(i);
    const py = positionAttr.getY(i);
    const pz = positionAttr.getZ(i);
    const t = Math.min(1, Math.max(0, yBaseFromRestY(yBaseAttr.getY(i)) / HIT_BEND_BODY_HEIGHT));
    const horiz = shearAtHeight(t, shearBelly, shearTop);
    positionAttr.setXYZ(i, px + ox * horiz, py, pz + oz * horiz);
  }
  positionAttr.needsUpdate = true;
}

export class SlimeWalkDeform {
  lean01 = 0;
  lean01V = 0;
  leanUpper01 = 0;
  leanUpperV = 0;
  sx = 1.08;
  vsx = 0;
  sy = 0.94;
  vsy = 0;
  eyeFollow = 0;
  eyeFollowV = 0;
  /** Last frame local forward * eyeFollow (for hit-bend compose). */
  eyeFollowX = 0;
  eyeFollowZ = 0;
  /** Last shear amplitudes (for eye target). */
  shearBelly = 0;
  shearTop = 0;
  bodyWidth = 0;
  applied = false;

  reset() {
    this.lean01 = 0;
    this.lean01V = 0;
    this.leanUpper01 = 0;
    this.leanUpperV = 0;
    this.sx = 1.08;
    this.vsx = 0;
    this.sy = 0.94;
    this.vsy = 0;
    this.eyeFollow = 0;
    this.eyeFollowV = 0;
    this.eyeFollowX = 0;
    this.eyeFollowZ = 0;
    this.shearBelly = 0;
    this.shearTop = 0;
    this.bodyWidth = 0;
    this.applied = false;
  }

  private idealScale(st: GaitLocalState, moving: boolean, c: WalkDeformSettings) {
    if (!moving) return { sx: c.slimeWalkIdleSx, sy: c.slimeWalkIdleSy };
    if (st.inPause) {
      const w = pauseBlendWeight(st);
      return {
        sx: c.slimeWalkRestSx + (c.slimeWalkPauseSx - c.slimeWalkRestSx) * w,
        sy: c.slimeWalkRestSy + (c.slimeWalkPauseSy - c.slimeWalkRestSy) * w,
      };
    }
    return {
      sx: c.slimeWalkRestSx + (c.slimeWalkPeakSx - c.slimeWalkRestSx) * st.e,
      sy: c.slimeWalkRestSy + (c.slimeWalkPeakSy - c.slimeWalkRestSy) * st.e,
    };
  }

  update(dt: number, st: GaitLocalState, moving: boolean, c: WalkDeformSettings) {
    if (!c.slimeWalkEnabled) {
      this.reset();
      return;
    }
    const leanTarget = !moving || st.inPause ? 0 : st.humpU;
    const f = Math.min(10, Math.max(0.5, c.slimeWalkLeanRate * 0.65));
    const lean = springToward(this.lean01, this.lean01V, leanTarget, dt, f, c.slimeWalkLeanDamp);
    this.lean01 = lean.x;
    this.lean01V = lean.v;
    const upper = springToward(
      this.leanUpper01,
      this.leanUpperV,
      this.lean01,
      dt,
      f * c.slimeWalkLeanUpperFreqScale,
      c.slimeWalkLeanUpperDamp,
    );
    this.leanUpper01 = upper.x;
    this.leanUpperV = upper.v;

    const ideal = this.idealScale(st, moving, c);
    const ssx = springToward(this.sx, this.vsx, ideal.sx, dt, c.slimeWalkScaleFreq, c.slimeWalkScaleDamp);
    this.sx = ssx.x;
    this.vsx = ssx.v;
    const ssy = springToward(this.sy, this.vsy, ideal.sy, dt, c.slimeWalkScaleFreq, c.slimeWalkScaleDamp);
    this.sy = ssy.x;
    this.vsy = ssy.v;

    // Eye spring toward last frame's shear at slimeEyeY (1-frame lag; soft OK)
    const eyeY = c.slimeEyeY ?? 1.15;
    const tEye = Math.min(1, Math.max(0, eyeY / HIT_BEND_BODY_HEIGHT));
    const eyeTarget = shearAtHeight(tEye, this.shearBelly, this.shearTop);
    const se = springToward(
      this.eyeFollow,
      this.eyeFollowV,
      eyeTarget,
      dt,
      c.slimeWalkEyeFollowFreq,
      c.slimeWalkEyeFollowDamp,
    );
    this.eyeFollow = se.x;
    this.eyeFollowV = se.v;
  }

  /** Project scalar eyeFollow onto local forward for bendFace. */
  projectEyeFollow(forwardX: number, forwardZ: number) {
    const len = Math.hypot(forwardX, forwardZ);
    const ox = len > 1e-8 ? forwardX / len : 0;
    const oz = len > 1e-8 ? forwardZ / len : 0;
    this.eyeFollowX = ox * this.eyeFollow;
    this.eyeFollowZ = oz * this.eyeFollow;
  }
}

/**
 * Foot glue (G2): body geometry rest y_min = -1 (BoxGeometry centered, body.position.y=0).
 * Inflation sets model.root.position.y = size/2*extent and scale = size/2*scale so
 * localBottom = position.y + (-1)*scale ≈ 0 at rest. When visual Y-scale is S,
 * world foot = S * localBottom; translate by -S*localBottom to pin foot at y=0.
 */
export function walkFootLocalBottom(modelRootPositionY: number, modelRootScaleY: number) {
  return modelRootPositionY - modelRootScaleY;
}
