import {Vector3} from 'three';
export type InflationMode='scale'|'bulge'|'super';
/** Shape-only transformations about the body center; grounding/volume correction are separate. */
export function inflatePoint(out:Vector3,p:Vector3,mode:InflationMode,fill:number,bulge:number,exponent:number,radius:number){
 out.copy(p);const length=p.length();if(length<1e-10||mode==='scale'||fill===0)return out;
 if(mode==='bulge')return out.multiplyScalar(1+bulge*fill*(radius/length-1));
 const n=8+(exponent-8)*fill;
 const norm=(Math.abs(p.x)**n+Math.abs(p.y)**n+Math.abs(p.z)**n)**(1/n);
 return out.multiplyScalar(1+fill*(1/norm-1));
}
