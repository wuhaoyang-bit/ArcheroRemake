import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const doc=JSON.parse(await readFile('public/params.json','utf8'));
 Object.assign(doc.settings,{sprayFrontEnabled:1,sprayFrontCount:4,sprayFrontSizeScale:.3,sprayFrontSpeedScale:.25,sprayFrontLife:.3,sprayEnabled:0,sprayDebugDir:1});
 await page.route('**/params.json',r=>r.fulfill({json:doc}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 await page.locator('#switch-monster-training').click();
 const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().frontSpray.active>0);
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 const s=await page.evaluate(()=>window.__ARCHERO__.snapshot());
 assert.equal(s.frontSpray.active,4);assert.equal(s.spray.active,0);
 assert.equal(s.frontSpray.layers.length,2);assert.equal(s.frontSpray.params.size,s.settings.spraySize*.3);
 await page.evaluate(()=>window.__ARCHERO__.stepInspection(.06));
 await mkdir('analysis/front-spray',{recursive:true});await page.locator('#viewport').screenshot({path:'analysis/front-spray/impact.png'});
 await page.locator('#value-sprayFrontEnabled').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().frontSpray.active),0);
 assert.deepEqual(errors,[]);console.log('PASS Chrome: actual arrow hit emits 4 front droplets with rear disabled; separate live toggle; no page errors');
}finally{await browser.close();}
