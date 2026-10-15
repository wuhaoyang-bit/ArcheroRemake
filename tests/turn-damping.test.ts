import test from 'node:test';
import assert from 'node:assert/strict';
import { slerpTurn, smoothDampAngleTurn } from '../src/turn-damping.ts';

const near = (actual: number, expected: number, epsilon = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= epsilon, actual + ' != ' + expected);

test('Slerp interpolates current orientation by clamped response times dt', () => {
  near(slerpTurn(Math.PI, 12, 0, 1 / 60), Math.PI * .2);
  near(slerpTurn(-Math.PI, 12, 0, 1 / 60), -Math.PI * .2);
  near(slerpTurn(1, 120, 0, 1 / 30), 1);
  let error = Math.PI;
  for (let i = 0; i < 8; i++) error -= slerpTurn(error, 12, 0, 1 / 120);
  near(error, Math.PI * .9 ** 8);
});

test('velocity damping retains speed state and mirrors both turning directions', () => {
  const fromRest = smoothDampAngleTurn(Math.PI, 0, .12, 0, 1 / 120);
  const alreadyTurning = smoothDampAngleTurn(Math.PI, 4, .12, 0, 1 / 120);
  assert.ok(alreadyTurning.turn > fromRest.turn);
  const mirrored = smoothDampAngleTurn(-Math.PI, -4, .12, 0, 1 / 120);
  near(mirrored.turn, -alreadyTurning.turn);
  near(mirrored.velocity, -alreadyTurning.velocity);
});

test('velocity damping converges without crossing a stationary target and clears speed on arrival', () => {
  for (const hz of [30, 60, 120]) {
    let error = Math.PI, velocity = 0;
    for (let i = 0; i < hz * 2; i++) {
      const next = smoothDampAngleTurn(error, velocity, .12, .001, 1 / hz);
      assert.ok(next.turn >= 0 && next.turn <= error);
      error -= next.turn; velocity = next.velocity;
    }
    near(error, 0); near(velocity, 0);
  }
  const overshoot = smoothDampAngleTurn(.01, 100, .12, 0, 1 / 60);
  near(overshoot.turn, .01); near(overshoot.velocity, 0);
});

test('invalid or zero time never advances either damping model', () => {
  for (const dt of [0, -1, NaN, Infinity]) {
    near(slerpTurn(1, 12, .001, dt), 0);
    assert.deepEqual(smoothDampAngleTurn(1, 3, .1, .001, dt), { turn: 0, velocity: 3 });
  }
});
