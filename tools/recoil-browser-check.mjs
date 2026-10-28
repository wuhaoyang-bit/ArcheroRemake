import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[];
try{
 for(const mobile of [false,true]){
  const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings:{recoilEnabled:1,recoilDistance:.16,recoilDuration:.12,monsterSpeed:0}}}));
  await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
  await page.locator('#switch-monster-training').click();
  const before=await page.evaluate(()=>window.__ARCHERO__.snapshot());
  const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
  await page.waitForFunction(()=>{const s=window.__ARCHERO__.snapshot();return s.arrows.fired===1&&!s.recoil.active&&s.recoil.elapsed>0;});
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
  const after=await page.evaluate(()=>window.__ARCHERO__.snapshot());
  const dx=after.position.x-before.position.x,dz=after.position.z-before.position.z;
  assert.ok(Math.abs(Math.hypot(dx,dz)-.16)<1e-6);assert.ok(dx*after.recoil.direction.x+dz*after.recoil.direction.z>0);assert.equal(after.mode,'idle');
  assert.equal(await page.locator('#recoil-speed-curve-editor svg').count(),1);
  await page.locator('#value-recoilDistance').evaluate(input=>{input.value='.22';input.dispatchEvent(new Event('change',{bubbles:true}));});
  assert.equal((await page.evaluate(()=>window.__ARCHERO__.snapshot())).settings.recoilDistance,.22);
  await page.locator('#value-recoilEnabled').evaluate(input=>{input.value='0';input.dispatchEvent(new Event('change',{bubbles:true}));});
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(false));
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().arrows.fired>=2);
  assert.deepEqual((await page.evaluate(()=>window.__ARCHERO__.snapshot())).position,after.position);
  await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS desktop/mobile: actual arrow release triggers exact recoil distance, independent controls, disabling preserves position, no page errors');
}finally{await browser.close();}
