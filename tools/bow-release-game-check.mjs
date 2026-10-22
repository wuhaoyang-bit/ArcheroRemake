import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {readFile,mkdir} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8'),settings={...JSON.parse(original).settings,arrowsPerAttack:3,arrowFireInterval:.03,attackSpeed:1,arrowSpeed:30};
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings}}));await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);await page.locator('#switch-locking-training').click();
 const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.6);
 await page.waitForFunction(()=>{const a=window.__ARCHERO__,s=a.snapshot();if(s.bowRelease.active.length>=3){a.pauseForInspection(true);return true}return false});
 const s=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(s.bowRelease.emitted,s.arrows.fired);assert.ok(s.bowRelease.allocated>=3);assert.equal(s.bowRelease.defaults.spikeOpacity,.15);
 await mkdir('analysis/bow-release',{recursive:true});await page.locator('#viewport').screenshot({path:'analysis/bow-release/in-game.png'});
 const lab=await b.newPage();lab.on('pageerror',e=>errors.push(e.message));await lab.route('**/params.json',r=>r.fulfill({json:{version:1,settings}}));await lab.goto('http://localhost:5173/bow-release-lab.html');await lab.waitForFunction(()=>window.__BOW_RELEASE_LAB__);
 const close=(x,y)=>{if(typeof x==='number')assert.ok(Math.abs(x-y)<1e-8,`${x} != ${y}`);else if(Array.isArray(x)){assert.equal(x.length,y.length);x.forEach((v,i)=>close(v,y[i]));}else if(x&&typeof x==='object'){assert.deepEqual(Object.keys(x),Object.keys(y));for(const k of Object.keys(x))close(x[k],y[k]);}else assert.equal(x,y)};
 for(const e of s.bowRelease.active){const reference=await lab.evaluate(age=>{const a=window.__BOW_RELEASE_LAB__;a.seek(a.snapshot().release+age);return a.snapshot().effect},e.age);for(const key of ['ringVisible','ringScale','ringRotation','ringFade','spikeFade','width','gain','spikes'])close(e[key],reference[key]);}
 const allocation=s.bowRelease.allocated;await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(false));await page.waitForFunction(n=>window.__ARCHERO__.snapshot().bowRelease.emitted>n+5,s.bowRelease.emitted);const later=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(later.bowRelease.allocated,allocation);assert.equal(later.bowRelease.emitted,later.arrows.fired);
 await page.locator('#reset-dummies').click();const reset=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(reset.bowRelease.active.length,0);
 await page.locator('#switch-monster-training').click();
 const box2=await page.locator('#viewport').boundingBox();await page.mouse.click(box2.x+box2.width*.5,box2.y+box2.height*.6);await page.waitForFunction(n=>window.__ARCHERO__.snapshot().bowRelease.emitted>n,reset.bowRelease.emitted);
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);console.log('PASS real shots, 3-arrow overlapping bursts, lab/game same-age geometry and uniforms, pool reuse, reset cleanup, monster arena, original settings preserved');
}finally{await b.close()}
