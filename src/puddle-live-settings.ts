import type {BurstSettings} from './slime-burst-config.ts';

export type PuddleOrigin={x:number;z:number;shape:number;angleRandom:number;sizeRandom:number;bodyColor?:[number,number,number]};
export type PuddleState={age:number;c:BurstSettings;x:number;z:number;shape:number;angle:number;size:number;scale:number;settled:boolean;opacity:number;origin:PuddleOrigin};
const motionKeys=['puddleStart','puddleVelocity','puddleSpeed','puddleFrequency','puddleDamping','puddleDelay'] as const;

/** Retune the existing residue without restarting its clock or drawing new random values. */
export function applyLivePuddleSettings(p:PuddleState,c:BurstSettings){
 const motionChanged=motionKeys.some(k=>p.c[k]!==c[k]);
 // age excludes delay; preserve the actual time since the monster exploded.
 p.age+=p.c.puddleDelay-c.puddleDelay;
 const color=p.origin.bodyColor??[c.puddleColorR,c.puddleColorG,c.puddleColorB];
 p.c={...c,puddleColorR:color[0],puddleColorG:color[1],puddleColorB:color[2]};
 p.x=p.origin.x+c.puddleX;p.z=p.origin.z+c.puddleZ;
 p.shape=c.puddleShape?Math.round(c.puddleShape)-1:p.origin.shape;
 p.angle=(c.puddleRotation+p.origin.angleRandom*c.puddleRotationRange)*Math.PI/180;
 p.size=c.puddleSize*(1+p.origin.sizeRandom*c.puddleSizeRange);
 if(motionChanged)p.settled=false;
 // A longer lifetime or disabling expiration must cancel a fade already in progress.
 p.opacity=c.puddleLifetime>0&&p.age>c.puddleLifetime?(c.puddleFade>0?Math.max(0,1-(p.age-c.puddleLifetime)/c.puddleFade):0):1;
}

/** All GPU-visible values, including values edited while the spring is settled. */
export function puddleRenderKey(p:PuddleState){
 return [p.age>=0,p.x,p.z,p.shape,p.angle,p.size,p.scale,p.opacity,p.c.puddleColorR,p.c.puddleColorG,p.c.puddleColorB].join('/');
}
