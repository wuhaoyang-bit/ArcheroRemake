import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS } from '../src/config.ts';
import { LockRings, ringLinkSegment, validateProgressCurve, progressAt } from '../src/lock-rings.ts';
import { parseSettingsDocument, settingsDocument } from '../src/settings-store.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const c={x:100,y:120},w=390,h=845;

test('giant circle encloses every corner including stroke, with offscreen and corner targets',()=>{
  for(const center of [c,{x:0,y:0},{x:800,y:-400}]){
    const s=new LockRings();s.update(0,'a',DEFAULTS,center,w,h);
    for(const x of [0,w])for(const y of [0,h])assert.ok(s.radius-DEFAULTS.ringTargetStroke/2>Math.hypot(x-center.x,y-center.y));
    near(s.elapsed,0);assert.notEqual(s.config,DEFAULTS);assert.notEqual(s.config!.ringCurve,DEFAULTS.ringCurve);
  }
});
test('progress is frame-rate independent, exact at duration and faster early than late',()=>{
  for(const hz of [30,60,120]){
    const s=new LockRings();s.update(0,'a',DEFAULTS,c,w,h);
    for(let i=0;i<hz;i++)s.update(1/hz,'a',DEFAULTS,c,w,h);
    near(s.elapsed,DEFAULTS.ringDuration);near(s.radius,DEFAULTS.ringTargetDiameter/2);
  }
  const a=progressAt(DEFAULTS.ringCurve,.25),b=progressAt(DEFAULTS.ringCurve,.5),d=progressAt(DEFAULTS.ringCurve,.75);
  assert.ok(a>b-a&&b-a>d-b&&d-b>1-d);
});
test('handoff keeps radius/time/config; pending settings only apply after losing all targets',()=>{
  const s=new LockRings();s.update(0,'a',DEFAULTS,c,w,h);s.update(.1,'a',DEFAULTS,c,w,h);
  const r=s.radius,t=s.elapsed,changed={...DEFAULTS,ringDuration:1,ringTargetDiameter:20,ringTargetStroke:4,ringPlayerHeight:3,
    ringCurve:[{time:0,progress:0},{time:100,progress:100}]};
  s.update(0,'b',changed,{x:900,y:0},w,h);near(s.radius,r);near(s.elapsed,t);assert.deepEqual(s.config!.ringCurve,DEFAULTS.ringCurve);
  s.update(.15,'b',changed,c,w,h);near(s.radius,4);near(s.config!.ringTargetStroke,1.2);
  s.update(0,'c',changed,c,w,h);near(s.radius,4);
  s.update(0,null,changed,c,w,h);assert.equal(s.config,null);assert.equal(s.targetId,null);
  s.update(0,'c',changed,c,w,h);near(s.config!.ringDuration,1);near(s.config!.ringTargetDiameter,20);near(s.config!.ringPlayerHeight,3);
  s.update(.5,'c',changed,c,w,h);near(s.radius,10+(s.initialRadius-10)*.5);
});
test('resize and animated pose are not transition inputs; projection change cannot restart shrink',()=>{
  const s=new LockRings();s.update(0,'a',DEFAULTS,c,w,h);s.update(.12,'a',DEFAULTS,c,w,h);
  const r=s.radius;s.update(0,'a',DEFAULTS,{x:330,y:200},w,1000);near(s.radius,r);near(s.elapsed,.12);
});
test('progress curve validation and JSON roundtrip preserve endpoints and monotonicity',()=>{
  const settings={...DEFAULTS,ringPlayerDiameter:6,ringCurve:[{time:0,progress:0},{time:50,progress:95},{time:100,progress:100}]};
  assert.deepEqual(parseSettingsDocument(settingsDocument(settings)),settings);
  const legacy=parseSettingsDocument({version:1,settings:{}});assert.deepEqual(legacy.ringCurve,DEFAULTS.ringCurve);
  for(const raw of [null,[],[{time:0,progress:1},{time:100,progress:100}],
    [{time:0,progress:0},{time:50,progress:80},{time:60,progress:70},{time:100,progress:100}],
    [{time:0,progress:0},{time:0,progress:0},{time:100,progress:100}],
    [{time:0,progress:0},{time:100,progress:101}]])assert.throws(()=>validateProgressCurve(raw));
  assert.throws(()=>parseSettingsDocument({version:1,settings:{ringCurve:null}},true));
});

test('stroke follows geometric completion and preview freezes across handoff then resumes continuously',()=>{
  const settings={...DEFAULTS,ringStrokeCurve:[{completion:0,width:200},{completion:50,width:300},{completion:100,width:50}]};
  const s=new LockRings();s.update(0,'a',settings,c,w,h);near(s.stroke,2.4);
  assert.ok(s.initialRadius-s.stroke/2>Math.hypot(390-c.x,845-c.y));
  s.seek(.5);s.update(.2,'a',settings,c,w,h);near(s.completion,.5);near(s.stroke,3.6);
  const radius=s.radius;s.update(2,'b',DEFAULTS,c,w,h);near(s.radius,radius);near(s.completion,.5);
  s.resume();s.update(0,'b',DEFAULTS,c,w,h);near(s.radius,radius);assert.equal(s.preview,null);
  s.update(2,'b',DEFAULTS,c,w,h);near(s.completion,1);near(s.stroke,.6);
  s.seek(0);s.update(0,'b',settings,c,w,h);near(s.radius,s.initialRadius);s.resume();near(s.elapsed,0);
  s.seek(.2);s.update(0,null,settings,c,w,h);assert.equal(s.preview,null);s.seek(.7);assert.equal(s.preview,null);
  const saved=parseSettingsDocument(settingsDocument(settings));assert.deepEqual(saved.ringStrokeCurve,settings.ringStrokeCurve);
  assert.deepEqual(parseSettingsDocument({version:1,settings:{}}).ringStrokeCurve,DEFAULTS.ringStrokeCurve);
  for(const ringStrokeCurve of [null,[],[{completion:0,width:100},{completion:100,width:1001}], [{completion:1,width:100},{completion:100,width:100}]])assert.throws(()=>parseSettingsDocument({version:1,settings:{ringStrokeCurve}},true));
});


test('link gates on completion, previews backwards, snapshots settings and clears on loss',()=>{
  const s=new LockRings();s.update(0,'a',DEFAULTS,c,w,h);
  s.seek(.949);s.update(0,'a',DEFAULTS,c,w,h);assert.equal(s.linkVisible,false);
  s.seek(.95);s.update(0,'a',DEFAULTS,c,w,h);assert.equal(s.linkVisible,true);
  const changed={...DEFAULTS,ringLinkThreshold:100,ringLinkStroke:4};
  s.update(0,'b',changed,c,w,h);assert.equal(s.linkVisible,true);near(s.config!.ringLinkStroke,1);
  s.seek(.94);s.update(0,'b',changed,c,w,h);assert.equal(s.linkVisible,false);
  s.update(0,null,changed,c,w,h);assert.equal(s.linkVisible,false);
  s.update(0,'b',changed,c,w,h);s.seek(.99);s.update(0,'b',changed,c,w,h);assert.equal(s.linkVisible,false);
  s.seek(1);s.update(0,'b',changed,c,w,h);assert.equal(s.linkVisible,true);near(s.config!.ringLinkStroke,4);
  assert.equal(parseSettingsDocument(settingsDocument(changed)).ringLinkThreshold,100);
});
test('link excludes circle interiors for every orientation and hides if overlapping',()=>{
  for(const angle of [0,Math.PI/2,Math.PI,Math.PI*1.3]){
    const a={x:12,y:45},b={x:12+100*Math.cos(angle),y:45+100*Math.sin(angle)};
    const line=ringLinkSegment(a,b,5,20)!;
    near(Math.hypot(line.x1-a.x,line.y1-a.y),5);near(Math.hypot(line.x2-b.x,line.y2-b.y),20);
    near(Math.hypot(line.x2-line.x1,line.y2-line.y1),75);
    assert.equal(ringLinkSegment(a,b,51,50),null);
  }
  assert.equal(ringLinkSegment(c,c,2,4),null);
});

test('attack link pulse uses actual animation phase and blend weight, resets when interrupted',async()=>{
  const {attackLinkMultiplier,DEFAULT_LINK_ATTACK_CURVE:curve}=await import('../src/lock-rings.ts');
  const attack={playing:true,time:0,duration:1.05,releaseTime:.55,weight:1};
  near(attackLinkMultiplier(curve,attack),1);
  near(attackLinkMultiplier(curve,{...attack,time:1.05*.508}),.65);
  near(attackLinkMultiplier(curve,{...attack,time:1.05*.54}),1.45);
  near(attackLinkMultiplier(curve,{...attack,time:1.05*.54,weight:.5}),1.225);
  near(attackLinkMultiplier(curve,{...attack,time:1.05}),1);
  near(attackLinkMultiplier(curve,{...attack,time:.54,playing:false}),1);
  assert.deepEqual(parseSettingsDocument(settingsDocument(DEFAULTS)).ringLinkAttackCurve,curve);
});

test('target switch pulse expands then settles, retriggers continuously without accumulation',()=>{
  const s=new LockRings();s.update(0,'a',DEFAULTS,c,w,h);s.update(1,'a',DEFAULTS,c,w,h);
  near(s.radius,4);s.update(0,'b',DEFAULTS,c,w,h);near(s.radius,4);
  s.update(DEFAULTS.ringSwitchDuration*.25,'b',DEFAULTS,c,w,h);near(s.radius,10);
  const radius=s.radius;s.update(0,'c',DEFAULTS,c,w,h);near(s.radius,radius);
  for(let i=0;i<10;i++){s.update(.01,'c',DEFAULTS,c,w,h);assert.ok(s.radius<=10&&s.radius>=4);}
  s.update(1,'c',DEFAULTS,c,w,h);near(s.radius,4);assert.equal(s.switchElapsed,null);
  s.update(0,'d',DEFAULTS,c,w,h);s.update(.02,'d',DEFAULTS,c,w,h);s.seek(.9);s.update(0,'d',DEFAULTS,c,w,h);assert.equal(s.switchElapsed,null);
  s.update(0,'e',DEFAULTS,c,w,h);assert.equal(s.switchElapsed,null);
  s.update(0,null,DEFAULTS,c,w,h);assert.equal(s.switchElapsed,null);
});
test('switch during entry does not add pulse, switch curve saves and rejects nonzero endpoints',()=>{
  const s=new LockRings();s.update(0,'a',DEFAULTS,c,w,h);s.update(.05,'a',DEFAULTS,c,w,h);
  s.update(.05,'b',DEFAULTS,c,w,h);assert.equal(s.switchElapsed,null);
  assert.deepEqual(parseSettingsDocument(settingsDocument(DEFAULTS)).ringSwitchCurve,DEFAULTS.ringSwitchCurve);
  assert.throws(()=>parseSettingsDocument({version:1,settings:{ringSwitchCurve:[{time:0,progress:1},{time:100,progress:0}]}},true));
});
