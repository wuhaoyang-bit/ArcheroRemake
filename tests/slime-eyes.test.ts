import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createYellowSlimeModel} from '../src/yellow-slime-model.ts';
import {SLIME_EYES_DEFAULTS as C} from '../src/slime-eyes-config.ts';
import {SlimeInflationVisual} from '../src/slime-inflation-visual.ts';
import {SLIME_INFLATION_DEFAULTS as I} from '../src/slime-inflation-config.ts';
test('pupils are paint on the eyeballs and texture responds to offsets',()=>{
 const m=createYellowSlimeModel();assert.equal(m.face.children.length,2);
 const eye=m.face.children[0];assert.equal(eye.children.length,1);
 const mat=(eye.children[0] as T.Mesh).material as T.MeshPhysicalMaterial,tex=mat.map as T.DataTexture;
 const pixels=tex.image.data!,at=(u:number,v:number)=>pixels[(Math.floor(v*256)*512+Math.floor(u*512))*4];
 assert.ok(at(.25,.5)<20);assert.ok(at(.75,.5)>240);
 m.updateEyes({...C,slimePupilX:.6,slimePupilSize:.1});assert.ok(at(.25,.5)>240);assert.ok(at(.25+.6/(2*Math.PI),.5)<20);
 assert.equal(m.updateEyes({...C,slimePupilX:.6,slimePupilSize:.1}),false);
});
test('eye placement changes immediately at the same fill and remains stable through repeated updates',()=>{
 const m=createYellowSlimeModel(),v=new SlimeInflationVisual(m);v.apply(I);
 const before=m.face.children[0].position.clone(),c={...I,slimeEyeX:.15,slimeEyeSpacing:.9,slimeEyeY:1.3,slimeEyeSize:.2};
 v.apply(c);const eye=m.face.children[0];assert.notDeepEqual(eye.position.toArray(),before.toArray());assert.equal(eye.scale.x,.2);
 const after=eye.position.clone();v.apply(c);assert.deepEqual(eye.position.toArray(),after.toArray());
 v.state.visual=.6;v.apply(c);assert.ok(eye.position.distanceTo(after)>0);assert.equal(eye.children.length,1);
});
