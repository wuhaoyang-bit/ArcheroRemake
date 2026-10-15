import { validateCurve, type TurnCurvePoint } from './turn-curve.ts';
/** speed is a percentage of the independent base moveSpeed, not angular velocity. */
export const DEFAULT_MOVE_CURVE: TurnCurvePoint[] = [{angle:0,speed:100},{angle:180,speed:100}];
export const validateMoveCurve = validateCurve;
export function movementMultiplier(angle: number, curve: readonly TurnCurvePoint[]): number {
  const error = Math.max(0,Math.min(180,angle));
  for(let i=1;i<curve.length;i++) {
    const a=curve[i-1],b=curve[i];
    if(error<=b.angle) return (a.speed+(b.speed-a.speed)*(error-a.angle)/(b.angle-a.angle))/100;
  }
  return curve.at(-1)!.speed/100;
}
