import {spring} from './hit-response.ts';
import type {SlimeInflationSettings} from './slime-inflation-config.ts';
export class SlimeInflationState{
 amount=0;visual=0;target=0;age=Infinity;
 private from=0;private frequency=5.5;private damping=.55;
 private begin(c:SlimeInflationSettings){this.from=this.visual;this.age=0;this.frequency=c.slimeInflationFrequency;this.damping=c.slimeInflationDamping;}
 hit(c:SlimeInflationSettings){if(!c.slimeInflationEnabled||c.slimeInjectionAmount<=0)return;this.amount+=Math.min(c.slimeInjectionAmount,Math.max(0,c.slimeCapacity-this.amount));this.target=Math.min(1,this.amount/c.slimeCapacity);this.begin(c);}
 update(dt:number,c:SlimeInflationSettings){
  const target=Math.min(1,this.amount/c.slimeCapacity);if(target!==this.target){this.target=target;this.begin(c);}
  if(!Number.isFinite(this.age))return;
  this.age+=Math.max(0,dt);const s=spring(this.from-this.target,0,this.age,this.frequency,this.damping);this.visual=Math.max(0,this.target+s.x);
  if(Math.abs(s.x)<1e-5&&Math.abs(s.v)<1e-4){this.visual=this.target;this.age=Infinity;}
 }
 reset(){this.amount=this.visual=this.target=this.from=0;this.age=Infinity;}
}
