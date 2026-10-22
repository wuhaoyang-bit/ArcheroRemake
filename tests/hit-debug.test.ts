import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import { HitDebug } from '../src/hit-debug.ts';
import { ArrowProjectiles } from '../src/arrow-projectiles.ts';
test('debug records contact before callbacks and leaves normal gameplay unchanged when off',()=>{
 const scene=new T.Scene(),template=new T.Group();template.add(new T.Mesh(new T.BoxGeometry(.1,.1,1)));const arrows=new ArrowProjectiles(scene,template),debug=new HitDebug(scene);arrows.debug=debug;
 const target=new T.Mesh(new T.BoxGeometry(1,2,1));target.position.z=3;target.userData.practiceTarget='test';target.updateMatrixWorld();arrows.setTargets([target]);arrows.setSpeed(10);
 arrows.fire(new T.Vector3(),new T.Vector3(0,0,3));arrows.update(.25);assert.equal(arrows.snapshot().hits,1);assert.equal(debug.last,null);
 debug.enabled=true;let pausedAtCallback=false;arrows.onHit=()=>{pausedAtCallback=debug.paused;};arrows.fire(new T.Vector3(),new T.Vector3(0,0,3));arrows.update(.25);
 assert.ok(pausedAtCallback);assert.equal(debug.snapshot().last?.point[2],2.5);assert.equal(debug.snapshot().last?.tipBefore[2],.5);assert.equal(arrows.snapshot().active.length,0);
 debug.update([]);assert.equal(debug.snapshot().proxyMeshes,1);assert.ok(debug.group.visible);debug.clear();assert.equal(debug.last,null);assert.equal(debug.paused,false);
});
test('piercing arrows freeze at first contact and resume without duplicating that hit',()=>{
 const scene=new T.Scene(),template=new T.Group();template.add(new T.Mesh(new T.BoxGeometry(.1,.1,1)));const arrows=new ArrowProjectiles(scene,template),debug=new HitDebug(scene);debug.enabled=true;arrows.debug=debug;arrows.setPierce(true);arrows.setSpeed(10);
 const targets=[3,5].map((z,i)=>{const m=new T.Mesh(new T.BoxGeometry(1,2,1));m.position.z=z;m.userData.practiceTarget=String(i);m.updateMatrixWorld();return m;});arrows.setTargets(targets);
 arrows.fire(new T.Vector3(),new T.Vector3(0,0,6));arrows.update(.6);assert.equal(arrows.snapshot().hits,1);assert.equal(arrows.snapshot().active[0].tip[2],2.5);
 debug.paused=false;arrows.update(.3);assert.equal(arrows.snapshot().hits,2);assert.equal(arrows.snapshot().active[0].tip[2],4.5);
});
