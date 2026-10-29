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

test('moving player wakes a resting eye and kicks along actual movement, then gravity settles it again',()=>{
 const {debris,eyes}=setup();debris.emit([eyes[0]],new T.Vector3(2,1,3),{...C,slimeEyeEjectSpeed:0});
 debris.update(20);const before=debris.snapshot()[0];assert.ok(before.settled);
 const [x,,z]=before.position,collider={radius:.46,height:3.25};
 debris.kickPlayer({x:x-1,z:z-.2,...collider},{x:x-.3,z:z-.2,...collider},.1,true);
 const kicked=debris.snapshot()[0];assert.ok(!kicked.settled&&!kicked.grounded);assert.ok(kicked.velocity[0]>0&&kicked.velocity[1]>0);assert.equal(kicked.velocity[2],0);
 debris.update(.1);assert.ok(debris.snapshot()[0].position[0]>kicked.position[0]);
 debris.update(20);assert.ok(debris.snapshot()[0].settled);
});
test('player sweep catches an eye even when both endpoints miss; high eyes and stationary players do not kick',()=>{
 const {debris,eyes}=setup();debris.emit([eyes[0]],new T.Vector3(2,1,3),{...C,slimeEyeEjectSpeed:0});debris.update(20);
 const before=debris.snapshot()[0],[x,,z]=before.position,c={radius:.46,height:3.25};
 debris.kickPlayer({x,z:z-2,...c},{x,z:z-2,...c},.1,true);assert.deepEqual(debris.snapshot()[0],before);
 debris.kickPlayer({x,z:z-2,...c},{x,z:z+2,...c},.1,true);assert.ok(debris.snapshot()[0].velocity[2]>0);
 const high=setup();high.debris.emit([high.eyes[0]],new T.Vector3(2,1,3),{...C,slimeEyeEjectSpeed:0,slimeEyeEjectGravity:0});
 const initial=high.debris.snapshot()[0];high.debris.kickPlayer({x:x-2,z,...c,height:.3},{x:x+2,z,...c,height:.3},.1,true);assert.deepEqual(high.debris.snapshot()[0],initial);
});
test('stationary player reflects airborne eyes without moving the player',()=>{
 const {debris,eyes}=setup(),player={x:1.7,z:5,radius:.46,height:3.25},before={...player};
 debris.setPlayer(player);debris.emit([eyes[0]],new T.Vector3(1.7,1.2,3),{...C,slimeEyeEjectGravity:0,slimeEyeEjectSpeed:10,slimeEyeSpeedCurve:[{time:0,progress:100},{time:100,progress:100}]});
 debris.update(.1);assert.ok(debris.snapshot()[0].velocity[2]<0);assert.deepEqual(player,before);
});
test('player collision uses a round footprint and a finite height',async()=>{
 const {eyePlayerContact}=await import('../src/eye-collision.ts'),player={x:0,z:0,radius:.5,height:3};
 assert.equal(eyePlayerContact(new T.Vector3(.59,1,.59),new T.Vector3(.59,1,.59),.1,player),null);
 assert.equal(eyePlayerContact(new T.Vector3(-2,4,0),new T.Vector3(2,4,0),.1,player),null);
 const hit=eyePlayerContact(new T.Vector3(-2,1,0),new T.Vector3(2,1,0),.1,player);assert.ok(hit);assert.ok(Math.abs(hit.time-.35)<1e-8);assert.deepEqual(hit.normal.toArray(),[-1,0,0]);
 const top=eyePlayerContact(new T.Vector3(0,4,0),new T.Vector3(0,2,0),.1,player);assert.ok(top);assert.deepEqual(top.normal.toArray(),[0,1,0]);
});

test('live kick strength scales an existing eye launch and zero keeps passive contact',async()=>{
 const kick=(strength:number)=>{const {debris,eyes}=setup();debris.emit([eyes[0]],new T.Vector3(2,1,3),{...C,slimeEyeEjectSpeed:0});debris.update(20);
 const [x,,z]=debris.snapshot()[0].position,c={radius:.46,height:3.25};
 debris.kickPlayer({x:x-1,z,...c},{x:x-.3,z,...c},.1,true,strength);return debris.snapshot()[0];};
 const normal=kick(1),strong=kick(2),gentle=kick(.5),off=kick(0);
 for(const axis of [0,1]){assert.equal(strong.velocity[axis],normal.velocity[axis]*2);assert.equal(gentle.velocity[axis],normal.velocity[axis]*.5);}
 assert.equal(off.velocity[1],0);assert.ok(off.velocity[0]>0);
 const {parseSettingsDocument,settingsDocument}=await import('../src/settings-store.ts');
 assert.equal(parseSettingsDocument({version:1,settings:{}}).slimeEyeKickStrength,1);
 const saved=parseSettingsDocument({version:1,settings:{slimeEyeKickStrength:2.5}});
 assert.equal(parseSettingsDocument(settingsDocument(saved)).slimeEyeKickStrength,2.5);
});
