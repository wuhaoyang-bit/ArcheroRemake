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
const pieceCount=json('manifest.json').count;
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
  for(let i=0;i<pieceCount;i++){const data=json(`${i}-sim.json`),original=new Float32Array(bytes(`${i}-skin-pos.bin`)),binding={ids:new Uint16Array(bytes(`${i}-surface-pose-ids.bin`)),weights:new Float32Array(bytes(`${i}-surface-pose-weights.bin`))},p=mapper.positions(binding);
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
 for(let piece=0;piece<pieceCount;piece++){
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

test('full ground grip removes tangential contact slip while retaining physical rebound',()=>{
 for(const dt of [1/60,1/120]){
  const body=new ShapeMatchingBody(json('0-sim.json')),p={...defaults,friction:1,bounce:.5,spin:0,stretch:0};
  body.spawn(new T.Vector3(0,3,0),new T.Vector3(),0,p);
  for(let i=0;i<body.v.length;i+=3){body.v[i]=12;body.v[i+1]=-5;body.v[i+2]=-4;}
  let contacts=0,upwardSpeed=0,peakStrain=0;
  for(let frame=0;frame<Math.round(2/dt);frame++){
   body.step(dt,p,0);assert.ok(body.x.every(Number.isFinite));
   if(body.contact){let vy=0;for(let i=1;i<body.v.length;i+=3)vy+=body.v[i];upwardSpeed=Math.max(upwardSpeed,vy/body.inv.length);peakStrain=Math.max(peakStrain,body.strain());}
   for(let i=0;i<body.inv.length;i++){const j=i*3;if(body.touching[i]&&body.x[j+1]<=.025001){contacts++;assert.equal(body.x[j],body.prev[j]);assert.equal(body.x[j+2],body.prev[j+2]);assert.equal(Math.abs(body.v[j]),0);assert.equal(Math.abs(body.v[j+2]),0);}}
  }
  assert.ok(contacts>10);assert.ok(upwardSpeed>1,'contact must release for upward bounce');assert.ok(peakStrain>.08,'soft deformation must remain active');
 }
});

test('ground grip does not brake airborne fragments and remains adjustable below full grip',()=>{
 const a=new ShapeMatchingBody(json('0-sim.json')),b=new ShapeMatchingBody(json('0-sim.json'));
 for(const body of [a,b])body.spawn(new T.Vector3(0,10,0),new T.Vector3(),5,defaults);
 for(let frame=0;frame<12;frame++){a.step(1/60,{...defaults,friction:1},0);b.step(1/60,{...defaults,friction:.45},0);}
 assert.equal(a.contact,false);assert.deepEqual(a.x,b.x);assert.deepEqual(a.v,b.v);
 assert.equal(parseSettingsDocument({version:1,settings:{}}).slimeFragmentsFriction,1);
});

test('cut material follows original face labels, including cut rims at the outer shell',async()=>{
 const {fragmentInteriorMask}=await import('../src/slime-fragments/material.ts');let cutRimVertices=0;
 for(let piece=0;piece<pieceCount;piece++){
  const data=json(`${piece}-sim.json`),index=new Uint32Array(bytes(`${piece}-skin-index.bin`)),position=new Float32Array(bytes(`${piece}-skin-pos.bin`)),weights=new Float32Array(bytes(`${piece}-surface-pose-weights.bin`));
  const mask=fragmentInteriorMask(position.length/3,index,data.surfaceGroups);
  for(const group of data.surfaceGroups)for(let i=group.start;i<group.start+group.count;i++){
   const vertex=index[i],inside=group.materialIndex===1;assert.equal(mask[vertex],inside?1:0);
   if(inside&&1-weights[vertex*3]-weights[vertex*3+1]-weights[vertex*3+2]<.002)cutRimVertices++;
  }
 }
 assert.ok(cutRimVertices>100,'depth-only classification would miss these real cut vertices');
});

test('solid gel absorbs landing energy while retaining compression and volume',()=>{
 for(let piece=0;piece<pieceCount;piece++){
  const data=json(`${piece}-sim.json`);let bottom=Infinity;for(let i=1;i<data.nodes.length;i+=3)bottom=Math.min(bottom,data.nodes[i]);
  const run=(heavy:boolean)=>{
   const body=new ShapeMatchingBody(data),p={...defaults,gravity:30,spin:0,stretch:0,...(heavy?{}:{volume:.00001,impactDamping:0,settleDamping:0,bounce:.02})};
   body.spawn(new T.Vector3(0,3-data.home[1]-bottom,0),new T.Vector3(),0,p);
   let clearance=0,strain=0,lateMotion=0;
   for(let i=0;i<240;i++){
    body.step(1/60,p,0);assert.ok(body.x.every(Number.isFinite));
    if(body.contact){let floor=Infinity;for(let j=1;j<body.x.length;j+=3)floor=Math.min(floor,body.x[j]);clearance=Math.max(clearance,floor-.025);strain=Math.max(strain,body.strain());}
    if(i>180)for(const v of body.v)lateMotion+=v*v/body.v.length;
   }
   return {clearance,strain,lateMotion,volume:body.snapshot().volumeRatio};
  };
  const old=run(false),gel=run(true);
  assert.ok(gel.clearance<old.clearance*.5,`piece ${piece}: lower whole-body rebound`);
  assert.ok(gel.strain>.1&&gel.strain>old.strain*.5,`piece ${piece}: compression remains visible`);
  assert.ok(gel.lateMotion<old.lateMotion*.2,`piece ${piece}: residual wobble settles`);
  assert.ok(Math.abs(gel.volume-1)<.08,`piece ${piece}: retains volume`);
 }
});

test('impact damping leaves first flight unchanged and its state resets when pooled',()=>{
 const data=json('0-sim.json'),a=new ShapeMatchingBody(data),b=new ShapeMatchingBody(data),without={...defaults,impactDamping:0,settleDamping:0};
 for(const body of [a,b])body.spawn(new T.Vector3(0,4,0),new T.Vector3(),0,defaults);
 for(let i=0;i<15;i++){a.step(1/60,defaults,0);b.step(1/60,without,0);}
 assert.equal(a.contact,false);assert.deepEqual(a.x,b.x);assert.deepEqual(a.v,b.v);
 for(let i=0;i<100;i++)a.step(1/60,defaults,0);assert.equal(a.contact,true);
 for(const body of [a,b])body.spawn(new T.Vector3(0,4,0),new T.Vector3(),0,defaults);
 for(let i=0;i<15;i++){a.step(1/60,defaults,0);b.step(1/60,defaults,0);}
 assert.deepEqual(a.x,b.x);assert.deepEqual(a.v,b.v);
 const settings=parseSettingsDocument({version:1,settings:{}});assert.equal(settings.slimeFragmentsImpactDamping,18);assert.equal(settings.slimeFragmentsSettleDamping,5);assert.equal(settings.slimeFragmentsBounce,0);
});

test('denser fracture has mixed piece sizes and preserves the original body volume',()=>{
 const manifest=json('manifest.json');assert.equal(pieceCount,20);
 const volumes:number[]=[];let nodes=0,triangles=0;
 for(let piece=0;piece<pieceCount;piece++){
  const data=json(`${piece}-sim.json`),p=new Float32Array(bytes(`${piece}-skin-pos.bin`)),index=new Uint32Array(bytes(`${piece}-skin-index.bin`));nodes+=data.nodes.length/3;triangles+=index.length/3;
  let volume=0;const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
  for(let i=0;i<index.length;i+=3){a.fromArray(p,index[i]*3);b.fromArray(p,index[i+1]*3);c.fromArray(p,index[i+2]*3);volume+=a.dot(b.cross(c))/6;}
  assert.ok(volume>0);volumes.push(volume);
 }
 assert.ok(Math.max(...volumes)/Math.min(...volumes)>8,'pieces should visibly differ in volume');
 assert.ok(Math.abs(volumes.reduce((a,b)=>a+b,0)/manifest.referenceVolume-1)<.001,'cuts preserve total volume');
 assert.ok(nodes<=1300&&triangles<145000,'more fragments stay within the simulation/render budget');
 assert.equal(nodes,manifest.totalNodes);assert.equal(triangles,manifest.totalTriangles);
});
