import test from 'node:test';
import assert from 'node:assert/strict';
import { exponentialCurve, remainingCurveAngle as step, validateCurve } from '../src/turn-curve.ts';
import { parseSettingsDocument } from '../src/settings-store.ts';
test('generated curve exactly follows exponential across frame rates and multiple segments',()=>{
 for(const k of [.1,8.5,10.4,60])for(const angle of [.2,14,90,180])for(const dt of [1/240,1/60,.1,1]){
   const expected=angle*Math.exp(-k*dt);
   assert.ok(Math.abs(step(angle,dt,exponentialCurve(k),0)-expected)<1e-10);
 }
});
test('custom speeds cross segments consistently, stop at target, and respect zero-speed barriers',()=>{
 const points=[{angle:0,speed:100},{angle:40,speed:500},{angle:100,speed:200},{angle:180,speed:2000}];
 let e=180;for(let i=0;i<100;i++)e=step(e,.001,points,0);
 assert.ok(Math.abs(e-step(180,.1,points,0))<1e-9);
 assert.equal(step(180,10,points,0),0);
 const zero=[{angle:0,speed:100},{angle:90,speed:0},{angle:180,speed:1000}];
 assert.equal(step(90,1,zero,0),90);assert.ok(step(180,1,zero,0)>=90);
 assert.equal(step(180,1,[{angle:0,speed:100},{angle:180,speed:0}],0),180);
 assert.equal(step(.05,.01,points,.1),0);
});
test('editable endpoint speeds, unique angles, legacy exponential initialization, independent persistence',()=>{
 const points=[{angle:0,speed:200},{angle:180,speed:2500}];assert.deepEqual(validateCurve(points),points);
 for(const p of [[{angle:0,speed:0}], [{angle:0,speed:0},{angle:180,speed:-1}], [...points,{angle:180,speed:2}]])assert.throws(()=>validateCurve(p));
 const old=parseSettingsDocument({version:1,settings:{turnResponse:8.5,turnSnapAngle:.3}});
 assert.deepEqual(old.turnCurve,exponentialCurve(8.5));assert.equal(old.curveSnapAngle,.3);
 const custom=parseSettingsDocument({version:1,settings:{...old,turnModel:2,turnCurve:points,turnResponse:20}});
 assert.deepEqual(custom.turnCurve,points);
});
