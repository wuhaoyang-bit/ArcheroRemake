import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8');await mkdir('analysis/hit-layers',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.goto('http://localhost:5173/hit-layers-preview.html');await page.waitForFunction(()=>window.__HIT_LAYERS__?.snapshot().ready,null,{timeout:60000});
const snap=()=>page.evaluate(()=>window.__HIT_LAYERS__.snapshot());
await page.locator('#next').click();assert.equal((await snap()).tick,2);await page.locator('#prev').click();assert.equal((await snap()).tick,0);
const frame=Math.ceil((Math.max((await snap()).settings.sprayDelay,(await snap()).settings.hitSplashBackDelay)+.12)*60);
await page.evaluate(f=>window.__HIT_LAYERS__.seek(f),frame);
const state=await snap();assert.ok(state.jet.length&&state.fan.length);assert.ok(state.sheet.some(w=>w.sheets>0));
await page.locator('#stage').screenshot({path:'analysis/hit-layers/all.png'});
const first=await page.locator('#stage canvas').screenshot();
await page.evaluate(()=>window.__HIT_LAYERS__.seek(0));await page.evaluate(f=>window.__HIT_LAYERS__.seek(f),frame);
assert.deepEqual((await snap()).sheet,state.sheet);const second=await page.locator('#stage canvas').screenshot();assert.ok(first.equals(second),'same-seed rewind must reproduce pixels');
await page.locator('[data-solo=jet]').click();assert.deepEqual((await snap()).visible,{jet:true,fan:false,sheet:false});await page.locator('#all').click();
await page.locator('[data-number=hitSplashBackScale]').fill('.6');await page.locator('[data-number=hitSplashBackScale]').dispatchEvent('input');assert.equal((await snap()).settings.hitSplashBackScale,.6);
await page.locator('#play').click();await page.waitForFunction(t=>window.__HIT_LAYERS__.snapshot().tick>t,state.tick);await page.locator('#play').click();const frozen=(await snap()).tick;await page.waitForTimeout(100);assert.equal((await snap()).tick,frozen);
await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:'analysis/hit-layers/mobile.png'});
assert.equal(await readFile('public/params.json','utf8'),original);assert.deepEqual(errors,[]);console.log('PASS preview: 3 layers, exact rewind pixels, frame stepping, pause, solo, live tuning, mobile, game params unchanged');
}finally{await browser.close();}
