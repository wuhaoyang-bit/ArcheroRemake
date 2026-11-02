import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';

const original=await readFile('public/params.json','utf8'),saved=JSON.parse(original).settings;
const out='analysis/slime-burst-color';await mkdir(out,{recursive:true});
const settings={...saved,monsterCount:1,monsterSpeed:0,slimeInjectionAmount:100,slimeCapacity:100,slimeColorTime:0,
  burstFeedbackDelay:0,burstDuration:1.2,burstOnset:.1,burstScale:1,burstFrequencyStart:2,burstFrequencyEnd:2,
  burstAmplitudeStart:.08,burstAmplitudeEnd:.08,hitSquashEnabled:0,hitKnockEnabled:0,hitRimEnabled:0,eyeHitEnabled:0};
// Leave new parameters absent to exercise loading an existing user's settings.
delete settings.burstColorPulseEnabled;delete settings.burstColorPulseAmount;
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[],results={};
let written;
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings}}));
  await page.route('**/__save-params',r=>{written=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
  await page.goto('http://127.0.0.1:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,{},{timeout:60000});
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
  await page.locator('#settings-category').selectOption('burst');
  assert.equal(await page.locator('#value-burstColorPulseEnabled').inputValue(),'1');
  assert.equal(await page.locator('#value-burstColorPulseAmount').inputValue(),'4');
  await page.locator('#value-burstColorPulseAmount').fill('6');await page.locator('#value-burstColorPulseAmount').dispatchEvent('change');
  await page.locator('#undo-settings').click();assert.equal(await page.locator('#value-burstColorPulseAmount').inputValue(),'4');
  await page.locator('#switch-monster-training').click();
  results.game=await page.evaluate(()=>{
    const api=window.__ARCHERO__,snap=()=>api.snapshot().feedback[0];
    api.testSlimeHit(snap().id);const hit=snap();
    for(let i=0;i<1000&&snap().burst.phase==='feedback';i++)api.stepInspection(1/120);
    const start=snap();for(let i=0;i<15;i++)api.stepInspection(1/120);const expanded=snap();
    for(let i=0;i<30;i++)api.stepInspection(1/120);const compressed=snap();
    return {hit,start,expanded,compressed};
  });
  assert.equal(results.game.hit.inflation.colorLightness,0);
  assert.equal(results.game.start.burst.phase,'winding');
  assert.ok(Math.abs(results.game.expanded.inflation.colorLightness-.04)<1e-8);
  assert.ok(Math.abs(results.game.compressed.inflation.colorLightness+.04)<1e-8);
  assert.notEqual(results.game.expanded.inflation.color,results.game.compressed.inflation.color);
  await page.locator('#save-settings').click();await page.waitForFunction(()=>document.querySelector('#store-status').textContent==='已写入 params.json');
  assert.equal(written.settings.burstColorPulseAmount,4);assert.equal(written.settings.burstColorPulseEnabled,1);

  await page.goto('http://127.0.0.1:5173/slime-burst-lab.html');await page.waitForFunction(()=>window.__BURST_LAB__?.snapshot().ready,{},{timeout:60000});
  await page.locator('#lab-settings-category').selectOption('burst');
  const snap=()=>page.evaluate(()=>window.__BURST_LAB__.snapshot());
  const wind=(await snap()).windFrame;
  const seek=frame=>page.evaluate(frame=>window.__BURST_LAB__.seek(frame),frame);
  const field=key=>page.locator(`input[type=number][data-key=${key}]`);
  const set=async(key,value)=>{await field(key).fill(String(value));await field(key).dispatchEvent('input');await page.waitForTimeout(80);};
  await seek(wind+15);const expanded=await snap();
  assert.equal(expanded.feedback[0].inflation.color,results.game.expanded.inflation.color);
  await page.locator('#view').screenshot({path:out+'/expanded-on.png'});
  await set('burstColorPulseEnabled',0);const off=await snap();
  assert.equal(off.frame,expanded.frame);assert.equal(off.feedback[0].inflation.colorLightness,0);
  assert.equal(off.feedback[0].scale,expanded.feedback[0].scale);
  assert.equal(off.feedback[0].inflation.color,results.game.start.inflation.color);
  await page.locator('#view').screenshot({path:out+'/expanded-off.png'});
  await set('burstColorPulseEnabled',1);
  await seek(wind+45);const compressed=await snap();
  assert.equal(compressed.feedback[0].inflation.color,results.game.compressed.inflation.color);
  await page.locator('#view').screenshot({path:out+'/compressed-on.png'});
  await set('burstColorPulseEnabled',0);await page.locator('#view').screenshot({path:out+'/compressed-off.png'});
  await set('burstColorPulseEnabled',1);await seek(wind+15);
  assert.deepEqual((await snap()).feedback,expanded.feedback);
  await set('burstColorPulseAmount',8);assert.ok(Math.abs((await snap()).feedback[0].inflation.colorLightness-.08)<1e-8);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已保存'));
  assert.equal(written.settings.burstColorPulseAmount,8);assert.equal(written.settings.cameraShakeTier,settings.cameraShakeTier);
  await seek(expanded.burstFrame);assert.equal((await snap()).feedback[0].inflation.colorLightness,0);
  await seek(0);assert.equal((await snap()).feedback[0].inflation.colorLightness,0);
  results.lab={expanded:expanded.feedback[0],off:off.feedback[0],compressed:compressed.feedback[0]};
  assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
  await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));
  console.log('PASS game/lab colour parity, onset and stretch/compression, toggle without shape changes, backward replay, reset, saved controls and undo');
}finally{await browser.close();}
