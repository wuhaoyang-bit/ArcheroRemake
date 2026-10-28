import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ShotRecoil } from '../src/shot-recoil.ts';
import { DEFAULTS } from '../src/config.ts';
import { MovementController, PLAYER_RADIUS } from '../src/controller.ts';
import { parseSettingsDocument, settingsDocument } from '../src/settings-store.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('recoil moves opposite the shot by the configured distance independent of timestep',()=>{
  for(const steps of [1,8,120]){const r=new ShotRecoil();r.trigger({x:3,z:4},DEFAULTS);let x=0,z=0;for(let i=0;i<steps;i++){const d=r.update(DEFAULTS.recoilDuration/steps);x+=d.x;z+=d.z;}close(x,-.6*DEFAULTS.recoilDistance);close(z,-.8*DEFAULTS.recoilDistance);}
});
test('curve controls speed distribution, normalized distance and zero curve is stationary',()=>{
 const r=new ShotRecoil();r.trigger({x:1,z:0},{...DEFAULTS,recoilSpeedCurve:[{time:0,progress:100},{time:100,progress:0}]});close(r.update(.06).x,-.16*.75);close(r.update(.06).x,-.16*.25);
 r.trigger({x:1,z:0},{...DEFAULTS,recoilSpeedCurve:[{time:0,progress:0},{time:100,progress:0}]});assert.deepEqual(r.update(1),{x:0,z:0});
});
test('retrigger replaces remaining recoil and snapshots settings for each shot',()=>{
 const s=structuredClone(DEFAULTS),r=new ShotRecoil();r.trigger({x:1,z:0},s);r.update(.02);r.trigger({x:0,z:1},s);s.recoilDistance=2;s.recoilSpeedCurve[0].progress=0;const d=r.update(1);close(d.x,0);close(d.z,-.16);
});
test('controller recoil respects walls, preserves idle and resets on arena switch or disable',()=>{
 const c=new MovementController();c.position={x:c.settings.roomSize/2-PLAYER_RADIUS-.01,z:0};c.triggerShotRecoil({x:-1,z:0});c.update(1);close(c.position.x,c.settings.roomSize/2-PLAYER_RADIUS);assert.equal(c.mode,'idle');
 c.triggerShotRecoil({x:1,z:0});c.set('recoilEnabled',0);assert.equal(c.recoil.active,false);c.set('recoilEnabled',1);c.triggerShotRecoil({x:1,z:0});c.setTraining('monsters');assert.equal(c.recoil.active,false);
});
test('old settings inherit recoil and custom curves round trip without shared references',()=>{
 const old=parseSettingsDocument({version:1,settings:{}});assert.equal(old.recoilDistance,.16);old.recoilSpeedCurve[0].progress=250;assert.equal(DEFAULTS.recoilSpeedCurve[0].progress,100);assert.deepEqual(settingsDocument(old).settings.recoilSpeedCurve,old.recoilSpeedCurve);
});
