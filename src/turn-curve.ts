export type TurnCurvePoint = { angle: number; speed: number };
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
