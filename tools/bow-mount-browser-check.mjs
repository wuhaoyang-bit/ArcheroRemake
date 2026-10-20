import { chromium } from '@playwright/test';
import { writeFile,mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const out='analysis/bow-attachment';await mkdir(out,{recursive:true});
const errors=[];
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
const p=await browser.newPage({viewport:{width:900,height:800}});p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.BASE_URL||'http://localhost:5173');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
const result=await p.evaluate(async()=>{
 const source=await(await fetch('/src/character.ts')).text();const THREE=await import(source.match(/import \* as THREE from "([^"]+)"/)[1]);const {loadCharacter}=await import('/src/character.ts');const c=await loadCharacter();const scene=new THREE.Scene();scene.background=new THREE.Color('#ded6c3');scene.add(c.model);scene.add(new THREE.HemisphereLight(0xffffff,0x999999,2));const light=new THREE.DirectionalLight(0xffffff,2);light.position.set(-3,7,6);scene.add(light);
 const cam=new THREE.OrthographicCamera(-2.3,2.3,2.05,-2.05,.1,100);cam.position.set(0,2.5,8);cam.lookAt(0,1.6,0);const r=new THREE.WebGPURenderer({antialias:true});await r.init();r.setSize(900,800);r.domElement.id='bow-mount-preview';r.domElement.style.cssText='position:fixed;inset:0;z-index:99999';document.body.append(r.domElement);
 window.__mountPose=async(phase,t,overhead=false)=>{c.idle.setEffectiveWeight(phase==='Idle'?1:0);c.run.setEffectiveWeight(phase==='Run'?1:0);c.attack.setEffectiveWeight(phase==='Attack'?1:0).play();const action=phase==='Idle'?c.idle:phase==='Run'?c.run:c.attack;action.time=t;c.mixer.update(0);c.model.updateMatrixWorld(true);cam.position.set(0,overhead?8:2.5,8);cam.lookAt(0,1.6,0);r.render(scene,cam);const hand=c.model.getObjectByName('left'), root=c.model.getObjectByName('WeaponHand1001_root');const originError=hand.getWorldPosition(new THREE.Vector3()).distanceTo(root.getWorldPosition(new THREE.Vector3()));return {originError,left:c.model.getObjectByName('left').matrixWorld.toArray(),grip:c.model.getObjectByName('RedBowGrip').matrix.toArray(),bow:c.model.getObjectByName('WeaponHand1001_gong').matrixWorld.toArray()};};return await window.__mountPose('Idle',0);
});
const inwardFlip=[-1,0,0,0,0,-1,0,0,0,0,1,0,0,0,0,1];
assert.ok(result.grip.every((v,i)=>Math.abs(v-inwardFlip[i])<1e-7),'Bow must flip around its long axis without moving the grip');
assert.ok(result.originError<1e-6,'Weapon root must sit on the original mount');
const samples=[{phase:'Idle',time:0,...result}];
await p.locator('#bow-mount-preview').screenshot({path:`${out}/idle-front.png`});
for(const [name,phase,time,overhead] of [['idle-top','Idle',0,true],['run','Run',.2,false],['draw','Attack',.5,false],['release','Attack',.55,false]]){const sample=await p.evaluate(([phase,t,top])=>window.__mountPose(phase,t,top),[phase,time,overhead]);assert.ok(sample.originError<1e-6);samples.push({phase,time,...sample});await p.locator('#bow-mount-preview').screenshot({path:`${out}/${name}.png`});}
await writeFile(`${out}/browser-matrices.json`,JSON.stringify({samples,errors},null,2));
assert.deepEqual(errors,[]);console.log('PASS bow mount: inward-facing half-turn, coincident origins through Idle/Run/Attack, front/top renders');
}finally{await browser.close();}
