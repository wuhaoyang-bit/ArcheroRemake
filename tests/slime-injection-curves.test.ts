import test from 'node:test';import assert from 'node:assert/strict';
import {INJECTION_CURVES,InjectionResponse,injectionProgress} from '../src/slime-injection-curves.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8);
test('all responses begin at zero and end exactly at their target',()=>{for(const c of INJECTION_CURVES){near(injectionProgress(c.id,0),0);near(injectionProgress(c.id,c.duration),1);}});
test('curve personalities: immediate quick, delayed pressure, spring overshoot, two-stage pause',()=>{
 assert.ok(injectionProgress('quick',.05)>.3);near(injectionProgress('pressure',.05),0);
 assert.ok(Array.from({length:100},(_,i)=>injectionProgress('spring',i*.01)).some(v=>v>1.1));
 near(injectionProgress('spread',.1),.25);near(injectionProgress('spread',.15),.25);assert.ok(injectionProgress('spread',.2)>.25);
});
test('injection quantity is monotonic, retriggers preserve visual position, capacity caps at one',()=>{
 for(const c of INJECTION_CURVES){const s=new InjectionResponse(c.id);s.hit(.2);s.update(.12);const visual=s.visual;s.hit(.2);near(s.visual,visual);near(s.target,.4);s.update(3);near(s.visual,.4);s.hit(1);near(s.target,1);s.update(3);near(s.visual,1);s.reset();near(s.visual,0);near(s.target,0);}
});
test('response does not depend on timestep partition',()=>{for(const c of INJECTION_CURVES){const a=new InjectionResponse(c.id),b=new InjectionResponse(c.id);a.hit(.2);b.hit(.2);a.update(.3);for(let i=0;i<30;i++)b.update(.01);near(a.visual,b.visual);}});
