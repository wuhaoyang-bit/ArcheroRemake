import type { Settings } from './config.ts';

export type Target = { id: string; label: string; x: number; z: number };
type Position = { x: number; z: number };
type Rules = Pick<Settings, 'targetModel' | 'lockRange' | 'targetCone' | 'targetAdvantage' | 'targetDwell'>;
const EPS = 1e-9;

/** Selection owns neither movement nor body rotation. All distances are in the ground plane. */
export class TargetSelection {
  active = false;
  target: Target | null = null;
  candidate: Target | null = null;
  elapsed = 0; // seconds, continuous qualification by the same candidate

  reset() { this.active = false; this.reselect(); }
  reselect() { this.target = null; this.clearCandidate(); }
  clearCandidate() { this.candidate = null; this.elapsed = 0; }

  update(targets: readonly Target[], position: Position, heading: number, rules: Rules, dt: number) {
    if (!this.active) return;
    const all = targets.map(target => {
      const x = target.x - position.x, z = target.z - position.z;
      const diff = Math.atan2(x, z) - heading;
      return { target, distance: Math.hypot(x, z), angle: Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff))) * 180 / Math.PI };
    }).filter(t => t.distance <= rules.lockRange);
    if (rules.targetModel === 0) {
      this.target = all.sort((a, b) => a.distance - b.distance)[0]?.target ?? null;
      this.clearCandidate(); return;
    }
    const best = all.filter(t => t.angle <= rules.targetCone / 2 + EPS)
      .sort((a, b) => Math.abs(a.angle - b.angle) <= EPS ? a.distance - b.distance : a.angle - b.angle)[0];
    if (rules.targetModel === 1) {
      this.target = best?.target ?? null; this.clearCandidate(); return;
    }
    const current = all.find(t => t.target.id === this.target?.id);
    if (!current) { // First selection / removed target / range invalidation bypass dwell.
      this.target = best?.target ?? null; this.clearCandidate(); return;
    }
    this.target = current.target; // Refresh position if the same entity moved.
    const advantage = best ? current.angle - best.angle : 0;
    // Equal-angle proximity ranks a candidate but cannot bypass C's angular advantage.
    if (!best || best.target.id === current.target.id || advantage <= EPS || advantage + EPS < rules.targetAdvantage) {
      this.clearCandidate(); return;
    }
    if (best.target.id !== this.candidate?.id) this.elapsed = 0;
    this.candidate = best.target;
    this.elapsed += Math.max(0, dt);
    if (this.elapsed + EPS >= rules.targetDwell / 1000) {
      this.target = best.target; this.clearCandidate();
    }
  }

  snapshot() {
    return { active: this.active, target: this.target && { ...this.target },
      candidate: this.candidate && { ...this.candidate }, elapsedMs: this.elapsed * 1000 };
  }
}
