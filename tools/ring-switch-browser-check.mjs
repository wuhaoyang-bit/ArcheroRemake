import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let saved={version:1,settings:{...JSON.parse(await readFile('public/params.json','utf8')).settings,targetModel:0,lockRange:30,ringDuration:.05,ringTargetDiameter:8,ringSwitchDuration:.25,ringSwitchAmount:150,ringWaveDuration:.4,ringWaveDistance:32,ringWaveStroke:1.2,
 ringSwitchCurve:[{time:0,progress:0},{time:25,progress:100},{time:50,progress:45},{time:75,progress:10},{time:100,progress:0}]}};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/params.json',r=>r.fulfill({json:saved}));await p.route('**/__save-params',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{ok:true}})});
 await p.goto('http://localhost:5173');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);await p.locator('#switch-locking-training').click();
 const box=await p.locator('#viewport').boundingBox();await p.mouse.click(box.x+box.width/2,box.y+box.height*.6);
 await p.waitForFunction(()=>window.__ARCHERO__.snapshot().debug.rings.completion===1);
 await p.locator('#target-model').selectOption('1');
 const samples=await p.evaluate(async()=>{const a=[];for(let i=0;i<40;i++){await new Promise(requestAnimationFrame);const state=window.__ARCHERO__.snapshot().debug.rings;const el=document.querySelector("[data-ring-wave]");a.push({radius:state.radius,wave:state.wave,display:getComputedStyle(el).display,stroke:Number(el.getAttribute("stroke-width"))});}return a;});
 assert.ok(Math.max(...samples.map(s=>s.radius))>9);assert.ok(Math.max(...samples.map(s=>s.radius))<=10.00001);assert.equal(samples.at(-1).radius,4);
 const waves=samples.filter(s=>s.wave);assert.ok(waves.length>3);assert.ok(waves[0].wave.radius<waves.at(-1).wave.radius);assert.ok(waves[0].stroke>waves.at(-1).stroke);assert.equal(waves[0].display,"inline");assert.equal(samples.at(-1).wave,null);
 await p.locator('#ring-switch-editor [data-curve=expand]').click();const large=p.locator('.curve-dialog[open]');const b=await large.locator('svg').boundingBox();
 await p.mouse.dblclick(b.x+(70+60*6.2)*b.width/720,b.y+(345-30*3)*b.height/400);
 assert.ok(await p.evaluate(()=>window.__ARCHERO__.snapshot().settings.ringSwitchCurve.some(p=>Math.abs(p.time-60)<.2)));
 await large.locator('[data-curve=edit]').click();const form=p.locator('.curve-number-dialog[open]');await form.locator('[name=progress]').fill('35');await form.locator('[type=submit]').click();await large.locator('.curve-close').click();
 await p.locator('#save-settings').click();await p.waitForFunction(()=>document.querySelector('#store-status').textContent.includes('已写入'));assert.ok(saved.settings.ringSwitchCurve.some(p=>p.progress===35));
 await p.reload();await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);assert.deepEqual(await p.evaluate(()=>window.__ARCHERO__.snapshot().settings.ringSwitchCurve),saved.settings.ringSwitchCurve);
 assert.deepEqual(errors,[]);console.log('PASS switch pulse expansion/settling, curve add/edit, persistence and reload');
}finally{await browser.close()}
