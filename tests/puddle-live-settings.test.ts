import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BURST_DEFAULTS} from '../src/slime-burst-config.ts';
import {applyLivePuddleSettings,puddleRenderKey,type PuddleState} from '../src/puddle-live-settings.ts';
function puddle():PuddleState{return {origin:{x:2,z:4,shape:2,angleRandom:.5,sizeRandom:-.5,bodyColor:[.2,.4,.6]},age:2,c:{...BURST_DEFAULTS},x:2,z:4,shape:2,angle:0,size:3,scale:1,settled:true,opacity:1};}
test('settled puddles retune size, offsets, rotation and shape without rerolling or restarting',()=>{
 const p=puddle(),before=puddleRenderKey(p);
 applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleSize:8,puddleSizeRange:.5,puddleX:1,puddleZ:-2,puddleRotation:30,puddleRotationRange:60,puddleShape:2});
 assert.equal(p.size,6);assert.equal(p.x,3);assert.equal(p.z,2);assert.equal(p.angle,Math.PI/3);assert.equal(p.shape,1);assert.equal(p.age,2);assert.equal(p.settled,true);assert.notEqual(puddleRenderKey(p),before);
});
test('new timing re-evaluates settled springs and delay preserves elapsed time',()=>{
 const p=puddle();applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleDelay:3,puddleFrequency:1});assert.equal(p.age,-1);assert.equal(p.settled,false);
 applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleDelay:3,puddleFrequency:1});assert.equal(p.age,-1);
 applyLivePuddleSettings(p,BURST_DEFAULTS);assert.equal(p.age,2);
});
test('body colour is retained per residue; fallback colour and cache react to edits',()=>{
 const p=puddle();applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleColorR:1,puddleColorG:0,puddleColorB:0});assert.deepEqual([p.c.puddleColorR,p.c.puddleColorG,p.c.puddleColorB],[.2,.4,.6]);
 p.origin.bodyColor=undefined;const key=puddleRenderKey(p);applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleColorR:1,puddleColorG:0,puddleColorB:0});assert.notEqual(puddleRenderKey(p),key);assert.equal(p.c.puddleColorG,0);
});
test('lifetime retuning can cancel an in-progress fade',()=>{
 const p=puddle();applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleLifetime:1,puddleFade:2});assert.equal(p.opacity,.5);
 applyLivePuddleSettings(p,{...BURST_DEFAULTS,puddleLifetime:0});assert.equal(p.opacity,1);
});
