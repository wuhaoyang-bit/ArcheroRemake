import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three/webgpu';
import {SlimeInflationState} from '../src/slime-inflation-state.ts';
import {DEFAULTS} from '../src/config.ts';
import {createTrainingCube,monsterInstance} from '../src/training-monster.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('game injection matches selected spring, preserves retrigger position, caps capacity, respects toggle',()=>{
 const s=new SlimeInflationState();s.hit(DEFAULTS);s.update(.12,DEFAULTS);assert.ok(s.visual>.2);const v=s.visual;s.hit(DEFAULTS);near(s.visual,v);near(s.amount,40);
 s.update(3,DEFAULTS);near(s.visual,.4);for(let i=0;i<8;i++)s.hit(DEFAULTS);near(s.amount,100);
 s.hit({...DEFAULTS,slimeCapacity:50});near(s.amount,100);s.reset();s.hit({...DEFAULTS,slimeInflationEnabled:0});near(s.amount,0);
});
for(const mode of [0,1])test(`persistent inflation composes with squash mode ${mode}, stays grounded, resets and isolates enemies`,()=>{
 const group=new T.Group();for(const id of ['a','b']){const r=createTrainingCube();r.userData.practiceTarget=id;group.add(r);}
 const f=new TrainingFeedback(group,[{id:'a',x:0,z:0},{id:'b',x:3,z:0}],16,38),c={...DEFAULTS,hitSquashMode:mode,hitKnockEnabled:0};
 f.hit('a',{x:1,z:1},c);f.update(.1,c);let [a,b]=f.snapshot();assert.ok(a.inflation!.visual>0&&a.compression>0);near(b.inflation!.amount,0);
 const visual=group.children[0].getObjectByName('WholeDummyVisual')!;near(new T.Box3().setFromObject(visual).min.y,0);
 const proxy=a.proxyScale[0];f.update(.1,c);near(f.snapshot()[0].proxyScale[0],proxy);
 f.update(3,c);a=f.snapshot()[0];near(a.compression,0);near(a.inflation!.visual,.2);assert.ok(new T.Box3().setFromObject(visual).max.y>1.8);
 f.refresh({...c,slimeInflationEnabled:0});near(new T.Box3().setFromObject(visual).max.y,1.8);near(f.snapshot()[0].inflation!.amount,20);
 f.refresh(c);assert.ok(new T.Box3().setFromObject(visual).max.y>1.8);
 f.reset();near(f.snapshot()[0].inflation!.amount,0);near(new T.Box3().setFromObject(visual).max.y,1.8);
});
test('new inflation parameters persist and old settings inherit defaults',()=>{
 const tuned={...DEFAULTS,slimeInjectionAmount:13,slimeCapacity:90,slimeInflationFrequency:4,slimeInflationDamping:.7};assert.deepEqual(parseSettingsDocument(settingsDocument(tuned)),tuned);near(parseSettingsDocument({version:1,settings:{}}).slimeBulge,.65);
});

test('full slime keeps taking hits without growing or entering windup when bursting is disabled',()=>{
 const root=createTrainingCube();root.userData.practiceTarget='a';const group=new T.Group();group.add(root);
 const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38),c={...DEFAULTS,burstEnabled:0,slimeInjectionAmount:60};
 let filled=0,windup=0,burst=0;f.onFilled=()=>filled++;f.onWindup=()=>windup++;f.onBurst=()=>burst++;
 assert.ok(f.hit('a',{x:0,z:1},c));f.update(.1,c);assert.ok(f.hit('a',{x:0,z:1},c));
 near(f.snapshot()[0].inflation!.amount,100);near(f.snapshot()[0].inflation!.target,1);
 f.update(.05,c);const age=monsterInstance(root)!.inflation!.state.age;
 assert.ok(f.hit('a',{x:0,z:1},c));assert.equal(monsterInstance(root)!.inflation!.state.age,age);
 for(let i=0;i<12;i++){
  f.update(.3,c);assert.ok(f.hit('a',{x:0,z:1},c));
  const s=f.snapshot()[0];near(s.inflation!.amount,100);assert.equal(s.age,0);assert.equal(s.burst.phase,'alive');
 }
 f.update(5,c);near(f.snapshot()[0].inflation!.visual,1);
 assert.equal(f.proxies.length,1);assert.equal(root.visible,true);assert.deepEqual([filled,windup,burst],[0,0,0]);
 f.reset();near(f.snapshot()[0].inflation!.amount,0);assert.ok(f.hit('a',{x:0,z:1},c));near(f.snapshot()[0].inflation!.amount,60);
});

test('gameplay forbids full-capacity burst even when an old preset enables it',()=>{
 const group=new T.Group(),root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);
 const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38,{allowFullBurst:false});
 const c={...DEFAULTS,burstEnabled:1,slimeInjectionAmount:100,burstFeedbackDelay:-5,burstDuration:.1};
 let events=0;f.onFilled=f.onWindup=f.onBurst=()=>events++;
 for(let i=0;i<6;i++){assert.equal(f.hit('a',{x:0,z:-1},c),true);f.update(2,c);assert.equal(f.snapshot()[0].burst.phase,'alive');}
 assert.equal(events,0);near(f.snapshot()[0].inflation!.amount,100);assert.equal(f.proxies.length,1);assert.equal(root.visible,true);
});
