import {spring} from './hit-response.ts';
export const SHAKE_SPRING_DEFAULTS={cameraShakeExtraMode:0,cameraShakeRollAmount:2,cameraShakeRollTime:.7,cameraShakeRollAttack:.035,cameraShakeRollFrequency:6,cameraShakeRollDamping:.25,cameraShakeScaleAmount:6,cameraShakeScaleTime:.7,cameraShakeScaleAttack:.04,cameraShakeScaleFrequency:6,cameraShakeScaleDamping:.25};
export type ShakeSpringSettings=typeof SHAKE_SPRING_DEFAULTS;
export const SHAKE_SPRING_LIMITS:Record<keyof ShakeSpringSettings,[number,number,number]>={cameraShakeExtraMode:[0,2,1],cameraShakeRollAmount:[0,10,.1],cameraShakeRollTime:[.1,3,.01],cameraShakeRollAttack:[.005,.2,.005],cameraShakeRollFrequency:[1,20,.1],cameraShakeRollDamping:[.05,.95,.01],cameraShakeScaleAmount:[0,25,.5],cameraShakeScaleTime:[.1,3,.01],cameraShakeScaleAttack:[.005,.2,.005],cameraShakeScaleFrequency:[1,20,.1],cameraShakeScaleDamping:[.05,.95,.01]};
export type SpringKind='Roll'|'Scale';
export const springKey=(kind:SpringKind,field:'Amount'|'Time'|'Attack'|'Frequency'|'Damping')=>`cameraShake${kind}${field}` as keyof ShakeSpringSettings;
/** Shared by the actual camera and the plotted preview. Zero at both ends. */
export function screenSpringSample(t:number,c:ShakeSpringSettings,kind:SpringKind){
 const duration=c[springKey(kind,'Time')],attack=Math.min(c[springKey(kind,'Attack')],duration*.4);
 if(t<=0||t>=duration)return 0;
 const amount=c[springKey(kind,'Amount')];
 if(t<attack){const u=t/attack;return amount*u*u*(3-2*u);}
 const state=spring(amount,0,t-attack,c[springKey(kind,'Frequency')],c[springKey(kind,'Damping')]);
 const tail=Math.min(.15,(duration-attack)*.25),u=Math.max(0,(t-(duration-tail))/tail);
 return state.x*(1-u*u*(3-2*u));
}
export class ScreenSpringFeedback{
 private config:ShakeSpringSettings|null=null;private age=0;private kind:SpringKind='Roll';
 trigger(c:ShakeSpringSettings,mode=c.cameraShakeExtraMode){this.reset();if(mode!==1&&mode!==2)return;this.config={...c};this.kind=mode===1?'Roll':'Scale';}
 update(dt:number){if(!this.config)return;this.age+=Math.max(0,dt);if(this.age>=this.config[springKey(this.kind,'Time')])this.reset();}
 value(){const v=this.config?screenSpringSample(this.age,this.config,this.kind):0;return {rotation:this.kind==='Roll'?v:0,scale:this.kind==='Scale'?1-v/100:1};}
 reset(){this.config=null;this.age=0;}
 snapshot(){return {...this.value(),active:!!this.config,age:this.age,kind:this.kind};}
}
