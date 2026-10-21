import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 await page.locator('#target-model').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('change',{bubbles:true}));});
 await page.locator('#switch-monster-training').click();
 const box=await page.locator('#viewport').boundingBox(),x=box.x+box.width/2,y=box.y+box.height*.7;
 await page.touchscreen.tap(x,y);
 const snap=()=>page.evaluate(()=>window.__ARCHERO__.snapshot()),initial=await snap(),id=initial.targeting.target.id;
 let moved=false,crossed=false;
 for(let i=0;i<50;i++){
   await page.waitForTimeout(100);const s=await snap();assert.equal(s.targeting.target.id,id);
   const t=s.feedback.find(t=>t.id===id),other=s.feedback.find(t=>t.id!==id),p=s.position;
   assert.equal(s.targeting.target.x,t.position.x);assert.equal(s.targeting.target.z,t.position.z);
   moved ||= Math.abs(t.position.z-initial.targeting.target.z)>.1;
   crossed ||= Math.hypot(t.position.x-p.x,t.position.z-p.z)>Math.hypot(other.position.x-p.x,other.position.z-p.z)+.01;
 }
 assert.ok(moved);assert.ok(crossed);assert.ok((await snap()).arrows.hits>0);
 await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(500);
 assert.equal((await snap()).mode,'in-place');assert.equal((await snap()).targeting.target.id,id);
 await page.mouse.move(x+65,y);await page.waitForTimeout(200);assert.equal((await snap()).mode,'moving');
 await page.mouse.up();const stopped=await snap();await page.waitForTimeout(700);assert.equal((await snap()).targeting.target?.id,stopped.targeting.target?.id);
 assert.deepEqual(errors,[]);console.log('PASS: stationary target remains locked despite nearest-distance crossing; live aim follows, arrows hit, in-place holds, moving selects, release freezes');
}finally{await browser.close();}
