import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/puddle-shapes';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];let saved;
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 await page.route('**/params.json',r=>r.fulfill({json:saved??{version:1,settings:{puddleShape:2,puddleRenderer:1,moveSpeed:13}}}));
 await page.route('**/__save-params',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
 await page.route('**/assets/lush-burst/scene.bin',r=>r.fulfill({path:'public/assets/lush-burst/scene.bin',contentType:'application/octet-stream'}));
 await page.goto('http://127.0.0.1:5187/puddle-shapes.html');await page.waitForFunction(()=>window.__PUDDLE_SHAPES__?.snapshot().ready,{},{timeout:120000});
 const snapshot=()=>page.evaluate(()=>window.__PUDDLE_SHAPES__.snapshot());
 assert.equal((await snapshot()).ground.instances,3);
 await page.screenshot({path:`${out}/overview.png`});
 for(const i of [1,2,3]){await page.locator(`[data-inspect="${i}"]`).click();assert.equal((await snapshot()).ground.instances,1);await page.locator('[data-camera=top]').click();await page.waitForTimeout(100);await page.locator('#view').screenshot({path:`${out}/shape-${i}.png`});}
 await page.locator('#wireframe').check();await page.locator('[data-camera=side]').click();await page.waitForTimeout(150);await page.locator('#view').screenshot({path:`${out}/wireframe.png`});await page.locator('#wireframe').uncheck();
 for(const i of [1,2,3])await page.locator(`[data-allow="${i}"]`).uncheck();assert.equal(await page.locator('#save').isDisabled(),true);
 await page.locator('[data-allow="2"]').check();assert.equal((await snapshot()).masks[1],2);
 await page.locator('#mode').selectOption('0');assert.equal((await snapshot()).masks[0],7);await page.locator('[data-allow="2"]').uncheck();assert.equal((await snapshot()).masks[0],5);
 await Promise.all([page.waitForResponse(r=>r.url().endsWith('/__save-params')),page.locator('#save').click()]);
 assert.equal(saved.settings.puddleCurveShapes,2);assert.equal(saved.settings.puddleCanvasShapes,5);assert.equal(saved.settings.puddleShape,0);assert.equal(saved.settings.moveSpeed,13);assert.equal(saved.settings.puddleRenderer,1);
 await page.reload();await page.waitForFunction(()=>window.__PUDDLE_SHAPES__?.snapshot().ready,{},{timeout:120000});assert.deepEqual((await snapshot()).masks,[5,2]);
 // Verify the actual game's spawn path consumes the saved candidate pool.
 const samples=await page.evaluate(async()=>{
  const {LushBurstEffects}=await import('/src/lush-burst-effects.ts');const source=await(await fetch('/src/lush-burst-effects.ts')).text();const T=await import(source.match(/import \* as T from ["']([^"']+)["']/)[1]);
  const {loadSettings}=await import('/src/settings-store.ts');const c=await loadSettings();for(let i=0;i<6;i++)c[`burstLayer${i}Enabled`]=0;
  const fx=await LushBurstEffects.load(new T.Scene()),camera=new T.PerspectiveCamera(),samples=[];
  for(const mode of [0,1]){fx.clear();const config={...c,puddleRenderer:mode};fx.update(0,config,24,24,camera);for(let i=0;i<30;i++){fx.emit(new T.Vector3(),new T.Vector3(),config,()=>i/30);fx.update(4,config,24,24,camera);}samples.push(fx.snapshot().puddles.map(p=>p.shape));}return samples;
 });
 assert.ok(samples[0].every(i=>i===0||i===2));assert.deepEqual([...new Set(samples[0])],[0,2]);assert.ok(samples[1].every(i=>i===1));
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:`${out}/mobile.png`});
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({saved,samples,errors},null,2));console.log('PASS: 3D previews, cameras, wireframe, empty pool guard, independent selection, merged save/reload, actual spawn pools and mobile layout.');
}finally{await browser.close();}
