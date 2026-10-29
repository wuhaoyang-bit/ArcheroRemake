import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {eyeDeformation,directionalScale,impactStrength,eyeImpactTiming,eyeSupport,type EyeImpact} from '../src/eye-deformation.ts';
import {SLIME_EYES_DEFAULTS as C} from '../src/slime-eyes-config.ts';
import {SlimeEyeDebris} from '../src/slime-eye-debris.ts';
const up=new T.Vector3(0,1,0);
const hit=(speed=12,normal=up,outgoing=new T.Vector3(5,8,0)):EyeImpact=>({age:0,normal,speed,point:new T.Vector3(0,.25,0),outgoing});
const pose=(age:number,impact=hit(),velocity=impact.outgoing)=>eyeDeformation({age,impact,velocity,grounded:false},C);

test('impact strength uses normal closing speed, is bounded, and weak bounces visibly weaken',()=>{
 const slow=pose(0,hit(2)),fast=pose(0);
 assert.ok(fast.scale<slow.scale);assert.equal(fast.scale,1-C.slimeEyeSquash);assert.equal(impactStrength(1000,C),1);
 const velocity=new T.Vector3(15,-1,0);assert.ok(impactStrength(-velocity.dot(up),C)<impactStrength(velocity.length(),C));
 assert.ok(eyeImpactTiming(hit(2),C).squash<eyeImpactTiming(hit(12),C).squash);
});

test('short held squash, round axis handoff, quick stretch, one small settle, then round',()=>{
 const impact=hit(),{squash,recover}=eyeImpactTiming(impact,C);
 assert.equal(pose(squash*C.slimeEyeSquashHold*.9).scale,pose(0).scale);
 assert.ok(pose(squash*.8).scale>pose(0).scale);
 assert.equal(pose(squash).scale,1);
 assert.ok(pose(squash+recover*C.slimeEyeReboundPeak).scale>1);
 assert.ok(pose(squash+recover*.86).scale<1);
 assert.equal(pose(squash+recover+.001).scale,1);
 assert.equal(eyeDeformation({age:0,velocity:new T.Vector3(40,0,0),grounded:false,impact},{...C,slimeEyeDeformEnabled:0}).scale,1);
});

test('a light bounce recovers before its apex even when horizontal velocity is high',()=>{
 const impact=hit(1,up,new T.Vector3(18,.6,0)),apex=impact.outgoing.y/C.slimeEyeEjectGravity,t=eyeImpactTiming(impact,C);
 assert.ok(t.squash+t.recover<apex);
 assert.equal(pose(apex,impact,new T.Vector3(18,0,0)).scale,1);
 assert.equal(eyeDeformation({age:2,velocity:new T.Vector3(30,0,0),grounded:false},C).scale,1);
});

test('anticipation is confined to the approach window and uses closing speed, not a tangential graze',()=>{
 const state={age:2,velocity:new T.Vector3(10,-8,0),grounded:false};
 const far=eyeDeformation({...state,approach:{time:C.slimeEyeAnticipationTime,normal:up,speed:8}},C);
 const near=eyeDeformation({...state,approach:{time:.005,normal:up,speed:8}},C);
 const graze=eyeDeformation({...state,velocity:new T.Vector3(30,-.2,0),approach:{time:.005,normal:up,speed:.2}},C);
 assert.equal(far.scale,1);assert.ok(near.scale>1);assert.ok(graze.scale<near.scale);
 assert.ok(near.axis.dot(state.velocity.clone().normalize())>1-1e-9);
});

test('squash direction follows the contact normal; rebound direction is frozen at departure',()=>{
 for(const normal of [up,new T.Vector3(-1,0,0),new T.Vector3(1,2,-3).normalize()]){
  const impact=hit(12,normal,new T.Vector3(-4,7,1)),timing=eyeImpactTiming(impact,C);
  const squashed=pose(0,impact,new T.Vector3(10,20,-5));assert.ok(squashed.axis.equals(normal));
  const rebound=pose(timing.squash+timing.recover*.2,impact,new T.Vector3(30,-8,5));
  assert.ok(rebound.axis.dot(impact.outgoing.clone().normalize())>1-1e-9);
  const before=directionalScale(new T.Matrix4(),pose(timing.squash-1e-7,impact).axis,pose(timing.squash-1e-7,impact).scale);
  const after=directionalScale(new T.Matrix4(),pose(timing.squash+1e-7,impact).axis,pose(timing.squash+1e-7,impact).scale);
  assert.ok(before.elements.every((v,i)=>Math.abs(v-after.elements[i])<1e-7));
 }
});

test('one-axis shape is symmetric, keeps volume, and rolling never rotates its principal axes',()=>{
 for(const axis of [up,new T.Vector3(1,0,0),new T.Vector3(2,3,-1).normalize()])for(const scale of [.3,.55,1,1.8]){
  const shape=directionalScale(new T.Matrix4(),axis,scale),m=shape.elements;
  assert.ok(Math.abs(shape.determinant()-1)<1e-9);assert.ok(Math.abs(m[1]-m[4])<1e-12);assert.ok(Math.abs(m[2]-m[8])<1e-12);assert.ok(Math.abs(m[6]-m[9])<1e-12);
  assert.ok(axis.clone().applyMatrix4(shape).distanceTo(axis.clone().multiplyScalar(scale))<1e-9);
  for(const angle of [0,.5,2]){const rotated=shape.clone().multiply(new T.Matrix4().makeRotationFromEuler(new T.Euler(angle,angle*2,-angle)));assert.ok(Math.abs(eyeSupport(rotated,axis)-scale)<1e-9);}
 }
});

function setup(enabled:number){
 const scene=new T.Scene(),face=new T.Group(),eye=new T.Group();scene.add(face);face.add(eye);eye.position.set(0,1,1);eye.scale.setScalar(.25);eye.add(new T.Mesh(new T.SphereGeometry(1),new T.MeshPhysicalNodeMaterial()));scene.updateMatrixWorld(true);
 const debris=new SlimeEyeDebris(scene);debris.setCollisions(8,8,[]);debris.emit([eye],new T.Vector3(0,1,0),{...C,slimeEyeDeformEnabled:enabled});return {scene,debris};
}
test('visual deformation never changes trajectory, never clips the floor, and settles round',()=>{
 const a=setup(0),b=setup(1);
 for(let i=0;i<1200;i++){
  a.debris.update(1/120);b.debris.update(1/120);assert.deepEqual(a.debris.snapshot(),b.debris.snapshot());
  const obj=b.scene.children.find(o=>o.name==='DetachedSlimeEye')!;
  assert.ok(Math.abs(obj.matrix.determinant()-.25**3)<1e-9);
  assert.ok(obj.matrix.elements[13]-eyeSupport(obj.matrix,up)>-1e-8);
 }
 const obj=b.scene.children.find(o=>o.name==='DetachedSlimeEye')!;assert.ok(Math.abs(eyeSupport(obj.matrix,up)-.25)<1e-9);
});
test('compressed contact pose touches its plane while physical center already travels away',()=>{
 const {scene,debris}=setup(1);let checked=false;
 for(let i=0;i<150;i++){
  const previous=debris.snapshot()[0];debris.update(1/240);const current=debris.snapshot()[0];
  if(previous.velocity[1]<0&&current.velocity[1]>0){
   const obj=scene.children.find(o=>o.name==='DetachedSlimeEye')!;
   assert.ok(Math.abs(obj.matrix.elements[13]-eyeSupport(obj.matrix,up))<1e-8);
   debris.update(.001);assert.ok(debris.snapshot()[0].position[1]>.25);
   assert.ok(Math.abs(obj.matrix.elements[13]-eyeSupport(obj.matrix,up))<1e-8);checked=true;break;
  }
 }
 assert.ok(checked);
});

test('rotating a round eye before detachment cannot inflate its resting height',()=>{
 for(const angle of [0,Math.PI/4,Math.PI/3]){
  const scene=new T.Scene(),face=new T.Group(),eye=new T.Group();scene.add(face);face.add(eye);eye.position.set(0,1,0);eye.scale.setScalar(.25);eye.rotation.set(angle,angle*.7,angle*.3);eye.add(new T.Mesh(new T.SphereGeometry(1),new T.MeshPhysicalNodeMaterial()));scene.updateMatrixWorld(true);
  const debris=new SlimeEyeDebris(scene);debris.emit([eye],new T.Vector3(0,2,0),{...C,slimeEyeEjectSpeed:0,slimeEyeEjectBounce:0});
  for(let i=0;i<240;i++)debris.update(1/120);
  assert.ok(Math.abs(debris.snapshot()[0].position[1]-.25)<1e-9);
  const obj=scene.children.find(o=>o.name==='DetachedSlimeEye')!;
  assert.ok(Math.abs(obj.matrix.elements[13]-eyeSupport(obj.matrix,up))<1e-9);
 }
});
