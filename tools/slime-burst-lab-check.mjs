import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/slime-burst-lab';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[];
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
let saved;await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings:{moveSpeed:13}}}));await page.route('**/__save-params',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
await page.goto('http://localhost:5173/slime-burst-lab.html');await page.waitForFunction(()=>window.__BURST_LAB__?.snapshot().ready,{},{timeout:60000});
const snap=()=>page.evaluate(()=>window.__BURST_LAB__.snapshot());const initial=await snap();assert.equal(initial.frame,0);assert.equal(initial.feedback[0].inflation.amount,100);assert.equal(initial.feedback[0].burst.phase,'feedback');
const delay=page.locator('input[type=number][data-key=burstFeedbackDelay]');await delay.fill('-.5');await delay.dispatchEvent('input');await page.waitForFunction(b=>window.__BURST_LAB__.snapshot().windFrame<b,initial.windFrame);const early=await snap();assert.ok(Math.abs(initial.windFrame-early.windFrame-60)<=1);await page.locator('[data-mark="wind"]').click();assert.equal((await snap()).feedback[0].burst.phase,'winding');assert.ok((await snap()).feedback[0].age<2);await delay.fill('0');await delay.dispatchEvent('input');await page.waitForFunction(b=>window.__BURST_LAB__.snapshot().windFrame===b,initial.windFrame);
await page.locator('[data-mark="wind"]').click();assert.equal((await snap()).feedback[0].burst.phase,'winding');await page.locator('[data-mark="before"]').click();assert.equal((await snap()).feedback[0].burst.phase,'winding');await page.locator('#view').screenshot({path:out+'/before.png'});
await page.locator('#next').click();const disappearance=await snap();assert.equal(disappearance.feedback[0].burst.phase,'gone');assert.equal(disappearance.frame,initial.burstFrame);
const at=initial.burstFrame+15;await page.evaluate(n=>window.__BURST_LAB__.seek(n),at);const forward=await snap();await page.locator('#view').screenshot({path:out+'/burst.png'});
await page.evaluate(n=>window.__BURST_LAB__.seek(n),at-10);await page.evaluate(n=>window.__BURST_LAB__.seek(n),at);const reverse=await snap();assert.deepEqual(reverse.effects,forward.effects);assert.deepEqual(reverse.feedback,forward.feedback);
await page.locator('#prev').click();assert.equal((await snap()).frame,at-1);await page.locator('#fps').selectOption('60');await page.locator('#next').click();assert.equal((await snap()).frame,at+1);
const field=page.locator('input[type=number][data-key=burstDuration]');await field.fill('2');await field.dispatchEvent('input');await page.waitForFunction(()=>window.__BURST_LAB__.snapshot().settings.burstDuration===2);await page.waitForTimeout(200);assert.equal((await snap()).frame,at+1);assert.ok((await snap()).burstFrame>initial.burstFrame);
await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已保存'));assert.equal(saved.settings.burstDuration,2);assert.equal(saved.settings.moveSpeed,13);
await page.locator('[data-mark="end"]').click();assert.ok((await snap()).effects.puddles[0].settled);await page.screenshot({path:out+'/desktop.png'});
await page.locator('#restart').click();await page.waitForTimeout(200);await page.locator('#play').click();assert.equal((await snap()).playing,false);assert.ok((await snap()).frame>0);
await page.setViewportSize({width:390,height:844});await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:out+'/mobile.png'});
assert.deepEqual(errors,[]);await writeFile(out+'/results.json',JSON.stringify({initial,forward,reverse,errors},null,2));console.log('Lab: stage boundaries, backward replay, step sizes, tuning, merged save, playback and mobile layout passed');
}finally{await browser.close();}
