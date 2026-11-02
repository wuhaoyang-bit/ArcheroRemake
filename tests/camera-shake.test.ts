import test from 'node:test';
import assert from 'node:assert/strict';
import {CAMERA_SHAKE_DEFAULTS as defaults, SHAKE_TIERS, shakeKey} from '../src/camera-shake-config.ts';
import {CameraShakeFeedback, readShakeTier, shakeEnvelope, shakeOffset} from '../src/camera-shake.ts';
import {parseSettingsDocument, settingsDocument} from '../src/settings-store.ts';
import {DEFAULTS, sanitize} from '../src/config.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('SmashBroCER trajectories preserve vertical, crossed-axis and circular motion',()=>{
  for(const kind of SHAKE_TIERS){
    const t=readShakeTier(defaults,kind);
    near(shakeEnvelope(t,0),kind==='weak'?2:kind==='mid'?4:8);
    assert.equal(shakeEnvelope(t,-1),0);assert.equal(shakeEnvelope(t,9),0);
  }
  const weak=readShakeTier(defaults,'weak');
  assert.deepEqual(shakeOffset(weak,0,'weak'),{x:0,y:0});
  const vertical=shakeOffset(weak,1,'weak');assert.equal(vertical.x,0);assert.ok(vertical.y>0);
  // At this frequency/frame the medium X axis is at its zero crossing while Y is at its peak.
  const crossed=shakeOffset({...readShakeTier(defaults,'mid'),omega:Math.PI/2},2,'mid',Math.PI/2);
  near(crossed.x,0);near(crossed.y,-shakeEnvelope(readShakeTier(defaults,'mid'),2));
  const strong=readShakeTier(defaults,'strong');
  for(const phase of [0,.2,1.3,4])for(let i=0;i<9;i++){
    const p=shakeOffset(strong,i,'strong',phase);near(Math.hypot(p.x,p.y),shakeEnvelope(strong,i));
  }
  near(shakeEnvelope({...strong,decayPerFrame:.5},2),0);
  near(shakeEnvelope({...weak,p:1},3),4/3);
});

test('60 Hz shake clock agrees across display/substep rates and returns exactly to baseline',()=>{
  for(const hz of [30,60,120,144]){
    const s=new CameraShakeFeedback();s.trigger(defaults,'strong',()=>.125);
    for(let i=0;i<hz/6;i++)s.update(1/hz,defaults);
    assert.equal(s.snapshot().active,false);assert.deepEqual(s.offset(),{x:0,y:0});
  }
  const a=new CameraShakeFeedback(),b=new CameraShakeFeedback();
  a.trigger(defaults,'mid',()=>.25);b.trigger(defaults,'mid',()=>.25);
  a.update(4/60,defaults);for(let i=0;i<8;i++)b.update(1/120,defaults);
  assert.deepEqual(a.snapshot(),b.snapshot());
  b.update(-1,defaults);b.update(NaN,defaults);assert.deepEqual(a.snapshot(),b.snapshot());
});

test('explosions snapshot their tier; repeat explosions restart without amplitude accumulation',()=>{
  const c={...defaults},s=new CameraShakeFeedback();s.trigger(c,'strong',()=>0);
  s.update(2/60,c);c.cameraShakeStrongA0=20;c.cameraShakeTier=0;s.update(0,c);
  assert.ok(Math.hypot(s.offset().x,s.offset().y)<8);
  s.trigger(c,'strong',()=>.25);assert.equal(s.snapshot().frame,0);near(Math.hypot(s.offset().x,s.offset().y),20);
  assert.equal(s.snapshot().triggers,2);s.trigger(c);assert.equal(s.snapshot().tier,'weak');
  s.update(0,{...c,cameraShakeEnabled:0});assert.deepEqual(s.offset(),{x:0,y:0});
  s.trigger({...c,cameraShakeEnabled:0});assert.equal(s.snapshot().active,false);
  s.update(1/60,c);assert.deepEqual(s.offset(),{x:0,y:0});
  s.reset();assert.equal(s.snapshot().triggers,0);assert.equal(s.snapshot().frame,0);
});

test('old settings acquire defaults; three independent presets persist and invalid values are handled',()=>{
  const old=parseSettingsDocument({version:1,settings:{moveSpeed:18}});
  for(const key of Object.keys(defaults) as (keyof typeof defaults)[])assert.equal(old[key],defaults[key]);
  const tuned={...DEFAULTS,cameraShakeTier:2,cameraShakeWeakA0:1.5,cameraShakeMidA0:7,cameraShakeStrongA0:13,cameraShakeStrongDecay:.2};
  assert.deepEqual(parseSettingsDocument(settingsDocument(tuned)),tuned);
  assert.equal(sanitize('cameraShakeTier',1.6),2);assert.equal(sanitize('cameraShakeEnabled',.1),0);
  assert.equal(sanitize(shakeKey('weak','Duration'),9.6),10);
  assert.equal(sanitize(shakeKey('mid','Formula'),90),1);
  assert.throws(()=>parseSettingsDocument({version:1,settings:{cameraShakeStrongA0:NaN}}));
  assert.throws(()=>parseSettingsDocument({version:1,settings:{cameraShakeMidDuration:61}},true));
});
