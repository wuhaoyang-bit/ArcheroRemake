import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/slime-drops-lab';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/assets/lush-burst/scene.bin',r=>r.fulfill({path:'public/assets/lush-burst/scene.bin',contentType:'application/octet-stream'}));
 let saved;await page.route('**/__save-params',r=>{saved=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
 await page.route('**/params.json',async r=>{const response=await r.fetch(),json=await response.json();json.settings.puddleRenderer=2;await r.fulfill({json});});
 // Read renderer configuration through a test-only response, not a production API.
 await page.route(/\/src\/slime-burst-lab\.ts(?:\?.*)?$/,async r=>{const response=await r.fetch(),src=await response.text();assert.match(src,/__BURST_LAB__:\s*\{/);await r.fulfill({response,body:src.replace(/__BURST_LAB__:\s*\{/, '__BURST_LAB__: { testRenderer: renderer, testEffects: effects, testFeedback: feedback,')});});
 await page.goto('http://127.0.0.1:5187/slime-burst-lab.html');
 await page.waitForFunction(()=>window.__BURST_LAB__?.snapshot().ready,{},{timeout:240000});
 const result=await page.evaluate(()=>{
  const lab=window.__BURST_LAB__;lab.seek(lab.snapshot().burstFrame+24);
  const s=lab.snapshot();return {toneMapping:lab.testRenderer.toneMapping,exposure:lab.testRenderer.toneMappingExposure,ground:s.effects.ground,settings:s.settings};
 });
 assert.equal(result.toneMapping,1);assert.equal(result.exposure,1);assert.ok(result.ground.drops>0);
 for(const view of ['perspective','front','top']){
  await page.locator(`[data-view="${view}"]`).click();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await page.locator('#view').screenshot({path:`${out}/${view}.png`});
 }
 await page.locator('#lab-settings-category').selectOption('puddle');
 const motionSection=page.locator('details').filter({has:page.locator('summary', {hasText:'液滴 · 飞行'})});
 await motionSection.locator('summary').click();
 await motionSection.locator('[data-key="liquidSpeedJitter"][type="number"]').fill('4');
 await page.waitForFunction(()=>window.__BURST_LAB__.snapshot().settings.liquidSpeedJitter===4);
 // Wait for the scheduled preview rebuild before sampling the birth snapshots.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const speeds=await page.evaluate(()=>window.__BURST_LAB__.testEffects.liquid.drops.filter(d=>d.paint).map(d=>d.settings.slimeEyeEjectSpeed));
 assert.ok(new Set(speeds).size>1);assert.ok(speeds.every(v=>v>=Math.max(0,result.settings.liquidEjectSpeed-4)&&v<=result.settings.liquidEjectSpeed+4));
 const repeated=await page.evaluate(()=>{const a=window.__BURST_LAB__;a.seek(a.snapshot().frame);return a.testEffects.liquid.drops.filter(d=>d.paint).map(d=>d.settings.slimeEyeEjectSpeed);});
 assert.deepEqual(repeated,speeds);
 await motionSection.locator('[data-key="liquidGravity"][type="number"]').fill('8');
 await page.waitForFunction(()=>window.__BURST_LAB__.testEffects.liquid.drops.find(d=>d.paint)?.settings.slimeEyeEjectGravity===8);
 const independent=await page.evaluate(()=>{const a=window.__BURST_LAB__;return {drop:a.testEffects.liquid.drops.find(d=>d.paint).settings.slimeEyeEjectGravity,eye:a.testFeedback.eyeDebris.fragments[0].settings.slimeEyeEjectGravity};});
 assert.deepEqual(independent,{drop:8,eye:result.settings.slimeEyeEjectGravity});
 await motionSection.locator('[data-curve="edit"]').click();
 await page.locator('dialog[open] [name="progress"]').fill('30');
 await page.locator('dialog[open] button[type="submit"]').click();
 const curves=await page.evaluate(()=>{const a=window.__BURST_LAB__;return {drop:a.testEffects.liquid.drops.find(d=>d.paint).settings.slimeEyeSpeedCurve,eye:a.testFeedback.eyeDebris.fragments[0].settings.slimeEyeSpeedCurve};});
 assert.equal(curves.drop.at(-1).progress,30);assert.deepEqual(curves.eye,result.settings.slimeEyeSpeedCurve);
 await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已保存本页参数'));
 assert.equal(saved.settings.liquidSpeedJitter,4);assert.equal(saved.settings.liquidGravity,8);assert.equal(saved.settings.liquidSpeedCurve.at(-1).progress,30);
 for(const key of ['slimeEyeEjectSpeed','slimeEyeEjectGravity','slimeEyeCurveTime','slimeEyeSpeedCurve'])assert.deepEqual(saved.settings[key],result.settings[key]);
 await motionSection.locator('[data-curve="generate"]').click();
 assert.deepEqual(await page.evaluate(()=>window.__BURST_LAB__.snapshot().settings.liquidSpeedCurve),[{time:0,progress:120},{time:100,progress:8}]);
 await page.locator('#import').setInputFiles({name:'liquid-tuning.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...saved,settings:{...saved.settings,slimeEyeEjectGravity:1}}))});
 await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已导入本页参数'));
 const imported=await page.evaluate(()=>window.__BURST_LAB__.snapshot().settings);
 assert.equal(imported.liquidSpeedJitter,4);assert.equal(imported.liquidSpeedCurve.at(-1).progress,30);assert.equal(imported.slimeEyeEjectGravity,result.settings.slimeEyeEjectGravity);
 await motionSection.screenshot({path:`${out}/motion-controls.png`});
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({result,speeds,independent,curves,saved,errors},null,2));
 console.log('PASS: actual burst lab, Linear / exposure 1, live drops and shadows from three camera angles; independent liquid flight controls, curve editing, saving and import; no WebGPU errors.');
}finally{await browser.close();}
