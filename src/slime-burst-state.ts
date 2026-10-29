import type {BurstSettings} from './slime-burst-config.ts';
/** Independent eye pose, smoothly taking over even when the last hit is still restoring. */
export function burstEyePose(age:number,c:BurstSettings){
 const duration=Math.min(c.burstEyePoseTime,c.burstDuration),u=duration>0?Math.max(0,Math.min(1,age/duration)):1;
 return {weight:c.burstEyeEnabled?u*u*(3-2*u):0,out:c.burstEyeOut,angle:c.burstEyeAngle};
}
export function burstSample(t:number,c:BurstSettings){
 const d=c.burstDuration,u=Math.min(1,Math.max(0,t/d)),p=c.burstFrequencyPower;
 const cycles=c.burstFrequencyStart*Math.min(t,d)+(c.burstFrequencyEnd-c.burstFrequencyStart)*d*Math.pow(u,p+1)/(p+1)+Math.max(0,t-d)*c.burstFrequencyEnd;
 const phase=c.burstPhaseStart*Math.PI/180+cycles*Math.PI*2;
 const amplitude=c.burstAmplitudeStart+(c.burstAmplitudeEnd-c.burstAmplitudeStart)*Math.pow(u,c.burstAmplitudePower);
 // A brief continuous onset keeps the actual hand-off shape intact at t=0, for any phase.
 const onset=c.burstOnset>0?Math.min(1,t/Math.min(c.burstOnset,d)):1;const envelope=onset*onset*(3-2*onset);
 const progress=(start:number,end:number)=>end<=start?(u>=start?1:0):Math.max(0,Math.min(1,(u-start)/(end-start)));
 return {phase,scale:(1+(c.burstScale-1)*Math.pow(progress(c.burstScaleStart,c.burstScaleEnd),c.burstScalePower))*(1+amplitude*Math.sin(phase)*envelope),bulgeProgress:Math.pow(progress(c.burstBulgeStart,c.burstBulgeEnd),c.burstBulgePower)};
}
export function burstEndTime(c:BurstSettings){const phase=burstSample(c.burstDuration,c).phase,target=c.burstPhaseEnd*Math.PI/180;const turns=Math.ceil((phase-target)/(2*Math.PI)-1e-10);return c.burstDuration+Math.max(0,target+turns*2*Math.PI-phase)/(2*Math.PI*c.burstFrequencyEnd);}
export class SlimeBurstState{
 phase:'alive'|'feedback'|'winding'|'gone'='alive';age=0;config?:BurstSettings;
 fill(c:BurstSettings){if(this.phase!=='alive'||!c.burstEnabled)return false;this.phase='feedback';this.config={...c};return true;}
 update(dt:number,feedbackComplete:boolean,feedbackRemaining=Infinity){if(this.phase==='feedback'){if(this.config!.burstFeedbackDelay<0){if(feedbackComplete||feedbackRemaining<=-this.config!.burstFeedbackDelay+1e-9){this.phase='winding';this.age=0;}return false;}if(feedbackComplete){this.age+=dt;if(this.age>=this.config!.burstFeedbackDelay){this.phase='winding';this.age=0;}}else this.age=0;return false;}if(this.phase!=='winding')return false;this.age+=dt;if(this.age>=burstEndTime(this.config!)){this.age=burstEndTime(this.config!);this.phase='gone';return true;}return false;}
 reset(){this.phase='alive';this.age=0;this.config=undefined;}
}
