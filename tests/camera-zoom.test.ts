import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraZoomFeedback } from '../src/camera-zoom.ts';
import { CAMERA_ZOOM_DEFAULTS as defaults } from '../src/camera-zoom-config.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('OutCubic attack, hold, and analytic critical spring match option 05',()=>{
 const c={...defaults,cameraZoomHold:.1},z=new CameraZoomFeedback();z.trigger('shot',c);
 z.update(.02,c);near(z.value(c),1+.04*.875);
 z.update(.02,c);near(z.value(c),1.04);
 z.update(.05,c);near(z.value(c),1.04);
 z.update(.15,c);const w=2*Math.PI*7;near(z.value(c),1+.04*(1+w*.1)*Math.exp(-w*.1));
});
test('spring evaluation is independent of frame partition and settles exactly',()=>{
 const a=new CameraZoomFeedback(),b=new CameraZoomFeedback();a.trigger('hit',defaults);b.trigger('hit',defaults);
 a.update(.2,defaults);for(let i=0;i<20;i++)b.update(.01,defaults);near(a.value(defaults),b.value(defaults));
 a.update(5,defaults);assert.equal(a.value(defaults),1);assert.equal(a.snapshot(defaults).hit.active,false);
});
for(const shot of [0,1])for(const hit of [0,1])test(`independent switches shot=${shot} hit=${hit}`,()=>{
 const c={...defaults,cameraZoomShotEnabled:shot,cameraZoomHitEnabled:hit,cameraZoomAttack:0},z=new CameraZoomFeedback();
 z.trigger('shot',c);z.trigger('hit',c);near(z.value(c),1+.04*(shot+hit));assert.deepEqual(z.snapshot(c).triggers,{shot,hit});
});
test('overlap is capped, disabling one channel preserves the other, reset clears both',()=>{
 const c={...defaults,cameraZoomAttack:0,cameraZoomMaxAmount:5},z=new CameraZoomFeedback();z.trigger('shot',c);z.trigger('hit',c);
 near(z.value(c),1.05);z.update(0,{...c,cameraZoomShotEnabled:0});near(z.value(c),1.04);
 assert.equal(z.snapshot(c).shot.active,false);assert.equal(z.snapshot(c).hit.active,true);
 z.reset();near(z.value(c),1);assert.deepEqual(z.snapshot(c).triggers,{shot:0,hit:0});
});
test('retrigger preserves current zoom and starts a fresh Out attack',()=>{
 const z=new CameraZoomFeedback();z.trigger('shot',defaults);z.update(.1,defaults);const previous=z.value(defaults);
 z.trigger('shot',defaults);near(z.value(defaults),previous);z.update(.04,defaults);near(z.value(defaults),1.04);
});
test('underdamping rebounds past baseline and zero amount does not trigger',()=>{
 const c={...defaults,cameraZoomAttack:0,cameraZoomDamping:.3},z=new CameraZoomFeedback();z.trigger('hit',c);z.update(.08,c);assert.ok(z.value(c)<1);
 z.reset();z.trigger('shot',{...c,cameraZoomShotAmount:0});assert.equal(z.snapshot(c).shot.active,false);
});
