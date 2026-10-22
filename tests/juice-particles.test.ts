import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import { HIT_DEFAULTS as C } from '../src/hit-feedback-config.ts';
import { parseSettingsDocument } from '../src/settings-store.ts';
import { JuiceParticles, buildJuiceSpawns, juiceParams, sampleJuice, juiceRemain, juiceIntegrateRemain } from '../src/juice-particles.ts';
const close=(a:number,b:number,e=1e-8)=>assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
test('screenshot parameters retain fractional world sizes through settings serialization',()=>{
 assert.deepEqual([C.juiceDelay,C.juiceCount,C.juiceRadius,C.juiceHeight,C.juiceSpeed,C.juiceSpeedJitter,C.juiceSize,C.juiceSizeJitter,C.juiceLife,C.juiceDragRel,C.juiceCurve],[.13,16,.34,.1,4,1,.6,.08,1.8,.55,2]);
 const loaded=parseSettingsDocument({version:1,settings:C});close(loaded.juiceSize,.6);close(loaded.juiceSizeJitter,.08);assert.equal('juiceSeed' in loaded,false);
});
test('seeded world-unit disk spawn and OutCubic match lab formula',()=>{
 const origin=new T.Vector3(2,1,3),a=buildJuiceSpawns(origin,juiceParams(C,1));
 assert.deepEqual(a,buildJuiceSpawns(origin,juiceParams(C,1)));assert.equal(a.length,16);
 for(const p of a){assert.ok(Math.hypot(p.ox-2,p.oz-3)<=.34);assert.ok(p.s0>=.52&&p.s0<=.68);assert.ok(p.speed0>=3&&p.speed0<=5);assert.ok(p.life>=1.8*.88&&p.life<=1.8*1.12);const s=sampleJuice(p,p.life/2,'easeOutCubic',.55);close(s.size,Math.max(.01,p.s0*.125));close(s.speed,p.speed0*.125);close(s.position[0],p.ox+p.dirX*p.speed0*p.life*(1-.5**4)/4);}
 close(juiceRemain('easeOutCubic',.5,.55),.125);close(juiceIntegrateRemain('easeOutCubic',1,1.8,.55),.45);
});
test('independent .13s deadline, current enemy position, captured settings and remainder age',()=>{
 const juice=JuiceParticles.createForTest(new T.Scene());let x=0;
 const resolve=()=>new T.Vector3(x,1,0),c={...C};juice.schedule('a',c,resolve);
 c.juiceDelay=2;c.juiceCount=60;c.juiceHeight=1;
 juice.update(.12,resolve);assert.equal(juice.snapshot().active,0);x=5;juice.update(.02,resolve);
 const s=juice.snapshot();assert.equal(s.active,16);assert.equal(s.pending.length,0);for(const p of s.particles){close(p.age,.01);close(p.origin[1],1.1);assert.ok(Math.abs(p.origin[0]-5)<=.34);}
});
test('rapid hits keep separate waves, zero delay emits immediately, reset cancels pending and pools reuse',()=>{
 const juice=JuiceParticles.createForTest(new T.Scene()),resolve=()=>new T.Vector3();
 juice.schedule('a',C,resolve);juice.update(.1,resolve);juice.schedule('a',C,resolve);juice.update(.04,resolve);assert.equal(juice.snapshot().active,16);assert.equal(juice.snapshot().pending.length,1);
 juice.update(.1,resolve);assert.equal(juice.snapshot().active,32);
 for(let i=0;i<12;i++)juice.schedule('b',{...C,juiceDelay:0},resolve);assert.equal(juice.snapshot().active,224);
 const capacity=juice.snapshot().capacity;juice.update(3,resolve);assert.equal(juice.snapshot().active,0);juice.schedule('a',{...C,juiceDelay:0},resolve);assert.equal(juice.snapshot().capacity,capacity);
 juice.schedule('a',C,resolve);juice.clear();juice.update(3,resolve);assert.equal(juice.snapshot().active,0);assert.equal(juice.snapshot().pending.length,0);
 juice.schedule('gone',C,resolve);juice.update(.2,()=>null);assert.equal(juice.snapshot().active,0);
});
test('modelCenter is enemy visual center on XZ above feet', async () => {
  const { TrainingFeedback } = await import('../src/training-feedback.ts');
  const { buildLockingTraining } = await import('../src/locking-training-scene.ts');
  const { MovementController } = await import('../src/controller.ts');
  const ctl = new MovementController();
  ctl.setTraining('locking');
  const group = buildLockingTraining(16, 38);
  const feedback = new TrainingFeedback(group, ctl.getPracticeTargets(), 16, 38);
  const id = ctl.getPracticeTargets()[0].id;
  const out = new T.Vector3();
  assert.ok(feedback.modelCenter(id, out));
  const feet = feedback.feetOrigin(id, new T.Vector3())!;
  assert.ok(Math.abs(out.x - feet.x) < 1e-3);
  assert.ok(Math.abs(out.z - feet.z) < 1e-3);
  assert.ok(out.y > feet.y);
});


test('each real burst automatically gets a new distribution; replay keeps a captured seed',()=>{
 const juice=JuiceParticles.createForTest(new T.Scene()),origin=new T.Vector3();
 juice.emit(origin,C);const a=juice.snapshot().particles;juice.clear();juice.emit(origin,C);assert.notDeepEqual(juice.snapshot().particles,a);
 juice.clear();juice.emit(origin,C,.2,123);const replay=juice.snapshot().particles;juice.clear();juice.emit(origin,C,.2,123);assert.deepEqual(juice.snapshot().particles,replay);
});
