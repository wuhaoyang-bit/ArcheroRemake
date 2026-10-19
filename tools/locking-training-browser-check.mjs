import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const original = await readFile('public/params.json', 'utf8');
await mkdir('analysis/locking-training-checks', {recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try {
  const page = await browser.newPage({viewport:{width:1440,height:1100},hasTouch:true}), errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  // All tuning stays local to this test page; never write the user's JSON.
  await page.route('**/params.json', route=>route.fulfill({contentType:'application/json',body:original}));
  await page.goto('http://localhost:5173');
  await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
  const snapshot = ()=>page.evaluate(()=>window.__ARCHERO__.snapshot());
  const initial = await snapshot();
  await page.locator('#switch-locking-training').click();
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().trainingTargets.length===8);
  const field = await snapshot();
  assert.equal(field.training,'locking'); assert.deepEqual(field.position,{x:0,z:0});
  assert.equal(field.pointerId,null);assert.equal(field.mode,'idle');assert.deepEqual(field.settings,initial.settings);
  const signs = field.trainingTargets.map(({position:[x,,z]})=>`${Math.sign(x)},${Math.sign(z)}`);
  assert.equal(new Set(signs).size,8);
  for(const target of field.trainingTargets) {
    const [x,,z]=target.position;
    assert.ok(Math.abs(x)<field.settings.roomSize/2 && Math.abs(z)<field.settings.roomLength/2);
  }
  await page.waitForTimeout(450);
  await page.screenshot({path:'analysis/locking-training-checks/desktop.png',fullPage:true});
  await page.locator('#viewport').screenshot({path:'analysis/locking-training-checks/field.png'});
  await page.locator('#switch-training').click();
  assert.equal((await snapshot()).training,'obstacles');assert.equal((await snapshot()).trainingTargets.length,0);
  await page.locator('#switch-locking-training').click();
  assert.equal((await snapshot()).trainingTargets.length,8);
  await page.locator('#switch-locking-training').click();
  assert.equal((await snapshot()).training,'free');assert.equal((await snapshot()).trainingTargets.length,0);
  // Real DOM input still runs the existing anchor-driven movement in the new field.
  await page.locator('#switch-locking-training').click();
  const box=await page.locator('#viewport').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.6;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+60,y);
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().position.x>.4);
  await page.mouse.up();const released=await snapshot();assert.equal(released.mode,'idle');
  assert.equal(released.completions,0);assert.equal(released.passedCheckpoints,0);assert.ok(released.offset.x>0);
  // Dimensions rebuild exactly one set of props; sliders affect this page only.
  await page.locator('#slider-roomSize').evaluate(input=>{input.value='8';input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.locator('#slider-roomLength').evaluate(input=>{input.value='8';input.dispatchEvent(new Event('input',{bubbles:true}))});
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().trainingTargets.every(t=>Math.abs(t.position[0])<=2&&Math.abs(t.position[2])<=2));
  assert.equal((await snapshot()).trainingTargets.length,8);
  // Re-entry is centered even after tuning and walking around.
  await page.locator('#switch-locking-training').click();await page.locator('#switch-locking-training').click();
  assert.deepEqual((await snapshot()).position,{x:0,z:0});
  await page.locator('#viewport').screenshot({path:'analysis/locking-training-checks/small-room.png'});
  await page.setViewportSize({width:390,height:844});await page.reload();
  await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
  await page.locator('#switch-locking-training').tap();
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().training==='locking');
  await page.waitForTimeout(300);await page.screenshot({path:'analysis/locking-training-checks/mobile.png'});
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});await page.waitForTimeout(150);
    const rect=await page.locator('#viewport').boundingBox();
    const boxes=await Promise.all(['#switch-training','#switch-locking-training','#open-settings'].map(id=>page.locator(id).boundingBox()));
    for(const b of boxes){assert.ok(b.x>=rect.x && b.x+b.width<=rect.x+rect.width+1);assert.ok(b.y>=rect.y && b.y+b.height<=rect.y+rect.height)}
    for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
      const a=boxes[i],b=boxes[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  }
  assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
  console.log('PASS: eight directions, centered entry, 3-way switching, dimension rebuild, unchanged input/tuning, desktop/mobile layout; no runtime errors.');
} finally {await browser.close()}
