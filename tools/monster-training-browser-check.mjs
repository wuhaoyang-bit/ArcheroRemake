import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[];const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
try{
 for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 await page.locator('#switch-monster-training').click();
 const snap=()=>page.evaluate(()=>window.__ARCHERO__.snapshot());
 const start=await snap();assert.equal(start.training,'monsters');const count=start.feedback.length;assert.ok(count>=1&&count<=10);for(const target of start.feedback){assert.equal(target.model,'white-cube');assert.equal(target.animation,undefined);}
 await page.waitForTimeout(2800);
 const near=await snap();for(let i=0;i<count;i++){assert.ok(distance(near.feedback[i].position,near.position)<distance(start.feedback[i].position,start.position));assert.ok(distance(near.feedback[i].position,near.position)>=1.76-1e-5);}
 for(let i=0;i<count;i++)for(let j=i+1;j<count;j++)assert.ok(distance(near.feedback[i].position,near.feedback[j].position)>=2.6-1e-5);
 const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.7);
 await page.waitForFunction(()=>window.__ARCHERO__.snapshot().arrows.hits>0,{},{timeout:15000});
 for(const target of (await snap()).feedback){assert.equal(target.animation,undefined);}
 await mkdir('analysis/monster-training',{recursive:true});await page.locator('#viewport').screenshot({path:`analysis/monster-training/${mobile?'mobile':'desktop'}.png`});
 await page.locator('#reset-dummies').click();const reset=await snap();assert.equal(reset.particles.active,0);assert.ok(distance(reset.feedback[0].position,start.feedback[0].position)<.5);
 await page.locator('#switch-locking-training').click();assert.equal((await snap()).feedback.length,8);
 await page.locator('#switch-monster-training').click();assert.equal((await snap()).feedback.length,count);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS desktop/mobile: white cubes without source animation pursuing, contacts, arrows hit, reset, switch, no overflow or browser errors');
}finally{await browser.close();}
