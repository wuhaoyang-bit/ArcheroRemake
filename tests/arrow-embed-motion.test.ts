import test from 'node:test';
import assert from 'node:assert/strict';
import {sampleEmbedMotion} from '../src/arrow-embed-motion.ts';
test('braking threshold is a distance percentage, with monotonic velocity and zero-speed endpoint',()=>{
 for(const n of [0,.25,.5,.9,1]){
  const speed=10,duration=.2,start=duration*n/(2-n);
  const end=sampleEmbedMotion(speed,duration,n,duration);
  assert.ok(Math.abs(sampleEmbedMotion(speed,duration,n,start).distance-end.distance*n)<1e-10);
  assert.equal(end.speed,0);
  let previous=speed;
  for(let i=0;i<=100;i++){const v=sampleEmbedMotion(speed,duration,n,duration*i/100).speed;assert.ok(v<=previous+1e-10);previous=v;}
 }
 assert.deepEqual(sampleEmbedMotion(20,0,.5,0),{distance:0,speed:0});
});
