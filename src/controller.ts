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
  private pendingRelease: { id: number; unlocked: boolean } | null = null;
  unlocked = false;
  center = { x: 0, y: 0 };
  raw = { x: 0, y: 0 };
  stick = { x: 0, y: 0 };
  position: GroundVector;
  offset: GroundVector = { x: 0, z: 0 };
  remembered: GroundVector = { x: 0, z: 0 };
  direction: GroundVector | null = null;
  heading = Math.PI;
  get targetHeading() {
    // The retained anchor remains authoritative even while hidden in idle.
    if (Math.hypot(this.offset.x, this.offset.z) > 0) return Math.atan2(this.offset.x, this.offset.z);
    return this.direction ? Math.atan2(this.direction.x, this.direction.z) : Math.PI;
  }

  constructor(settings: Settings = { ...DEFAULTS }) {
    this.settings = { ...settings };
    this.position = { x: 0, z: settings.roomSize * 0.27 };
  }
  get anchorVisible() { return this.mode !== 'idle'; }
  get anchor() { return { x: this.position.x + this.offset.x, z: this.position.z + this.offset.z }; }

  press(id: number, x: number, y: number) {
    this.pendingRelease = null;
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

  private clampInput(dx: number, dy: number) {
    const length = Math.hypot(dx, dy);
    const scale = length === 0 ? 0 : Math.min(1, this.settings.joystickRadius / length);
    return { x: dx * scale, y: dy * scale };
  }

  private mapAnchor(input: { x: number; y: number }) {
    this.offset = { x: input.x * this.settings.anchorScale, z: input.y * this.settings.anchorScale };
    this.syncAnchorDirection();
  }

  private syncAnchorDirection() {
    const length = Math.hypot(this.offset.x, this.offset.z);
    // Exact zero retains the last nonzero direction, as agreed.
    if (length > 0) this.direction = { x: this.offset.x / length, z: this.offset.z / length };
  }

  private mapStick() {
    this.stick = this.clampInput(this.raw.x, this.raw.y);
    this.mapAnchor(this.stick);
  }

  canRelease(id: number) {
    return id === this.pointerId || (this.pointerId === null && id === this.pendingRelease?.id);
  }

  loseCapture(id: number) {
    if (id !== this.pointerId) return;
    const pending = { id, unlocked: this.unlocked };
    // Stop immediately, but capture loss can precede the authoritative pointerup.
    this.release(id);
    this.pendingRelease = pending;
  }

  release(id: number, finalInput?: { x: number; y: number }) {
    if (!this.canRelease(id)) return;
    const unlocked = id === this.pointerId ? this.unlocked : this.pendingRelease!.unlocked;
    this.pendingRelease = null;
    // Final pointer displacement maps directly to the anchor, bypassing the
    // visual stick. A still-locked gesture retains its previous anchor.
    if (finalInput && Number.isFinite(finalInput.x) && Number.isFinite(finalInput.y)
      && (unlocked || Math.hypot(finalInput.x, finalInput.y) > this.settings.unlockDistance)) {
      this.mapAnchor(this.clampInput(finalInput.x, finalInput.y));
    }
    this.remembered = { ...this.offset };
    this.pointerId = null;
    this.mode = 'idle';
    this.unlocked = false;
    this.raw = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
  }

  cancel() {
    this.pendingRelease = null;
    if (this.pointerId !== null) this.release(this.pointerId);
  }

  set(key: SettingKey, value: number) {
    this.settings[key] = sanitize(key, value);
    if (this.unlocked && (key === 'joystickRadius' || key === 'anchorScale')) this.mapStick();
    if (key === 'roomSize' || key === 'roomLength') this.constrain();
  }

  private constrain() {
    const edge = this.settings.roomSize / 2 - PLAYER_RADIUS;
    const longitudinalEdge = this.settings.roomLength / 2 - PLAYER_RADIUS;
    this.position.x = Math.max(-edge, Math.min(edge, this.position.x));
    this.position.z = Math.max(-longitudinalEdge, Math.min(longitudinalEdge, this.position.z));
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.syncAnchorDirection();
    if (this.mode === 'moving' && this.direction) {
      this.position.x += this.direction.x * this.settings.moveSpeed * dt;
      this.position.z += this.direction.z * this.settings.moveSpeed * dt;
      this.constrain();
    }
    let difference = wrapAngle(this.targetHeading - this.heading);
    // Exact left/right reversals have two equally short arcs. Match the observed
    // upper-screen arc (-Z); leave other directions and non-ties unchanged.
    const angleEpsilon = 1e-10;
    if (Math.abs(Math.abs(difference) - Math.PI) < angleEpsilon
      && Math.abs(Math.cos(this.heading)) < angleEpsilon) {
      difference = Math.sign(Math.sin(this.heading)) * Math.PI;
    }
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
