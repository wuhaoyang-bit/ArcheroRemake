import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173/spider-viewer.html');await page.waitForFunction(()=>window.__SPIDER_VIEWER__);
 const seek=t=>page.evaluate(t=>window.__SPIDER_VIEWER__.seek(t),t),snap=()=>page.evaluate(()=>window.__SPIDER_VIEWER__.snapshot());
 for(const clip of ['Idle','Run','Hitted','Dead']){await page.selectOption('#clip',clip);await seek(.1);assert.equal((await snap()).clip,clip);}
 await page.selectOption('#clip','Hitted');await page.locator('#all-on').click();await seek(.1);const a=await snap();assert.ok(a.particles.active>0);assert.ok(a.feedback[0].rim>0);assert.ok(a.feedback[0].compression>0);
 await seek(.4);await seek(.1);assert.deepEqual((await snap()).particles.particles,a.particles.particles);
 await seek(0);await page.locator('#next').click();assert.ok(Math.abs((await snap()).time-1/60)<1e-9);await page.locator('#prev').click();assert.equal((await snap()).time,0);
 await page.selectOption('#fps','30');await page.locator('#next').click();assert.ok(Math.abs((await snap()).time-1/30)<1e-9);
 await page.locator('#all-off').click();await seek(.1);let s=await snap();assert.equal(s.particles.active,0);assert.equal(s.feedback[0].rim,0);assert.equal(s.feedback[0].compression,0);
 const input=page.locator('[data-key="monsterHitSpeed"]');await input.fill('2');await input.dispatchEvent('change');assert.ok(Math.abs((await snap()).duration-.5333333611488342/2)<1e-6);
 for(const view of ['front','side','top','back','game']){await page.locator(`[data-view="${view}"]`).click();assert.ok((await snap()).camera.every(Number.isFinite));}
 await page.locator('#all-on').click();await seek(.1);await mkdir('analysis/spider-viewer',{recursive:true});await page.screenshot({path:'analysis/spider-viewer/desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'analysis/spider-viewer/mobile.png'});
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);console.log('PASS 4 clips, five views, deterministic particles, 30/60 frame stepping, feedback toggles, speed, mobile layout, no game settings writes');
}finally{await browser.close();}
