import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 const report=await page.evaluate(async()=>{
  const source=await(await fetch('/src/training-monster.ts')).text(),T=await import(source.match(/from "([^"]*three_webgpu[^" ]*)"/)[1]);
  const {TrainingMonsterFactory,monsterInstance}=await import('/src/training-monster.ts'),factory=await TrainingMonsterFactory.load(),a=factory.create(),b=factory.create();
  const ai=monsterInstance(a),bi=monsterInstance(b);let am,bm;a.traverse(o=>{if(o.isSkinnedMesh)am=o;});b.traverse(o=>{if(o.isSkinnedMesh)bm=o;});
  const sample=root=>{root.updateMatrixWorld(true);let points=[];root.traverse(o=>{if(o.isSkinnedMesh)for(let i=0;i<o.geometry.attributes.position.count;i++){const p=new T.Vector3();o.getVertexPosition(i,p).applyMatrix4(o.matrixWorld);points.push(...p.toArray());}});return points;};
  const base=sample(a),other=sample(b),motion={};const delta=points=>Math.max(...points.map((v,i)=>Math.abs(v-base[i])));
  ai.animation.update(.3,false);motion.Idle=delta(sample(a));ai.animation.update(.3,true);motion.Run=delta(sample(a));ai.animation.hit();ai.animation.update(.3,true);motion.Hitted=delta(sample(a));
  const independent=sample(b).every((v,i)=>v===other[i]);ai.animation.update(1,true);const resumed=ai.animation.snapshot().state;
  ai.animation.reset();const reset=ai.animation.snapshot();return {independent,skeletonsSeparate:am.skeleton!==bm.skeleton,bonesSeparate:am.skeleton.bones[0]!==bm.skeleton.bones[0],motion,resumed,reset,texture:!!am.material.map,aimHeight:ai.aimHeight,proxyMeshes:ai.proxy.children.length};
 });
 assert.ok(report.independent&&report.skeletonsSeparate&&report.bonesSeparate&&report.texture);for(const d of Object.values(report.motion))assert.ok(d>1e-4);assert.equal(report.resumed,'Run');assert.equal(report.reset.state,'Idle');assert.ok(report.aimHeight>0);
 await page.locator('#switch-locking-training').click();let s=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(s.feedback.length,8);assert.ok(s.feedback.every(d=>d.model==='3043_01'&&d.animation.state==='Idle'));
 await page.locator('#switch-monster-training').click();await page.waitForFunction(()=>window.__ARCHERO__.snapshot().feedback.every(d=>d.animation.state==='Run'));
 const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);await page.waitForFunction(()=>window.__ARCHERO__.snapshot().feedback.some(d=>d.animation.state==='Hitted'));
 await page.locator('#reset-dummies').click();assert.equal((await page.evaluate(()=>window.__ARCHERO__.snapshot())).particles.active,0);assert.deepEqual(errors,[]);
 console.log('PASS real GLB: textures, independent skeletons, Idle/Run/Hitted mesh deformation, recovery/reset, eight stationary and two pursuing monsters',report);
}finally{await browser.close();}
