import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const document=JSON.parse(await readFile('public/params.json','utf8'));document.settings.burstEnabled=1;
 if(document.slimePresets?.soft)document.slimePresets.soft.burstEnabled=1;
 await page.route('**/params.json',r=>r.fulfill({json:document}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
 await page.locator('#switch-monster-training').click();await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 for(const mode of ['hard','soft']){
  if(mode==='soft')await page.locator('#slime-mode-toggle').click();
  const result=await page.evaluate(()=>{
   const a=window.__ARCHERO__,initial=a.snapshot(),id=initial.feedback[0].id;
   if(initial.settings.burstEnabled!==1)throw Error('Legacy-enabled preset fixture missing');
   const hits=Math.ceil(initial.settings.slimeCapacity/initial.settings.slimeInjectionAmount)+8;
   for(let i=0;i<hits;i++){if(!a.testSlimeHit(id))throw Error('Full target rejected hit');for(let j=0;j<20;j++)a.stepInspection(1/120);}
   for(let j=0;j<360;j++)a.stepInspection(1/120);
   return a.snapshot();
  });
  assert.equal(result.feedback[0].inflation.amount,result.settings.slimeCapacity);assert.equal(result.feedback[0].burst.phase,'alive');
  assert.equal(result.shockwave.waves.length,0);assert.equal(result.burstEffects.bursts.length,0);
  console.log(`PASS ${mode}: legacy burst flag ON: capacity capped, repeated hits accepted, no windup or explosion`);
 }
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(false));
 const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().arrows.hits>0,null,{timeout:20000});
 assert.deepEqual(errors,[]);console.log('PASS actual arrow collision still works after fullness');
}finally{await browser.close();}
