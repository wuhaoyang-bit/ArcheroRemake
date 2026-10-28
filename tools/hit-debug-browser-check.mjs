import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir,readFile} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8');const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://localhost:5173');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 const snap=()=>p.evaluate(()=>window.__ARCHERO__.snapshot());await p.locator('#hit-debug-enabled').check();await p.locator('#switch-locking-training').click();
 const box=await p.locator('#viewport').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height*.6);await p.waitForFunction(()=>window.__ARCHERO__.snapshot().debug.hit.paused);
 const hit=await snap();assert.ok(hit.debug.hit.last);assert.ok(hit.debug.hit.proxyMeshes>8);assert.ok(hit.feedback.every(d=>d.age===null));
 await p.waitForTimeout(250);assert.deepEqual((await snap()).attack,hit.attack);assert.equal((await snap()).arrows.hits,hit.arrows.hits);
 const radius=p.locator('[data-setting="monsterHitRadius"][type="number"]');
 await radius.fill('0.6');await radius.dispatchEvent('change');
 await p.waitForFunction(()=>window.__ARCHERO__.snapshot().feedback.every(d=>Math.abs(d.hitRadius-.6*d.modelScale)<1e-6));
 assert.ok((await snap()).debug.hit.paused);assert.equal((await snap()).arrows.hits,hit.arrows.hits);
 await radius.fill('1.105');await radius.dispatchEvent('change');
 await p.waitForFunction(()=>window.__ARCHERO__.snapshot().feedback.every(d=>Math.abs(d.hitRadius-1.105*d.modelScale)<1e-6));
 await mkdir('analysis/hit-debug',{recursive:true});await p.locator('#viewport').screenshot({path:'analysis/hit-debug/contact.png'});
 await p.locator('#hit-debug-step').click();await p.waitForFunction(()=>window.__ARCHERO__.snapshot().feedback.some(d=>d.age>0));const stepped=await snap();assert.ok(stepped.debug.hit.paused);assert.ok(stepped.feedback.some(d=>d.age>0&&d.age<=1/60+1e-6));
 await p.locator('#reset-dummies').click();assert.equal((await snap()).debug.hit.last,null);
 await p.selectOption('#hit-debug-speed','0.1');assert.equal((await snap()).debug.hit.speed,.1);
 await p.locator('#hit-debug-enabled').uncheck();assert.ok(await p.locator('#hit-debug-toolbar').isHidden());await p.mouse.click(box.x+box.width/2,box.y+box.height*.6);await p.waitForFunction(n=>window.__ARCHERO__.snapshot().arrows.hits>n,stepped.arrows.hits);assert.equal((await snap()).debug.hit.paused,false);
 await p.setViewportSize({width:390,height:844});await p.locator('#hit-debug-enabled').evaluate(e=>{e.checked=true;e.dispatchEvent(new Event('change',{bubbles:true}));});await p.waitForTimeout(100);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);console.log('PASS hit overlays, freeze before feedback, paused simulation, 1/60 step, reset, speed, disabling, mobile toolbar; params unchanged');
}finally{await b.close();}
