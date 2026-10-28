import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8');
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{for(const mode of [0,1]){
 const mobile=mode===1,p=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/params.json',r=>r.fulfill({json:{version:1,settings:{monsterCount:1,monsterSpeed:0,hitKnockEnabled:0,hitSquashMode:mode,hitSquashAmount:.15,slimeInjectionAmount:20,slimeCapacity:100}}}));
 await p.goto('http://localhost:5173');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);await p.locator('#switch-monster-training').click();const box=await p.locator('#viewport').boundingBox();
 if(mobile)await p.touchscreen.tap(box.x+box.width/2,box.y+box.height*.65);else await p.mouse.click(box.x+box.width/2,box.y+box.height*.65);
 await p.waitForFunction(()=>{const s=window.__ARCHERO__.snapshot();return s.arrows.hits>=2&&s.feedback[0].compression>0&&s.feedback[0].inflation.visual>.2;});
 await p.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));const s=await p.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(s.feedback[0].inflation.amount,Math.min(100,s.arrows.hits*20));assert.ok(s.feedback[0].inflation.extent>1);assert.ok(s.feedback[0].proxyScale[0]>1);assert.ok(s.cameraZoom.triggers.hit>0);assert.equal(await p.locator('#value-slimeInflationFrequency').inputValue(),'5.5');
 await p.locator('#viewport').screenshot({path:`/tmp/slime-inflation-game-${mode}.png`});
 await p.locator('#reset-dummies').click();const reset=await p.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(reset.feedback[0].inflation.amount,0);assert.equal(reset.feedback[0].inflation.extent,1);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);console.log(`PASS real repeated hits, inflation + squash mode ${mode}, camera zoom, reset, mobile=${mobile}`);await p.close();
}assert.equal(await readFile('public/params.json','utf8'),original);}finally{await browser.close();}
