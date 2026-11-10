import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three/webgpu';
import {DEFAULTS,sanitize} from '../src/config.ts';
import {parseSettingsDocument,settingsDocument} from '../src/settings-store.ts';
import {FragmentPoseMapper} from '../src/slime-fragments/pose.ts';
import {ShapeMatchingBody,defaults} from '../src/slime-fragments/shape-matching.ts';
const root=new URL('../public/assets/slime-fragments/',import.meta.url);
const json=(name:string)=>JSON.parse(readFileSync(new URL(name,root),'utf8'));
const bytes=(name:string)=>{const b=readFileSync(new URL(name,root));return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
test('fragment controls persist, old settings get defaults, solver counts are integers',()=>{
 const c={...DEFAULTS,slimeFragmentsSoftness:1.2,slimeFragmentsEnabled:0,slimeFragmentsMaxBursts:2};assert.deepEqual(parseSettingsDocument(settingsDocument(c)),c);
 assert.equal(parseSettingsDocument({version:1,settings:{}}).slimeFragmentsSoftness,.8);
 assert.equal(sanitize('slimeFragmentsSubsteps',4.7),5);assert.equal(sanitize('slimeFragmentsIterations',0),1);assert.equal(sanitize('slimeFragmentsEnabled',.2),0);
});
test('accepted cuts reconstruct their original surface and follow rotated/scaled live bodies',()=>{
 const ref=json('reference-body.json'),mapper=new FragmentPoseMapper(ref),geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(ref.positions,3));const body=new T.Mesh(geometry,new T.MeshBasicMaterial());
 for(const transformed of [false,true]){
  if(transformed){body.position.set(3,.5,-8);body.rotation.set(.1,1.2,-.08);body.scale.set(1.3,.9,1.1);}mapper.capture(body);
  for(let i=0;i<9;i++){const data=json(`${i}-sim.json`),original=new Float32Array(bytes(`${i}-skin-pos.bin`)),binding={ids:new Uint16Array(bytes(`${i}-surface-pose-ids.bin`)),weights:new Float32Array(bytes(`${i}-surface-pose-weights.bin`))},p=mapper.positions(binding);
   for(let j=0;j<p.length;j+=3){const expected=new T.Vector3(original[j],original[j+1],original[j+2]).add(new T.Vector3(...data.home as [number,number,number])).applyMatrix4(body.matrixWorld);assert.ok(expected.distanceTo(new T.Vector3(p[j],p[j+1],p[j+2]))<3e-6);}
  }
 }
});
test('scheme D deforms under ground impact and recovers without a squash animation',()=>{
 const body=new ShapeMatchingBody(json('0-sim.json')),p={...defaults,spin:0,stretch:0};body.spawn(new T.Vector3(0,4,0),new T.Vector3(),0,p);let peak=0;
 for(let i=0;i<480;i++){body.step(1/120,p,0);if(body.contact)peak=Math.max(peak,body.strain());assert.ok(body.x.every(Number.isFinite));}
 assert.ok(peak>.15);assert.ok(body.strain()<peak*.4);assert.ok(Math.abs(body.snapshot().volumeRatio-1)<.08);
 for(let i=1;i<body.x.length;i+=3)assert.ok(body.x[i]>=.0249);
});

test('initial overlap from a live slime pose is depenetrated without a fake launch impulse',()=>{
 const body=new ShapeMatchingBody(json('7-sim.json')),p={...defaults,gravity:0,spin:0,stretch:0};body.spawn(new T.Vector3(0,-1,0),new T.Vector3(),0,p);
 assert.ok(body.x.some((v,i)=>i%3===1&&v<0));let bottom=Infinity;for(let i=1;i<body.x.length;i+=3)bottom=Math.min(bottom,body.x[i]);
 const control=new ShapeMatchingBody(json('7-sim.json'));control.spawn(new T.Vector3(0,-1+.025-bottom,0),new T.Vector3(),0,p);body.step(1/60,p,0);control.step(1/60,p,0);
 for(let i=1;i<body.x.length;i+=3)assert.ok(body.x[i]>=.02499);
 assert.ok(Math.max(...body.v.map(Math.abs))<.05);assert.ok(body.strain()<.001);
 assert.ok(Math.max(...body.v.map((v,i)=>Math.abs(v-control.v[i])))<.0001);
});

test('pooled constraints refit to a new bent pose exactly like newly constructed bodies',()=>{
 for(let piece=0;piece<9;piece++){
  const data=json(`${piece}-sim.json`),pooled=new ShapeMatchingBody(data),home=new T.Vector3(2,3,-1);
  const nodes=new Float32Array(data.nodes.map((v:number,i:number)=>v*(i%3===1?.8:1.2)+home.getComponent(i%3)+(i%3===0?.04*data.nodes[i+1]**2:0)));
  const rest=Array.from(nodes,(v,i)=>v-home.getComponent(i%3)),fresh=new ShapeMatchingBody({...data,nodes:rest,home:home.toArray()});
  const constraints=pooled.groups.slice(),positions=pooled.x;pooled.setRestPose(nodes,home);
  assert.equal(pooled.x,positions);for(let i=0;i<constraints.length;i++)assert.equal(pooled.groups[i],constraints[i]);
  for(const b of [pooled,fresh])b.spawn(new T.Vector3(),new T.Vector3(),3,defaults);
  for(let frame=0;frame<60;frame++){pooled.step(1/60,defaults,0);fresh.step(1/60,defaults,0);}
  for(let i=0;i<pooled.x.length;i++)assert.ok(Math.abs(pooled.x[i]-fresh.x[i])<1e-8);
 }
});

test('GPU skin buffers match CPU surface and normals without uploading surface vertices every step',async()=>{
 const {Skin,SkinBuffers}=await import('../src/slime-fragments/skin.ts');
 const data=json('0-sim.json'),body=new ShapeMatchingBody(data),material=new T.MeshPhysicalNodeMaterial();
 const nodeOffset=7,tetOffset=11,gpu=new SkinBuffers(body.x.length/3+nodeOffset,body.elements.length+tetOffset,material);
 const make=(buffers?:InstanceType<typeof SkinBuffers>)=>new Skin(body,new Float32Array(bytes('0-skin-pos.bin')),new Float32Array(bytes('0-skin-normal.bin')),new Uint32Array(bytes('0-skin-index.bin')),new Uint32Array(bytes('0-bind-ids.bin')),new Float32Array(bytes('0-bind-weights.bin')),material,buffers,nodeOffset,tetOffset);
 const cpu=make(),skin=make(gpu);body.spawn(new T.Vector3(0,2,0),new T.Vector3(),2,defaults);
 skin.syncRestPose();const version=(skin.mesh.geometry.attributes.position as T.BufferAttribute).version;
 for(let i=0;i<50;i++)body.step(1/60,defaults,0);cpu.update();skin.update();
 assert.equal((skin.mesh.geometry.attributes.position as T.BufferAttribute).version,version);
 const g=skin.mesh.geometry,ids=g.attributes.fragmentNodes.array,w=g.attributes.fragmentWeights.array,tets=g.attributes.fragmentTet.array,d=gpu.displacement.array,m=gpu.normals.array;
 for(let i=0;i<skin.original.length/3;i++){
  for(let k=0;k<3;k++){let p=skin.original[i*3+k];for(let j=0;j<4;j++)p+=w[i*4+j]*d[ids[i*4+j]*4+k];assert.ok(Math.abs(p-cpu.mesh.geometry.attributes.position.array[i*3+k])<2e-6);}
  const n=new T.Vector3(...[0,1,2].map(k=>{let sum=0;for(let j=0;j<3;j++)sum+=m[tets[i]*12+k*4+j]*skin.originalNormals[i*3+j];return sum;}) as [number,number,number]).normalize();
  assert.ok(n.distanceTo(new T.Vector3().fromBufferAttribute(cpu.mesh.geometry.attributes.normal,i))<2e-6);
 }
 assert.ok(gpu.displacement.version>0);assert.ok(gpu.normals.version>0);
});
