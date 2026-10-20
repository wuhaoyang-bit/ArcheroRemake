import test from 'node:test';
import assert from 'node:assert/strict';
import { remainingSmoothCurveAngle as step, smoothTurnSpeed as speed, exponentialCurve } from '../src/turn-curve.ts';
import { DEFAULTS } from '../src/config.ts';
import { MovementController, wrapAngle } from '../src/controller.ts';
import { parseSettingsDocument, settingsDocument } from '../src/settings-store.ts';
import { SettingsHistory } from '../src/settings-history.ts';

const points = [{angle: 0, speed: 100}, {angle: 17, speed: 800}, {angle: 110, speed: 40}, {angle: 180, speed: 2000}];
const near = (a: number, b: number, eps = 1e-7) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
test('quintic preserves knots and nonnegative bounds, with C2 joins on unequal spans', () => {
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1], h = (b.angle - a.angle) * 1e-5;
    assert.equal(speed(a.angle, a, b), a.speed); assert.equal(speed(b.angle, a, b), b.speed);
    for (let j = 0; j <= 1000; j++) {
      const v = speed(a.angle + (b.angle - a.angle) * j / 1000, a, b);
      assert.ok(v >= Math.min(a.speed, b.speed) && v <= Math.max(a.speed, b.speed));
    }
    for (const [x, direction, value] of [[a.angle, 1, a.speed], [b.angle, -1, b.speed]]) {
      near((speed(x + direction * h, a, b) - value) / h, 0, 1e-5);
      near((speed(x + direction * 2 * h, a, b) - 2 * speed(x + direction * h, a, b) + value) / h ** 2, 0, .003);
    }
  }
});
test('time integration crosses segments, is frame-rate independent and never overshoots', () => {
  for (const curve of [points, exponentialCurve(10.4), [{angle:0,speed:0},{angle:180,speed:1000}]]) {
    for (const duration of [.1, .5, 2]) {
      const expected = step(180, duration, curve, .1);
      for (const hz of [30, 60, 120, 240]) {
        let e = 180;
        for (let i = 0; i < hz * duration; i++) {
          const next = step(e, 1 / hz, curve, .1);
          assert.ok(next >= 0 && next <= e); e = next;
        }
        near(e, expected, 2e-6);
      }
    }
  }
  assert.equal(step(180, 100, points, .1), 0);
  for (const dt of [0, -1, Infinity, NaN]) assert.equal(step(90, dt, points, .1), 90);
});
test('zero-speed knots and plateaus block even a large snap threshold or time step', () => {
  for (const angle of [.05, 90]) {
    const curve = [{angle:0,speed:100},{angle,speed:0},{angle:180,speed:1000}];
    assert.equal(step(angle, 100, curve, .1), angle);
    assert.ok(step(180, 100, curve, .1) > angle);
  }
  assert.equal(step(180, 10, [{angle:0,speed:100},{angle:180,speed:0}], .1), 180);
  assert.equal(step(100, 10, [{angle:0,speed:100},{angle:90,speed:0},{angle:180,speed:0}], .1), 100);
});
test('ID 7 persists, inherits missing lock configuration, and history restores source curves', () => {
  const s = parseSettingsDocument({version:1,settings:{turnModel:7,turnCurve:points}}, true);
  assert.equal(s.lockTurnModel, 7); assert.deepEqual(s.lockTurnCurve, points);
  assert.deepEqual(settingsDocument(s).settings, s);
  const history = new SettingsHistory(s);
  history.record({...s, turnModel:2}); assert.deepEqual(history.undo(), s);
  history.record({...s, turnCurve:exponentialCurve(10)}); assert.deepEqual(history.undoAll(), s);
  for (const id of [1,3,4]) assert.equal(parseSettingsDocument({version:1,settings:{turnModel:id}}).turnModel, 0);
  for (const id of [8,7.1,-1]) assert.throws(() => parseSettingsDocument({version:1,settings:{lockTurnModel:id}}));
});
test('controller uses smooth speeds and independent lock curve through movement, handoff and release', () => {
  const c = new MovementController({...DEFAULTS, turnModel:7, lockTurnModel:7, turnCurve:points,
    lockTurnCurve:[{angle:0,speed:200},{angle:180,speed:200}], anchorFollow:0});
  c.setTraining('locking'); c.press(1,0,0);
  assert.equal(c.usesLockTurn,true);
  c.heading = wrapAngle(c.targetHeading - 1);
  c.update(.01); near(c.angularSpeed,200);
  c.move(1,50,0); assert.equal(c.usesLockTurn,false);
  c.heading = c.anchorHeading - 1;
  const expected = step(180 / Math.PI,.01,points,.1);
  c.update(.01); near(Math.abs(wrapAngle(c.targetHeading-c.heading))*180/Math.PI,expected);
  c.press(2,0,0); assert.equal(c.usesLockTurn,false);
  c.release(2); assert.equal(c.usesLockTurn,true);
  c.heading = wrapAngle(c.targetHeading - 1); c.update(.01); near(c.angularSpeed,200);
  c.set('lockTurnModel',6); c.update(.01); c.set('lockTurnModel',7);
  c.heading = wrapAngle(c.targetHeading - 1); c.update(.01); near(c.angularSpeed,200);
  assert.equal(c.snapshot().dampingVelocity,0);
  c.setLockCurve([{angle:0,speed:50},{angle:180,speed:50}]); c.update(.01); near(c.angularSpeed,50);
});
