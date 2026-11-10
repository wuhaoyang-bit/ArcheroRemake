/** Constant speed until N% of total distance, then linearly decelerate to rest.
 * Solving the two areas under velocity gives brakeTime = T*N/(2-N).
 * Integrating analytically makes the result independent of frame rate. */
export function sampleEmbedMotion(speed:number,duration:number,brakeFraction:number,time:number){
  if(duration<=0)return {distance:0,speed:0};
  const t=Math.max(0,Math.min(duration,time));
  const start=duration*brakeFraction/(2-brakeFraction);
  if(t<start)return {distance:speed*t,speed};
  const tail=duration-start;
  if(tail<=1e-12)return {distance:speed*t,speed:t>=duration?0:speed};
  const u=t-start;
  return {distance:speed*start+speed*(u-u*u/(2*tail)),speed:speed*Math.max(0,1-u/tail)};
}
