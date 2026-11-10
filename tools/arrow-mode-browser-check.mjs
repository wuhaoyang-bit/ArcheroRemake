import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const doc=JSON.parse(await readFile('public/params.json','utf8'));
 Object.assign(doc.settings,{arrowPierce:1,arrowPierceGravity:2,arrowSpeed:20,arrowSpeedAfterPierce:10,arrowPiercePauseMs:20,arrowPierceEntrySpeed:10});
 await page.route('**/params.json',r=>r.fulfill({json:doc}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 assert.equal(await page.locator('#value-arrowPierceGravity').inputValue(),'2');
 for(const [key,value] of [['arrowEmbedSpeed',10],['arrowEmbedDurationMs',120],['arrowEmbedBrakePercent',50]]){
  await page.locator('#value-'+key).evaluate((el,v)=>{el.value=String(v);el.dispatchEvent(new Event('change',{bubbles:true}));},value);
 }
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().arrows.embedMotion.durationMs===120);
 assert.deepEqual(await page.evaluate(()=>window.__ARCHERO__.snapshot().arrows.embedMotion),{speed:10,durationMs:120,brakePercent:50});
 await page.locator('#switch-monster-training').click();
 const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().arrows.active.some(a=>a.lodged),null,{timeout:20000});
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 const a=await page.evaluate(()=>window.__ARCHERO__.snapshot().arrows.active.find(a=>a.lodged));
 assert.equal(a.bodyAttached,true);assert.equal(a.speed,0);assert.equal(a.gravityArmed,false);assert.ok(a.hitIds.length>0);
 assert.equal(await page.locator('#slider-arrowPierceGravity').getAttribute('max'),'2');
 await mkdir('analysis/arrow-mode',{recursive:true});await page.locator('#viewport').screenshot({path:'analysis/arrow-mode/lodged.png'});
 await page.locator('#value-arrowPierceGravity').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.evaluate(()=>window.__ARCHERO__.stepInspection(.001));
 assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().arrows.pierceGravity),false);
 assert.deepEqual(errors,[]);console.log('PASS Chrome: 0/1/2 control; mode 2 lodges real arrow at zero speed without gravity; live selector; no page errors');
}finally{await browser.close();}
