import { exponentialCurve } from './turn-curve.ts';
export const DESIGN_WIDTH = 390;
export const ASPECT = 9 / 19.5;

export const DEFAULTS = {
  joystickRadius: 64,
  unlockDistance: 12,
  showThreshold: 0,
  anchorScale: 0.036,
  moveSpeed: 16,
  turnSpeed: 1200,
  turnModel: 0, // Stable IDs: 0 constant, 2 curve, 5 Slerp, 6 SmoothDampAngle.
  curveSnapAngle: 0.1,
  turnCurve: exponentialCurve(10.4),
  // 120 Hz simulation: 180 * (1 - response/120)^18 <= 0.1 degrees.
  slerpResponse: 40.872,
  slerpSnapAngle: 0.1,
  smoothTime: 0.03039,
  smoothSnapAngle: 0.1,
  blendDuration: 0.06,
  runSpeed: 1.6,
  roomSize: 16,
  roomLength: 38,
  cameraResponse: 9,
  cameraOffset: 0,
  viewWidth: 18,
};
export type Settings = typeof DEFAULTS;
export type SettingKey = Exclude<keyof Settings, 'turnCurve'>;
export const LIMITS: Record<SettingKey, [number, number, number]> = {
  joystickRadius: [32, 100, 1], unlockDistance: [1, 40, 1],
  showThreshold: [0, 1, 1],
  anchorScale: [0.005, 0.08, 0.001], moveSpeed: [1, 30, 0.1],
  turnModel: [0, 6, 1], curveSnapAngle: [0.001, 5, 0.001],
  slerpResponse: [0.1, 120, 0.001], slerpSnapAngle: [0.001, 5, 0.001],
  smoothTime: [0.005, 0.5, 0.00001], smoothSnapAngle: [0.001, 5, 0.001],
  turnSpeed: [90, 1800, 10], blendDuration: [0, 0.6, 0.01],
  runSpeed: [0.25, 4, 0.05],
  roomSize: [8, 24, 1], roomLength: [8, 80, 1], cameraResponse: [2, 24, 0.5],
  cameraOffset: [-25, 25, 1], viewWidth: [12, 28, 0.5],
};

export function sanitize(key: SettingKey, value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS[key];
  if (key === 'turnModel') return [0, 2, 5, 6].includes(value) ? value : 0;
  return Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], value));
}
