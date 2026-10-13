import { DEFAULTS, sanitize, type SettingKey, type Settings } from './config.ts';

export type Mode = 'idle' | 'in-place' | 'moving';
export type GroundVector = { x: number; z: number };
export const PLAYER_RADIUS = 0.46;
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const follow = (current: number, target: number, response: number, dt: number) =>
  current + (target - current) * -Math.expm1(-response * dt);

/** Pure input/movement state. The visual model and camera never drive this state. */
export class MovementController {
  settings: Settings;
  mode: Mode = 'idle';
  pointerId: number | null = null;
  unlocked = false;
  center = { x: 0, y: 0 };
  raw = { x: 0, y: 0 };
  stick = { x: 0, y: 0 };
  position: GroundVector;
  offset: GroundVector = { x: 0, z: 0 };
  remembered: GroundVector = { x: 0, z: 0 };
  direction: GroundVector | null = null;
  heading = Math.PI;
  targetHeading = Math.PI;

  constructor(settings: Settings = { ...DEFAULTS }) {
    this.settings = { ...settings };
    this.position = { x: 0, z: settings.roomSize * 0.27 };
  }
  get anchorVisible() { return this.mode !== 'idle'; }
  get anchor() { return { x: this.position.x + this.offset.x, z: this.position.z + this.offset.z }; }

  press(id: number, x: number, y: number) {
    // Taking over does not reset the movement mode or the remembered direction.
    if (this.mode === 'idle') {
      this.mode = 'in-place';
      this.offset = { ...this.remembered };
    }
    this.pointerId = id;
    this.center = { x, y };
    this.raw = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.unlocked = false;
  }

  move(id: number, dx: number, dy: number) {
    if (id !== this.pointerId || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.raw = { x: dx, y: dy };
    if (!this.unlocked) {
      if (Math.hypot(dx, dy) <= this.settings.unlockDistance) return;
      this.unlocked = true;
      this.mode = 'moving';
    }
    this.mapStick();
  }

  private mapStick() {
    const length = Math.hypot(this.raw.x, this.raw.y);
    const scale = length === 0 ? 0 : Math.min(1, this.settings.joystickRadius / length);
    this.stick = { x: this.raw.x * scale, y: this.raw.y * scale };
    this.offset = { x: this.stick.x * this.settings.anchorScale, z: this.stick.y * this.settings.anchorScale };
    // Deliberately no second dead zone. Exact zero retains only the last direction.
    if (length > 0) {
      this.direction = { x: this.raw.x / length, z: this.raw.y / length };
      this.targetHeading = Math.atan2(this.direction.x, this.direction.z);
    }
  }

  release(id: number) {
    if (id !== this.pointerId) return;
    this.remembered = { ...this.offset };
    this.pointerId = null;
    this.mode = 'idle';
    this.unlocked = false;
    this.raw = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
  }

  cancel() { if (this.pointerId !== null) this.release(this.pointerId); }

  set(key: SettingKey, value: number) {
    this.settings[key] = sanitize(key, value);
    if (this.unlocked && (key === 'joystickRadius' || key === 'anchorScale')) this.mapStick();
    if (key === 'roomSize') this.constrain();
  }

  private constrain() {
    const edge = this.settings.roomSize / 2 - PLAYER_RADIUS;
    this.position.x = Math.max(-edge, Math.min(edge, this.position.x));
    this.position.z = Math.max(-edge, Math.min(edge, this.position.z));
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    if (this.mode === 'moving' && this.direction) {
      this.position.x += this.direction.x * this.settings.moveSpeed * dt;
      this.position.z += this.direction.z * this.settings.moveSpeed * dt;
      this.constrain();
    }
    const difference = wrapAngle(this.targetHeading - this.heading);
    const step = this.settings.turnSpeed * Math.PI / 180 * dt;
    this.heading = wrapAngle(this.heading + Math.sign(difference) * Math.min(Math.abs(difference), step));
  }

  snapshot() {
    return {
      mode: this.mode, pointerId: this.pointerId, unlocked: this.unlocked,
      position: { ...this.position }, stick: { ...this.stick }, offset: { ...this.offset },
      remembered: { ...this.remembered }, direction: this.direction && { ...this.direction },
      anchor: this.anchor, anchorVisible: this.anchorVisible,
      heading: this.heading, targetHeading: this.targetHeading,
    };
  }
}

/** Linear weight interpolation starting from the current pose, including reversals. */
export class AnimationBlend {
  weight = 0;
  target = 0;
  private start = 0;
  private elapsed = 0;
  private duration = 0;
  setTarget(target: number, duration: number) {
    if (target === this.target) return;
    this.start = this.weight;
    this.target = target;
    this.elapsed = 0;
    this.duration = duration;
    if (duration === 0) this.weight = target;
  }
  update(dt: number) {
    this.elapsed += dt;
    const t = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1;
    this.weight = this.start + (this.target - this.start) * t;
    return this.weight;
  }
}
