import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
let saved={version:1,settings:{...JSON.parse(await readFile('public/params.json','utf8')).settings,targetModel:1,lockRange:30,ringLinkThreshold:0,ringDuration:.05,ringPlayerDiameter:4,ringTargetDiameter:8,ringLinkStroke:2,
 ringLinkAttackCurve:[{completion:0,width:100},{completion:20,width:90},{completion:50.8,width:65},{completion:54,width:145},{completion:70,width:115},{completion:100,width:100}]}};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const p=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/params.json',r=>r.fulfill({json:saved}));await p.route('**/__save-params',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{ok:true}})});
 await p.goto('http://localhost:5173');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 await p.locator('#switch-locking-training').click();const box=await p.locator('#viewport').boundingBox(),x=box.x+box.width/2,y=box.y+box.height*.65;
 await p.mouse.click(x,y);await p.waitForTimeout(300);
 const samples=await p.evaluate(async()=>{
  const result=[];for(let i=0;i<100;i++){await new Promise(requestAnimationFrame);const s=window.__ARCHERO__.snapshot();result.push({a:s.attack,c:s.debug.rings.config,w:Number(document.querySelector('[data-ring-link]').getAttribute('stroke-width'))});}return result;
 });
 for(const {a,c,w} of samples){
  const phase=a.time/a.duration*100,points=c.ringLinkAttackCurve;let value=points.at(-1).width;
  for(let i=1;i<points.length;i++)if(phase<=points[i].completion){const l=points[i-1],r=points[i];value=l.width+(r.width-l.width)*(phase-l.completion)/(r.completion-l.completion);break;}
  assert.ok(Math.abs(w-c.ringLinkStroke*(1+(value/100-1)*a.weight))<1e-7);
 }
 assert.ok(Math.min(...samples.map(s=>s.w))<1.5);assert.ok(Math.max(...samples.map(s=>s.w))>2.6);
 await p.mouse.move(x,y);await p.mouse.down();await p.waitForTimeout(60);
 assert.equal(await p.locator('[data-ring-link]').getAttribute('stroke-width'),'2');await p.mouse.up();
 const root=p.locator('#link-attack-editor');await root.locator('[data-curve=expand]').click();
 const dialog=p.locator('.curve-dialog[open]');assert.equal(await dialog.locator('[data-release-marker]').count(),1);assert.equal(await dialog.locator('[data-attack-cursor]').count(),1);
 assert.match(await dialog.locator('.attack-phase-readout').textContent(),/0.550s/);
 await dialog.locator('[data-curve=edit]').click();const form=p.locator('.curve-number-dialog[open]');await form.locator('[name=progress]').fill('120');await form.locator('[type=submit]').click();await dialog.locator('.curve-close').click();
 await root.scrollIntoViewIfNeeded();await mkdir('analysis/attack-link-checks',{recursive:true});await p.screenshot({path:'analysis/attack-link-checks/editor.png'});
 await p.locator('#save-settings').click();await p.waitForFunction(()=>document.querySelector('#store-status').textContent.includes('已写入'));
 assert.equal(saved.settings.ringLinkAttackCurve.at(-1).width,120);
 await p.reload();await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 assert.equal(await p.evaluate(()=>window.__ARCHERO__.snapshot().settings.ringLinkAttackCurve.at(-1).width),120);
 assert.deepEqual(errors,[]);console.log('PASS animation clock/weight synchronization, repeated pulse, interruption, phase markers, curve editing and JSON reload');
}finally{await browser.close()}
