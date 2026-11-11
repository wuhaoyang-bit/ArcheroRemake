import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DEFAULTS} from '../src/config.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {createTrainingCube} from '../src/training-monster.ts';
import {SlimePresets} from '../src/slime-presets.ts';

test('suppression defaults on, restores legacy burst when off, and cancels pending windup',()=>{
 const group=new T.Group(),root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);
 const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38,{allowFullBurst:'settings'});
 const c={...DEFAULTS,burstEnabled:0,slimeInjectionAmount:100,burstFeedbackDelay:-5,burstDuration:.1};
 let bursts=0;f.onBurst=()=>bursts++;
 assert.equal(c.burstSuppressed,1);
 for(let i=0;i<3;i++){assert.ok(f.hit('a',{x:0,z:1},c));f.update(2,c);}
 assert.equal(f.snapshot()[0].burst.phase,'alive');assert.equal(bursts,0);
 c.burstSuppressed=0;assert.ok(f.hit('a',{x:0,z:1},c));assert.equal(f.snapshot()[0].burst.phase,'feedback');assert.equal(f.proxies.length,0);
 f.update(.01,c);assert.equal(f.snapshot()[0].burst.phase,'winding');
 c.burstSuppressed=1;assert.deepEqual(f.cancelSuppressedBursts(c),['a']);assert.deepEqual(f.cancelSuppressedBursts(c),[]);
 assert.equal(f.proxies.length,1);assert.ok(f.hit('a',{x:0,z:1},c));f.update(2,c);assert.equal(bursts,0);
 c.burstSuppressed=0;assert.ok(f.hit('a',{x:0,z:1},c));f.update(.01,c);f.update(2,c);
 assert.equal(f.snapshot()[0].burst.phase,'gone');assert.equal(bursts,1);
 c.burstSuppressed=1;assert.deepEqual(f.cancelSuppressedBursts(c),[]);assert.equal(f.snapshot()[0].burst.phase,'gone');
});

test('suppression is shared between soft and hard modes and persists through reload',()=>{
 const c={...structuredClone(DEFAULTS),burstSuppressed:0},modes=new SlimePresets(c);
 const soft=modes.toggle(c);assert.equal(soft.burstSuppressed,0);
 soft.burstSuppressed=1;const hard=modes.toggle(soft);assert.equal(hard.burstSuppressed,1);
 hard.burstSuppressed=0;const bundle=modes.saveBundle(hard);
 const restored=new SlimePresets(bundle.settings,bundle.slimePresets);
 assert.equal(restored.toggle(bundle.settings).burstSuppressed,0);
});
