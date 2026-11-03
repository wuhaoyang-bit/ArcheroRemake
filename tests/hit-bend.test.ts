import test from 'node:test';
import assert from 'node:assert/strict';
import { BufferAttribute } from 'three';
import { HIT_BEND_DEFAULTS } from '../src/hit-bend-config.ts';
import {
  applyHorizontalBend,
  calculateBendWeights,
  horizontalBendAmount,
  profileSmoothstep,
  smooth01,
  yBaseFromRestY,
} from '../src/hit-bend.ts';
import { parseSettingsDocument } from '../src/settings-store.ts';

const close = (a: number, b: number, eps = 1e-8) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('smooth01 and yBase match PLAN', () => {
  close(smooth01(0), 0);
  close(smooth01(1), 1);
  close(smooth01(0.5), 0.5);
  close(yBaseFromRestY(-1), 0);
  close(yBaseFromRestY(1), 2);
});

test('profileSmoothstep: foot lock, peak, and tail', () => {
  const foot = 0.1, peak = 1.15;
  close(profileSmoothstep(0.05, foot, peak), 0);
  close(profileSmoothstep(foot, foot, peak), 0);
  assert.ok(profileSmoothstep(peak, foot, peak) > 0.99);
  assert.ok(profileSmoothstep(peak + 0.25, foot, peak) < 0.6);
  close(profileSmoothstep(peak + 0.5, foot, peak), 0);
});

test('calculateBendWeights phases: formC, hold, follow, spring overshoot', () => {
  const p = { ...HIT_BEND_DEFAULTS, hitBendFollowDelay: 0.05 };
  const form = calculateBendWeights(0.05, p);
  assert.equal(form.phase, 'formC');
  assert.ok(form.belly > 0 && form.belly < 1);
  close(form.upper, 0);

  const hold = calculateBendWeights(0.12, p);
  assert.equal(hold.phase, 'hold');
  close(hold.belly, 1);
  close(hold.upper, 0);

  const follow = calculateBendWeights(0.2, p);
  assert.equal(follow.phase, 'follow');
  close(follow.belly, 1);
  assert.ok(follow.upper > 0);

  // Underdamped spring from 1 can go above 1 or below 0.
  let sawOvershoot = false;
  for (let t = 0.3; t < 1.2; t += 0.02) {
    const s = calculateBendWeights(t, { ...p, hitBendSpringDamp: 0.2, hitBendSpringFreq: 4.5 });
    if (s.phase === 'spring' && (s.belly > 1.02 || s.belly < -0.02)) sawOvershoot = true;
  }
  assert.equal(sawOvershoot, true);

  const delay0 = calculateBendWeights(0.11, { ...HIT_BEND_DEFAULTS, hitBendFollowDelay: 0 });
  assert.equal(delay0.phase, 'follow');
});

test('foot lock keeps horizontal amount at 0; peak gets belly amp', () => {
  const p = HIT_BEND_DEFAULTS;
  close(horizontalBendAmount(0.05, 1, 0, p), 0);
  close(horizontalBendAmount(p.hitBendFootLockY, 1, 1, p), 0);
  const atPeak = horizontalBendAmount(p.hitBendPeakY, 1, 0, p);
  close(atPeak, p.hitBendMax * profileSmoothstep(p.hitBendPeakY, p.hitBendFootLockY, p.hitBendPeakY));
  const aboveWaist = 1.0;
  assert.ok(horizontalBendAmount(aboveWaist, 1, 1, p) > horizontalBendAmount(aboveWaist, 1, 0, p));
});

test('applyHorizontalBend writes needsUpdate and respects foot lock on column', () => {
  const n = 5;
  const rest = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const y = -1 + (2 * i) / (n - 1);
    rest[i * 3] = 0;
    rest[i * 3 + 1] = y;
    rest[i * 3 + 2] = 0;
  }
  const yBase = new BufferAttribute(rest.slice(), 3);
  const pos = new BufferAttribute(rest.slice(), 3);
  const p = { ...HIT_BEND_DEFAULTS, hitBendMax: 0.4 };
  const versionBefore = pos.version;
  applyHorizontalBend(pos, yBase, 1, 0, 1, 0, p);
  assert.ok(pos.version > versionBefore);
  close(pos.getX(0), 0); // foot yBase=0
  // Top yBase=2 is past tail → profile 0; peak-near samples must move.
  let maxAbsX = 0;
  for (let i = 0; i < n; i++) maxAbsX = Math.max(maxAbsX, Math.abs(pos.getX(i)));
  assert.ok(maxAbsX > 0.05);
  close(pos.getY(2), yBase.getY(2));
});

test('weights at age 0 leave mesh unchanged when applied with belly=upper=0', () => {
  const rest = new Float32Array([0, 0, 0, 0, 1, 0]);
  const yBase = new BufferAttribute(rest.slice(), 3);
  const pos = new BufferAttribute(rest.slice(), 3);
  const w = calculateBendWeights(0, HIT_BEND_DEFAULTS);
  close(w.belly, 0);
  close(w.upper, 0);
  applyHorizontalBend(pos, yBase, 0, 1, w.belly, w.upper, HIT_BEND_DEFAULTS);
  close(pos.getX(0), 0);
  close(pos.getZ(1), 0);
});

test('legacy settings inherit hitBend defaults', () => {
  const c = parseSettingsDocument({ version: 1, settings: {} });
  assert.equal(c.hitBendEnabled, 1);
  close(c.hitBendMax, 0.4);
  close(c.hitBendFormTime, 0.1);
  close(c.hitBendFollowDelay, 0);
  close(c.hitBendFollowTime, 0.12);
  close(c.hitBendFollowAmount, 0.85);
  close(c.hitBendSpringFreq, 4.5);
  close(c.hitBendSpringDamp, 0.28);
  close(c.hitBendFootLockY, 0.1);
  close(c.hitBendPeakY, 1.15);
  close(c.hitBendWaistY, 0.575);
  const d = parseSettingsDocument({ version: 1, settings: { ...c, hitBendMax: 0.55 } });
  close(d.hitBendMax, 0.55);
});
