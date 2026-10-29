import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS} from '../src/config.ts';
import {MovementController} from '../src/controller.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
import {DEFAULT_LIQUID_SPEED_CURVE} from '../src/slime-liquid-flight-config.ts';

const read=(settings:Record<string,unknown>,strict=false)=>parseSettingsDocument({version:1,settings},strict);
test('liquid defaults copy the currently tuned eye values rather than the old eye factory defaults',()=>{
 const c=read({});assert.equal(c.liquidEjectSpeed,20);assert.equal(c.liquidGravity,20);assert.equal(c.liquidCurveTime,.9);
 assert.deepEqual(c.liquidSpeedCurve,[{time:0,progress:120},{time:100,progress:8}]);
 c.liquidSpeedCurve[0].progress=2;assert.equal(DEFAULT_LIQUID_SPEED_CURVE[0].progress,120);
});
test('legacy files copy their saved eye flight once, ignore retired drop speed, and keep separate curve objects',()=>{
 const eyeCurve=[{time:0,progress:75},{time:100,progress:0}];
 const c=read({slimeEyeEjectSpeed:17,slimeEyeEjectGravity:12,slimeEyeCurveTime:.5,slimeEyeSpeedCurve:eyeCurve,liquidDropSpeed:10});
 assert.equal(c.liquidEjectSpeed,17);assert.equal(c.liquidGravity,12);assert.equal(c.liquidCurveTime,.5);assert.deepEqual(c.liquidSpeedCurve,eyeCurve);
 c.liquidSpeedCurve[0].progress=200;assert.equal(c.slimeEyeSpeedCurve[0].progress,75);assert.equal(eyeCurve[0].progress,75);
 const doc=settingsDocument(c);doc.settings.slimeEyeEjectSpeed=39;doc.settings.slimeEyeSpeedCurve[0].progress=30;
 const again=parseSettingsDocument(doc);assert.equal(again.liquidEjectSpeed,17);assert.equal(again.liquidSpeedCurve[0].progress,200);
 assert.equal('liquidDropSpeed' in doc.settings,false);
});
test('explicit liquid values including zero override legacy eye migration and round trip independently',()=>{
 const curve=[{time:0,progress:0},{time:100,progress:0}];
 const c=read({slimeEyeEjectSpeed:30,slimeEyeEjectGravity:25,slimeEyeCurveTime:2,liquidEjectSpeed:0,liquidGravity:0,liquidCurveTime:.02,liquidSpeedCurve:curve});
 assert.equal(c.liquidEjectSpeed,0);assert.equal(c.liquidGravity,0);assert.equal(c.liquidCurveTime,.02);assert.deepEqual(c.liquidSpeedCurve,curve);
 assert.deepEqual(parseSettingsDocument(settingsDocument(c)),c);
});
test('liquid numeric limits and curve validation reject invalid data and clamp normal imports',()=>{
 for(const key of ['liquidEjectSpeed','liquidSpeedJitter','liquidGravity','liquidCurveTime']){
  assert.throws(()=>read({[key]:NaN}));assert.throws(()=>read({[key]:'10'}));assert.throws(()=>read({[key]:-1},true));
 }
 const c=read({liquidEjectSpeed:90,liquidGravity:90,liquidCurveTime:0});
 assert.equal(c.liquidEjectSpeed,40);assert.equal(c.liquidGravity,30);assert.equal(c.liquidCurveTime,.02);
 for(const curve of [[],[{time:0,progress:-1},{time:100,progress:0}],[{time:0,progress:301},{time:100,progress:0}]])assert.throws(()=>read({liquidSpeedCurve:curve}));
});
test('speed jitter defaults for old files, clamps at its limit and saves explicit zero or custom offsets',()=>{
 assert.equal(read({liquidEjectSpeed:10}).liquidSpeedJitter,3);
 assert.equal(read({liquidSpeedJitter:90}).liquidSpeedJitter,40);
 for(const liquidSpeedJitter of [0,4.5]){
  const c=read({liquidSpeedJitter});assert.equal(parseSettingsDocument(settingsDocument(c)).liquidSpeedJitter,liquidSpeedJitter);
 }
});
test('controller edits each curve independently and snapshots caller-owned points',()=>{
 const ctl=new MovementController(),curve=[{time:0,progress:77},{time:100,progress:0}];
 const eye=structuredClone(ctl.settings.slimeEyeSpeedCurve);
 ctl.setLiquidSpeedCurve(curve);curve[0].progress=5;
 assert.equal(ctl.settings.liquidSpeedCurve[0].progress,77);assert.deepEqual(ctl.settings.slimeEyeSpeedCurve,eye);
 ctl.setEyeSpeedCurve([{time:0,progress:20},{time:100,progress:0}]);assert.equal(ctl.settings.liquidSpeedCurve[0].progress,77);
 assert.deepEqual(DEFAULTS.slimeEyeSpeedCurve,eye);
});
