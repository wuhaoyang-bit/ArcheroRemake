import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 for(const mobile of [false,true]){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1100},isMobile:mobile,hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 if(mobile)await page.locator('#open-settings').click();
 const root=page.locator('#camera-zoom-preview');await root.scrollIntoViewIfNeeded();
 const before=await root.locator('.zoom-curve-line').getAttribute('d');
 await page.locator('#value-cameraZoomDamping').evaluate(e=>{e.value='.3';e.dispatchEvent(new Event('change',{bubbles:true}));});
 assert.notEqual(await root.locator('.zoom-curve-line').getAttribute('d'),before);
 await root.locator('select').selectOption('both');
 await root.locator('input').evaluate(e=>{e.value='.12';e.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.match(await root.locator('output').textContent(),/0.120 s/);
 await root.locator('button').click();await page.waitForTimeout(120);assert.notEqual(await root.locator('input').inputValue(),'0.12');
 await root.locator('button').click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);await root.screenshot({path:`/tmp/archero-zoom-preview-${mobile?'mobile':'desktop'}.png`});
 console.log(`PASS live curve, mode selection, scrubbing, playback, no overflow: mobile=${mobile}`);await page.close();
 }
}finally{await browser.close();}
