import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/curve-fluid';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message);});page.on('console',m=>{if(m.type()==='error'){errors.push(m.text());console.error(m.text());}});
 await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 page.on('requestfailed',r=>console.log('requestfailed',r.url(),r.failure()));
 // Serve the unchanged 26 MB baked burst buffer locally to avoid dev-server transfer throttling.
await page.route('**/assets/lush-burst/scene.bin',r=>r.fulfill({path:'public/assets/lush-burst/scene.bin',contentType:'application/octet-stream'}));
await page.goto('http://127.0.0.1:5187/slime-burst-lab.html');
 for(let i=0;i<240;i++){const status=await page.evaluate(()=>({ready:!!window.__BURST_LAB__?.snapshot().ready,text:document.querySelector('#loading')?.textContent}));if(i%30===0)console.log(status);if(status.ready||status.text?.includes('加载失败'))break;await page.waitForTimeout(1000);}
 console.log(await page.locator('body').innerText().then(s=>s.slice(0,300)));
 assert.ok(await page.evaluate(()=>window.__BURST_LAB__?.snapshot().ready));
 await page.locator('select[data-key=puddleRenderer]').selectOption('1',{force:true});await page.waitForTimeout(100);
 const initial=await page.evaluate(()=>window.__BURST_LAB__.snapshot());
 await page.evaluate(f=>window.__BURST_LAB__.seek(f),initial.burstFrame+12);
 const forward=await page.evaluate(()=>window.__BURST_LAB__.snapshot().effects);
 await page.locator('#view').screenshot({path:`${out}/spreading.png`});
 await page.evaluate(f=>{window.__BURST_LAB__.seek(0);window.__BURST_LAB__.seek(f);},initial.burstFrame+12);
 assert.deepEqual(await page.evaluate(()=>window.__BURST_LAB__.snapshot().effects),forward);
 await page.locator('[data-mark=end]').click();
 for(const view of ['perspective','side','top']){
  await page.locator(`[data-view=${view}]`).click();await page.waitForTimeout(200);
  await page.locator('#view').screenshot({path:`${out}/${view}.png`});
 }
 const state=await page.evaluate(()=>window.__BURST_LAB__.snapshot());
 assert.equal(state.effects.ground.renderer,'curve-fluid-mesh');assert.equal(state.effects.ground.instances,1);
 assert.ok(state.effects.ground.triangles>1000);assert.equal(state.effects.puddles[0].settled,true);
 const lifecycle=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.webgpu.js');
  const {LushBurstEffects}=await import('/src/lush-burst-effects.ts');
  const {BURST_DEFAULTS}=await import('/src/slime-burst-config.ts');
  const scene=new T.Scene(),fx=await LushBurstEffects.load(scene),camera=new T.PerspectiveCamera();
  const c={...BURST_DEFAULTS,puddleRenderer:1};for(let i=0;i<6;i++)c[`burstLayer${i}Enabled`]=0;
  for(let i=0;i<140;i++){fx.emit(new T.Vector3(),new T.Vector3(i,0,0),{...c,puddleShape:i%3+1},()=>.5,new T.Color(1,0,0));fx.update(3,c,24,24,camera);}
  const capped=fx.snapshot(),meshes=scene.children.filter(o=>o.name.startsWith('CurveFluidPuddle'));
  const geometry=meshes.map(m=>{m.geometry.computeBoundingBox();return {count:m.count,height:m.geometry.boundingBox.max.y-m.geometry.boundingBox.min.y,morphs:m.geometry.morphAttributes.position.length};});
  fx.clear();const cleared=fx.snapshot();
  const finite={...c,puddleDelay:.5,puddleLifetime:1,puddleFade:.5};
  fx.emit(new T.Vector3(),new T.Vector3(),finite,()=>.5);fx.update(.2,finite,24,24,camera);const delayed=fx.snapshot();
  fx.update(1.55,finite,24,24,camera);const fading=fx.snapshot();
  fx.update(.3,finite,24,24,camera);const expired=fx.snapshot();
  fx.emit(new T.Vector3(),new T.Vector3(),{...c,puddleEnabled:0},()=>.5);fx.update(1,c,24,24,camera);const disabled=fx.snapshot();
  return {capped,geometry,cleared,delayed,fading,expired,disabled,legacy:scene.children.some(o=>o.visible&&['LushPersistentYellowPaint','PuddleContactShadow'].includes(o.name))};
 });
 assert.equal(lifecycle.capped.puddles.length,140);assert.equal(lifecycle.capped.ground.instances,128);assert.equal(lifecycle.capped.ground.batches,3);
 assert.equal(lifecycle.capped.puddles[0].x,0);assert.equal(lifecycle.legacy,false);
 assert.ok(lifecycle.geometry.every(g=>g.height>.02&&g.morphs===1));
 assert.equal(lifecycle.cleared.ground.instances,0);assert.equal(lifecycle.delayed.ground.instances,0);
 assert.ok(lifecycle.fading.puddles[0].opacity>0&&lifecycle.fading.puddles[0].opacity<1);
 assert.equal(lifecycle.expired.ground.instances,0);assert.equal(lifecycle.disabled.ground.instances,0);
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({state,lifecycle,errors},null,2));
 console.log('PASS: GPU rendering, deterministic replay, 3D geometry/morphs, 128-puddle cap, three batches, delay/fade/expiry/clear/disabled; no visible legacy floor.');
}finally{await browser.close();}
