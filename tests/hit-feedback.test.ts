import { HitParticles } from '../src/hit-particles.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import { HIT_DEFAULTS } from '../src/hit-feedback-config.ts';
import { HitResponse, spring } from '../src/hit-response.ts';
import { TrainingFeedback } from '../src/training-feedback.ts';
import { buildLockingTraining } from '../src/locking-training-scene.ts';
import { MovementController } from '../src/controller.ts';
import { ArrowProjectiles } from '../src/arrow-projectiles.ts';
import { parseSettingsDocument } from '../src/settings-store.ts';
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const make=()=>new HitResponse({x:0,z:0},{x:7,z:18});
test('0.06 compress, hold through 0.20 knockback, then spring; rim ends at 0.30',()=>{const r=make();r.hit({x:1,z:0},HIT_DEFAULTS);r.update(.06,HIT_DEFAULTS);close(r.scale,.85);r.update(.04,HIT_DEFAULTS);close(r.position.x,.91875);r.update(.1,HIT_DEFAULTS);close(r.position.x,1.05);close(r.scale,.85);r.update(.1,HIT_DEFAULTS);assert.ok(r.scale>1);close(r.rim(HIT_DEFAULTS),0);r.update(4,HIT_DEFAULTS);close(r.scale,1);close(r.position.x,1.05);});
test('wall stops BOTH axes, never slides and never releases spring early',()=>{const r=new HitResponse({x:.95,z:0},{x:1,z:5});r.hit({x:1,z:1},HIT_DEFAULTS);r.update(.1,HIT_DEFAULTS);close(r.position.x,1);close(r.position.z,.05);assert.equal(r.blocked,true);close(r.scale,.85);r.update(.09,HIT_DEFAULTS);close(r.scale,.85);close(r.position.z,.05);r.update(.02,HIT_DEFAULTS);assert.ok(r.scale>.85);});
test('repeated hit replaces remaining distance/direction and preserves current scale',()=>{const r=make();r.hit({x:1,z:0},HIT_DEFAULTS);r.update(.1,HIT_DEFAULTS);const x=r.position.x,scale=r.scale;r.hit({x:-1,z:0},HIT_DEFAULTS);close(r.scale,scale);r.update(.2,HIT_DEFAULTS);close(r.position.x,x-1.05);close(r.scale,.85);close(r.age,.2);});
test('direct release time and early release preserve compression-state derivative',()=>{const r=make(),c={...HIT_DEFAULTS,hitReleaseTime:.3};r.hit({x:1,z:0},c);r.update(.25,c);close(r.scale,.85);r.update(.1,c);assert.ok(r.scale>.85);const early={...HIT_DEFAULTS,hitReleaseTime:.02};const e=make();e.hit({x:1,z:0},early);e.update(.02,early);assert.ok(e.scale>.85&&e.v>0);});
test('spring and knockback are independent of step partition across damping regimes',()=>{for(const z of [.05,.15,1,1.5,2]){const a=spring(.15,.2,.42,4,z),part=spring(.15,.2,.17,4,z),b=spring(part.x,part.v,.25,4,z);close(a.x,b.x);close(a.v,b.v);}const a=make(),b=make();a.hit({x:1,z:1},HIT_DEFAULTS);b.hit({x:1,z:1},HIT_DEFAULTS);a.update(.4,HIT_DEFAULTS);for(let i=0;i<48;i++)b.update(1/120,HIT_DEFAULTS);close(a.position.x,b.position.x);close(a.scale,b.scale);});
test('whole dummy including base scales; raycast silhouette stays fixed; all parts flash independently per dummy',()=>{const ctl=new MovementController();ctl.setTraining('locking');const group=buildLockingTraining(16,38),feedback=new TrainingFeedback(group,ctl.getPracticeTargets(),16,38);const id=ctl.getPracticeTargets()[0].id,root=group.children.find(o=>o.userData.practiceTarget===id)!;const visual=root.getObjectByName('WholeDummyVisual')!,proxy=root.getObjectByName('UnscaledHitProxy')!;const originalProxyBox=new T.Box3().setFromObject(proxy),originalVisualBox=new T.Box3().setFromObject(visual);feedback.hit(id,{x:1,z:0},{...HIT_DEFAULTS,hitKnockEnabled:0});feedback.update(.1,HIT_DEFAULTS);const proxyBox=new T.Box3().setFromObject(proxy),visualBox=new T.Box3().setFromObject(visual);close(proxyBox.max.y,originalProxyBox.max.y);close(visualBox.max.y,originalVisualBox.max.y*.85);assert.ok(visual.children.length>10);assert.equal(visual.children.length,proxy.children.length);const snap=feedback.snapshot();assert.ok(snap[0].rim>0);assert.ok(snap.slice(1).every(s=>s.rim===0&&s.scale===1));feedback.reset();assert.ok(feedback.snapshot().every(s=>s.scale===1&&s.rim===0));});
test('moving target coordinates are read by existing selection and reset on reenter',()=>{const c=new MovementController();c.setTraining('locking');c.press(1,0,0);const selected=c.targeting.target!,moving=c.getPracticeTargets().find(t=>t.id===selected.id)!;moving.x=100;c.refreshTargetPositions();assert.equal(c.targeting.target?.id,selected.id);assert.equal(c.targeting.target?.x,100);c.move(1,40,0);c.update(.01);assert.notEqual(c.targeting.target?.id,selected.id);c.restartTraining();assert.ok(c.getPracticeTargets().every(t=>Math.abs(t.x)<16));});
test('arrow snapshots contact and direction before recycling, once per hit',()=>{const scene=new T.Scene(),template=new T.Group();template.add(new T.Mesh(new T.BoxGeometry(.1,.1,1)));const arrows=new ArrowProjectiles(scene,template),target=new T.Mesh(new T.BoxGeometry(1,1,1));target.position.z=3;target.userData.practiceTarget='target';target.updateMatrixWorld();let count=0;arrows.onHit=hit=>{count++;assert.equal(arrows.snapshot().active.length,0);assert.equal(hit.id,'target');close(hit.point.z,2.5);close(hit.direction.z,1);};arrows.setTargets([target]);arrows.fire(new T.Vector3(),new T.Vector3(0,0,3),10);arrows.update(.1);arrows.update(.1);assert.equal(count,1);});
test('legacy settings inherit confirmed feedback values and new values round-trip',()=>{const c=parseSettingsDocument({version:1,settings:{}});assert.equal(c.hitSquashAmount,.15);assert.equal(c.hitSpringDamping,.15);assert.equal(c.hitParticleCount,14);assert.equal(c.hitReleaseTime,.2);const d=parseSettingsDocument({version:1,settings:{...c,hitRimTime:.6,hitParticleCount:19}});assert.equal(d.hitRimTime,.6);assert.equal(d.hitParticleCount,19);});

test('particle pool supports simultaneous hits, expires independently and reuses capacity',()=>{const particles=new HitParticles(new T.Scene()),c=HIT_DEFAULTS;for(let i=0;i<12;i++)particles.emit(new T.Vector3(i,1,0),new T.Vector3(1,0,0),c);particles.update(.1,c);assert.equal(particles.snapshot().active,12*47);const capacity=particles.snapshot().capacity;particles.update(1,c);assert.equal(particles.snapshot().active,0);for(let i=0;i<12;i++)particles.emit(new T.Vector3(i,1,0),new T.Vector3(1,0,0),c);assert.equal(particles.snapshot().capacity,capacity);particles.clear();assert.equal(particles.snapshot().active,0);});

test('release time is independent of knockback duration and restarts on latest hit',()=>{
  const c={...HIT_DEFAULTS,hitKnockTime:.1,hitReleaseTime:.5},r=make();
  r.hit({x:1,z:0},c);r.update(.3,c);close(r.scale,.85);close(r.position.x,1.05);
  r.hit({x:1,z:0},c);r.update(.49,c);close(r.scale,.85);r.update(.03,c);assert.ok(r.scale>.85);
});
test('old offset settings migrate to direct seconds; explicit new time wins and persists',()=>{
  const legacy=parseSettingsDocument({version:1,settings:{hitKnockTime:.3,hitReleaseOffset:.1}});close(legacy.hitReleaseTime,.4);
  const current=parseSettingsDocument({version:1,settings:{...legacy,hitReleaseTime:.7,hitReleaseOffset:-.2}});close(current.hitReleaseTime,.7);
  close(parseSettingsDocument({version:1,settings:current}).hitReleaseTime,.7);
});


test('rim holds, fades independently, ends on time and restarts on hit',()=>{
 const c={...HIT_DEFAULTS,hitRimFadeStart:.4,hitRimTime:.8},r=make();
 r.hit({x:1,z:0},c);r.update(.4,c);close(r.rim(c),1);
 r.update(.2,c);close(r.rim(c),.25);
 // Timing edits apply to the next hit, not midway through the current flash.
 close(r.rim({...c,hitRimFadeStart:0,hitRimTime:5}),.25);
 r.hit({x:1,z:0},c);close(r.rim(c),1);r.update(.8,c);close(r.rim(c),0);
 for(const start of [0,.8,1]){const settings={...c,hitRimFadeStart:start};r.hit({x:1,z:0},settings);r.update(.4,settings);close(r.rim(settings),start===0?.25:1);r.update(.4,settings);close(r.rim(settings),0);}
 close(parseSettingsDocument({version:1,settings:{}}).hitRimFadeStart,.2);
 close(parseSettingsDocument({version:1,settings:{hitRimFadeStart:1.2,hitRimTime:3}}).hitRimFadeStart,1.2);
});


test('squash total duration smoothly finishes even before release; independent clocks and repeated hits',()=>{
 for(const duration of [.05,.15,.6,2,5]){
  const c={...HIT_DEFAULTS,hitSquashTime:duration,hitReleaseTime:.2},a=make(),b=make();
  a.hit({x:1,z:0},c);b.hit({x:1,z:0},c);
  a.update(duration-1e-7,c);assert.ok(Math.abs(a.x)<1e-8);assert.ok(Math.abs(a.v)<.001);
  a.update(1e-6,c);close(a.scale,1);close(a.v,0);
  for(let i=0;i<100;i++)b.update(duration/100,c);close(b.scale,1);
 }
 const c={...HIT_DEFAULTS,hitSquashTime:.1},r=make();r.hit({x:1,z:0},c);r.update(.06,c);
 const compressed=r.scale;r.hit({x:1,z:0},c);close(r.scale,compressed);r.update(.06,c);assert.ok(r.scale<1);
 r.update(.05,c);close(r.scale,1);assert.ok(r.knockingBack);assert.ok(r.rim(c)>0);
 close(parseSettingsDocument({version:1,settings:{}}).hitSquashTime,2);
 close(parseSettingsDocument({version:1,settings:{hitSquashTime:.7}}).hitSquashTime,.7);
});


test('overall spark duration scales every layer, expires lights, and is captured per hit',()=>{
 const originalRandom=Math.random;Math.random=()=>.5;
 try{
  const a=new HitParticles(new T.Scene()),b=new HitParticles(new T.Scene());
  a.emit(new T.Vector3(),new T.Vector3(1,0,0),HIT_DEFAULTS);
  const short={...HIT_DEFAULTS,hitParticleDuration:.4};b.emit(new T.Vector3(),new T.Vector3(1,0,0),short);
  const full=a.snapshot().particles,half=b.snapshot().particles;
  assert.equal(full.length,47);full.forEach((p,i)=>close(half[i].life,p.life*.5));
  b.update(.03,HIT_DEFAULTS);a.update(.03,HIT_DEFAULTS);
  a.snapshot().particles.forEach((p,i)=>p.position.forEach((v,j)=>close(v,b.snapshot().particles[i].position[j])));
  b.update(.37,HIT_DEFAULTS);assert.equal(b.snapshot().active,0);assert.equal(b.snapshot().lights,0);
  a.update(.37,HIT_DEFAULTS);assert.ok(a.snapshot().active>0);
  for(const duration of [.05,3]){const c={...HIT_DEFAULTS,hitParticleDuration:duration,hitParticleLife:1};b.emit(new T.Vector3(),new T.Vector3(1,0,0),c);assert.ok(b.snapshot().particles.every(p=>p.life<=duration));b.update(duration,c);assert.equal(b.snapshot().active,0);assert.equal(b.snapshot().lights,0);}
 }finally{Math.random=originalRandom;}
});
