import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[];
try{
 for(const [shot,hit,mobile] of [[0,0,false],[1,0,false],[0,1,false],[1,1,false],[1,1,true]]){
  const page=await browser.newPage(mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  const settings={...JSON.parse(original).settings,monsterSpeed:0,monsterCount:1,arrowSpeed:50,recoilEnabled:0,cameraZoomShotEnabled:shot,cameraZoomHitEnabled:hit,cameraZoomHold:.3,cameraZoomShotAmount:4,cameraZoomHitAmount:4};
  await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings}}));
  await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
  await page.locator('#switch-monster-training').click();
  const box=await page.locator('#viewport').boundingBox();
  if(mobile)await page.touchscreen.tap(box.x+box.width/2,box.y+box.height*.65);
  else await page.mouse.click(box.x+box.width/2,box.y+box.height*.65);
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().arrows.hits>0);
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
  const s=await page.evaluate(()=>window.__ARCHERO__.snapshot());
  assert.equal(s.cameraZoom.triggers.shot>0,!!shot);assert.equal(s.cameraZoom.triggers.hit>0,!!hit);
  assert.equal(s.cameraZoom.shot.active,!!shot);assert.equal(s.cameraZoom.hit.active,!!hit);
  if(!shot&&!hit)assert.equal(s.cameraZoom.zoom,1);
  else assert.ok(s.cameraZoom.zoom>1);
  assert.equal(await page.locator('#value-cameraZoomDamping').inputValue(),'1');
  await page.locator('#reset-dummies').click();
  assert.equal(await page.evaluate(()=>window.__ARCHERO__.snapshot().cameraZoom.zoom),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  console.log(`PASS real arrow shot=${shot} hit=${hit} mobile=${mobile}, zoom=${s.cameraZoom.zoom}`);
  await page.close();
 }
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
}finally{await browser.close();}
