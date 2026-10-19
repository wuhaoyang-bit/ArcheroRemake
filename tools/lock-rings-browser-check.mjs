import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
const out='analysis/lock-rings-checks';await mkdir(out,{recursive:true});
const original=await readFile('public/params.json','utf8');
let saved={version:1,settings:{...JSON.parse(original).settings,targetModel:0,lockRange:30,ringDuration:1.2,ringCurve:[0,10,25,50,75,90,100].map(time=>({time,progress:Number((100*(1-(1-time/100)**3)).toFixed(3))}))}};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[],results=[];const snap=p=>p.evaluate(()=>window.__ARCHERO__.snapshot());
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
const set=async(p,key,value)=>{await p.locator('#value-'+key).evaluate((input,v)=>{input.value=String(v);input.dispatchEvent(new Event('change',{bubbles:true}))},value);await frame(p)};
async function prepare(p){p.on('pageerror',e=>errors.push(e.message));await p.route('**/params.json',r=>r.fulfill({json:saved}));await p.route('**/__save-params',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{ok:true}})});await p.goto('http://localhost:5173');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000})}
async function check(name,run){await run();results.push(name);console.log('PASS '+name)}
try{
 const page=await browser.newPage({viewport:{width:1440,height:1100}});await prepare(page);
 await page.locator('#switch-locking-training').click();
 const box=await page.locator('#viewport').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.68;
 await check('first lock shows both circles; moving target during shrink preserves radius origin and timer',async()=>{
  assert.equal(await page.locator('.lock-rings').isVisible(),false);
  await page.mouse.move(x,y);await page.mouse.down();await frame(page);
  const a=(await snap(page)).debug.rings;assert.ok(a.targetId);assert.ok(a.radius>4);assert.equal(a.config.ringDuration,1.2);
  assert.equal(await page.locator('[data-ring=player]').getAttribute('r'),'2');
  await page.locator('#target-model').selectOption('1');await frame(page);
  const b=(await snap(page)).debug.rings;assert.notEqual(a.targetId,b.targetId);assert.equal(b.initialRadius,a.initialRadius);assert.ok(b.elapsed>=a.elapsed);assert.ok(b.radius<=a.radius);
  await page.mouse.up();
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().debug.rings.progress===1);
  assert.equal((await snap(page)).debug.rings.radius,4);
 });
 await check('all ring tuning is deferred across handoff, applied together only after lost lock',async()=>{
  const before=(await snap(page)).debug.rings.config;
  for(const [key,value] of Object.entries({ringPlayerDiameter:6,ringTargetDiameter:12,ringPlayerStroke:1.5,ringTargetStroke:2,ringPlayerHeight:1.6,ringTargetHeight:1.5,ringDuration:.25}))await set(page,key,value);
  assert.deepEqual((await snap(page)).debug.rings.config,before);
  await page.locator('#target-model').selectOption('0');await frame(page);assert.deepEqual((await snap(page)).debug.rings.config,before);
  await set(page,'lockRange',0);assert.equal(await page.locator('.lock-rings').isVisible(),false);
  await set(page,'lockRange',30);await page.waitForFunction(()=>window.__ARCHERO__.snapshot().debug.rings.progress===1);
  const s=(await snap(page)).debug.rings;assert.equal(s.radius,6);assert.equal(s.config.ringPlayerDiameter,6);assert.equal(s.config.ringTargetHeight,1.5);
  assert.equal(await page.locator('[data-ring=target]').getAttribute('stroke-width'),'2');
 });
 await check('fixed projected center ignores running and attacking poses; overlay never captures input',async()=>{
  const center=await page.locator('[data-ring=player]').getAttribute('cy');
  await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(180);assert.equal((await snap(page)).mode,'in-place');
  assert.equal(await page.locator('[data-ring=player]').getAttribute('cy'),center);
  await page.mouse.up();await page.waitForTimeout(250);assert.equal((await snap(page)).attack.playing,true);
  assert.equal(await page.locator('[data-ring=player]').getAttribute('cy'),center);
  assert.equal(await page.locator('.lock-rings').evaluate(e=>getComputedStyle(e).pointerEvents),'none');
  await page.screenshot({path:`${out}/desktop.png`});
 });
 await check('progress editor adds, numerically edits and drags points, fixes endpoints, and saves JSON',async()=>{
  const small=page.locator('#ring-curve-editor');await small.locator('[data-curve=expand]').click();const root=page.locator('.curve-dialog[open] .curve-large');
  const svg=root.locator('svg'),b=await svg.boundingBox();
  const point=(time,progress)=>({x:b.x+(70+time*6.2)*b.width/720,y:b.y+(345-progress*3)*b.height/400});
  let p=point(62.5,95);await page.mouse.dblclick(p.x,p.y);
  assert.ok((await snap(page)).settings.ringCurve.some(p=>Math.abs(p.time-62.5)<.2));
  await root.locator('[data-curve=edit]').click();const dialog=page.locator('.curve-number-dialog[open]');
  await dialog.locator('[name=time]').fill('60');await dialog.locator('[name=progress]').fill('94');await dialog.locator('[type=submit]').click();
  p=point(60,94);const to=point(62,96);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:5});await page.mouse.up();
  const points=(await snap(page)).settings.ringCurve;assert.ok(points.some(p=>Math.abs(p.time-62)<.2));
  p=point(100,100);await page.mouse.click(p.x,p.y);assert.equal(await root.locator('[data-curve=delete]').isDisabled(),true);assert.equal(await root.locator('[data-curve=edit]').isDisabled(),true);
  await page.locator('.curve-dialog[open] .curve-close').click();await page.locator('#save-settings').click();await page.waitForFunction(()=>document.querySelector('#store-status').textContent.includes('已写入'));
  await page.reload();await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
  assert.deepEqual((await snap(page)).settings.ringCurve,saved.settings.ringCurve);assert.equal((await snap(page)).settings.ringTargetDiameter,12);
  assert.equal((await snap(page)).debug.rings.targetId,null);
 });
 const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});const mobile=await ctx.newPage();await prepare(mobile);
 await check('mobile touch and 390/320 layouts scale rings and allow expanded curve editing',async()=>{
  await mobile.locator('#switch-locking-training').tap();await mobile.touchscreen.tap(190,600);
  await mobile.waitForFunction(()=>window.__ARCHERO__.snapshot().debug.rings.progress===1);
  for(const width of [390,320]){
   await mobile.setViewportSize({width,height:844});await frame(mobile);
   const v=await mobile.locator('#viewport').boundingBox();const circle=await mobile.locator('[data-ring=target]').boundingBox();
   assert.ok(Math.abs(circle.width-14*v.width/390)<.1);assert.equal((await snap(mobile)).debug.rings.progress,1);
   assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  await mobile.screenshot({path:`${out}/mobile.png`});
  await mobile.locator('#open-settings').tap();const root=mobile.locator('#ring-curve-editor');await root.scrollIntoViewIfNeeded();await root.locator('[data-curve=expand]').tap();
  assert.equal(await mobile.locator('.curve-dialog[open]').isVisible(),true);await mobile.locator('.curve-dialog[open] .curve-close').tap();
 });
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
 await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));
}finally{await browser.close()}
