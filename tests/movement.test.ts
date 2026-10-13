import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimationBlend, MovementController, PLAYER_RADIUS, follow, wrapAngle } from '../src/controller.ts';
import { DEFAULTS } from '../src/config.ts';

const near = (actual: number, expected: number, epsilon = 1e-9) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
// Fixed test fixture: behavior expectations do not depend on the latest tuning defaults.
const moving = (dx = 40, dy = 0) => { const c = new MovementController({ ...DEFAULTS, moveSpeed: 6, anchorScale: 0.032 }); c.press(1, 100, 200); c.move(1, dx, dy); return c; };

test('T01–T03: first press runs in place; strict threshold unlocks with full first-step speed', () => {
  const c = new MovementController(), start = { ...c.position };
  assert.equal(c.anchorVisible, false);
  c.press(7, 3, 500); c.update(0.2);
  assert.equal(c.mode, 'in-place'); assert.deepEqual(c.position, start);
  assert.deepEqual(c.center, { x: 3, y: 500 }); assert.deepEqual(c.anchor, c.position);
  assert.equal(c.anchorVisible, true);
  c.move(7, 12, 0); c.update(0.1);
  assert.equal(c.unlocked, false); assert.deepEqual(c.stick, { x: 0, y: 0 }); assert.deepEqual(c.position, start);
  c.move(7, 12.01, 0); assert.equal(c.mode, 'moving'); near(c.stick.x, 12.01);
  c.update(1 / 60); near(c.position.x - start.x, DEFAULTS.moveSpeed / 60);
});

test('T04–T06: unlocked input has no second dead zone; radius clamps; anchor travels with player', () => {
  const c = moving(); c.move(1, -0.00001, 0); c.update(0.1);
  assert.equal(c.unlocked, true); near(c.position.x, -0.6);
  c.move(1, 300, 400); near(Math.hypot(c.stick.x, c.stick.y), DEFAULTS.joystickRadius);
  near(Math.hypot(c.offset.x, c.offset.z), c.settings.joystickRadius * c.settings.anchorScale);
  assert.deepEqual(c.center, { x: 100, y: 200 });
  const offset = { ...c.offset }, before = c.anchor;
  c.update(0.1); assert.deepEqual(c.offset, offset);
  near(c.anchor.x - before.x, 0.36); near(c.anchor.z - before.z, 0.48);
});

test('T07–T09, T25: immediate travel direction is independent of shortest-arc body rotation, including release and re-press', () => {
  const c = moving(); c.set('turnSpeed', 90); c.update(0.1);
  near(c.position.x, 0.6); near(c.heading, Math.PI - Math.PI / 20);
  const offset = { ...c.offset }; assert.deepEqual(c.offset, offset);
  c.move(1, -40, 0); const x = c.position.x; c.update(0.1); near(c.position.x, x - 0.6);
  near(c.heading, Math.PI);
  c.release(1); const stop = { ...c.position }; c.update(0.1);
  assert.deepEqual(c.position, stop); near(c.heading, -Math.PI + Math.PI / 20); assert.equal(c.anchorVisible, false);
  c.press(2, 20, 20); c.update(0.1); assert.deepEqual(c.position, stop);
  near(c.heading, -Math.PI + Math.PI / 10); assert.equal(c.mode, 'in-place');
  c.update(5); near(wrapAngle(c.heading - c.targetHeading), 0);
});

test('T10: release remembers relative offset, independent of facing and world position; new level clears memory', () => {
  const c = moving(30, -40); c.update(0.2); const offset = { ...c.offset }, oldWorld = c.anchor;
  c.release(1); c.position.x += 1; c.press(2, 5, 10);
  assert.deepEqual(c.offset, offset); near(c.anchor.x, oldWorld.x + 1);
  c.update(0.2); assert.deepEqual(c.offset, offset);
  const fresh = new MovementController(); fresh.press(1, 0, 0); assert.deepEqual(fresh.anchor, fresh.position);
});

test('T11: new touch while in-place resets input origin but preserves anchor offset and threshold', () => {
  const c = moving(); c.release(1); c.press(2, 20, 30);
  const offset = { ...c.offset }; c.move(2, 5, 0); c.press(3, 300, 600);
  assert.equal(c.mode, 'in-place'); assert.equal(c.unlocked, false); assert.deepEqual(c.offset, offset);
  assert.deepEqual(c.center, { x: 300, y: 600 }); assert.deepEqual(c.raw, { x: 0, y: 0 });
  c.move(3, 11, 0); assert.equal(c.unlocked, false);
  c.move(3, 13, 0); assert.equal(c.unlocked, true);
});

test('T12–T15, T19: moving takeover keeps old direction until new unlock; old fingers never regain control', () => {
  const c = moving(); const offset = { ...c.offset };
  c.press(2, 5, 10); assert.equal(c.mode, 'moving'); assert.equal(c.unlocked, false);
  c.update(0.1); near(c.position.x, 0.6); assert.deepEqual(c.offset, offset);
  c.move(1, -50, -50); c.release(1); assert.equal(c.pointerId, 2); assert.deepEqual(c.offset, offset);
  c.move(2, 1, -2); c.update(0.1); near(c.position.x, 1.2);
  c.move(2, 0, -30); near(c.offset.z, -0.96); const z = c.position.z; c.update(0.1); near(c.position.z, z - 0.6);
  c.press(3, 200, 400); c.press(4, 250, 400); c.release(3); assert.equal(c.pointerId, 4);
  c.release(4); const stop = { ...c.position }; c.move(2, 100, 100); c.move(3, 100, 100); c.update(1);
  assert.equal(c.mode, 'idle'); assert.equal(c.pointerId, null); assert.deepEqual(c.position, stop);
});

test('T16–T18: exact center keeps full speed with zero anchor; arbitrarily small nonzero input redirects', () => {
  const c = moving(); c.move(1, 0, 0); assert.deepEqual(c.offset, { x: 0, z: 0 });
  c.update(0.1); near(c.position.x, 0.6); assert.deepEqual(c.anchor, c.position);
  c.move(1, 0, -1e-10); const x = c.position.x, z = c.position.z; c.update(0.1);
  near(c.position.x, x); near(c.position.z, z - 0.6);
  c.move(1, 0, 0); c.release(1); c.press(2, 0, 0);
  assert.deepEqual(c.remembered, { x: 0, z: 0 }); assert.deepEqual(c.anchor, c.position); assert.equal(c.mode, 'in-place');
  near(c.targetHeading, Math.PI);
});

test('T20: cancel behaves as release, remembers offset, and never resumes without a new press', () => {
  const c = moving(20, -30), offset = { ...c.offset }; c.cancel();
  const p = { ...c.position }; c.update(1); c.move(1, 100, 0);
  assert.equal(c.mode, 'idle'); assert.deepEqual(c.remembered, offset); assert.deepEqual(c.position, p);
  c.cancel(); c.press(2, 0, 0); assert.deepEqual(c.offset, offset);
});

test('T24: mapping scale changes anchor reach without changing fixed velocity', () => {
  const c = moving(); const first = c.offset.x; c.set('anchorScale', 0.064); near(c.offset.x, first * 2);
  c.update(0.1); near(c.position.x, 0.6);
  c.press(2, 0, 0); const locked = { ...c.offset }; c.set('anchorScale', 0.02);
  assert.deepEqual(c.offset, locked);
});

test('T26: independent rectangular walls contain the player; input and run state continue; smaller rooms immediately constrain', () => {
  const c = moving(40, 40); c.update(20); const edge = DEFAULTS.roomSize / 2 - PLAYER_RADIUS;
  near(c.position.x, edge); near(c.position.z, DEFAULTS.roomLength / 2 - PLAYER_RADIUS); assert.equal(c.mode, 'moving'); assert.equal(c.unlocked, true);
  c.move(1, -40, -40); c.update(20); near(c.position.x, -edge); near(c.position.z, -DEFAULTS.roomLength / 2 + PLAYER_RADIUS);
  c.set('roomSize', 8); near(c.position.z, -DEFAULTS.roomLength / 2 + PLAYER_RADIUS); c.set('roomLength', 8); near(c.position.x, -4 + PLAYER_RADIUS); near(c.position.z, -4 + PLAYER_RADIUS);
  assert.equal(c.mode, 'moving');
});

test('T27–T28: same-length input maps to a ground circle through a complete turn', () => {
  const c = moving();
  for (let degrees = 0; degrees < 360; degrees++) {
    const angle = degrees * Math.PI / 180; c.move(1, 50 * Math.cos(angle), 50 * Math.sin(angle));
    near(Math.hypot(c.offset.x, c.offset.z), 1.6);
    near(c.offset.x, 1.6 * Math.cos(angle)); near(c.offset.z, 1.6 * Math.sin(angle));
  }
});

test('C01, C03–C05: camera responds to position error, converges without overshoot, equivalent across display rates', () => {
  let camera = 0, previousGap = 10;
  for (let i = 0; i < 120; i++) { camera = follow(camera, 10, 9, 1 / 60); const gap = 10 - camera; assert.ok(gap >= 0 && gap < previousGap); previousGap = gap; }
  near(camera, 10, 1e-6);
  // Input may have reversed; a still-positive position error still pulls forward.
  assert.ok(follow(0, 0.5, 9, 1 / 60) > 0);
  const result = (hz: number) => { let c = -4; for (let i = 0; i < hz; i++) c = follow(c, 8, 9, 1 / hz); return c; };
  near(result(30), result(60)); near(result(60), result(144));
});

test('animation fusion is continuous when interrupted; in-place → moving never restarts Run', () => {
  const b = new AnimationBlend(); b.setTarget(1, 0.12); near(b.update(0.06), 0.5);
  b.setTarget(0, 0.12); near(b.weight, 0.5); near(b.update(0.06), 0.25);
  b.setTarget(1, 0.12); near(b.update(0.06), 0.625); b.setTarget(1, 0.12); near(b.update(0.06), 1);
  b.setTarget(0, 0); near(b.weight, 0); near(b.update(0.01), 0);
});

test('movement and turning remain frame-rate independent and reject invalid inputs', () => {
  const simulate = (hz: number) => { const c = moving(30, -40); c.set('turnSpeed', 90); for (let i = 0; i < hz; i++) c.update(1 / hz); return c; };
  const a = simulate(30), b = simulate(144); near(a.position.x, b.position.x); near(a.position.z, b.position.z); near(a.heading, b.heading);
  a.move(1, NaN, Infinity); const p = { ...a.position }; a.update(NaN); assert.deepEqual(a.position, p);
  a.set('moveSpeed', -9); assert.equal(a.settings.moveSpeed, 1); a.set('moveSpeed', NaN); assert.equal(a.settings.moveSpeed, DEFAULTS.moveSpeed);
});
