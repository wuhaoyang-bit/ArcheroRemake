import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DEFAULTS} from '../src/config.ts';
import {SlimeBurstState,burstSample,burstEndTime} from '../src/slime-burst-state.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {createTrainingCube} from '../src/training-monster.ts';
import {settingsDocument,parseSettingsDocument} from '../src/settings-store.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('burst waits for feedback, ends at outward peak exactly once and resets',()=>{
 const b=new SlimeBurstState();assert.equal(b.fill({...DEFAULTS,burstEnabled:0}),false);assert.ok(b.fill(DEFAULTS));assert.equal(b.fill(DEFAULTS),false);b.update(10,false);assert.equal(b.phase,'feedback');b.update(.1,true);assert.equal(b.phase,'winding');near(b.age,0);const end=burstEndTime(DEFAULTS);assert.ok(end>=DEFAULTS.burstDuration);near(Math.sin(burstSample(end,DEFAULTS).phase),1);assert.ok(b.update(end,true));assert.equal(b.phase,'gone');assert.equal(b.update(1,true),false);b.reset();assert.equal(b.phase,'alive');
});
for(const mode of [0,1])test(`final hit finishes feedback and knockback before burst (squash mode ${mode})`,()=>{
 const root=createTrainingCube();root.userData.practiceTarget='a';const group=new T.Group();group.add(root);const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38),c={...DEFAULTS,slimeInjectionAmount:100,hitSquashMode:mode};let filled=0,exploded=0;f.onFilled=()=>filled++;f.onBurst=()=>exploded++;
 f.hit('a',{x:0,z:1},c);assert.equal(filled,1);assert.equal(f.proxies.length,0);assert.equal(f.hit('a',{x:0,z:1},c),false);f.update(.05,c);const p=f.snapshot()[0].position;assert.ok(p.z>0);f.pursue(.5,{x:5,z:5},10,c);assert.deepEqual(f.snapshot()[0].position,p);assert.equal(f.snapshot()[0].burst.phase,'feedback');
 for(let i=0;i<2000&&f.snapshot()[0].burst.phase!=='winding';i++)f.update(1/120,c);const before=f.snapshot()[0];assert.equal(before.burst.phase,'winding');near(before.compression,0);near(before.rim,0);near(before.inflation!.visual,1);near(before.position.z,c.hitKnockDistance);const visual=root.getObjectByName('WholeDummyVisual')!;near(new T.Box3().setFromObject(visual).min.y,0);
 for(let i=0;i<300;i++){f.update(1/120,c);f.pursue(1/120,{x:8,z:8},10,c);}assert.equal(exploded,1);assert.equal(root.visible,false);assert.deepEqual(f.snapshot()[0].position,before.position);f.reset();assert.equal(root.visible,true);assert.equal(f.proxies.length,1);near(f.snapshot()[0].inflation!.amount,0);
});
test('burst controls persist with backwards compatible defaults',()=>{const c={...DEFAULTS,burstDuration:2.3,puddleShape:2,puddleDamping:.7,burstLayer3Enabled:0};assert.deepEqual(parseSettingsDocument(settingsDocument(c)),c);assert.equal(parseSettingsDocument({version:1,settings:{}}).burstBulge,.8);});

test('negative transition offset starts before feedback completes, positive offset still waits',()=>{
 const early=new SlimeBurstState();early.fill({...DEFAULTS,burstFeedbackDelay:-.5});early.update(.1,false,.6);assert.equal(early.phase,'feedback');early.update(.1,false,.5);assert.equal(early.phase,'winding');near(early.age,0);
 const late=new SlimeBurstState();late.fill({...DEFAULTS,burstFeedbackDelay:.3});late.update(2,false,.1);assert.equal(late.phase,'feedback');late.update(.1,true,0);assert.equal(late.phase,'feedback');late.update(.2,true,0);assert.equal(late.phase,'winding');
 const tuned={...DEFAULTS,burstFeedbackDelay:-.75};assert.equal(parseSettingsDocument(settingsDocument(tuned)).burstFeedbackDelay,-.75);
});
for(const mode of [0,1])test(`early burst overlaps continuing knockback, squash and inflation (mode ${mode})`,()=>{
 const root=createTrainingCube();root.userData.practiceTarget='a';const group=new T.Group();group.add(root);
 const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38),c={...DEFAULTS,slimeInjectionAmount:100,burstFeedbackDelay:-1.9,burstDuration:3,hitSquashMode:mode,hitKnockTime:.8};
 f.hit('a',{x:0,z:1},c);let tick=0;while(f.snapshot()[0].burst.phase==='feedback'&&tick++<500)f.update(1/120,c);
 const start=f.snapshot()[0];assert.ok(tick/120<.12);assert.equal(start.burst.phase,'winding');assert.ok(start.compression>0);assert.ok(start.rim>0);assert.ok(start.position.z<c.hitKnockDistance);assert.notEqual(start.inflation!.visual,1);
 f.update(.15,c);const after=f.snapshot()[0];assert.ok(after.position.z>start.position.z);assert.notEqual(after.compression,start.compression);assert.notEqual(after.inflation!.visual,start.inflation!.visual);
 for(let i=0;i<300;i++)f.update(1/120,c);const settled=f.snapshot()[0];assert.equal(settled.burst.phase,'winding');near(settled.position.z,c.hitKnockDistance);near(settled.compression,0);near(settled.rim,0);near(settled.inflation!.visual,1);
});
test('inflation-dominated feedback also supports early start',()=>{
 const time=(offset:number)=>{const root=createTrainingCube();root.userData.practiceTarget='a';const group=new T.Group();group.add(root);const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38),c={...DEFAULTS,slimeInjectionAmount:100,slimeInflationFrequency:1,slimeInflationDamping:.2,hitSquashTime:.1,burstFeedbackDelay:offset};f.hit('a',{x:0,z:1},c);let ticks=0;while(f.snapshot()[0].burst.phase==='feedback'&&ticks<3000){f.update(1/120,c);ticks++;}assert.ok(ticks<3000);return ticks/120;};
 const baseline=time(0),early=time(-.5);assert.ok(baseline>2);assert.ok(Math.abs(baseline-early-.5)<1/120+.0001);
});
