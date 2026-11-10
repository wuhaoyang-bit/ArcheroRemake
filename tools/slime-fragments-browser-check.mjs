import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const pieceCount=JSON.parse(await readFile('public/assets/slime-fragments/manifest.json','utf8')).count;
const settings=JSON.parse(await readFile('public/params.json','utf8')).settings;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const tuning={...settings,monsterCount:3,monsterSpeed:0,slimeInjectionAmount:100,slimeFragmentsEnabled:1,slimeFragmentsMaxBursts:2,slimeFragmentsLifetime:5,slimeEyeEjectSpeed:8};
 let saved;
 await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings:tuning}}));await page.route('**/__save-params',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{ok:true}});});
 await page.goto(process.env.BASE_URL||'http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:120000});
 await page.locator('#settings-category').selectOption('slime-fragments');assert.equal(await page.locator('#settings-category-slime-fragments').isVisible(),true);assert.equal(await page.locator('#value-slimeFragmentsEnabled').inputValue(),'1');
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));await page.locator('#switch-monster-training').click();await page.evaluate(()=>window.__ARCHERO__.stepInspection(0));
 let s=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(s.slimeFragments.active,0);const ids=s.feedback.map(f=>f.id);assert.equal(ids.length,3);
 await page.evaluate(ids=>ids.forEach(id=>window.__ARCHERO__.testSlimeHit(id)),ids);
 const emitted=await page.evaluate(()=>{const api=window.__ARCHERO__;for(let i=0;i<600;i++){api.stepInspection(1/120);const s=api.snapshot();if(s.slimeFragments.emitted>=3)return s;}throw Error('No fragment bursts');});
 assert.equal(emitted.slimeFragments.active,2);assert.ok(emitted.slimeFragments.allocated<=2);assert.equal(emitted.slimeFragments.bursts[0].pieces.length,pieceCount);assert.ok(emitted.slimeFragments.maxInitialError<.0001);assert.equal(emitted.slimeFragments.failed,0);
 await mkdir('analysis/slime-fragments',{recursive:true});await page.screenshot({path:'analysis/slime-fragments/assembled.png'});
 const impact=await page.evaluate(()=>{const api=window.__ARCHERO__;let peak=0,ground=false;for(let i=0;i<300;i++){api.stepInspection(1/120);const f=api.snapshot().slimeFragments;for(const b of f.bursts)for(const p of b.pieces){if(p.contact){ground=true;peak=Math.max(peak,p.strain);}}}return {peak,ground,state:api.snapshot().slimeFragments};});assert.equal(impact.ground,true);assert.ok(impact.peak>.08);assert.equal(impact.state.failed,0);assert.ok(impact.state.bursts.every(b=>b.pieces.every(p=>p.centroid[1]<15)),'initial penetration must not launch fragments into the sky');
 await page.screenshot({path:'analysis/slime-fragments/landed.png'});
 const set=async(key,value)=>{await page.locator('#value-'+key).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('change',{bubbles:true}));},value);await page.evaluate(()=>window.__ARCHERO__.stepInspection(0));};
 await set('slimeFragmentsSoftness',1.2);await page.locator('#save-settings').click();assert.equal(saved.settings.slimeFragmentsSoftness,1.2);assert.equal(saved.settings.slimeFragmentsEnabled,1);
 await set('slimeFragmentsEnabled',0);assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().slimeFragments.active),0);
 await page.locator('#reset-dummies').click();await page.evaluate(()=>window.__ARCHERO__.stepInspection(0));const disabledBefore=await page.evaluate(()=>window.__ARCHERO__.snapshot().slimeFragments.emitted);const id=await page.evaluate(()=>window.__ARCHERO__.snapshot().feedback[0].id);await page.evaluate(id=>window.__ARCHERO__.testSlimeHit(id),id);await page.evaluate(()=>{for(let i=0;i<240;i++)window.__ARCHERO__.stepInspection(1/120);});assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().slimeFragments.emitted),disabledBefore);
 await set('slimeFragmentsEnabled',1);await set('slimeFragmentsLifetime',1);await page.locator('#reset-dummies').click();await page.evaluate(()=>window.__ARCHERO__.stepInspection(0));const id2=await page.evaluate(()=>window.__ARCHERO__.snapshot().feedback[0].id);await page.evaluate(id=>window.__ARCHERO__.testSlimeHit(id),id2);await page.evaluate(()=>{for(let i=0;i<480;i++)window.__ARCHERO__.stepInspection(1/120);});assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().slimeFragments.active),0);
 await page.locator('#reset-dummies').click();assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().slimeFragments.active),0);
 assert.deepEqual(errors,[]);const report={emitted:emitted.slimeFragments,impact,errors};await writeFile('analysis/slime-fragments/report.json',JSON.stringify(report,null,2));console.log('Scheme D: sidebar, live pose, multi-burst pool, soft impact, save, toggle and expiry passed');
}finally{await browser.close();}
