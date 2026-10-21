import { HIT_DEFAULTS, HIT_LIMITS } from './hit-feedback-config.ts';
import { DEFAULT_RING_CURVE, DEFAULT_STROKE_CURVE, DEFAULT_LINK_ATTACK_CURVE, DEFAULT_SWITCH_CURVE } from './lock-rings.ts';
import { DEFAULT_MOVE_CURVE } from './move-speed.ts';
import { DEFAULT_ANCHOR_CURVE } from './anchor-follow.ts';
import { exponentialCurve } from './turn-curve.ts';
export const DESIGN_WIDTH = 390;
export const ASPECT = 9 / 19.5;

export const DEFAULTS = {
  ...HIT_DEFAULTS,
  monsterSpeed: 3,
  joystickRadius: 64,
  unlockDistance: 12,
  showThreshold: 0,
  anchorScale: 0.036,
  anchorFollow: 1,
  anchorCurve: DEFAULT_ANCHOR_CURVE,
  moveSpeed: 16,
  moveModel: 0, // 0 constant, 1 angle-error curve
  moveCurve: DEFAULT_MOVE_CURVE,
  turnSpeed: 1200,
  turnModel: 0, // Stable IDs: 0 constant, 2 curve, 5 Slerp, 6 SmoothDampAngle, 7 C2 curve.
  curveSnapAngle: 0.1,
  turnCurve: exponentialCurve(10.4),
  // 120 Hz simulation: 180 * (1 - response/120)^18 <= 0.1 degrees.
  slerpResponse: 40.872,
  slerpSnapAngle: 0.1,
  smoothTime: 0.03039,
  smoothSnapAngle: 0.1,
  ringPlayerDiameter: 4, ringTargetDiameter: 8,
  ringPlayerStroke: 1, ringTargetStroke: 1.2,
  ringWaveDuration:0.4,ringWaveDistance:32,ringWaveStroke:1.2,ringWaveCurve:DEFAULT_RING_CURVE,
  ringSwitchDuration:0.25, ringSwitchAmount:150, ringSwitchCurve:DEFAULT_SWITCH_CURVE,
  ringLinkThreshold: 95, ringLinkStroke: 1,
  ringPlayerHeight: 1.4, ringTargetHeight: 1.2,
  ringDuration: 0.25, ringCurve: DEFAULT_RING_CURVE, ringStrokeCurve: DEFAULT_STROKE_CURVE, ringLinkAttackCurve: DEFAULT_LINK_ATTACK_CURVE,
  targetModel: 0, // 0 nearest, 1 direction cone, 2 direction with retention.
  lockRange: 22,
  showLockRange: 0,
  targetCone: 90, // Full cone angle, degrees.
  targetAdvantage: 8,
  targetDwell: 160, // Milliseconds.
  lockTurnModel: 0,
  lockTurnSpeed: 1200,
  lockCurveSnapAngle: 0.1,
  lockTurnCurve: exponentialCurve(10.4),
  lockSlerpResponse: 40.872,
  lockSlerpSnapAngle: 0.1,
  lockSmoothTime: 0.03039,
  lockSmoothSnapAngle: 0.1,
  blendDuration: 0.06,
  runSpeed: 1.6,
  bowScale: 1.5, arrowScale: 1.5, arrowSpeed: 50,
  roomSize: 16,
  roomLength: 38,
  cameraResponse: 9,
  cameraOffset: 0,
  viewWidth: 18,
};
export type Settings = typeof DEFAULTS;
export type SettingKey = Exclude<keyof Settings, 'turnCurve' | 'lockTurnCurve' | 'anchorCurve' | 'moveCurve' | 'ringCurve' | 'ringStrokeCurve' | 'ringLinkAttackCurve' | 'ringSwitchCurve' | 'ringWaveCurve'>;
/** Missing lock values inherit the corresponding ordinary tuning once, on load. */
export const LOCK_TURN_KEYS = {
  lockTurnModel: 'turnModel', lockTurnSpeed: 'turnSpeed', lockCurveSnapAngle: 'curveSnapAngle',
  lockSlerpResponse: 'slerpResponse', lockSlerpSnapAngle: 'slerpSnapAngle',
  lockSmoothTime: 'smoothTime', lockSmoothSnapAngle: 'smoothSnapAngle',
} as const;
export const LIMITS: Record<SettingKey, [number, number, number]> = {
  ...HIT_LIMITS,
  monsterSpeed: [0,10,.1],
  joystickRadius: [32, 100, 1], unlockDistance: [1, 40, 1],
  showThreshold: [0, 1, 1],
  anchorFollow: [0, 1, 1], moveModel: [0, 1, 1],
  anchorScale: [0.005, 0.08, 0.001], moveSpeed: [1, 30, 0.1],
  turnModel: [0, 7, 1], curveSnapAngle: [0.001, 5, 0.001],
  slerpResponse: [0.1, 120, 0.001], slerpSnapAngle: [0.001, 5, 0.001],
  smoothTime: [0.005, 0.5, 0.00001], smoothSnapAngle: [0.001, 5, 0.001],
  ringPlayerDiameter: [2, 80, 0.5], ringTargetDiameter: [2, 80, 0.5],
  ringWaveDuration:[0.05,3,0.01],ringWaveDistance:[0,200,1],ringWaveStroke:[0,16,0.1],
  ringSwitchDuration:[0.03,2,0.01], ringSwitchAmount:[0,200,1],
  ringLinkThreshold: [0, 100, 0.1], ringLinkStroke: [0.25, 16, 0.25],
  ringPlayerStroke: [0.25, 8, 0.25], ringTargetStroke: [0.25, 8, 0.05],
  ringPlayerHeight: [0, 5, 0.05], ringTargetHeight: [0, 5, 0.05], ringDuration: [0.05, 3, 0.01],
  targetModel: [0, 2, 1], lockRange: [0, 100, 0.1], showLockRange: [0, 1, 1],
  targetCone: [0, 360, 1], targetAdvantage: [0, 180, 0.1], targetDwell: [0, 2000, 10],
  lockTurnModel: [0, 7, 1], lockTurnSpeed: [90, 1800, 10], lockCurveSnapAngle: [0.001, 5, 0.001],
  lockSlerpResponse: [0.1, 120, 0.001], lockSlerpSnapAngle: [0.001, 5, 0.001],
  lockSmoothTime: [0.005, 0.5, 0.00001], lockSmoothSnapAngle: [0.001, 5, 0.001],
  turnSpeed: [90, 1800, 10], blendDuration: [0, 0.6, 0.01],
  runSpeed: [0.25, 4, 0.05],
  bowScale: [0.1, 6, 0.1], arrowScale: [0.1, 6, 0.1], arrowSpeed: [1, 200, 1],
  roomSize: [8, 24, 1], roomLength: [8, 80, 1], cameraResponse: [2, 24, 0.5],
  cameraOffset: [-25, 25, 1], viewWidth: [12, 28, 0.5],
};

export function sanitize(key: SettingKey, value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS[key];
  if (key.startsWith('hit') && key.endsWith('Enabled')) return value >= .5 ? 1 : 0;
  if (key === 'hitParticleCount') value = Math.round(value);
  if (key === 'moveModel') return value === 1 ? 1 : 0;
  if (key === 'turnModel' || key === 'lockTurnModel') return [0, 2, 5, 6, 7].includes(value) ? value : 0;
  if (key === 'targetModel') return [0, 1, 2].includes(value) ? value : 0;
  return Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], value));
}
