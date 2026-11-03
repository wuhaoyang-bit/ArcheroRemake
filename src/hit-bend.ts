import { spring } from './hit-response.ts';
import type { HitBendSettings } from './hit-bend-config.ts';
import type { BufferAttribute } from 'three';

/** Body height in local units (RoundedBox / inflation box edge length). */
export const HIT_BEND_BODY_HEIGHT = 2;
/** Peak-after decay length: 0.25 * bodyHeight, fixed (no panel). */
export const HIT_BEND_TAIL = 0.5;

export function smooth01(u: number) {
  const x = Math.min(1, Math.max(0, u));
  return x * x * (3 - 2 * x);
}

/** Base-frame height: geometry y ∈ [-1,1] → yBase ∈ [0,2] (PLAN §0). */
export function yBaseFromRestY(restY: number) {
  return restY + 1;
}

/** 8.1A smoothstep profile on yBase. */
export function profileSmoothstep(yBase: number, footLockY: number, peakY: number, tail = HIT_BEND_TAIL) {
  if (yBase <= footLockY) return 0;
  if (yBase <= peakY) return smooth01((yBase - footLockY) / Math.max(1e-6, peakY - footLockY));
  return 1 - smooth01((yBase - peakY) / Math.max(1e-6, tail));
}

/**
 * Preview bendWeights transplant (knockback-force-feel/app.js).
 * belly / upper → spring toward 0 with overshoot after follow-through.
 */
export function calculateBendWeights(age: number, p: HitBendSettings) {
  const t0 = Math.max(1e-6, p.hitBendFormTime);
  const delay = Math.max(0, p.hitBendFollowDelay);
  const follow = Math.max(1e-6, p.hitBendFollowTime);
  const tFollow0 = t0 + delay;
  const tFollow1 = tFollow0 + follow;
  const f = p.hitBendSpringFreq;
  const z = p.hitBendSpringDamp;

  if (age <= 0) return { belly: 0, upper: 0, phase: 'wait' as const };

  if (age < t0) {
    return { belly: smooth01(age / t0), upper: 0, phase: 'formC' as const };
  }
  if (age < tFollow0) {
    return { belly: 1, upper: 0, phase: 'hold' as const };
  }
  if (age < tFollow1) {
    return { belly: 1, upper: smooth01((age - tFollow0) / follow), phase: 'follow' as const };
  }
  const dt = age - tFollow1;
  const belly = spring(1, 0, dt, f, z).x;
  const upper = spring(1, 0, dt, f, z).x;
  return { belly, upper, phase: 'spring' as const };
}

/** Horizontal displacement along outDir for one sample height (body local xz). */
export function horizontalBendAmount(
  yBase: number,
  belly: number,
  upper: number,
  p: Pick<HitBendSettings, 'hitBendMax' | 'hitBendFootLockY' | 'hitBendPeakY' | 'hitBendWaistY' | 'hitBendFollowAmount'>,
) {
  if (yBase <= p.hitBendFootLockY) return 0;
  const w = profileSmoothstep(yBase, p.hitBendFootLockY, p.hitBendPeakY);
  let horiz = p.hitBendMax * belly * w;
  if (yBase > p.hitBendWaistY) {
    const t = smooth01((yBase - p.hitBendWaistY) / Math.max(1e-6, HIT_BEND_BODY_HEIGHT - p.hitBendWaistY));
    horiz += p.hitBendMax * p.hitBendFollowAmount * upper * t;
  }
  return horiz;
}

/**
 * Add horizontal bend onto current positions (typically post-inflation).
 * yBaseAttr supplies undeformed local y for the height profile (inflation.base).
 * positionAttr is read as the pre-bend mesh and written in place.
 * Does not recompute normals or bounding volumes (PLAN §7).
 */
export function applyHorizontalBend(
  positionAttr: BufferAttribute,
  yBaseAttr: BufferAttribute,
  outDirX: number,
  outDirZ: number,
  belly: number,
  upper: number,
  p: HitBendSettings,
) {
  const len = Math.hypot(outDirX, outDirZ);
  const ox = len > 1e-8 ? outDirX / len : 0;
  const oz = len > 1e-8 ? outDirZ / len : 0;
  const count = Math.min(positionAttr.count, yBaseAttr.count);
  for (let i = 0; i < count; i++) {
    const px = positionAttr.getX(i);
    const py = positionAttr.getY(i);
    const pz = positionAttr.getZ(i);
    const horiz = horizontalBendAmount(yBaseFromRestY(yBaseAttr.getY(i)), belly, upper, p);
    positionAttr.setXYZ(i, px + ox * horiz, py, pz + oz * horiz);
  }
  positionAttr.needsUpdate = true;
}
