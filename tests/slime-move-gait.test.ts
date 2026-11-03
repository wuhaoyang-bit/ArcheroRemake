import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SLIME_FULLNESS_DEFAULTS } from '../src/slime-fullness-config.ts';
import { slimeMoveGaitMultiplier, slimeMoveHump } from '../src/slime-fullness.ts';
import { parseSettingsDocument } from '../src/settings-store.ts';

test('slimeMoveHump peaks at peakAt and is 0 at ends', () => {
  assert.equal(slimeMoveHump(0, 0.45), 0);
  assert.equal(slimeMoveHump(1, 0.45), 0);
  const peak = slimeMoveHump(0.45, 0.45);
  assert.ok(peak > 0.999);
  assert.ok(slimeMoveHump(0.2, 0.45) < peak);
  assert.ok(slimeMoveHump(0.8, 0.45) < peak);
});

test('slimeMoveGaitMultiplier: valley at start, peak near peakAt, pause is 0, then wraps', () => {
  const c = { ...SLIME_FULLNESS_DEFAULTS };
  const period = c.slimeMovePeriod;
  const pause = c.slimeMovePause;
  assert.ok(Math.abs(slimeMoveGaitMultiplier(0, c) - c.slimeMoveValley) < 1e-9);
  const atPeak = slimeMoveGaitMultiplier(period * c.slimeMovePeakAt, c);
  assert.ok(Math.abs(atPeak - c.slimeMovePeak) < 1e-6);
  assert.equal(slimeMoveGaitMultiplier(period + pause * 0.5, c), 0);
  assert.ok(Math.abs(slimeMoveGaitMultiplier(period + pause, c) - c.slimeMoveValley) < 1e-9);
  assert.ok(slimeMoveGaitMultiplier(period * 0.5, c) > c.slimeMoveValley);
});

test('legacy settings inherit slime move gait defaults', () => {
  const s = parseSettingsDocument({ version: 1, settings: {} });
  assert.equal(s.slimeMovePeriod, 0.55);
  assert.equal(s.slimeMovePause, 0.12);
  assert.equal(s.slimeMovePeak, 1.35);
  assert.equal(s.slimeMoveValley, 0.35);
  assert.equal(s.slimeMovePeakAt, 0.45);
});
