import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DEFAULTS, sanitize} from '../src/config.ts';
import {burstSample, burstEndTime} from '../src/slime-burst-state.ts';
import {createTrainingCube, monsterInstance} from '../src/training-monster.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {parseSettingsDocument, settingsDocument} from '../src/settings-store.ts';

const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
// Three's sRGB conversion round trip is approximate; this is well below one 8-bit colour step.
const nearColor=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const tuning={...DEFAULTS,slimeInjectionAmount:100,burstScale:1,burstFrequencyStart:2,burstFrequencyEnd:2,burstAmplitudeStart:.08,burstAmplitudeEnd:.08};
const hsl=(color:T.Color)=>color.getHSL({h:0,s:0,l:0},T.SRGBColorSpace);

test('colour is in phase with stretch/compression, fades in, and stops with zero oscillation',()=>{
  near(burstSample(0,tuning).colorLightness,0);
  const expanded=burstSample(.125,tuning),compressed=burstSample(.375,tuning);
  near(expanded.scale,1.08);near(expanded.colorLightness,.04);
  near(compressed.scale,.92);near(compressed.colorLightness,-.04);
  assert.ok(Math.abs(burstSample(.01,tuning).colorLightness)<.001);
  for(let i=0;i<200;i++){
    const t=i/120,off=burstSample(t,{...tuning,burstColorPulseEnabled:0}),on=burstSample(t,tuning);
    near(off.colorLightness,0);near(off.scale,on.scale);near(off.phase,on.phase);
    near(burstSample(t,{...tuning,burstAmplitudeStart:0,burstAmplitudeEnd:0}).colorLightness,0);
    near(burstSample(t,{...tuning,burstColorPulseAmount:0}).colorLightness,0);
    assert.ok(Math.abs(on.colorLightness)<=.04+1e-9);
  }
  const fading={...tuning,burstAmplitudeEnd:0,burstPhaseEnd:90};
  near(burstSample(burstEndTime(fading),fading).colorLightness,0);
});

test('actual slime material pulses only while winding, never accumulates, and leaves other monsters and eyes unchanged',()=>{
  const group=new T.Group();
  for(const id of ['a','b']){const root=createTrainingCube();root.userData.practiceTarget=id;group.add(root);}
  const f=new TrainingFeedback(group,[{id:'a',x:0,z:0},{id:'b',x:3,z:0}],16,38);
  f.refresh(tuning);const untouched=f.snapshot()[1].inflation!.color;
  f.hit('a',{x:0,z:1},tuning);assert.equal(f.snapshot()[0].burst.phase,'feedback');near(f.snapshot()[0].inflation!.colorLightness,0);
  for(let i=0;i<1000&&f.snapshot()[0].burst.phase==='feedback';i++)f.update(1/120,tuning);
  assert.equal(f.snapshot()[0].burst.phase,'winding');
  const base=f.currentColor('a',new T.Color())!.clone(),baseHsl=hsl(base);
  const eyeColours=()=>{const colours:number[]=[];group.children[0].getObjectByName('Face')!.traverse(o=>{if(o instanceof T.Mesh)colours.push((o.material as T.MeshPhysicalMaterial).color.getHex());});return colours;};
  const eyes=eyeColours();
  f.update(.125,tuning);nearColor(hsl(f.currentColor('a',new T.Color())!).l,baseHsl.l+.04);
  const expanded=f.snapshot()[0];for(let i=0;i<20;i++)f.refresh(tuning);
  assert.equal(f.snapshot()[0].inflation!.color,expanded.inflation!.color);
  assert.deepEqual(eyeColours(),eyes);assert.equal(f.snapshot()[1].inflation!.color,untouched);
  near(f.snapshot()[1].inflation!.colorLightness,0);
  f.update(.25,tuning);nearColor(hsl(f.currentColor('a',new T.Color())!).l,baseHsl.l-.04);
  f.update(.125,tuning);assert.equal(f.currentColor('a',new T.Color())!.getHex(),base.getHex());
  let emitted:T.Color|undefined;f.onBurst=(_center,_feet,_c,color)=>{emitted=color?.clone();};
  f.update(burstEndTime(tuning),tuning);assert.equal(f.snapshot()[0].burst.phase,'gone');
  near(f.snapshot()[0].inflation!.colorLightness,0);assert.equal(emitted?.getHex(),base.getHex());
  f.reset();near(f.snapshot()[0].inflation!.colorLightness,0);assert.equal(group.children[0].visible,true);
});

test('custom fullness colours retain hue and saturation and restore exactly after tint',()=>{
  const root=createTrainingCube(),visual=monsterInstance(root)!.inflation!;
  const c={...DEFAULTS,slimeColorEnabled:0,slimeColorEndR:80,slimeColorEndG:130,slimeColorEndB:220};
  visual.apply(c);const base=visual.copyColor(new T.Color()),before=hsl(base);
  for(const delta of [.04,-.04,.12]){
    visual.apply(c,delta);const after=hsl(visual.copyColor(new T.Color()));
    nearColor(after.h,before.h);nearColor(after.s,before.s);nearColor(after.l,before.l+delta);
  }
  visual.apply(c);assert.equal(visual.copyColor(new T.Color()).getHex(),base.getHex());
});

test('colour pulse settings persist and old parameter files receive the subtle enabled default',()=>{
  const old=parseSettingsDocument({version:1,settings:{}});
  assert.equal(old.burstColorPulseEnabled,1);assert.equal(old.burstColorPulseAmount,4);
  const c={...DEFAULTS,burstColorPulseEnabled:0,burstColorPulseAmount:7.5};
  assert.deepEqual(parseSettingsDocument(settingsDocument(c)),c);
  assert.equal(sanitize('burstColorPulseEnabled',.2),0);assert.equal(sanitize('burstColorPulseAmount',50),15);
});
