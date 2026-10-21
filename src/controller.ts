import { validateProgressCurve, validateSwitchCurve, validateStrokeCurve, type StrokePoint, type ProgressPoint } from './lock-rings.ts';
import { movementMultiplier, validateMoveCurve } from './move-speed.ts';
import { remainingAnchorDistance, validateAnchorCurve, type AnchorCurvePoint } from './anchor-follow.ts';
import { trainingCourse, lockingTargets, moveAroundObstacles, CHECKPOINT_RADIUS, type TrainingMode } from './training.ts';
import { TargetSelection } from './targeting.ts';
import { remainingCurveAngle, remainingSmoothCurveAngle, validateCurve, type TurnCurvePoint } from './turn-curve.ts';
import { DEFAULTS, sanitize, type SettingKey, type Settings } from './config.ts';
import { slerpTurn, smoothDampAngleTurn } from './turn-damping.ts';

export type Mode = 'idle' | 'in-place' | 'moving';
export type GroundVector = { x: number; z: number };
export const PLAYER_RADIUS = 0.46;
export const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle));
export const follow = (current: number, target: number, response: number, dt: number) =>
  current + (target - current) * -Math.expm1(-response * dt);

/** Pure input/movement state. The visual model and camera never drive this state. */
export class MovementController {
  settings: Settings;
  training: TrainingMode = 'free';
  targeting = new TargetSelection();
  private targetCache: ReturnType<typeof lockingTargets> = [];
  private targetCacheKey = '';
  practiceRevision = 0;
  getPracticeTargets() {
    const key = `${this.settings.roomSize}/${this.settings.roomLength}/${this.practiceRevision}`;
    if(key !== this.targetCacheKey){this.targetCacheKey=key;this.targetCache=lockingTargets(this.settings.roomSize,this.settings.roomLength);}
    return this.targetCache;
  }
  refreshTargetPositions(){this.updateTargeting(0);}
  private lastTurnModel: number | null = null;
  completions = 0;
  passedCheckpoints = 0;
  private courseCache?: ReturnType<typeof trainingCourse>;
  private courseKey = '';
  get course() {
    const key = `${this.settings.roomSize}/${this.settings.roomLength}`;
    if (!this.courseCache || key !== this.courseKey) {
      this.courseCache = trainingCourse(this.settings.roomSize, this.settings.roomLength); this.courseKey = key;
    }
    return this.courseCache;
  }
  private checkTrainingProgress() {
    const next = this.course.checkpoints[this.passedCheckpoints];
    if (next && Math.hypot(this.position.x-next.x, this.position.z-next.z) <= CHECKPOINT_RADIUS) this.passedCheckpoints++;
  }
  setTraining(training: TrainingMode) {
    this.training = training;
    this.completions = 0;
    this.restartTraining();
  }
  restartTraining() {
    this.practiceRevision++;
    this.passedCheckpoints = 0;
    this.cancel();
    this.pointerId = null; this.pendingRelease = null;
    this.mode = 'idle'; this.movementSpeed = 0; this.unlocked = false;
    this.targetOffset = {x: 0, z: 0};
    this.offset = {x: 0, z: 0}; this.remembered = {x: 0, z: 0}; this.direction = null;
    this.raw = {x: 0, y: 0}; this.stick = {x: 0, y: 0};
    this.heading = Math.PI; this.angularSpeed = 0; this.dampedVelocity = 0;
    this.lastTurnModel = null; this.targeting.reset();
    this.position = {x: 0, z: this.training === 'obstacles' ? this.course.startZ : this.training === 'locking' ? 0 : this.settings.roomSize * .27};
    this.constrain();
  }
  movementAngleError = 0;
  movementSpeedRatio = 1;
  movementBaseSpeed = 0;
  movementSpeed = 0; // Commanded units/s, before walls or obstacle collision.
  mode: Mode = 'idle';
  pointerId: number | null = null;
  private pendingRelease: { id: number; unlocked: boolean } | null = null;
  private attackSequence = 0;
  attackRequest: number | null = null;
  get activeAttackRequest() {
    return this.mode === 'idle' && this.training === 'locking' && this.targeting.target
      ? this.attackRequest : null;
  }
  unlocked = false;
  center = { x: 0, y: 0 };
  raw = { x: 0, y: 0 };
  stick = { x: 0, y: 0 };
  position: GroundVector;
  offset: GroundVector = { x: 0, z: 0 };
  targetOffset: GroundVector = { x: 0, z: 0 };
  remembered: GroundVector = { x: 0, z: 0 };
  direction: GroundVector | null = null;
  heading = Math.PI;
  angularSpeed = 0; // Actual turn magnitude during the latest simulation step, degrees/s.
  private dampedVelocity = 0; // Signed radians/s; persists across input updates and release.
  get anchorHeading() {
    // The retained anchor remains authoritative even while hidden in idle.
    if (Math.hypot(this.offset.x, this.offset.z) > 0) return Math.atan2(this.offset.x, this.offset.z);
    return this.direction ? Math.atan2(this.direction.x, this.direction.z) : Math.PI;
  }
  // A new locked stick during a moving handoff is still "moving", not in-place.
  get usesLockTurn() { return this.mode !== 'moving' && this.training === 'locking' && this.targeting.target !== null; }
  get targetHeading() {
    const target = this.targeting.target;
    return this.usesLockTurn && target
      ? Math.atan2(target.x - this.position.x, target.z - this.position.z) : this.anchorHeading;
  }
  get activeTurnModel() { return this.usesLockTurn ? this.settings.lockTurnModel : this.settings.turnModel; }
  private updateTargeting(dt: number) {
    if (this.training !== 'locking') return;
    this.getPracticeTargets();
    this.targeting.update(this.targetCache, this.position, this.anchorHeading, this.settings, dt);
  }

  constructor(settings: Settings = { ...DEFAULTS }) {
    this.settings = { ...settings, ringWaveCurve:validateProgressCurve(settings.ringWaveCurve), ringSwitchCurve:validateSwitchCurve(settings.ringSwitchCurve), ringLinkAttackCurve:validateStrokeCurve(settings.ringLinkAttackCurve), ringStrokeCurve:validateStrokeCurve(settings.ringStrokeCurve), ringCurve: validateProgressCurve(settings.ringCurve), turnCurve: validateCurve(settings.turnCurve), lockTurnCurve: validateCurve(settings.lockTurnCurve), anchorCurve: validateAnchorCurve(settings.anchorCurve), moveCurve: validateMoveCurve(settings.moveCurve) };
    this.position = { x: 0, z: settings.roomSize * 0.27 };
  }
  get anchorVisible() { return this.mode !== 'idle'; }
  get anchor() { return { x: this.position.x + this.offset.x, z: this.position.z + this.offset.z }; }

  press(id: number, x: number, y: number) {
    this.attackRequest = null;
    this.pendingRelease = null;
    // Taking over does not reset the movement mode or the remembered direction.
    if (this.mode === 'idle') {
      this.mode = 'in-place';
      this.offset = { ...this.remembered };
    }
    this.targetOffset = { ...this.offset }; // Freeze actual anchor during a new locked gesture.
    this.pointerId = id;
    this.center = { x, y };
    this.raw = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.unlocked = false;
    if (this.training === 'locking') { this.targeting.active = true; this.updateTargeting(0); }
  }

  move(id: number, dx: number, dy: number) {
    if (id !== this.pointerId || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const startsMoving = this.mode === 'in-place';
    this.raw = { x: dx, y: dy };
    if (!this.unlocked) {
      if (Math.hypot(dx, dy) <= this.settings.unlockDistance) return;
      this.unlocked = true;
      this.mode = 'moving';
    }
    this.mapStick(startsMoving);
  }

  private clampInput(dx: number, dy: number) {
    const length = Math.hypot(dx, dy);
    const scale = length === 0 ? 0 : Math.min(1, this.settings.joystickRadius / length);
    return { x: dx * scale, y: dy * scale };
  }

  private mapAnchor(input: { x: number; y: number }, immediate = false) {
    this.targetOffset = { x: input.x * this.settings.anchorScale, z: input.y * this.settings.anchorScale };
    if (immediate || !this.settings.anchorFollow) {
      this.offset = { ...this.targetOffset };
      this.syncAnchorDirection();
    }
  }

  private followAnchor(dt: number) {
    if (this.mode !== 'moving' || !this.unlocked || !this.settings.anchorFollow) return;
    const dx = this.targetOffset.x-this.offset.x, dz = this.targetOffset.z-this.offset.z;
    const distance = Math.hypot(dx,dz);
    if (distance === 0) return;
    const remaining = remainingAnchorDistance(distance,dt,this.settings.anchorCurve);
    const fraction = 1-remaining/distance;
    this.offset.x += dx*fraction; this.offset.z += dz*fraction;
  }

  private syncAnchorDirection() {
    const length = Math.hypot(this.offset.x, this.offset.z);
    // Exact zero retains the last nonzero direction, as agreed.
    if (length > 0) this.direction = { x: this.offset.x / length, z: this.offset.z / length };
  }

  private mapStick(immediate = false) {
    this.stick = this.clampInput(this.raw.x, this.raw.y);
    this.mapAnchor(this.stick, immediate);
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

  release(id: number, finalInput?: { x: number; y: number }, reason: 'pointerup' | 'cancel' = 'cancel') {
    if (!this.canRelease(id)) return;
    const unlocked = id === this.pointerId ? this.unlocked : this.pendingRelease!.unlocked;
    this.pendingRelease = null;
    // Final pointer displacement maps directly to the anchor, bypassing the
    // visual stick. A still-locked gesture retains its previous anchor.
    if (finalInput && Number.isFinite(finalInput.x) && Number.isFinite(finalInput.y)
      && (unlocked || Math.hypot(finalInput.x, finalInput.y) > this.settings.unlockDistance)) {
      this.mapAnchor(this.clampInput(finalInput.x, finalInput.y), true);
    }
    this.targetOffset = { ...this.offset }; // Cancellation/locked release leaves no pending follow.
    this.remembered = { ...this.offset };
    this.pointerId = null;
    this.mode = 'idle'; this.movementSpeed = 0;
    this.unlocked = false;
    this.raw = { x: 0, y: 0 };
    this.stick = { x: 0, y: 0 };
    this.targeting.clearCandidate();
    this.updateTargeting(0);
    // Only an authoritative owner pointerup requests a shot, after final-position
    // mapping and target selection. Cancellation/capture loss is not a release shot.
    this.attackRequest = reason === 'pointerup' && this.training === 'locking' && this.targeting.target
      ? ++this.attackSequence : null;
  }

  cancel() {
    this.attackRequest = null;
    this.pendingRelease = null;
    if (this.pointerId !== null) this.release(this.pointerId);
  }

  setRingLinkAttackCurve(points:StrokePoint[]){this.settings.ringLinkAttackCurve=validateStrokeCurve(points);}
  setRingStrokeCurve(points:StrokePoint[]){this.settings.ringStrokeCurve=validateStrokeCurve(points);}
  setRingWaveCurve(points:ProgressPoint[]){this.settings.ringWaveCurve=validateProgressCurve(points);}
  setRingSwitchCurve(points:ProgressPoint[]){this.settings.ringSwitchCurve=validateSwitchCurve(points);}
  setRingCurve(points: ProgressPoint[]) { this.settings.ringCurve = validateProgressCurve(points); }

  setAnchorCurve(points: AnchorCurvePoint[]) { this.settings.anchorCurve = validateAnchorCurve(points); }

  setMoveCurve(points: TurnCurvePoint[]) { this.settings.moveCurve = validateMoveCurve(points); }

  setCurve(points: TurnCurvePoint[]) { this.settings.turnCurve = validateCurve(points); }
  setLockCurve(points: TurnCurvePoint[]) { this.settings.lockTurnCurve = validateCurve(points); }

  set(key: SettingKey, value: number) {
    const next = sanitize(key, value);
    // Changing model starts fresh velocity state, without changing pose, input, or anchor.
    if ((key === 'turnModel' && !this.usesLockTurn || key === 'lockTurnModel' && this.usesLockTurn)
      && next !== this.settings[key]) this.dampedVelocity = 0;
    if (key === 'targetModel' && next !== this.settings.targetModel) this.targeting.reselect();
    this.settings[key] = next;
    if (key === 'anchorFollow' && !next) { this.offset = {...this.targetOffset}; this.syncAnchorDirection(); }
    if (this.unlocked && (key === 'joystickRadius' || key === 'anchorScale')) this.mapStick();
    if (key === 'roomSize' || key === 'roomLength') {
      if (this.training === 'obstacles') this.restartTraining(); else this.constrain();
    }
    if (['targetModel', 'lockRange', 'targetCone', 'targetAdvantage', 'targetDwell', 'roomSize', 'roomLength'].includes(key)) this.updateTargeting(0);
  }

  private constrain() {
    const edge = this.settings.roomSize / 2 - PLAYER_RADIUS;
    const longitudinalEdge = this.settings.roomLength / 2 - PLAYER_RADIUS;
    this.position.x = Math.max(-edge, Math.min(edge, this.position.x));
    this.position.z = Math.max(-longitudinalEdge, Math.min(longitudinalEdge, this.position.z));
  }

  update(dt: number) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.followAnchor(dt);
    this.syncAnchorDirection();
    this.movementSpeed = 0;
    if (this.mode === 'moving' && this.direction) {
      const angle = Math.abs(wrapAngle(this.anchorHeading-this.heading))*180/Math.PI;
      this.movementAngleError = angle;
      this.movementSpeedRatio = this.settings.moveModel === 1 ? movementMultiplier(angle,this.settings.moveCurve) : 1;
      this.movementBaseSpeed = this.settings.moveSpeed;
      this.movementSpeed = this.movementBaseSpeed * this.movementSpeedRatio;
      const dx = this.direction.x * this.movementSpeed * dt, dz = this.direction.z * this.movementSpeed * dt;
      if (this.training === 'obstacles') moveAroundObstacles(this.position, dx, dz, this.course.obstacles, PLAYER_RADIUS, () => this.checkTrainingProgress());
      else { this.position.x += dx; this.position.z += dz; }
      this.constrain();
      if (this.training === 'obstacles' && this.position.z <= this.course.finishZ) {
        this.completions++; this.restartTraining(); return;
      }
    }
    this.updateTargeting(dt);
    const locked = this.usesLockTurn, model = this.activeTurnModel;
    if (this.lastTurnModel !== null && this.lastTurnModel !== model) this.dampedVelocity = 0;
    this.lastTurnModel = model;
    let difference = wrapAngle(this.targetHeading - this.heading);
    // Exact left/right reversals have two equally short arcs. Match the observed
    // left-to-right upper arc (-Z), right-to-left lower arc (+Z).
    // Both use negative rotation; non-ties still take the shortest arc.
    const angleEpsilon = 1e-10;
    if (Math.abs(Math.abs(difference) - Math.PI) < angleEpsilon
      && Math.abs(Math.cos(this.heading)) < angleEpsilon) {
      difference = -Math.PI;
    }
    let turn: number;
    if (model === 2 || model === 7) {
      const degrees = Math.abs(difference) * 180 / Math.PI;
      const residual = (model === 7 ? remainingSmoothCurveAngle : remainingCurveAngle)(degrees, dt, locked ? this.settings.lockTurnCurve : this.settings.turnCurve,
        locked ? this.settings.lockCurveSnapAngle : this.settings.curveSnapAngle);
      turn = Math.sign(difference) * (degrees - residual) * Math.PI / 180;
    } else if (model === 5) {
      turn = slerpTurn(difference, locked ? this.settings.lockSlerpResponse : this.settings.slerpResponse,
        (locked ? this.settings.lockSlerpSnapAngle : this.settings.slerpSnapAngle) * Math.PI / 180, dt);
    } else if (model === 6) {
      // Preserve the existing shortest-path contract when input reverses: discard
      // velocity pointing away from the new target. Same-direction speed carries on.
      if (difference * this.dampedVelocity < 0) this.dampedVelocity = 0;
      const next = smoothDampAngleTurn(
        difference, this.dampedVelocity, locked ? this.settings.lockSmoothTime : this.settings.smoothTime,
        (locked ? this.settings.lockSmoothSnapAngle : this.settings.smoothSnapAngle) * Math.PI / 180, dt,
      );
      turn = next.turn;
      this.dampedVelocity = next.velocity;
    } else {
      const step = (locked ? this.settings.lockTurnSpeed : this.settings.turnSpeed) * Math.PI / 180 * dt;
      turn = Math.sign(difference) * Math.min(Math.abs(difference), step);
    }
    this.angularSpeed = Math.abs(turn) / dt * 180 / Math.PI;
    this.heading = wrapAngle(this.heading + turn);
  }

  snapshot() {
    return {
      training: this.training, completions: this.completions, passedCheckpoints: this.passedCheckpoints,
      mode: this.mode, pointerId: this.pointerId, unlocked: this.unlocked,
      position: { ...this.position }, stick: { ...this.stick }, offset: { ...this.offset }, targetOffset: { ...this.targetOffset },
      remembered: { ...this.remembered }, direction: this.direction && { ...this.direction },
      anchor: this.anchor, anchorVisible: this.anchorVisible,
      movementAngleError: this.movementAngleError, movementSpeedRatio: this.movementSpeedRatio, movementBaseSpeed: this.movementBaseSpeed,
      movementSpeed: this.movementSpeed, heading: this.heading, angularSpeed: this.angularSpeed, targetHeading: this.targetHeading,
      dampingVelocity: this.dampedVelocity * 180 / Math.PI,
      targeting: this.targeting.snapshot(), anchorHeading: this.anchorHeading,
      turnContext: this.usesLockTurn ? 'lock' : 'ordinary', activeTurnModel: this.activeTurnModel,
      attackRequest: this.attackRequest,
      activeAttackRequest: this.activeAttackRequest,
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
  reset(weight: number) {
    this.weight = weight; this.target = weight; this.start = weight;
    this.elapsed = 0; this.duration = 0;
  }
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
