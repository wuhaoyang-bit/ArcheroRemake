import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementController} from '../src/controller.ts';
import {DEFAULTS} from '../src/config.ts';
import {remainingAnchorDistance, validateAnchorCurve} from '../src/anchor-follow.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const moving=()=>{const c=new MovementController();c.press(1,0,0);c.move(1,60,0);return c;};
test('unlock snaps both anchors, later moves only update target; movement follows actual anchor',()=>{
 const c=moving();near(c.offset.x,60*c.settings.anchorScale);assert.deepEqual(c.offset,c.targetOffset);
 const old={...c.offset},before={...c.position};c.move(1,60,1);
 assert.deepEqual(c.offset,old);assert.notDeepEqual(c.offset,c.targetOffset);
 c.update(1/120);assert.ok(c.offset.z>0 && c.offset.z<c.targetOffset.z);
 near(c.position.x-before.x,c.direction!.x*c.settings.moveSpeed/120);
 near(c.position.z-before.z,c.direction!.z*c.settings.moveSpeed/120);
 near(c.targetHeading,Math.atan2(c.offset.x,c.offset.z));
});
test('small noise is attenuated; large distance catches up quickly without overshoot or frame dependence',()=>{
 const curve=DEFAULTS.anchorCurve;
 assert.ok(remainingAnchorDistance(.05,1/60,curve)>.045);
 near(remainingAnchorDistance(2,.02,curve),1.4);
 for(const hz of [30,60,120]) {
   let e=2;for(let i=0;i<hz;i++)e=remainingAnchorDistance(e,1/hz,curve);
   near(e,remainingAnchorDistance(2,1,curve));assert.ok(e>=0);
 }
 const zero=validateAnchorCurve([{distance:0,speed:0},{distance:.1,speed:0},{distance:1,speed:20}]);
 assert.ok(remainingAnchorDistance(1,100,zero)>=.1);
});
test('release coordinates override pending follow even after capture loss, idle never overwrites endpoint',()=>{
 for(const lost of [false,true]) {
  const c=moving();c.move(1,-60,0);c.update(1/120);
  assert.notDeepEqual(c.offset,c.targetOffset);
  if(lost)c.loseCapture(1);
  c.release(1,{x:0,y:-60});const position={...c.position};
  assert.deepEqual(c.offset,{x:0,z:-60*c.settings.anchorScale});assert.deepEqual(c.targetOffset,c.offset);
  assert.deepEqual(c.remembered,c.offset);
  for(let i=0;i<120;i++)c.update(1/120);
  assert.deepEqual(c.position,position);assert.deepEqual(c.targetOffset,c.offset);near(c.offset.x,0);
 }
});
test('takeover freezes actual anchor, ignores old finger, and resumes follow only after unlocking',()=>{
 const c=moving();c.move(1,-60,0);c.update(.01);const anchor={...c.offset};
 c.press(2,10,10);c.move(1,0,60);c.release(1,{x:0,y:60});c.update(.2);
 assert.deepEqual(c.offset,anchor);assert.deepEqual(c.targetOffset,anchor);
 c.move(2,0,-60);assert.deepEqual(c.offset,anchor);assert.notDeepEqual(c.targetOffset,anchor);
 c.update(.01);assert.notDeepEqual(c.offset,anchor);
});
test('cancellation freezes actual anchor; new in-place unlock and disabling follow snap immediately',()=>{
 const c=moving();c.move(1,0,-60);c.update(.01);const anchor={...c.offset};c.cancel();c.update(1);
 assert.deepEqual(c.offset,anchor);assert.deepEqual(c.targetOffset,anchor);
 c.press(2,0,0);c.move(2,-60,0);assert.deepEqual(c.offset,c.targetOffset);near(c.offset.z,0);
 c.move(2,0,-60);c.set('anchorFollow',0);assert.deepEqual(c.offset,c.targetOffset);
 c.move(2,60,0);assert.deepEqual(c.offset,c.targetOffset);
 c.restartTraining();assert.deepEqual(c.offset,{x:0,z:0});assert.deepEqual(c.targetOffset,c.offset);
});
test('relative follow ignores player position and body heading; independent curves persist and validate',()=>{
 const a=moving(),b=moving();b.position.x=2;b.heading=1;
 a.move(1,60,2);b.move(1,60,2);a.update(.01);b.update(.01);assert.deepEqual(a.offset,b.offset);
 const curve=[{distance:0,speed:0},{distance:.25,speed:50}];
 const settings={...DEFAULTS,anchorCurve:curve,anchorFollow:0};
 assert.deepEqual(parseSettingsDocument(settingsDocument(settings)),settings);
 const old=parseSettingsDocument({version:1,settings:{turnModel:2}});assert.deepEqual(old.anchorCurve,DEFAULTS.anchorCurve);
 for(const curve of [[],[{distance:0,speed:0}], [{distance:0,speed:0},{distance:0,speed:1}], [{distance:0,speed:0},{distance:1,speed:Infinity}]])assert.throws(()=>validateAnchorCurve(curve));
});
