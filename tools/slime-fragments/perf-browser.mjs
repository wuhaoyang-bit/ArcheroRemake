import {chromium} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const settings=JSON.parse(await readFile('public/params.json','utf8')).settings;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1050}});page.on('pageerror',e=>console.error(e));
 await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings:{...settings,monsterCount:3,monsterSpeed:0,slimeInjectionAmount:100,slimeFragmentsEnabled:1,slimeFragmentsMaxBursts:3,slimeFragmentsLifetime:15,slimeEyeEjectSpeed:8}}}));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:120000});
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 await page.locator('#switch-monster-training').click();
 const report=await page.evaluate(async()=>{const api=window.__ARCHERO__;api.stepInspection(0);api.snapshot().feedback.forEach(f=>api.testSlimeHit(f.id));let emitMs=0;for(let i=0;i<600;i++){const t=performance.now();api.stepInspection(1/120);if(api.snapshot().slimeFragments.emitted>=3){emitMs=performance.now()-t;break;}}const samples=[];for(let i=0;i<210;i++){await new Promise(requestAnimationFrame);const t=performance.now();api.stepInspection(1/60);const total=performance.now()-t;if(i>=30){const s=api.snapshot().slimeFragments;samples.push({solve:s.solveMs,skin:s.skinMs,total});}}const stats=key=>{const a=samples.map(s=>s[key]).sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)]};};return {emitMs,solveMs:stats('solve'),skinMs:stats('skin'),frameCpuMs:stats('total'),state:api.snapshot().slimeFragments};});
 console.log(JSON.stringify({...report,state:undefined},null,2));if(process.argv[2])await writeFile(process.argv[2],JSON.stringify(report,null,2));
}finally{await browser.close();}
