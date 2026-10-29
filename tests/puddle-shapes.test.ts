import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BURST_DEFAULTS} from '../src/slime-burst-config.ts';
import {allowedPuddleShapes,pickPuddleShape} from '../src/puddle-shapes.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
test('all seven nonempty pools select only allowed shapes, covering each candidate',()=>{
 for(let mask=1;mask<8;mask++){
  const c={...BURST_DEFAULTS,puddleRenderer:1,puddleCurveShapes:mask};const seen=new Set<number>();
  for(let i=0;i<100;i++){const shape=pickPuddleShape(c,(i+.5)/100);assert.ok(mask&(1<<shape));seen.add(shape);}
  assert.deepEqual([...seen],allowedPuddleShapes(c));
 }
});
test('renderer pools are independent and explicit fixed shapes bypass random candidates',()=>{
 const c={...BURST_DEFAULTS,puddleCanvasShapes:1,puddleCurveShapes:4};assert.equal(pickPuddleShape(c,.9),0);assert.equal(pickPuddleShape({...c,puddleRenderer:1},.1),2);assert.equal(pickPuddleShape({...c,puddleShape:2},.9),1);
});
test('older settings enable all shapes and saved pools round trip',()=>{
 const old=parseSettingsDocument({version:1,settings:{}});assert.equal(old.puddleCanvasShapes,7);assert.equal(old.puddleCurveShapes,7);
 const next=parseSettingsDocument(settingsDocument({...old,puddleCanvasShapes:3,puddleCurveShapes:5}));assert.equal(next.puddleCanvasShapes,3);assert.equal(next.puddleCurveShapes,5);
 assert.throws(()=>parseSettingsDocument({version:1,settings:{puddleCurveShapes:0}},true));
});
