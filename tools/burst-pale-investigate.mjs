import {chromium} from '@playwright/test';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const out='analysis/burst-pale';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const reports=[],errors=[];
try{
const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')errors.push(m.text());});
const doc=JSON.parse(await readFile('public/params.json','utf8'));Object.assign(doc.settings,{slimeInjectionAmount:100,slimeCapacity:100,monsterSpeed:0});
await page.route('**/params.json',r=>r.fulfill({json:doc}));await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:90000});await page.locator('#switch-monster-training').click();await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
for(let round=0;round<3;round++){
 await page.locator('#reset-dummies').click();
 await page.evaluate(()=>{const a=window.__ARCHERO__,id=a.snapshot().feedback[0].id;a.testSlimeHit(id);for(let i=0;i<1200;i++){a.stepInspection(1/120);if(a.snapshot().feedback[0].burst.phase==='gone')return;}throw Error('No burst');});
 for(let frame=0;frame<=90;frame++){
  if(frame)await page.evaluate(()=>window.__ARCHERO__.stepInspection(1/120));
  if([0,1,3,8,15,30,60,90].includes(frame)){
   const s=await page.evaluate(()=>window.__ARCHERO__.snapshot());reports.push({round,frame,cameraShake:s.cameraShake,cameraView:s.cameraView,shockwave:s.shockwave,fragments:s.slimeFragments});
   await page.locator('#viewport canvas').screenshot({path:`${out}/${round}-${frame}.png`});
  }
 }
 console.log('captured explosion',round);
}
}finally{await writeFile(out+'/report.json',JSON.stringify({reports,errors},null,2));await browser.close();}
