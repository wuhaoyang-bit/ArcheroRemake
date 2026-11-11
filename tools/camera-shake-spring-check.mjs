import {chromium} from '@playwright/test';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings:{monsterCount:1,monsterSpeed:0,burstSuppressed:0,slimeInjectionAmount:100,burstDuration:.1,cameraZoomShotEnabled:0,cameraZoomHitEnabled:0}}}));
 await page.route('**/__save-params',r=>r.fulfill({json:{ok:true}}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));await page.locator('#switch-monster-training').click();await page.locator('#settings-category').selectOption('camera-shake');
 assert.equal(await page.locator('[data-spring] svg').count(),2);
 for(const mode of [0,1,2]){
  await page.locator('#value-cameraShakeExtraMode').selectOption(String(mode));await page.locator('#reset-dummies').click();
  const result=await page.evaluate(()=>{const a=window.__ARCHERO__;a.testSlimeHit(a.snapshot().feedback[0].id);for(let i=0;i<1800;i++){a.stepInspection(1/120);if(a.snapshot().feedback[0].burst.phase==='gone')break;}a.stepInspection(.04);const active=a.snapshot().cameraShake;for(let i=0;i<120;i++)a.stepInspection(1/120);return {active,final:a.snapshot().cameraShake};});
  assert.equal(result.active.triggers,1);
  if(mode===1)assert.ok(result.active.extra.rotation>0);else assert.equal(result.active.extra.rotation,0);
  if(mode===2)assert.ok(result.active.extra.scale<1);else assert.equal(result.active.extra.scale,1);
  assert.equal(result.final.extra.rotation,0);assert.equal(result.final.extra.scale,1);
 }
 await page.locator('#value-cameraShakeExtraMode').selectOption('0');
 for(const [kind,mode] of [['Roll',1],['Scale',2]]){
  await page.locator(`[data-play="${kind}"]`).click();await page.waitForTimeout(100);assert.ok((await page.locator(`[data-spring="${kind}"] output`).textContent()).includes('s'));
  await page.locator(`[data-game="${mode}"]`).click();await page.evaluate(()=>window.__ARCHERO__.stepInspection(.04));
  const s=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(s.settings.cameraShakeExtraMode,0);assert.equal(s.cameraShake.extra.kind,kind);assert.equal(s.cameraShake.extra.active,true);
 }
 assert.deepEqual(errors,[]);console.log('PASS Chrome: three explosion modes, two curves, independent previews, return to baseline; no page errors');
}finally{await browser.close();}
