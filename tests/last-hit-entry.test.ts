import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three/webgpu';
import {DEFAULTS} from '../src/config.ts';import {TrainingFeedback} from '../src/training-feedback.ts';import {createTrainingCube} from '../src/training-monster.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
test('last hit prediction matches burst threshold and suppression, without changing fullness',()=>{
 const group=new T.Group(),root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);
 const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38,{allowFullBurst:'settings'}),c={...DEFAULTS,burstSuppressed:0,burstEnabled:0,slimeInjectionAmount:60};
 assert.equal(f.willHitTriggerBurst('a',c),false);f.hit('a',{x:0,z:1},c);
 assert.equal(f.willHitTriggerBurst('a',c),true);assert.equal(f.snapshot()[0].inflation!.amount,60);
 assert.equal(f.willHitTriggerBurst('a',{...c,burstSuppressed:1}),false);
 assert.equal(f.willHitTriggerBurst('a',{...c,slimeInflationEnabled:0}),false);
 f.hit('a',{x:0,z:1},c);assert.equal(f.snapshot()[0].burst.phase,'feedback');assert.equal(f.willHitTriggerBurst('a',c),false);
 const saved={...DEFAULTS,arrowFinalHitEntryMs:75};assert.equal(parseSettingsDocument(settingsDocument(saved)).arrowFinalHitEntryMs,75);
});
