export type AnchorCurvePoint = { distance: number; speed: number };
export const DEFAULT_ANCHOR_CURVE: AnchorCurvePoint[] = [
  {distance:0,speed:0}, {distance:.05,speed:.08}, {distance:.15,speed:.6},
  {distance:.35,speed:4}, {distance:.6,speed:30},
];
export function validateAnchorCurve(raw: unknown): AnchorCurvePoint[] {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 128) throw new Error('锚点曲线需包含 2～128 个点');
  const points = raw.map(p => {
    if (!p || !Number.isFinite(p.distance) || !Number.isFinite(p.speed) || p.distance < 0 || p.distance > 100 || p.speed < 0 || p.speed > 10000) throw new Error('距离需为 0～100，速度需为 0～10000 的有限数字');
    return {distance: Number(p.distance), speed: Number(p.speed)};
  }).sort((a,b)=>a.distance-b.distance);
  if (points[0].distance !== 0 || points.some((p,i)=>i>0 && p.distance===points[i-1].distance)) throw new Error('必须包含距离 0，且距离不能重复');
  return points;
}
/** Exact integration of piecewise-linear v(distance); beyond the last point use its speed. */
export function remainingAnchorDistance(distance: number, dt: number, points: readonly AnchorCurvePoint[]): number {
  if (!Number.isFinite(dt) || dt <= 0) return distance;
  let e = distance, remaining = dt;
  const last = points.at(-1)!;
  if (e > last.distance) {
    if (last.speed === 0) return e;
    const time = (e-last.distance)/last.speed;
    if (remaining < time) return e-last.speed*remaining;
    remaining -= time; e = last.distance;
  }
  for(let i=points.length-2;i>=0 && remaining>0;i--) {
    const low=points[i],high=points[i+1];
    if(e<=low.distance) continue;
    const slope=(high.speed-low.speed)/(high.distance-low.distance);
    const speed=low.speed+slope*(e-low.distance);
    if(speed<=0) break;
    const time=low.speed===0?Infinity:slope===0?(e-low.distance)/speed:(Math.log(speed)-Math.log(low.speed))/slope;
    if(remaining>=time) {e=low.distance;remaining-=time;}
    else {e+=slope===0?-speed*remaining:speed*Math.expm1(-slope*remaining)/slope;e=Math.max(low.distance,e);remaining=0;}
  }
  return Math.max(0,e);
}
