import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {DirectionalSpray,spawnJellySpray,DEFAULT_SPRAY_PARAMS} from '../src/directional-spray.ts';
import {HIT_DEFAULTS} from '../src/hit-feedback-config.ts';

test('two unlit billboard layers share particle budget and retain distinct debug colors',()=>{
 const scene=new T.Scene(),spray=new DirectionalSpray(scene);
 spray.applyFromSettings({...HIT_DEFAULTS,sprayMode:2,sprayCount:10,sprayDebugDir:1});
 spray.emit(new T.Vector3(0,2,0),new T.Vector3(0,0,1));
 assert.deepEqual(spray.layerSnapshot().map(w=>[w.kind,w.count,w.color]),[['jet',4,0x16cfff],['fan',6,0xff6338]]);
 const camera=new T.PerspectiveCamera();camera.rotation.set(.3,.6,0);
 spray.prepare(camera);
 for(const mesh of scene.children as T.InstancedMesh[]){
  assert.ok(mesh.material instanceof T.MeshBasicMaterial);mesh.geometry.computeBoundingBox();
  assert.equal(mesh.geometry.boundingBox!.getSize(new T.Vector3()).z,0);
  assert.equal(mesh.material.transparent,true);assert.equal(mesh.material.depthWrite,false);
  assert.ok(mesh.material.map);assert.equal(mesh.material.side,T.DoubleSide);
  assert.equal(mesh.castShadow,false);assert.equal(mesh.receiveShadow,false);
  const matrix=new T.Matrix4(),position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();
  mesh.getMatrixAt(0,matrix);matrix.decompose(position,rotation,scale);
  assert.ok(1-Math.abs(rotation.dot(camera.quaternion))<1e-6);
  assert.ok(Math.abs(scale.x-scale.y)<1e-6);
 }
 spray.setDebugDir(false);assert.ok(spray.layerSnapshot().every(w=>w.color===0xffd34d));
 spray.clear();spray.emit(new T.Vector3(),new T.Vector3(0,0,1));assert.equal(scene.children.length,2);
});

test('jet is narrow, fan is wide and shallow, both rotate with shot direction',()=>{
 for(const direction of [new T.Vector3(0,0,1),new T.Vector3(1,0,0)]){
  for(const jet of [true,false]){
   const ps=spawnJellySpray(new T.Vector3(0,2,0),direction,{...DEFAULT_SPRAY_PARAMS,count:80,spreadDeg:jet?12:55},false,jet);
   const angles=ps.map(p=>Math.acos(Math.min(1,p.dirHX*direction.x+p.dirHZ*direction.z))*180/Math.PI);
   assert.ok(Math.max(...angles)<(jet?12.01:55.01));
   if(!jet){assert.ok(Math.max(...angles)>40);assert.ok(ps.every(p=>Math.abs(p.vy0)<p.speedH0*.4));}
   assert.ok(new Set(ps.map(p=>p.size0)).size>10);
  }
 }
});

test('single layers and lifetime cleanup do not leave an extra layer visible',()=>{
 const spray=new DirectionalSpray(new T.Scene());
 for(const mode of [0,1]){
  spray.clear();spray.applyFromSettings({...HIT_DEFAULTS,sprayMode:mode,sprayCount:8});
  spray.emit(new T.Vector3(0,2,0),new T.Vector3(0,0,1));
  assert.equal(spray.layerSnapshot().length,1);assert.equal(spray.activeCount(),8);
  spray.update(6);assert.equal(spray.activeCount(),0);
 }
});

test('front droplets are subtle, lateral, immediate and independent of rear settings',()=>{
 const scene=new T.Scene(),rear=new DirectionalSpray(scene),front=rear.createSibling();
 rear.applyFromSettings({...HIT_DEFAULTS,sprayMode:1,sprayCount:20});
 const point=new T.Vector3(2,2,3),incoming=new T.Vector3(0,0,1);
 front.emitFront(point,incoming,{...HIT_DEFAULTS,sprayEnabled:0,sprayDelay:2});
 assert.equal(front.activeCount(),4);assert.equal(rear.activeCount(),0);assert.equal(rear.params.count,20);
 assert.equal(front.params.size,HIT_DEFAULTS.spraySize*.3);
 assert.equal(front.params.speed,HIT_DEFAULTS.spraySpeed*.25);
 assert.equal(front.params.life,.3);assert.deepEqual(point.toArray(),[2,2,3]);
 front.update(.05);front.prepare(new T.PerspectiveCamera());
 const positions:T.Vector3[]=[];
 for(const mesh of scene.children as T.InstancedMesh[])for(let i=0;i<mesh.count;i++){
  const m=new T.Matrix4();mesh.getMatrixAt(i,m);positions.push(new T.Vector3().setFromMatrixPosition(m));
 }
 assert.ok(positions.some(p=>p.x<point.x));assert.ok(positions.some(p=>p.x>point.x));
 assert.ok(positions.every(p=>p.z<point.z));
 front.update(1);assert.equal(front.activeCount(),0);
 front.emitFront(point,incoming,{...HIT_DEFAULTS,sprayFrontEnabled:0});assert.equal(front.activeCount(),0);
});

test('delayed front droplets resolve the latest target position and facing at emission',()=>{
 const spray=new DirectionalSpray(new T.Scene());
 let position=new T.Vector3(0,2,0),normal=new T.Vector3(0,0,1),calls=0;
 const resolve=(_id:string,out:T.Vector3,dir:T.Vector3)=>{calls++;out.copy(position);dir.copy(normal);return true;};
 const settings={...HIT_DEFAULTS,sprayDelay:.2};spray.scheduleFront('moving',settings,resolve);
 assert.equal(calls,0);spray.update(.1,resolve);assert.equal(spray.activeCount(),0);
 position=new T.Vector3(5,2,8);normal=new T.Vector3(1,0,0);settings.sprayFrontCount=9;
 spray.update(.1,resolve);assert.equal(calls,1);assert.equal(spray.activeCount(),4);
 assert.deepEqual(spray.lastEmit!.origin,[5.04,2,8]);
 assert.equal(spray.sampleRemain()!.u,0);
 const emitted=[...spray.lastEmit!.origin];position.x=99;spray.update(.01,resolve);
 assert.deepEqual(spray.lastEmit!.origin,emitted);
 spray.clear();spray.scheduleFront('gone',settings,resolve);spray.update(.3,()=>false);assert.equal(spray.activeCount(),0);
 spray.scheduleFront('reset',settings,resolve);spray.clear();spray.update(.3,resolve);assert.equal(spray.activeCount(),0);
});

test('delayed sprays retain independent hit anchors instead of the global rear resolver',()=>{
 const spray=new DirectionalSpray(new T.Scene()),settings={...HIT_DEFAULTS,sprayDelay:.1,sprayHeight:0,sprayMode:2};
 const point=new T.Vector3(1,2,3),reverse=new T.Vector3(0,0,-1);
 spray.schedule('one',settings,(_id,out,dir)=>{out.copy(point);dir.copy(reverse);return true;});
 spray.schedule('two',{...settings,sprayDelay:.2},(_id,out,dir)=>{out.set(9,2,3);dir.set(-1,0,0);return true;});
 point.x=4;
 const rear=(_id:string,out:T.Vector3,dir:T.Vector3)=>{out.set(999,0,0);dir.set(0,0,1);return true;};
 spray.update(.1,rear);assert.deepEqual(spray.lastEmit,{origin:[4,2,3],dir:[0,0,-1]});
 spray.update(.1,rear);assert.deepEqual(spray.lastEmit,{origin:[9,2,3],dir:[-1,0,0]});
 assert.equal(spray.layerSnapshot().length,4);
});
