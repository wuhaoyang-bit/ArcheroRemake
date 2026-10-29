import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three/webgpu';
import {EyeHitMotion} from '../src/eye-hit-motion.ts';
import {EYE_HIT_CURVES,validateEyeHitCurve} from '../src/eye-hit-config.ts';
import {DEFAULTS as C} from '../src/config.ts';
import {createTrainingCube,monsterInstance} from '../src/training-monster.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
const n=new T.Vector3(0,0,1),d=new T.Vector3(0,0,-1),near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const end=C.eyeHitPullTime+C.eyeHitHoldTime+C.eyeHitReturnTime+C.eyeHitAbsorbTime;
function motion(){const m=new EyeHitMotion();m.hit(d,n,1,1,C);return m;}
test('eye response pulls immediately, passes neutral at speed, absorbs energy, then restores linearly',()=>{
 const m=motion();m.update(.001);assert.ok(m.sample(n).offset.z>0);
 m.age=C.eyeHitPullTime;near(m.sample(n).offset.z,C.eyeHitPull);
 m.age=C.eyeHitPullTime+C.eyeHitHoldTime+C.eyeHitReturnTime;near(m.sample(n).offset.z,0);
 m.age+=.001;assert.ok(m.sample(n).offset.z<0);
 m.age=end;near(m.sample(n).offset.z,-C.eyeHitDepth);
 m.age=end+.1;const a=m.sample(n).offset.z;m.age=end+.2;const b=m.sample(n).offset.z;m.age=end+.3;const c=m.sample(n).offset.z;
 near(b-a,C.eyeHitRestoreSpeed*.1);near(c-b,b-a);
 m.age=end+C.eyeHitDepth/C.eyeHitRestoreSpeed+.01;assert.equal(m.sample(n).phase,'idle');near(m.sample(n).offset.length(),0);
});
test('custom speed envelopes preserve stage distances and reject zero/nonfinite curves',()=>{
 for(const raw of [[{time:0,progress:0},{time:100,progress:0}],[{time:0,progress:NaN},{time:100,progress:1}]])assert.throws(()=>validateEyeHitCurve(raw));
 const m=new EyeHitMotion();m.hit(d,n,1,1,{...C,eyeHitPullCurve:[{time:0,progress:100},{time:100,progress:100}]});m.age=C.eyeHitPullTime/2;near(m.sample(n).offset.z,C.eyeHitPull/2);m.age=C.eyeHitPullTime;near(m.sample(n).offset.z,C.eyeHitPull);
 const doc=parseSettingsDocument(settingsDocument({...C,eyeHitPullCurve:[{time:0,progress:200},{time:100,progress:50}]}));assert.deepEqual(doc.eyeHitPullCurve,[{time:0,progress:200},{time:100,progress:50}]);assert.deepEqual(parseSettingsDocument({version:1,settings:{}}).eyeHitAbsorbCurve,EYE_HIT_CURVES.eyeHitAbsorbCurve);
});
test('repeated hit preserves current offset, is bounded, snapshots curves, and is timestep independent',()=>{
 const m=motion();m.age=end+.1;const before=m.sample(n).offset.clone(),c=structuredClone(C);m.hit(new T.Vector3(-1,0,0),n,1,1,c);assert.ok(before.distanceTo(m.sample(n).offset)<1e-9);c.eyeHitPullCurve[0].progress=0;assert.equal(m.settings!.eyeHitPullCurve![0].progress,260);
 for(let i=0;i<100;i++){m.update(.02);m.hit(i%2?d:new T.Vector3(-1,0,0),n,1,1,C);assert.ok(m.sample(n).offset.length()<=Math.max(C.eyeHitPull,C.eyeHitDepth)+1e-8);}
 const a=motion(),b=motion();a.update(.123);for(let i=0;i<123;i++)b.update(.001);assert.ok(a.sample(n).offset.distanceTo(b.sample(n).offset)<1e-8);
});
function setup(c={...C,burstEnabled:0}){const group=new T.Group(),root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38);f.refresh(c);return {f,root,group,v:monsterInstance(root)!.inflation!,c};}
test('eye matrices compose with both squash modes, inflation and rotation; refresh never advances time',()=>{
 for(const mode of [0,1]){const {f,root,v,c}=setup({...C,burstEnabled:0,hitSquashMode:mode});root.rotation.y=.5;f.hit('a',{x:0,z:-1},c);f.update(.05,c);
  const snap=f.snapshot()[0].eyeHit!,matrices=v.eyes.map(e=>e.matrix.clone()),positions=v.eyes.map(e=>e.position.clone());
  for(let i=0;i<10;i++){f.refresh(c);f.animate(0,c);}
  assert.deepEqual(f.snapshot()[0].eyeHit,snap);v.eyes.forEach((e,i)=>{assert.ok(e.position.equals(positions[i]));assert.ok(e.matrix.equals(matrices[i]));});
  assert.ok(snap.some(s=>s.tether));const color=v.copyColor(new T.Color());root.traverse(o=>{if(o.name==='EyeGelTether')assert.equal(((o as T.Mesh).material as T.MeshPhysicalMaterial).color.getHex(),color.getHex());});
  f.refresh({...c,slimeEyesEnabled:0});assert.ok(f.snapshot()[0].eyeHit!.every(s=>!s.tether));f.refresh(c);
  f.refresh({...c,eyeHitTetherEnabled:0});assert.ok(f.snapshot()[0].eyeHit!.every(s=>!s.tether));assert.ok(f.snapshot()[0].eyeHit!.some(s=>s.phase==='pull'));
  f.refresh({...c,eyeHitEnabled:0});assert.ok(f.snapshot()[0].eyeHit!.every(s=>s.phase==='idle'));f.reset();assert.ok(v.eyes.every(e=>e.matrixAutoUpdate));
 }
});
test('burst hands off actual eye pose, excludes gel connections, and does not wait for slow restoration',()=>{
 const c={...C,slimeInjectionAmount:100,burstFeedbackDelay:-5,burstDuration:.1,burstPhaseEnd:0,eyeHitRestoreSpeed:.2};const {f,group,v}=setup(c);f.hit('a',{x:0,z:-1},c);
 for(let i=0;i<300;i++){f.update(1/120,c);if(f.snapshot()[0].burst.phase==='gone')break;}
 assert.equal(f.snapshot()[0].burst.phase,'gone');assert.equal(f.eyeDebris.snapshot().length,2);
 for(const eye of group.children.filter(o=>o.name==='DetachedSlimeEye')){assert.equal(eye.children.length,1);assert.ok(!eye.getObjectByName('EyeGelTether'));}
 assert.ok(v.eyeHit.snapshot().every(s=>s.phase==='idle'));
});

test('startup warming exposes gel connections even with reversed targets and disabled effects',()=>{
 const {f,root}=setup();root.rotation.y=Math.PI;f.prepareEyeDebris({...C,eyeHitEnabled:0,eyeHitTetherEnabled:0,eyeHitMinimumStrength:0,hitKnockEnabled:0,slimeEyesEnabled:0});
 let visible=0;root.traverse(o=>{if(o.name==='EyeGelTether'&&o.visible)visible++;});assert.equal(visible,2);
});

test('default front-hit entry absorbs speed rather than accelerating again at the body surface',()=>{
 const m=motion(),t=C.eyeHitPullTime+C.eyeHitHoldTime+C.eyeHitReturnTime,e=1e-6;
 m.age=t-e;const before=m.sample(n).offset.z;m.age=t+e;const after=m.sample(n).offset.z;
 const incoming=before/e,inside=-after/e;assert.ok(inside<=incoming*1.01);assert.ok(inside>=incoming*.9);
});
