import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import { MonsterAnimation } from '../src/training-monster.ts';
const clips=['Idle','Run','Hitted','Dead'].map((name,i)=>new T.AnimationClip(name,name==='Hitted'?.833:1,[new T.NumberKeyframeTrack('.position[y]',[0,.4,name==='Hitted'?.833:1],[0,i+1,0])]));
test('source monster states loop, hit once, return to motion, and reset independently',()=>{
 const one=new MonsterAnimation(new T.Group(),clips),two=new MonsterAnimation(new T.Group(),clips);
 one.update(.2,true);assert.equal(one.snapshot().state,'Run');assert.equal(two.snapshot().state,'Idle');
 one.hit();one.update(.2,true);assert.equal(one.snapshot().state,'Hitted');assert.equal(two.snapshot().state,'Idle');
 one.hit();one.update(.7,true);assert.equal(one.snapshot().state,'Hitted');one.update(.2,true);assert.equal(one.snapshot().state,'Run');
 one.hit();one.update(1,false);assert.equal(one.snapshot().state,'Idle');one.reset();assert.equal(one.snapshot().time,0);assert.equal(one.snapshot().hitRemaining,0);
 one.dispose();two.dispose();
});


test('hit animation speed changes clip playback and wall-clock recovery, with restart and reset',()=>{
 for(const speed of [.25,1,2,6]){
  const a=new MonsterAnimation(new T.Group(),clips),duration=.833/speed;
  a.hit(speed);assert.ok(Math.abs(a.snapshot().hitRemaining-duration)<1e-8);
  a.update(duration/2,false);assert.equal(a.snapshot().state,'Hitted');assert.ok(Math.abs(a.snapshot().time-.833/2)<1e-8);
  a.hit(speed);assert.equal(a.snapshot().time,0);
  a.update(duration+.1,true);assert.equal(a.snapshot().state,'Run');assert.ok(Math.abs(a.snapshot().time-.1)<1e-8);
  a.reset();a.update(.2,false);assert.equal(a.snapshot().state,'Idle');assert.ok(Math.abs(a.snapshot().time-.2)<1e-8);
  a.hit(2);a.update(.1,false);a.hit(.25);assert.ok(Math.abs(a.snapshot().hitRemaining-.833/.25)<1e-8);a.update(.1,false);assert.ok(Math.abs(a.snapshot().time-.025)<1e-8);
  a.dispose();
 }
});
