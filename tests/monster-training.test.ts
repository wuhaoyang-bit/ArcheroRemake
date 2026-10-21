import test from 'node:test';
import assert from 'node:assert/strict';
import {MovementController,PLAYER_RADIUS} from '../src/controller.ts';
import {DUMMY_RADIUS,separateMonsters} from '../src/monster-training.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {buildLockingTraining} from '../src/locking-training-scene.ts';
const distance=(a:{x:number;z:number},b:{x:number;z:number})=>Math.hypot(a.x-b.x,a.z-b.z);
function setup(){const c=new MovementController();c.setTraining('monsters');const t=c.getPracticeTargets(),f=new TrainingFeedback(buildLockingTraining(16,38,t),t,16,38);return {c,t,f};}
test('two monsters approach without overlapping each other or player; reset restores spawns',()=>{
 const {c,t,f}=setup(),start=t.map(a=>({...a}));
 for(let i=0;i<1200;i++){f.update(1/120,c.settings);f.pursue(1/120,c.position,3,c.settings);c.update(1/120);}
 assert.equal(t.length,2);assert.ok(distance(t[0],c.position)<distance(start[0],c.position));
 assert.ok(distance(t[0],t[1])>=2*DUMMY_RADIUS-1e-6);
 for(const a of t)assert.ok(distance(a,c.position)>=DUMMY_RADIUS+PLAYER_RADIUS-1e-6);
 f.reset();assert.deepEqual(t,start);c.setTraining('locking');assert.equal(c.getPracticeTargets().length,8);
});
test('knockback suspends pursuit; after duration it resumes',()=>{
 const {c,t,f}=setup();f.hit(t[0].id,{x:0,z:-1},c.settings);f.update(.1,c.settings);const p={...t[0]};f.pursue(.05,c.position,3,c.settings);assert.deepEqual(t[0],p);f.update(.11,c.settings);const before=distance(t[0],c.position);f.pursue(.05,c.position,3,c.settings);assert.ok(distance(t[0],c.position)<before);
});
test('player cannot walk through dummy at maximum player speed',()=>{
 const {c,t}=setup();t[0].x=2;t[0].z=0;t[1].x=-4;t[1].z=-4;c.settings.moveSpeed=30;c.press(1,0,0);c.move(1,100,0);
 for(let i=0;i<240;i++){c.update(1/120);for(const a of t)assert.ok(distance(a,c.position)>=DUMMY_RADIUS+PLAYER_RADIUS-1e-6);}
});
test('coincident dummies and wall contacts resolve deterministically',()=>{
 for(const p of [{x:0,z:0},{x:7.54,z:18.54},{x:5,z:17}]){
 const targets=[{x:6.5,z:17.5},{x:6.5,z:17.5}];separateMonsters(targets,p,PLAYER_RADIUS,16,38);
 assert.ok(distance(targets[0],targets[1])>=2*DUMMY_RADIUS-1e-5);
 for(const a of targets){assert.ok(distance(a,p)>=DUMMY_RADIUS+PLAYER_RADIUS-1e-5);assert.ok(Math.abs(a.x)<=6.545&&Math.abs(a.z)<=17.545);}
 }
});
