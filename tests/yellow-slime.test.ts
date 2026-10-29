import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {createTrainingCube,monsterInstance} from '../src/training-monster.ts';
import {TrainingFeedback} from '../src/training-feedback.ts';
import {DEFAULTS} from '../src/config.ts';

test('yellow slime retains transmissive physical material through hit feedback, with independent proxy',()=>{
 const root=createTrainingCube();root.userData.practiceTarget='slime';
 const group=new T.Group();group.add(root);
 assert.equal(root.userData.monsterModel,'yellow-slime');assert.equal(monsterInstance(root)?.animation,undefined);
 const f=new TrainingFeedback(group,[{id:'slime',x:0,z:0}],16,38);
 const materials:T.MeshPhysicalNodeMaterial[]=[];root.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshPhysicalNodeMaterial)materials.push(o.material);});
 assert.equal(materials.length,5);const bodyMaterials=materials.filter(m=>m.transmission>0);assert.equal(bodyMaterials.length,1);const material=bodyMaterials[0];
 assert.equal(material.color.getHex(),0xfff4b1);assert.equal(material.transmission,.65);assert.equal(material.thickness,1.8);assert.equal(material.clearcoat,.8);assert.ok(material.emissiveNode);
 const c={...DEFAULTS,hitSquashMode:1};f.hit('slime',{x:1,z:1},c);f.update(.1,c);
 const s=f.snapshot()[0];assert.ok(s.compression>0);assert.ok(s.inflation!.amount===20);assert.deepEqual(s.proxyScale,Array(3).fill(s.inflation!.settledExtent));assert.notEqual(material.color.getHex(),0xfff4b1);assert.notEqual(DEFAULTS.juiceColor,material.color.getHex());
 f.reset();assert.equal(f.snapshot()[0].compression,0);assert.equal(f.snapshot()[0].inflation!.amount,0);assert.deepEqual(f.snapshot()[0].proxyScale,[1,1,1]);
});
