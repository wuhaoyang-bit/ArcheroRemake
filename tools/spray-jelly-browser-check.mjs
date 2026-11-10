import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const document=JSON.parse(await readFile('public/params.json','utf8'));
Object.assign(document.settings,{sprayDebugDir:1,sprayMode:2,sprayEnabled:1,sprayCount:8});
await page.route('**/params.json',route=>route.fulfill({json:document}));
await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
await page.locator('#switch-monster-training').click();
const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
await page.waitForFunction(()=>window.__ARCHERO__.snapshot().spray.layers.length===2,{},{timeout:20000});
await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
const snapshot=await page.evaluate(()=>window.__ARCHERO__.snapshot());
assert.deepEqual(snapshot.spray.layers.map(w=>w.color).sort(),[0x16cfff,0xff6338].sort());
assert.equal(snapshot.spray.layers.reduce((n,w)=>n+w.count,0),snapshot.settings.sprayCount);
await page.evaluate(()=>window.__ARCHERO__.stepInspection(.14));
await mkdir('analysis/spray-jelly',{recursive:true});
await page.locator('#viewport').screenshot({path:'analysis/spray-jelly/two-layers.png'});
await page.locator('#value-sprayDebugDir').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}));});
await page.evaluate(()=>window.__ARCHERO__.stepInspection(.001));
assert.ok((await page.evaluate(()=>window.__ARCHERO__.snapshot().spray.layers)).every(w=>w.color===0xffd34d));
assert.deepEqual(errors,[]);console.log('PASS Chrome actual monster hit: two billboard layers, distinct debug colors, shared count, live color toggle, no page errors');
}finally{await browser.close();}
