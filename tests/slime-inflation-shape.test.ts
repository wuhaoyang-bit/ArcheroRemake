import test from 'node:test';
import assert from 'node:assert/strict';
import {Vector3} from 'three';
import {inflatePoint} from '../src/slime-inflation-shape.ts';
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-9);
test('all inflation comparisons begin at exactly the same geometry without mutating source',()=>{
 const p=new Vector3(.9,1,.2),original=p.clone();
 for(const mode of ['scale','bulge','super'] as const)assert.deepEqual(inflatePoint(new Vector3(),p,mode,0,.65,3,Math.sqrt(3)),p);
 assert.deepEqual(p,original);
});
test('outward sphere interpolation moves face centers more than corners and never contracts radially',()=>{
 const radius=Math.sqrt(3),center=new Vector3(1,0,0),corner=new Vector3(1,1,1);
 const moved=inflatePoint(new Vector3(),center,'bulge',1,.65,3,radius);assert.ok(moved.x>1);
 near(inflatePoint(new Vector3(),corner,'bulge',1,.65,3,radius).distanceTo(corner),0);
 for(const p of [center,corner,new Vector3(1,.5,.2)])assert.ok(inflatePoint(new Vector3(),p,'bulge',.5,.65,3,radius).length()>=p.length());
});
test('full superellipsoid target satisfies its surface equation',()=>{
 for(const n of [2,3,8]){const p=inflatePoint(new Vector3(),new Vector3(1,.5,.2),'super',1,.65,n,Math.sqrt(3));near(Math.abs(p.x)**n+Math.abs(p.y)**n+Math.abs(p.z)**n,1);}
});
