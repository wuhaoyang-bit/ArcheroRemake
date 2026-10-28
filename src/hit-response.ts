import type { HitSettings } from './hit-feedback-config.ts';
export type Point = { x: number; z: number };
export function spring(x:number,v:number,t:number,f:number,z:number) {
  const w=2*Math.PI*f;
  if(t<=0)return {x,v};
  if(Math.abs(z-1)<1e-6){const b=v+w*x,e=Math.exp(-w*t);return {x:e*(x+b*t),v:e*(v-w*b*t)};}
  if(z<1){const a=z*w,b=w*Math.sqrt(1-z*z),B=(v+a*x)/b,c=Math.cos(b*t),s=Math.sin(b*t),e=Math.exp(-a*t);return {x:e*(x*c+B*s),v:e*((-a*x+b*B)*c+(-a*B-b*x)*s)};}
  const r1=-w*(z-Math.sqrt(z*z-1)),r2=-w*(z+Math.sqrt(z*z-1)),A=(v-r2*x)/(r1-r2),B=x-A;
  return {x:A*Math.exp(r1*t)+B*Math.exp(r2*t),v:r1*A*Math.exp(r1*t)+r2*B*Math.exp(r2*t)};
}
function compress(start:number,t:number,c:HitSettings){const u=Math.min(1,Math.max(0,t/c.hitCompressTime));return {x:start+(c.hitSquashAmount-start)*u*u*(3-2*u),v:u>=1?0:(c.hitSquashAmount-start)*6*u*(1-u)/c.hitCompressTime};}
/** Visual scale and knockback have independent clocks; a wall never releases the spring. */
export class HitResponse {
  age=Infinity; start=0; x=0; v=0; blocked=false; direction:Point={x:0,z:0};
  private config:HitSettings|null=null;
  constructor(readonly position:Point,readonly bounds:{x:number;z:number}){}
  hit(direction:Point,c:HitSettings){this.start=this.x;this.age=0;this.blocked=false;this.config={...c};const length=Math.hypot(direction.x,direction.z);this.direction=length>1e-8?{x:direction.x/length,z:direction.z/length}:{x:0,z:0};}
  update(dt:number,current:HitSettings){if(!this.config)return;const c=this.config,prev=this.age;this.age+=dt;
    if(c.hitKnockEnabled&&current.hitKnockEnabled&&!this.blocked){const progress=(t:number)=>1-(1-Math.min(1,t/c.hitKnockTime))**3;const distance=c.hitKnockDistance*(progress(this.age)-progress(prev));const dx=this.direction.x*distance,dz=this.direction.z*distance;let fraction=1;
      for(const [p,d,b] of [[this.position.x,dx,this.bounds.x],[this.position.z,dz,this.bounds.z]]){if(d>0)fraction=Math.min(fraction,(b-p)/d);else if(d<0)fraction=Math.min(fraction,(-b-p)/d);}
      fraction=Math.max(0,Math.min(1,fraction));this.position.x+=dx*fraction;this.position.z+=dz*fraction;if(fraction<1)this.blocked=true;
    }
    const release=Math.max(0,c.hitReleaseTime);
    if(!c.hitSquashEnabled||!current.hitSquashEnabled||this.age>=c.hitSquashTime){this.x=this.v=0;return;}
    const s=this.age<release?compress(this.start,this.age,c):(()=>{const initial=compress(this.start,release,c);return spring(initial.x,initial.v,this.age-release,c.hitSpringFrequency,c.hitSpringDamping);})();
    // A short smooth envelope guarantees zero displacement AND velocity at the deadline.
    // Analytic evaluation keeps the result independent of frame rate and timestep partition.
    const tail=Math.min(.1,c.hitSquashTime*.2),tailStart=c.hitSquashTime-tail;
    if(this.age>tailStart){const u=(this.age-tailStart)/tail,weight=1-u*u*(3-2*u),derivative=-6*u*(1-u)/tail;s.v=s.v*weight+s.x*derivative;s.x*=weight;}
    this.x=s.x;this.v=s.v;if(this.age>=release&&Math.abs(this.x)<1e-4&&Math.abs(this.v)<1e-3)this.x=this.v=0;
  }
  remaining(current:HitSettings){const c=this.config;if(!c)return 0;return Math.max(0,Math.max(c.hitKnockEnabled&&current.hitKnockEnabled?c.hitKnockTime:0,c.hitSquashEnabled&&current.hitSquashEnabled?c.hitSquashTime:0,c.hitRimEnabled&&current.hitRimEnabled?c.hitRimTime:0)-this.age);}
  complete(current:HitSettings){return this.remaining(current)<=0;}
  get knockingBack(){return !!this.config?.hitKnockEnabled && this.age<this.config.hitKnockTime;}
  get scale(){return Math.max(.15,Math.min(1.85,1-this.x));}
  rim(current:HitSettings){const c=this.config;if(!c||!c.hitRimEnabled||!current.hitRimEnabled)return 0;if(this.age>=c.hitRimTime)return 0;const start=Math.max(0,Math.min(c.hitRimTime,c.hitRimFadeStart));if(this.age<=start)return c.hitRimStrength;const progress=(this.age-start)/(c.hitRimTime-start);return c.hitRimStrength*(1-progress)**2;}
  reset(){this.age=Infinity;this.start=this.x=this.v=0;this.config=null;this.blocked=false;}
}
