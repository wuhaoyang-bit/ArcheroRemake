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
