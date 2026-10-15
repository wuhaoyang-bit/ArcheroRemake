import { Quaternion } from 'three';

// Relative yaw quaternions keep the caller's chosen 180-degree tie direction.
const from = new Quaternion(), to = new Quaternion(), result = new Quaternion();
/** Unity-style Slerp(current, target, Clamp01(response * dt)), angles in radians. */
export function slerpTurn(error: number, response: number, snapAngle: number, dt: number): number {
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  to.set(0, Math.sin(error / 2), 0, Math.cos(error / 2));
  result.slerpQuaternions(from, to, Math.min(1, Math.max(0, response * dt)));
  const turn = 2 * Math.atan2(result.y, result.w);
  return Math.abs(error - turn) <= snapAngle ? error : turn;
}

export type DampedTurn = { turn: number; velocity: number };

/**
 * Unity SmoothDamp's uncapped recurrence, expressed relative to the current heading.
 * The velocity is signed and must persist between updates, including after pointer release.
 * Source: UnityCsReference / Runtime/Export/Math/Mathf.cs (SmoothDampAngle / SmoothDamp).
 */
export function smoothDampAngleTurn(
  error: number, velocity: number, smoothTime: number, snapAngle: number, dt: number,
): DampedTurn {
  if (!Number.isFinite(dt) || dt <= 0) return { turn: 0, velocity };
  if (error === 0) return { turn: 0, velocity: 0 };
  const frequency = 2 / Math.max(0.0001, smoothTime);
  const scaledTime = frequency * dt;
  const decay = 1 / (1 + scaledTime + 0.48 * scaledTime ** 2 + 0.235 * scaledTime ** 3);
  const displacement = -error;
  const bridge = (velocity + frequency * displacement) * dt;
  const nextVelocity = (velocity - frequency * bridge) * decay;
  const turn = error + (displacement + bridge) * decay;
  if ((error > 0) === (turn > error) || Math.abs(error - turn) <= snapAngle) {
    return { turn: error, velocity: 0 };
  }
  return { turn, velocity: nextVelocity };
}
