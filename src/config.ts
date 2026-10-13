export const DESIGN_WIDTH = 390;
export const ASPECT = 9 / 19.5;

export const DEFAULTS = {
  joystickRadius: 64,
  unlockDistance: 12,
  anchorScale: 0.036,
  moveSpeed: 16,
  turnSpeed: 900,
  blendDuration: 0.06,
  runSpeed: 1.6,
  roomSize: 16,
  cameraResponse: 9,
  cameraOffset: 0,
  viewWidth: 18,
};
export type Settings = typeof DEFAULTS;
export type SettingKey = keyof Settings;
export const LIMITS: Record<SettingKey, [number, number, number]> = {
  joystickRadius: [32, 100, 1], unlockDistance: [1, 40, 1],
  anchorScale: [0.005, 0.08, 0.001], moveSpeed: [1, 30, 0.1],
  turnSpeed: [90, 1800, 10], blendDuration: [0, 0.6, 0.01],
  runSpeed: [0.25, 4, 0.05],
  roomSize: [8, 24, 1], cameraResponse: [2, 24, 0.5],
  cameraOffset: [-25, 25, 1], viewWidth: [12, 28, 0.5],
};

export function sanitize(key: SettingKey, value: number): number {
  if (!Number.isFinite(value)) return DEFAULTS[key];
  return Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], value));
}
