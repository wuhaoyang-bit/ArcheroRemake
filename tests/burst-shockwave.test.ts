import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,sanitize} from '../src/config.ts';
import {MovementController} from '../src/controller.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
import {MAX_SHOCKWAVES,ShockwaveState,sampleShockwave} from '../src/burst-shockwave-state.ts';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const origin={x:2,y:1,z:-4};

test('default shockwave expands quickly then slows continuously to a stop, fading without snapping',()=>{
  let previous=sampleShockwave(0,DEFAULTS),maxStrength=0;
  assert.equal(previous.radius,0);assert.equal(previous.strength,0);
  for(let i=1;i<=1000;i++){
    const s=sampleShockwave(DEFAULTS.burstShockwaveDuration*i/1000,DEFAULTS);
    assert.ok(s.radius>=previous.radius);assert.ok(s.speed<=previous.speed+1e-9);
    assert.ok(s.strength>=0&&s.strength<=DEFAULTS.burstShockwaveStrength);
    maxStrength=Math.max(maxStrength,s.strength);previous=s;
  }
  near(previous.radius,DEFAULTS.burstShockwaveRadius);assert.equal(previous.speed,0);assert.equal(previous.strength,0);
  assert.ok(maxStrength>DEFAULTS.burstShockwaveStrength*.8);
  assert.ok(sampleShockwave(DEFAULTS.burstShockwaveDuration*.25,DEFAULTS).progress>.55);
  assert.ok(sampleShockwave(DEFAULTS.burstShockwaveDuration*.99,DEFAULTS).strength<.01);
});

test('speed curve changes travel timing; its integral is normalized to a fixed final radius',()=>{
  const linear={...DEFAULTS,burstShockwaveSpeedCurve:[{time:0,progress:100},{time:100,progress:100}]};
  const accelerating={...linear,burstShockwaveSpeedCurve:[{time:0,progress:0},{time:100,progress:100}]};
  const doubled={...accelerating,burstShockwaveSpeedCurve:[{time:0,progress:0},{time:100,progress:200}]};
  near(sampleShockwave(.16,linear).progress,.5);near(sampleShockwave(.16,accelerating).progress,.25);
  for(let i=0;i<=100;i++){
    const age=i/100*.32;
    near(sampleShockwave(age,accelerating).radius,sampleShockwave(age,doubled).radius);
  }
  near(sampleShockwave(.32,accelerating).radius,3.2);
  near(sampleShockwave(.16,{...linear,burstShockwaveFadePower:4}).radius,sampleShockwave(.16,linear).radius);
});

test('simulation timing agrees across frame rates and clears at the duration boundary',()=>{
  for(const hz of [30,60,120,144]){
    const s=new ShockwaveState();s.emit(origin,DEFAULTS);
    for(let i=0;i<hz;i++)s.update(.16/hz,DEFAULTS);
    const wave=s.snapshot()[0],expected=sampleShockwave(.16,DEFAULTS);
    near(wave.age,.16);near(wave.radius,expected.radius);near(wave.strength,expected.strength);
    s.update(-1,DEFAULTS);s.update(NaN,DEFAULTS);assert.deepEqual(s.snapshot()[0],wave);
    s.update(.16,DEFAULTS);assert.equal(s.waves.length,0);
  }
});

test('explosions preserve their center and curve, overlap within a fixed budget, and clear on disable/reset',()=>{
  const c=structuredClone(DEFAULTS),center={...origin},s=new ShockwaveState();s.emit(center,c);
  center.x=999;c.burstShockwaveRadius=8;c.burstShockwaveSpeedCurve[0].progress=0;
  s.update(.08,c);assert.deepEqual(s.waves[0].center,origin);
  near(s.snapshot()[0].radius,sampleShockwave(.08,DEFAULTS).radius);
  for(let i=0;i<MAX_SHOCKWAVES+3;i++)s.emit({x:i,y:0,z:0},DEFAULTS);
  assert.equal(s.waves.length,MAX_SHOCKWAVES);assert.equal(s.waves[0].center.x,3);
  s.update(0,{...c,burstShockwaveEnabled:0});assert.equal(s.waves.length,0);
  s.emit(origin,{...c,burstShockwaveEnabled:0});s.emit(origin,{...c,burstShockwaveStrength:0});
  s.emit(origin,{...c,burstShockwaveSpeedCurve:[{time:0,progress:0},{time:100,progress:0}]});
  assert.equal(s.waves.length,0);s.emit(origin,DEFAULTS);s.clear();assert.equal(s.waves.length,0);
});

test('old settings gain defaults and independently editable speed curves survive serialization',()=>{
  const old=parseSettingsDocument({version:1,settings:{moveSpeed:18}});
  assert.equal(old.burstShockwaveEnabled,1);assert.deepEqual(old.burstShockwaveSpeedCurve,DEFAULTS.burstShockwaveSpeedCurve);
  assert.notEqual(old.burstShockwaveSpeedCurve,DEFAULTS.burstShockwaveSpeedCurve);
  const ctl=new MovementController({...DEFAULTS});
  assert.notEqual(ctl.settings.burstShockwaveSpeedCurve,DEFAULTS.burstShockwaveSpeedCurve);
  ctl.setShockwaveSpeedCurve([{time:0,progress:20},{time:50,progress:200},{time:100,progress:0}]);
  assert.deepEqual(parseSettingsDocument(settingsDocument(ctl.settings)),ctl.settings);
  assert.equal(sanitize('burstShockwaveEnabled',.1),0);assert.equal(sanitize('burstShockwaveRadius',100),8);
  assert.throws(()=>parseSettingsDocument({version:1,settings:{burstShockwaveDuration:NaN}}));
  assert.throws(()=>parseSettingsDocument({version:1,settings:{burstShockwaveSpeedCurve:[{time:0,progress:-1},{time:100,progress:0}]}}));
});
