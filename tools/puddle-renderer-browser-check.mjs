import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/puddle-renderer-switch';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];let saved;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 await page.route('**/assets/lush-burst/scene.bin',r=>r.fulfill({path:'public/assets/lush-burst/scene.bin',contentType:'application/octet-stream'}));
 await page.route('**/params.json',async r=>{const response=await r.fetch();const json=await response.json();json.settings.puddleRenderer=0;await r.fulfill({json});});
 await page.route('**/__save-params',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
 await page.goto('http://127.0.0.1:5187/slime-burst-lab.html');
 await page.waitForFunction(()=>window.__BURST_LAB__?.snapshot().ready,{},{timeout:180000});
 await page.locator('[data-mark=end]').click();
 const snap=()=>page.evaluate(()=>window.__BURST_LAB__.snapshot());
 const old=await snap();assert.equal(old.settings.puddleRenderer,0);assert.equal(old.effects.ground.renderer,'canvas-puddle');
 await page.locator('#view').screenshot({path:`${out}/old.png`});
 const selector=page.locator('select[data-key=puddleRenderer]');
 await selector.selectOption('1',{force:true});await page.waitForFunction(()=>window.__BURST_LAB__.snapshot().effects.ground.renderer==='curve-fluid-mesh');
 const mesh=await snap();assert.deepEqual(mesh.effects.puddles,old.effects.puddles);assert.equal(mesh.frame,old.frame);
 await page.locator('#view').screenshot({path:`${out}/mesh.png`});
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/__save-params')),page.locator('#save').click()]);assert.equal(saved.settings.puddleRenderer,1);
 await selector.selectOption('0',{force:true});await page.waitForFunction(()=>window.__BURST_LAB__.snapshot().effects.ground.renderer==='canvas-puddle');
 const restored=await snap();assert.deepEqual(restored.effects.puddles,old.effects.puddles);
 await page.locator('#view').screenshot({path:`${out}/restored.png`});
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/__save-params')),page.locator('#save').click()]);assert.equal(saved.settings.puddleRenderer,0);
 // Check actual scene visibility when switching live, without rebuilding the effect.
 const live=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.webgpu.js');
  const {LushBurstEffects}=await import('/src/lush-burst-effects.ts');
  const c={...window.__BURST_LAB__.snapshot().settings},scene=new T.Scene(),camera=new T.PerspectiveCamera(),fx=await LushBurstEffects.load(scene);
  fx.emit(new T.Vector3(),new T.Vector3(),c,()=>.5);fx.update(4,c,24,24,camera);
  const inspect=()=>({state:fx.snapshot(),plane:scene.getObjectByName('LushPersistentYellowPaint').visible,mesh:scene.children.filter(o=>o.name.startsWith('CurveFluidPuddle')).some(o=>o.visible)});
  const a=inspect();fx.update(0,{...c,puddleRenderer:1},24,24,camera);const b=inspect();fx.update(0,c,24,24,camera);const d=inspect();fx.clear();const cleared=inspect();return {a,b,d,cleared};
 });
 assert.equal(live.a.plane,true);assert.equal(live.a.mesh,false);assert.equal(live.b.plane,false);assert.equal(live.b.mesh,true);assert.equal(live.d.plane,true);assert.equal(live.d.mesh,false);
 assert.deepEqual(live.a.state.puddles,live.b.state.puddles);assert.deepEqual(live.a.state.puddles,live.d.state.puddles);assert.equal(live.cleared.plane,false);assert.equal(live.cleared.mesh,false);
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({old,mesh,restored,live,errors},null,2));
 console.log('PASS: default old renderer, both-way switching, preserved residues/time, mutually exclusive visibility, save values, clear, no browser errors.');
}finally{await browser.close();}
