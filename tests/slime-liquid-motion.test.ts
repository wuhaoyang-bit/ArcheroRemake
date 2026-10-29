import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DEFAULTS} from '../src/config.ts';
import {UnifiedSlimeLiquid} from '../src/unified-slime-liquid.ts';
import {SlimeEyeDebris} from '../src/slime-eye-debris.ts';
import type {FlightSettings} from '../src/slime-flight-motion.ts';

type Drop={p:T.Vector3;v:T.Vector3;direction:T.Vector3;radius:number;paint:boolean;ballistic:boolean;settings:FlightSettings};
const drops=(fx:UnifiedSlimeLiquid)=>(fx as unknown as {drops:Drop[]}).drops;
function pair(patch:Partial<typeof DEFAULTS>={}){
 // Explicitly choose equal flight values for the trajectory comparison; runtime settings stay separate.
 const c={...DEFAULTS,puddleRenderer:2,puddleEnabled:1,puddleLifetime:0,liquidDropCount:1,
  liquidEjectSpeed:patch.slimeEyeEjectSpeed??DEFAULTS.slimeEyeEjectSpeed,
  liquidGravity:patch.slimeEyeEjectGravity??DEFAULTS.slimeEyeEjectGravity,
  liquidCurveTime:patch.slimeEyeCurveTime??DEFAULTS.slimeEyeCurveTime,
  liquidSpeedCurve:(patch.slimeEyeSpeedCurve??DEFAULTS.slimeEyeSpeedCurve).map(p=>({...p})),...patch};
 const scene=new T.Scene(),liquid=new UnifiedSlimeLiquid(scene),eye=new SlimeEyeDebris(scene);
 liquid.update(0,[],c,40,40);liquid.emit(new T.Vector3(0,1.1,0),c,()=>.5,new T.Color(.9,.5,.02));
 const drop=drops(liquid)[0],source=new T.Group();source.position.copy(drop.p);source.scale.setScalar(drop.radius);
 source.add(new T.Mesh(new T.SphereGeometry(1),new T.MeshPhysicalNodeMaterial()));scene.add(source);
 eye.emit([source],drop.p.clone().sub(drop.direction),c);
 const compare=()=>{const e=eye.snapshot()[0];assert.ok(drop.p.distanceTo(new T.Vector3(...e.position))<1e-8,'airborne positions differ');assert.ok(drop.v.distanceTo(new T.Vector3(...e.velocity))<1e-8,'airborne velocities differ');};
 return {c,eye,liquid,drop,compare,step(dt:number){eye.update(dt);liquid.update(dt,[],c,40,40);}};
}

test('equal independent settings produce the eye flight trend at 30/60/120Hz until ground contact',()=>{
 for(const dt of [1/30,1/60,1/120]){
  const p=pair({slimeEyeEjectSpeed:18,slimeEyeEjectGravity:19.6,slimeEyeCurveTime:.3,slimeEyeSpeedCurve:[{time:0,progress:150},{time:40,progress:35},{time:100,progress:8}]});
  let frames=0;
  while(drops(p.liquid).includes(p.drop)&&frames<240){p.step(dt);if(drops(p.liquid).includes(p.drop))p.compare();frames++;}
  assert.ok(frames>10&&frames<240);assert.equal(p.liquid.snapshot().deposits,1);
 }
});
test('liquid becomes a puddle on first contact even when the eye has high bounce and no friction',()=>{
 const p=pair({slimeEyeEjectSpeed:0,slimeEyeEjectGravity:20,slimeEyeEjectBounce:.9,slimeEyeGroundFriction:0,slimeEyeRollDrag:0});
 while(drops(p.liquid).includes(p.drop))p.step(1/120);
 assert.equal(p.liquid.snapshot().deposits,1);assert.equal(drops(p.liquid).filter(d=>d.paint).length,0);
 let eyeRebounded=false;
 for(let i=0;i<240;i++){p.step(1/120);if(p.eye.snapshot()[0].velocity[1]>0)eyeRebounded=true;}
 assert.ok(eyeRebounded);assert.equal(p.liquid.snapshot().drops,0);assert.equal(p.liquid.snapshot().deposits,1);
});
test('zero launch curve still falls under gravity and eye bounce settings do not alter liquid motion',()=>{
 const zero=[{time:0,progress:0},{time:100,progress:0}];
 const a=pair({slimeEyeSpeedCurve:zero,slimeEyeEjectBounce:0}),b=pair({slimeEyeSpeedCurve:zero,slimeEyeEjectBounce:.9});
 a.step(.1);b.step(.1);a.compare();b.compare();assert.equal(a.drop.p.x,0);assert.ok(a.drop.p.y<1.1);assert.ok(a.drop.p.equals(b.drop.p));
});
test('liquid stops at a wall without an elastic reflection and then lands',()=>{
 const p=pair({slimeEyeEjectSpeed:40,slimeEyeEjectGravity:20,slimeEyeCurveTime:.3});
 let contacted=false;
 for(let i=0;i<240&&drops(p.liquid).includes(p.drop);i++){
  p.liquid.update(1/120,[],p.c,4,4);
  if(p.drop.ballistic){contacted=true;assert.ok(p.drop.v.x<=0&&p.drop.v.z>=0,'wall must not reverse outward speed');}
 }
 assert.ok(contacted);assert.equal(p.liquid.snapshot().deposits,1);
});
test('flight parameters are captured at birth and the next burst takes edited speed/curve/gravity',()=>{
 const p=pair();p.c.liquidEjectSpeed=0;p.c.liquidGravity=0;p.c.liquidSpeedCurve.forEach(pt=>pt.progress=0);
 p.step(.1);p.compare();assert.ok(p.drop.v.length()>0);
 p.liquid.emit(new T.Vector3(2,1.1,0),p.c,()=>.5);
 const next=drops(p.liquid).find(d=>d!==p.drop)!;assert.equal(next.v.length(),0);
 const start=next.p.clone();p.liquid.update(.1,[],p.c,40,40);assert.ok(next.p.equals(start));
});
test('liquid flight tuning does not change eyes and eye tuning does not change liquid flight',()=>{
 const a=pair(),liquidOnly=pair({liquidEjectSpeed:3,liquidGravity:2,liquidCurveTime:1.5,liquidSpeedCurve:[{time:0,progress:30},{time:100,progress:0}]}),
  eyeOnly=pair({liquidEjectSpeed:a.c.liquidEjectSpeed,liquidGravity:a.c.liquidGravity,liquidCurveTime:a.c.liquidCurveTime,liquidSpeedCurve:a.c.liquidSpeedCurve,
   slimeEyeEjectSpeed:4,slimeEyeEjectGravity:1,slimeEyeCurveTime:1,slimeEyeSpeedCurve:[{time:0,progress:50},{time:100,progress:0}]});
 for(const p of [a,liquidOnly,eyeOnly])p.step(.1);
 assert.deepEqual(a.eye.snapshot(),liquidOnly.eye.snapshot());
 assert.ok(a.drop.p.distanceTo(liquidOnly.drop.p)>.1);
 assert.ok(a.drop.p.equals(eyeOnly.drop.p));assert.ok(a.drop.v.equals(eyeOnly.drop.v));
 assert.notDeepEqual(a.eye.snapshot()[0].position,eyeOnly.eye.snapshot()[0].position);
});
test('landing splashes do not evict other airborne drops when the pool is full',()=>{
 const fx=new UnifiedSlimeLiquid(new T.Scene()),c={...DEFAULTS,puddleRenderer:2,puddleEnabled:1,liquidDropCount:64,liquidEjectSpeed:0};
 for(let i=0;i<6;i++)fx.emit(new T.Vector3(0,1.1,0),c,()=>.5);
 const all=[...drops(fx)];all.slice(0,64).forEach(d=>{d.p.y=d.radius+.04;d.ballistic=true;});
 fx.update(1/120,[],c,40,40);
 assert.ok(all.slice(64).every(d=>drops(fx).includes(d)));assert.ok(drops(fx).length<=384);assert.equal(fx.snapshot().deposits,64);
});

function speedSpread(base=10,jitter=3){
 const c={...DEFAULTS,puddleRenderer:2,puddleEnabled:1,puddleLifetime:0,liquidDropCount:3,liquidEjectSpeed:base,liquidSpeedJitter:jitter,
  liquidSpeedCurve:[{time:0,progress:120},{time:100,progress:8}]};
 const fx=new UnifiedSlimeLiquid(new T.Scene());let call=0;
 // Equal elevation, radius and angular jitter; only the per-drop speed sample varies.
 const random=()=>{const index=call++;return index%5===3?[0,.5,1][Math.floor(index/5)%3]:.5;};
 fx.emit(new T.Vector3(0,1.1,0),c,random);
 return {fx,c,original:[...drops(fx)],random};
}
test('per-drop speed offsets produce different landing distances and remain fixed along the speed curve',()=>{
 const {fx,c,original}=speedSpread();
 assert.deepEqual(original.map(d=>d.settings.slimeEyeEjectSpeed),[7,10,13]);
 original.forEach((d,i)=>assert.ok(Math.abs(d.v.length()-[7,10,13][i]*1.2)<1e-10));
 c.liquidSpeedJitter=0;c.liquidEjectSpeed=30;
 const distances:number[]=[];
 for(let i=0;i<600&&distances.length<3;i++){
  fx.update(1/120,[],c,100,100);
  original.forEach((d,j)=>{if(distances[j]===undefined&&!drops(fx).includes(d))distances[j]=Math.hypot(d.p.x,d.p.z);});
 }
 assert.equal(fx.snapshot().deposits,3);assert.ok(distances[0]<distances[1]&&distances[1]<distances[2]);
 assert.deepEqual(original.map(d=>d.settings.slimeEyeEjectSpeed),[7,10,13]);
 fx.emit(new T.Vector3(0,1.1,0),c,()=>.5);
 assert.ok(drops(fx).filter(d=>d.paint).every(d=>d.settings.slimeEyeEjectSpeed===30));
});
test('zero speed jitter disables variation, negative results stop at zero, and seeded replay repeats the spread',()=>{
 const uniform=speedSpread(10,0);assert.deepEqual(uniform.original.map(d=>d.settings.slimeEyeEjectSpeed),[10,10,10]);
 const clamped=speedSpread(1,3);assert.deepEqual(clamped.original.map(d=>d.settings.slimeEyeEjectSpeed),[0,1,4]);
 assert.equal(clamped.original[0].v.length(),0);
 clamped.fx.update(.1,[],clamped.c,100,100);assert.ok(clamped.original[0].p.y<1.1);
 const a=speedSpread(),b=speedSpread();a.fx.update(.2,[],a.c,100,100);b.fx.update(.2,[],b.c,100,100);
 assert.deepEqual(a.original.map(d=>[d.p.toArray(),d.v.toArray()]),b.original.map(d=>[d.p.toArray(),d.v.toArray()]));
});
