import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three/webgpu';
import {SlimeEyeDebris} from '../src/slime-eye-debris.ts';import {SLIME_EYES_DEFAULTS as C} from '../src/slime-eyes-config.ts';
function setup(){const scene=new T.Scene(),body=new T.Group();scene.add(body);body.position.set(2,1,3);const eyes=[-.3,.3].map(x=>{const eye=new T.Group();eye.position.set(x,.2,1);eye.scale.setScalar(.13);eye.add(new T.Mesh(new T.SphereGeometry(1),new T.MeshPhysicalNodeMaterial()));body.add(eye);return eye;});scene.updateMatrixWorld(true);return {scene,body,eyes,debris:new SlimeEyeDebris(scene)};}
test('detached eyes retain world pose and launch radially; body hiding does not hide them',()=>{const {scene,body,eyes,debris}=setup(),center=body.position.clone();debris.emit(eyes,center,C);const snap=debris.snapshot();assert.equal(snap.length,2);snap.forEach((f,i)=>{const pos=eyes[i].getWorldPosition(new T.Vector3());assert.ok(pos.distanceTo(new T.Vector3(...f.position))<1e-8);const expected=pos.sub(center).normalize().multiplyScalar(C.slimeEyeEjectSpeed);assert.ok(expected.distanceTo(new T.Vector3(...f.velocity))<1e-8);});body.visible=false;assert.ok(scene.children.filter(x=>x.name==='DetachedSlimeEye').every(x=>x.visible));debris.update(.1);assert.notDeepEqual(debris.snapshot(),snap);});
test('eyes settle, persist, and reset clears fragments without disposing original assets',()=>{const {scene,eyes,debris}=setup();let disposed=false;(eyes[0].children[0] as T.Mesh).geometry.addEventListener('dispose',()=>disposed=true);debris.emit(eyes,new T.Vector3(2,1,3),C);for(let i=0;i<2400;i++)debris.update(1/120);assert.equal(debris.snapshot().length,2);assert.ok(debris.snapshot().every(x=>x.settled));debris.clear();assert.equal(debris.snapshot().length,0);assert.equal(scene.children.length,1);assert.equal(disposed,false);});

test('editable radial curve integrates accurately and gravity starts immediately',async()=>{
 const {eyeFlight}=await import('../src/slime-eye-debris.ts');const c={...C,slimeEyeEjectSpeed:20,slimeEyeCurveTime:.2,slimeEyeSpeedCurve:[{time:0,progress:100},{time:50,progress:20},{time:100,progress:0}]};
 assert.equal(eyeFlight(0,c).speed,20);assert.ok(eyeFlight(.001,c).drop>0);assert.equal(eyeFlight(.1,c).speed,4);
 assert.equal(eyeFlight(.3,c).speed,0);assert.equal(eyeFlight(.3,c).distance,eyeFlight(.2,c).distance);assert.ok(eyeFlight(.3,c).drop>eyeFlight(.2,c).drop);
 for(const t of [.01,.06,.12,.3]){const epsilon=1e-6,derivative=(eyeFlight(t+epsilon,c).distance-eyeFlight(t-epsilon,c).distance)/(2*epsilon);assert.ok(Math.abs(derivative-eyeFlight(t,c).speed)<1e-5);}
 const zero={...c,slimeEyeSpeedCurve:[{time:0,progress:0},{time:100,progress:0}]};assert.equal(eyeFlight(.1,zero).distance,0);assert.ok(eyeFlight(.1,zero).drop>0);
});
test('eyes repeatedly bounce forward and preserve heading on impact',()=>{
 const {debris,eyes}=setup();const c={...C,slimeEyeEjectSpeed:20,slimeEyeEjectGravity:19.6,slimeEyeEjectBounce:.7,slimeEyeGroundFriction:.1};debris.emit(eyes,new T.Vector3(2,1,3),c);
 let previous=debris.snapshot()[0],bounces=0,forwardAirSteps=0;
 for(let i=0;i<1200;i++){debris.update(1/120);const next=debris.snapshot()[0];if(previous.velocity[1]<0&&next.velocity[1]>0){bounces++;assert.ok(next.velocity[2]>0);assert.ok(next.velocity[0]<0);}if(previous.landed&&!next.grounded&&next.velocity[1]>0){assert.ok(next.position[2]>previous.position[2]);forwardAirSteps++;}previous=next;}
 assert.ok(bounces>=3);assert.ok(forwardAirSteps>10);assert.ok(previous.settled);
});
test('zero bounce rolls on ground; zero impact friction preserves forward momentum',()=>{
 const {debris,eyes}=setup();debris.emit(eyes,new T.Vector3(2,1,3),{...C,slimeEyeEjectBounce:0,slimeEyeGroundFriction:0,slimeEyeRollDrag:0});
 for(let i=0;i<240;i++)debris.update(1/120);const a=debris.snapshot()[0];assert.ok(a.grounded);assert.ok(a.velocity[2]>0);debris.update(.5);const b=debris.snapshot()[0];assert.ok(b.position[2]>a.position[2]);assert.equal(b.velocity[2],a.velocity[2]);assert.equal(b.position[1],a.position[1]);
});

test('eye curve settings validate, round-trip and snapshot independently',async()=>{
 const {parseSettingsDocument,settingsDocument}=await import('../src/settings-store.ts');const c=parseSettingsDocument({version:1,settings:{slimeEyeSpeedCurve:[{time:0,progress:200},{time:100,progress:0}]}});
 assert.deepEqual(parseSettingsDocument(settingsDocument(c)).slimeEyeSpeedCurve,c.slimeEyeSpeedCurve);
 assert.throws(()=>parseSettingsDocument({version:1,settings:{slimeEyeSpeedCurve:[{time:0,progress:-1},{time:100,progress:0}]}}));
 const {debris,eyes}=setup();debris.emit(eyes,new T.Vector3(2,1,3),c);c.slimeEyeSpeedCurve[0].progress=0;assert.equal((debris as any).fragments[0].settings.slimeEyeSpeedCurve[0].progress,200);
});

test('fast eyes bounce off walls and do not return to their pre-collision launch curve',()=>{
 const {debris,eyes}=setup();debris.setCollisions(12,12,[]);debris.emit(eyes,new T.Vector3(2,1,3),{...C,slimeEyeEjectGravity:0,slimeEyeEjectSpeed:40,slimeEyeSpeedCurve:[{time:0,progress:300},{time:100,progress:300}]},'source');
 let reflected=false;for(let i=0;i<30;i++){debris.update(1/120);for(const f of debris.snapshot()){assert.ok(Math.abs(f.position[0])<6);assert.ok(Math.abs(f.position[2])<6);if(f.velocity[2]<0)reflected=true;}}assert.ok(reflected);
});
test('monster sweep excludes source and respects height, without mutating obstacles',async()=>{
 const {eyeContact}=await import('../src/eye-collision.ts');const box=new T.Box3(new T.Vector3(-1,0,4),new T.Vector3(1,2,6)),before=box.clone(),from=new T.Vector3(0,1,0),to=new T.Vector3(0,1,10);
 assert.equal(eyeContact(from,to,.2,Infinity,Infinity,[{id:'self',box}],'self'),null);
 const hit=eyeContact(from,to,.2,Infinity,Infinity,[{id:'other',box}],'self');assert.ok(hit);assert.ok(hit.time<.4);assert.deepEqual(hit.normal.toArray(),[0,0,-1]);
 assert.equal(eyeContact(new T.Vector3(0,3,0),new T.Vector3(0,3,10),.2,Infinity,Infinity,[{id:'other',box}],'self'),null);assert.ok(box.equals(before));
});
test('hitting another monster reflects only the eye velocity',()=>{
 const {debris,eyes}=setup(),box=new T.Box3(new T.Vector3(-10,0,5),new T.Vector3(10,4,6)),before=box.clone();debris.setCollisions(Infinity,Infinity,[{id:'other',box}]);debris.emit(eyes,new T.Vector3(2,1,3),{...C,slimeEyeEjectGravity:0,slimeEyeEjectSpeed:40,slimeEyeSpeedCurve:[{time:0,progress:100},{time:100,progress:100}]},'source');debris.update(.1);assert.ok(debris.snapshot().every(f=>f.velocity[2]<0));assert.ok(box.equals(before));
});
