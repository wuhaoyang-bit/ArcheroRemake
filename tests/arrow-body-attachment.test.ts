import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three/webgpu';
import {bindArrowToBody} from '../src/arrow-body-attachment.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);

test('arrow attachment follows CPU surface deformation and tilt without stretching the arrow',()=>{
 const scene=new T.Scene(),mesh=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial());scene.add(mesh);
 const position=new T.Vector3(.1,.1,.2),rotation=new T.Quaternion();
 const binding=bindArrowToBody(mesh,position,rotation,new T.Vector3(0,0,1));assert.ok(binding);
 binding.update(position,rotation);near(position.x,.1);near(position.y,.1);near(position.z,.2);
 const p=mesh.geometry.attributes.position;
 for(let i=0;i<p.count;i++)p.setXYZ(i,p.getX(i),p.getY(i)+.3,p.getX(i)*.5);
 binding.update(position,rotation);
 const normal=new T.Vector3(-.5,0,1).normalize(),anchor=new T.Vector3(.1,.4,.05);
 const expected=anchor.addScaledVector(normal,.2);
 position.toArray().forEach((v,i)=>near(v,expected.toArray()[i]));
 const direction=new T.Vector3(0,0,1).applyQuaternion(rotation);
 near(direction.dot(normal),1);
 // Repeated samples never accumulate drift.
 for(let i=0;i<100;i++)binding.update(position,rotation);
 position.toArray().forEach((v,i)=>near(v,expected.toArray()[i]));
 scene.remove(mesh);assert.equal(binding.update(position,rotation),false);
});

test('attachment follows parent animation matrices and handles a missed surface gracefully',()=>{
 const scene=new T.Scene(),group=new T.Group(),mesh=new T.Mesh(new T.PlaneGeometry(2,2),new T.MeshBasicMaterial());scene.add(group);group.add(mesh);
 const position=new T.Vector3(0,0,.2),rotation=new T.Quaternion();
 const binding=bindArrowToBody(mesh,position,rotation,new T.Vector3(0,0,1));assert.ok(binding);
 group.position.set(2,3,4);group.rotation.y=Math.PI/2;group.scale.set(2,.5,1);
 binding.update(position,rotation);near(position.x,2.2);near(position.y,3);near(position.z,4);
 near(new T.Vector3(0,0,1).applyQuaternion(rotation).x,1);
 assert.equal(bindArrowToBody(mesh,new T.Vector3(100,100,100),rotation,new T.Vector3(0,0,1)),null);
});
