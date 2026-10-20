export type TurnCurvePoint = { angle: number; speed: number };
/** Quintic smoothstep: both derivatives vanish at each knot, including unequal spans.
 * Evaluate from the nearer endpoint to avoid cancellation near a zero speed. */
export function smoothTurnSpeed(angle: number, low: TurnCurvePoint, high: TurnCurvePoint): number {
  const t = Math.max(0, Math.min(1, (angle - low.angle) / (high.angle - low.angle)));
  const u = t <= .5 ? t : 1 - t;
  const s = u * u * u * (10 + u * (-15 + 6 * u));
  return t <= .5 ? low.speed * (1 - s) + high.speed * s : high.speed * (1 - s) + low.speed * s;
}

/** Adaptive Simpson integration of travel time, not of speed or its derivatives. */
function smoothTravelTime(a: number, b: number, low: TurnCurvePoint, high: TurnCurvePoint): number {
  if (a === b) return 0;
  if (smoothTurnSpeed(a, low, high) === 0) return Infinity;
  if (low.speed === high.speed) return (b - a) / low.speed;
  const f = (x: number) => 1 / smoothTurnSpeed(x, low, high);
  const integrate = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tolerance: number, depth: number): number => {
    const m = (a + b) / 2, fl = f((a + m) / 2), fr = f((m + b) / 2);
    const left = (m - a) / 6 * (fa + 4 * fl + fm), right = (b - m) / 6 * (fm + 4 * fr + fb);
    const delta = left + right - whole;
    if (!Number.isFinite(left + right)) return Infinity;
    if (depth === 0 || Math.abs(delta) <= 15 * tolerance) return left + right + delta / 15;
    return integrate(a, m, fa, fl, fm, left, tolerance / 2, depth - 1)
      + integrate(m, b, fm, fr, fb, right, tolerance / 2, depth - 1);
  };
  const fa = f(a), fm = f((a + b) / 2), fb = f(b), whole = (b - a) / 6 * (fa + 4 * fm + fb);
  return integrate(a, b, fa, fm, fb, whole, 1e-10, 18);
}

export function remainingSmoothCurveAngle(error: number, dt: number, points: readonly TurnCurvePoint[], snap: number): number {
  let e = Math.max(0, Math.min(180, error));
  if (!Number.isFinite(dt) || dt <= 0) return e;
  // Never let the arrival threshold jump across a nonzero equilibrium.
  const barrier = points.some(p => p.angle > 0 && p.angle <= e && p.speed === 0);
  const threshold = barrier ? 0 : snap;
  if (e <= threshold) return 0;
  for (let i = points.length - 2; i >= 0 && dt > 0; i--) {
    const low = points[i], high = points[i + 1];
    if (e <= low.angle) continue;
    if (smoothTurnSpeed(e, low, high) === 0) return e;
    const end = Math.max(low.angle, threshold);
    const crossing = smoothTravelTime(end, e, low, high);
    if (dt >= crossing) {
      e = end; dt -= crossing;
      if (e <= threshold) return 0;
    } else {
      let a = end, b = e;
      // Monotone time-of-flight inversion stays inside this segment at all times.
      for (let n = 0; n < 44 && b - a > 1e-11; n++) {
        const m = (a + b) / 2;
        if (smoothTravelTime(m, e, low, high) > dt) a = m; else b = m;
      }
      return b;
    }
  }
  return e;
}
export const MAX_CURVE_POINTS = 128;
export function exponentialCurve(response: number): TurnCurvePoint[] {
  return [0, 15, 30, 60, 90, 120, 150, 180].map(angle => ({ angle, speed: angle * response }));
}
export function validateCurve(raw: unknown): TurnCurvePoint[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_CURVE_POINTS) throw new Error(`曲线需包含 2～${MAX_CURVE_POINTS} 个控制点`);
  const points = raw.map(p => {
    if (!p || typeof p.angle !== 'number' || typeof p.speed !== 'number'
      || !Number.isFinite(p.angle) || !Number.isFinite(p.speed)
      || p.angle < 0 || p.angle > 180 || p.speed < 0) throw new Error('角度需在 0～180°，速度需为非负有限数字');
    return { angle: p.angle, speed: p.speed };
  }).sort((a, b) => a.angle - b.angle);
  if (points[0].angle !== 0 || points.at(-1)!.angle !== 180) throw new Error('必须保留 0° 和 180° 端点');
  if (points.some((p, i) => i > 0 && p.angle === points[i - 1].angle)) throw new Error('同一角度只能有一个控制点');
  return points;
}

/** Integrate de/dt=-v(e) exactly across piecewise-linear speed segments.
 * A line v(e)=k*e thus matches exponential following, rather than Euler stepping.
 * A zero-speed point is an equilibrium: do not jump over it into the next segment.
 */
export function remainingCurveAngle(error: number, dt: number, points: readonly TurnCurvePoint[], snap: number): number {
  let e = Math.max(0, Math.min(180, error)), remaining = dt;
  if (e <= snap) return 0;
  for (let i = points.length - 2; i >= 0 && remaining > 0; i--) {
    const low = points[i], high = points[i + 1];
    if (e <= low.angle) continue;
    const slope = (high.speed - low.speed) / (high.angle - low.angle);
    const speed = low.speed + slope * (e - low.angle);
    if (speed <= 0) break;
    const crossing = low.speed === 0 ? Infinity : slope === 0
      ? (e - low.angle) / speed : (Math.log(speed) - Math.log(low.speed)) / slope;
    if (remaining >= crossing) {
      e = low.angle; remaining -= crossing;
    } else {
      e += slope === 0 ? -speed * remaining : speed * Math.expm1(-slope * remaining) / slope;
      e = Math.max(low.angle, e); remaining = 0;
    }
    if (e <= snap) return 0;
  }
  return e;
}
