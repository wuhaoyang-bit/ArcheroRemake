import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import { validateJuiceSpeedCurve, sampleJuiceSpeedCurve } from '../src/juice-speed-curve.ts';
import { HIT_DEFAULTS } from '../src/hit-feedback-config.ts';
import { parseSettingsDocument,settingsDocument } from '../src/settings-store.ts';
import { JuiceParticles } from '../src/juice-particles.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('custom speed interpolates and integrates exactly, including slow nonzero tail',()=>{
 const curve=[{time:0,progress:100},{time:50,progress:20},{time:100,progress:10}];
 close(sampleJuiceSpeedCurve(curve,.25).speed,.6);close(sampleJuiceSpeedCurve(curve,.5).integral,.3);
 close(sampleJuiceSpeedCurve(curve,1).integral,.375);close(sampleJuiceSpeedCurve(curve,1).speed,.1);
 for(const u of [.1,.25,.6,.9])close((sampleJuiceSpeedCurve(curve,u+1e-5).integral-sampleJuiceSpeedCurve(curve,u-1e-5).integral)/2e-5,sampleJuiceSpeedCurve(curve,u).speed);
});
test('custom curves round trip and reject duplicate, invalid and missing endpoint data',()=>{
 const curve=[{time:0,progress:200},{time:100,progress:5}];
 const loaded=parseSettingsDocument({version:1,settings:{juiceCurve:6,juiceSpeedCurve:curve}});
 assert.equal(loaded.juiceCurve,6);assert.deepEqual(settingsDocument(loaded).settings.juiceSpeedCurve,curve);
 for(const bad of [[],[{time:0,progress:0},{time:0,progress:100}], [{time:0,progress:301},{time:100,progress:0}],[{time:0,progress:NaN},{time:100,progress:0}]])assert.throws(()=>validateJuiceSpeedCurve(bad));
});
test('queued bursts capture custom curves; custom speed does not change the size curve',()=>{
 const juice=JuiceParticles.createForTest(new T.Scene());const c={...HIT_DEFAULTS,juiceCurve:6,juiceSpeedCurve:[{time:0,progress:50},{time:100,progress:50}]};
 juice.schedule('a',c,()=>new T.Vector3());c.juiceSpeedCurve[0].progress=300;juice.update(.23,()=>new T.Vector3());
 const p=juice.snapshot().particles[0];close(p.speed,p.speed0*.5);close(p.position[0]-p.ox,p.dirX*p.speed0*.5*.1);close(p.size,Math.max(.01,p.s0*(1-p.age/p.life)**3));
});
