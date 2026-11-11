import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DEFAULTS} from '../src/config.ts';
import {hitBendReturnTravel} from '../src/hit-bend.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {createTrainingCube} from '../src/training-monster.ts';
const c={...DEFAULTS,hitKnockEnabled:0,slimeInflationEnabled:0,hitBendReturnDistance:.12};
const start=c.hitBendFormTime+c.hitBendFollowDelay+c.hitBendFollowTime;
const end=start+1/(2*c.hitBendSpringFreq*Math.sqrt(1-c.hitBendSpringDamp**2));
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){const group=new T.Group(),root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);return new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38);}
test('travel is limited to first return and follows spring timing',()=>{
 near(hitBendReturnTravel(start,c),0);near(hitBendReturnTravel(end,c),.12);near(hitBendReturnTravel(end+2,c),.12);
 let prev=0;for(let i=0;i<=100;i++){const v=hitBendReturnTravel(start+(end-start)*i/100,c);assert.ok(v>=prev);prev=v;}
 near(hitBendReturnTravel(end,{...c,hitBendReturnDistance:0}),0);
 for(const damping of [1,1.5])assert.ok(Number.isFinite(hitBendReturnTravel(end,{...c,hitBendSpringDamp:damping})));
});
test('whole target moves against hit direction, retains position, and is frame independent',()=>{
 const a=fixture(),b=fixture();a.hit('a',{x:1,z:0},c);b.hit('a',{x:1,z:0},c);
 a.update(start,c);near(a.snapshot()[0].position.x,0);a.update(1-start,c);
 for(let i=0;i<120;i++)b.update(1/120,c);
 near(a.snapshot()[0].position.x,-.12);near(b.snapshot()[0].position.x,-.12);
 a.update(1,c);near(a.snapshot()[0].position.x,-.12);
 a.hit('a',{x:0,z:1},c);a.update(1,c);near(a.snapshot()[0].position.x,-.12);near(a.snapshot()[0].position.z,-.12);
 a.reset();near(a.snapshot()[0].position.x,0);
});
test('return respects bounds and disabling bend prevents movement',()=>{
 const a=fixture(),c2={...c,hitBendReturnDistance:100};a.hit('a',{x:1,z:0},c2);a.update(1,c2);
 const snap=a.snapshot()[0];near(snap.position.x,-snap.bounds.x);
 a.reset();a.hit('a',{x:1,z:0},c);a.update(1,{...c,hitBendEnabled:0});near(a.snapshot()[0].position.x,0);
});
