import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const original=await readFile('public/params.json','utf8'),out='analysis/burst-shockwave';await mkdir(out,{recursive:true});
const url=process.env.ARCHERO_URL??'http://127.0.0.1:5173';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[],results={};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
let document={version:1,settings:{monsterCount:2,monsterSpeed:0,slimeInjectionAmount:100,slimeCapacity:100,cameraShakeEnabled:0,cameraZoomShotEnabled:0,cameraZoomHitEnabled:0}};
try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.route('**/favicon.ico',r=>r.fulfill({status:204}));
  await page.route('**/params.json',r=>r.fulfill({json:document}));
  await page.route('**/__save-params',r=>{document=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
  const open=async()=>{await page.goto(url);await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,{},{timeout:60000});await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));};
  const snap=()=>page.evaluate(()=>window.__ARCHERO__.snapshot());
  const step=dt=>page.evaluate(dt=>window.__ARCHERO__.stepInspection(dt),dt);
  const number=async(key,value)=>{const f=page.locator('#value-'+key);await f.fill(String(value));await f.dispatchEvent('change');};
  await open();await page.locator('#settings-category').selectOption('shockwave');
  assert.equal((await snap()).settings.burstShockwaveRadius,3.2);
  await number('burstShockwaveRadius',4);await page.locator('#undo-settings').click();assert.equal((await snap()).settings.burstShockwaveRadius,3.2);
  const editor=page.locator('#burst-shockwave-speed-editor');
  await editor.locator('circle[data-time="50"]').click({force:true});await editor.locator('[data-curve="edit"]').click();
  await page.locator('dialog[open] input[name=progress]').fill('75');await page.locator('dialog[open] button[type=submit]').click();
  assert.equal((await snap()).settings.burstShockwaveSpeedCurve[2].progress,75);
  await page.locator('#undo-settings').click();assert.equal((await snap()).settings.burstShockwaveSpeedCurve[2].progress,25);
  await page.locator('#switch-monster-training').click();
  results.explosion=await page.evaluate(()=>{
    const a=window.__ARCHERO__,id=a.snapshot().feedback[0].id;a.testSlimeHit(id);
    for(let i=0;i<1200;i++){
      a.stepInspection(1/120);const s=a.snapshot();
      if(s.feedback[0].burst.phase==='gone')return s.shockwave;
      if(s.shockwave.waves.length)throw new Error('Shockwave fired before the actual explosion');
    }
    throw new Error('Explosion missing');
  });
  assert.equal(results.explosion.waves.length,1);assert.equal(results.explosion.waves[0].age,0);assert.equal(results.explosion.waves[0].radius,0);
  const radii=[0];for(let i=0;i<3;i++){await step(.08);radii.push((await snap()).shockwave.waves[0].radius);}
  assert.ok(radii[1]>radii[2]-radii[1]);assert.ok(radii[2]-radii[1]>radii[3]-radii[2]);
  const frozen=(await snap()).shockwave;await page.waitForTimeout(100);assert.deepEqual((await snap()).shockwave,frozen);
  await step(.08);assert.equal((await snap()).shockwave.waves.length,0);
  await page.locator('#reset-dummies').click();await page.locator('#shockwave-preview').click();await step(.06);
  results.preview=(await snap()).shockwave;assert.ok(results.preview.screen[0].strength>0);
  await page.locator('#viewport canvas').screenshot({path:out+'/game-on.png'});
  await number('burstShockwaveEnabled',0);await step(0);assert.equal((await snap()).shockwave.waves.length,0);
  await page.locator('#viewport canvas').screenshot({path:out+'/game-off.png'});
  await number('burstShockwaveEnabled',1);await page.locator('#shockwave-preview').click();await page.locator('#reset-dummies').click();assert.equal((await snap()).shockwave.waves.length,0);
  await number('burstShockwaveDuration',.4);await page.locator('#save-settings').click();await page.waitForFunction(()=>document.querySelector('#store-status').textContent==='已写入 params.json');
  const savedCurve=(await snap()).settings.burstShockwaveSpeedCurve;
  await open();await page.locator('#settings-category').selectOption('shockwave');assert.equal((await snap()).settings.burstShockwaveDuration,.4);assert.deepEqual((await snap()).settings.burstShockwaveSpeedCurve,savedCurve);
  await page.setViewportSize({width:390,height:844});await page.locator('#open-settings').click();await page.locator('#settings-category').selectOption('shockwave');
  assert.equal(await editor.locator('svg').isVisible(),true);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.locator('#shockwave-preview').click();await step(.1);assert.ok((await snap()).shockwave.screen[0].strength>0);
  await page.screenshot({path:out+'/mobile.png'});
  console.log('Game: timing, deceleration, transparent materials, preview, pause/reset/off, curve undo, save/reload and mobile passed');

  // Isolate the refractive ring against a stationary grid, so pixel differences measure the actual shader.
  document.settings={...document.settings,burstShockwaveDuration:.32,puddleEnabled:0,slimeEyeEjectEnabled:0,...Object.fromEntries(Array.from({length:6},(_,i)=>[`burstLayer${i}Enabled`,0]))};
  await page.setViewportSize({width:1440,height:1000});await page.goto(url+'/slime-burst-lab.html');
  await page.waitForFunction(()=>window.__BURST_LAB__?.snapshot().ready,{},{timeout:60000});
  const lab=()=>page.evaluate(()=>window.__BURST_LAB__.snapshot());
  const seek=n=>page.evaluate(n=>window.__BURST_LAB__.seek(n),n);
  const setLab=async(key,value)=>{const f=page.locator(`input[type=number][data-key=${key}]`);await f.fill(String(value));await f.dispatchEvent('input');await page.waitForTimeout(80);};
  const burst=(await lab()).burstFrame;await seek(burst-1);assert.equal((await lab()).shockwave.waves.length,0);
  await seek(burst+10);results.lab=(await lab()).shockwave;
  await seek(burst-5);await seek(burst+10);assert.deepEqual((await lab()).shockwave,results.lab);
  await page.locator('#lab-settings-category').selectOption('shockwave');
  results.pixels=[];
  for(const view of ['front','perspective']){
    await page.locator(`[data-view=${view}]`).click();await setLab('burstShockwaveEnabled',1);await seek(burst+10);
    const band=(await lab()).shockwave.screen[0];
    const on=await page.locator('#view canvas').screenshot({path:out+`/${view}-on.png`});
    await setLab('burstShockwaveEnabled',0);
    const off=await page.locator('#view canvas').screenshot({path:out+`/${view}-off.png`});
    const pixels=await page.evaluate(async({on,off,band})=>{
      const decode=async data=>{const blob=new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}),bitmap=await createImageBitmap(blob),c=new OffscreenCanvas(bitmap.width,bitmap.height),ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,data:ctx.getImageData(0,0,bitmap.width,bitmap.height).data};};
      const a=await decode(on),b=await decode(off);let inside=0,changedInside=0,outside=0,changedOutside=0,maxOutside=0;
      for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
        const i=(y*a.width+x)*4,diff=Math.max(...[0,1,2].map(c=>Math.abs(a.data[i+c]-b.data[i+c])));
        const d=Math.hypot((x+.5-band.x*a.width)*390/a.width,(y+.5-band.y*a.height)*390/a.width);
        if(Math.abs(d-band.radius)<=band.width/2+2){inside++;if(diff>3)changedInside++;}
        else{outside++;maxOutside=Math.max(maxOutside,diff);if(diff>3)changedOutside++;}
      }
      return {inside,changedInside,outside,changedOutside,maxOutside};
    },{on:on.toString('base64'),off:off.toString('base64'),band});
    results.pixels.push({view,band,...pixels});
    assert.ok(pixels.changedInside>30,`${view}: no visible refraction`);
    assert.ok(pixels.changedOutside/pixels.outside<.0001,`${view}: global image changed ${JSON.stringify(pixels)}`);
  }
  await setLab('burstShockwaveEnabled',1);await setLab('burstShockwaveRadius',4.1);
  await page.locator('#save').click();await page.waitForFunction(()=>document.querySelector('#message').textContent.includes('已保存'));
  assert.equal(document.settings.burstShockwaveRadius,4.1);assert.equal(document.settings.monsterCount,2);
  assert.deepEqual(document.settings.burstShockwaveSpeedCurve,savedCurve);
  await seek(burst+60);assert.equal((await lab()).shockwave.waves.length,0);await seek(0);assert.equal((await lab()).shockwave.waves.length,0);
  await page.setViewportSize({width:390,height:844});await seek(burst+10);assert.ok((await lab()).shockwave.screen[0].radius>0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
  await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));
  console.log('Lab: deterministic replay, bounded pixel refraction in two views, merged save and resize passed');
}finally{await browser.close();}
