import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementController} from '../src/controller.ts';
import {DEFAULTS} from '../src/config.ts';
import {movementMultiplier} from '../src/move-speed.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('flat default curve exactly preserves the constant model across input, rotation and follow',()=>{
 const a=new MovementController({...DEFAULTS,moveSpeed:13}),b=new MovementController({...DEFAULTS,moveSpeed:13,moveModel:1});
 for(const c of [a,b]){c.press(1,0,0);c.move(1,60,0);}
 for(let i=0;i<240;i++){
  for(const c of [a,b]){c.move(1,60*Math.cos(i/20),60*Math.sin(i/20));c.update(1/120);}
  assert.deepEqual(a.position,b.position);near(a.heading,b.heading);near(a.movementSpeed,b.movementSpeed);
 }
});
test('angle curve scales speed using shortest actual anchor error while keeping travel independent of body',()=>{
 const c=new MovementController({...DEFAULTS,moveModel:1,moveCurve:[{angle:0,speed:100},{angle:180,speed:0}]});
 c.press(1,0,0);c.move(1,60,0);c.heading=Math.PI;
 const p={...c.position};c.update(.01);
 near(c.movementSpeed,8);near(c.position.x-p.x,.08);near(c.position.z,p.z);
 // Anchor is still following the new input; calculation must not use its endpoint instead.
 c.move(1,0,-60);c.setAnchorCurve([{distance:0,speed:0},{distance:10,speed:0}]);c.heading=Math.PI/2;
 c.update(.01);near(c.movementSpeed,16);
 c.release(1,{x:0,y:-60});near(c.movementSpeed,0);
});
test('zero multiplier stops translation but turning continues; switching preserves pose and tuning',()=>{
 const c=new MovementController({...DEFAULTS,moveModel:1,moveCurve:[{angle:0,speed:0},{angle:180,speed:0}]});
 c.press(1,0,0);c.move(1,60,0);const p={...c.position},h=c.heading;
 c.update(.01);assert.deepEqual(c.position,p);assert.notEqual(c.heading,h);
 const before=c.snapshot();c.set('moveModel',0);assert.deepEqual(c.snapshot(),before);
 c.update(.01);near(c.movementSpeed,16);assert.ok(c.position.x>p.x);
 assert.deepEqual(c.settings.moveCurve,[{angle:0,speed:0},{angle:180,speed:0}]);
});
test('move curve interpolation and independent JSON roundtrip retain endpoints and base speed',()=>{
 const curve=[{angle:0,speed:100},{angle:90,speed:80},{angle:180,speed:60}];
 near(movementMultiplier(45,curve),.9);near(movementMultiplier(180,curve),.6);
 const settings={...DEFAULTS,moveModel:1,moveSpeed:13,moveCurve:curve};
 assert.deepEqual(parseSettingsDocument(settingsDocument(settings)),settings);
 const old=parseSettingsDocument({version:1,settings:{moveSpeed:13}});assert.equal(old.moveModel,0);near(old.moveSpeed,13);
 assert.deepEqual(old.moveCurve,DEFAULTS.moveCurve);
 assert.throws(()=>parseSettingsDocument({version:1,settings:{moveModel:.5}}));
 assert.throws(()=>parseSettingsDocument({version:1,settings:{moveCurve:[{angle:0,speed:100}]}}));
});
