import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
await mkdir('analysis/training-checks',{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--enable-unsafe-webgpu']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');
 await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 const snap=()=>page.evaluate(()=>window.__ARCHERO__.snapshot());
 const before=await snap();
 await page.locator('#switch-training').click();
 assert.equal((await snap()).training,'obstacles');assert.deepEqual((await snap()).settings,before.settings);
 await page.waitForTimeout(800);
 await page.screenshot({path:'analysis/training-checks/desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
 await page.screenshot({path:'analysis/training-checks/mobile.png'});
 await page.locator('#switch-training').click();assert.equal((await snap()).training,'free');
 await page.locator('#switch-training').click();assert.equal((await snap()).training,'obstacles');
 // Reach the first checkpoint through real pointer input and inspect retained progress.
 const firstRect=await page.locator('#viewport').boundingBox();
 const sx=firstRect.x+firstRect.width/2,sy=firstRect.y+firstRect.height*.65;
 await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx-60,sy);
 // Change direction inside the same browser frame: avoid automation roundtrip overshoot at high speed.
 await page.waitForFunction(({x,y})=>{
   const state=window.__ARCHERO__.snapshot();
   if(state.position.x >= -2.15) return false;
   document.querySelector('#viewport').dispatchEvent(new PointerEvent('pointermove',{
     pointerId:state.pointerId,pointerType:'mouse',clientX:x,clientY:y,buttons:1,bubbles:true,
   }));
   return true;
 },{x:sx,y:sy-60},{polling:'raf'});
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().passedCheckpoints===1, null, {polling:'raf'});
 await page.mouse.up();
 assert.equal((await snap()).passedCheckpoints,1);
 await page.screenshot({path:'analysis/training-checks/progress-mobile.png'});
 await page.locator('#switch-training').click();await page.locator('#switch-training').click();
 assert.equal((await snap()).passedCheckpoints,0);
 // Drive up the clear right-hand lane to exercise the actual DOM success/restart path.
 const r=await page.locator('#viewport').boundingBox();
 const cx=r.x+r.width/2,cy=r.y+r.height*.65;
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+60,cy);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().position.x>3);
 await page.mouse.move(cx,cy-60);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().completions===1,{},{timeout:15000});
 const done=await snap();assert.equal(done.mode,'idle');assert.equal(done.pointerId,null);
 assert.equal(await page.locator('#training-result').isVisible(),true);
 await page.mouse.up();assert.equal((await snap()).completions,1);
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop/mobile arena switching, preserved tuning, real pointer finish/restart, no runtime errors.');
}finally{await browser.close();}
