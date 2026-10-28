import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings:{hitSquashMode:1,hitSquashAmount:.3,hitReleaseTime:.5,monsterSpeed:0,monsterCount:1,hitKnockEnabled:0}}}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 await page.locator('#switch-monster-training').click();const b=await page.locator('#viewport').boundingBox();await page.mouse.click(b.x+b.width/2,b.y+b.height*.65);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().feedback.some(d=>d.age>.08&&d.age<.3));
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 const snap=()=>page.evaluate(()=>window.__ARCHERO__.snapshot());
 let d=(await snap()).feedback.find(d=>d.compression>.1);assert.ok(d);assert.ok(Math.abs(d.visualMatrix[0]-d.visualMatrix[5])>1e-4||Math.abs(d.visualMatrix[5]-d.visualMatrix[10])>1e-4);
 assert.deepEqual(d.proxyScale,[1,1,1]);
 await page.locator('#value-hitSquashMode').selectOption('0');await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 d=(await snap()).feedback.find(d=>d.compression>.1);assert.ok(Math.abs(d.visualMatrix[0]-d.visualMatrix[5])<1e-8);assert.ok(Math.abs(d.visualMatrix[5]-d.visualMatrix[10])<1e-8);
 await page.locator('#value-hitSquashMode').selectOption('1');await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 await page.locator('#viewport').screenshot({path:'/tmp/archero-directional-squash.png'});
 await page.locator('#reset-dummies').click();assert.ok((await snap()).feedback.every(d=>d.compression===0));assert.deepEqual(errors,[]);
 console.log('PASS real hit directional deformation, fixed proxies, live mode switching and reset');
}finally{await browser.close();}
