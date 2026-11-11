import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
 await page.locator('#switch-monster-training').click();await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 const result=await page.evaluate(()=>{
  const a=window.__ARCHERO__,input=document.querySelector('#value-burstSuppressed');
  const first=input.closest('.setting-group').querySelector('[data-setting]').dataset.setting;
  const set=v=>{input.value=String(v);input.dispatchEvent(new Event('change',{bubbles:true}));a.stepInspection(0);};
  const id=a.snapshot().feedback[0].id,phase=()=>a.snapshot().feedback.find(x=>x.id===id).burst.phase;
  const initial=a.snapshot().settings.burstSuppressed;
  for(let i=0;i<30;i++){a.testSlimeHit(id);a.stepInspection(.1);}
  const full=phase();set(0);a.testSlimeHit(id);const triggered=phase();
  set(1);const cancelled=phase(),accepted=a.testSlimeHit(id);
  set(0);a.testSlimeHit(id);for(let i=0;i<900;i++)a.stepInspection(1/120);
  const exploded=phase();set(1);return {first,initial,full,triggered,cancelled,accepted,exploded,after:phase()};
 });
 assert.deepEqual(result,{first:'burstSuppressed',initial:1,full:'alive',triggered:'feedback',cancelled:'alive',accepted:true,exploded:'gone',after:'gone'});
 assert.deepEqual(errors,[]);console.log('PASS browser switch placement, default suppression, cancellation, restored explosion',result);
}finally{await browser.close();}
