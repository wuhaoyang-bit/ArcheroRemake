import type {BurstSettings} from './slime-burst-config.ts';

export function allowedPuddleShapes(c:Pick<BurstSettings,'puddleRenderer'|'puddleCanvasShapes'|'puddleCurveShapes'>):number[]{
 const mask=(c.puddleRenderer===1?c.puddleCurveShapes:c.puddleCanvasShapes)&7;
 return [0,1,2].filter(i=>(mask||7)&(1<<i));
}
/** Fixed shape IDs remain explicit overrides; random selections are uniform over the chosen pool. */
export function pickPuddleShape(c:Pick<BurstSettings,'puddleRenderer'|'puddleCanvasShapes'|'puddleCurveShapes'|'puddleShape'>,random:number){
 if(c.puddleShape)return Math.max(0,Math.min(2,Math.round(c.puddleShape)-1));
 const allowed=allowedPuddleShapes(c);
 return allowed[Math.min(allowed.length-1,Math.floor(Math.max(0,random)*allowed.length))];
}
