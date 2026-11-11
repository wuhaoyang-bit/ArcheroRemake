import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 for(const mode of [2,0,1]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const doc=JSON.parse(await readFile('public/params.json','utf8'));
  Object.assign(doc.settings,{arrowPierce:1,arrowPierceGravity:mode,arrowSpeed:20,arrowSpeedAfterPierce:10,arrowEmbedDurationMs:120,arrowEmbedSpeed:10,arrowEmbedBrakePercent:50,sprayEnabled:1,sprayMode:2,sprayDelay:.05,sprayHeight:0,hitSplashBackEnabled:1,hitSplashBackDelay:.05,monsterSpeed:0,hitKnockEnabled:0});
  await page.route('**/params.json',r=>r.fulfill({json:doc}));
  await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
  await page.locator('#switch-monster-training').click();
  const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
  await page.waitForFunction(()=>{const s=window.__ARCHERO__.snapshot();return s.spray.active>0&&s.hitSplash.some(w=>w.kind==='back'&&w.sheets>0)&&s.arrows.active.some(a=>a.hitIds.length>0);});
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
  const s=await page.evaluate(()=>window.__ARCHERO__.snapshot()),a=s.arrows.active.find(a=>a.hitIds.length>0),spray=s.spray.lastEmit,sheet=s.hitSplash.find(w=>w.kind==='back');
  const dot=(x,y)=>x.reduce((sum,v,i)=>sum+v*y[i],0);
  assert.ok(mode===2?dot(spray.dir,a.direction)<-.7:dot(spray.dir,a.direction)>.7,JSON.stringify({mode,spray,a}));
  assert.ok(dot(sheet.direction,spray.dir)>.9);assert.equal(s.spray.layers.length,2);assert.equal(sheet.droplets,0);
  assert.deepEqual(errors,[]);console.log(`PASS Chrome mode ${mode}: both spray layers and sheets ${mode===2?'reverse at entry':'remain at rear'}`);await page.close();
 }
}finally{await browser.close();}
