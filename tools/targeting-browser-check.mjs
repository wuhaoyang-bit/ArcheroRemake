import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const original = await readFile('public/params.json', 'utf8');
// Keep target geometry/timing predictable even after the user tunes the live JSON.
let saved = {version:1,settings:{...JSON.parse(original).settings,
  targetModel:0,lockRange:22,showLockRange:0,targetCone:90,targetAdvantage:8,targetDwell:160}};
const fixture = structuredClone(saved.settings);
const out = 'analysis/targeting-checks';
await mkdir(out, {recursive:true});
const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors = [], results = [];
let page;
const near = (a,b,e=.001) => assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const snap = p => p.evaluate(()=>window.__ARCHERO__.snapshot());
const ready = p => p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
const set = (p,key,value) => p.locator(`#value-${key}`).evaluate((input,value)=>{
  input.value=String(value); input.dispatchEvent(new Event('change',{bubbles:true}));
},value);
async function check(name, action) { await action(); results.push(name); console.log(`PASS ${name}`); }
async function prepare(p) {
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/params.json',r=>r.fulfill({json:saved}));
  await p.route('**/__save-params',async r=>{saved=r.request().postDataJSON();await r.fulfill({json:{ok:true}})});
  await p.goto(process.env.BASE_URL || 'http://localhost:5173'); await ready(p);
}
try {
  page=await browser.newPage({viewport:{width:1440,height:1100}}); await prepare(page);
  const initial=(await snap(page)).settings;
  await check('explicit lock tuning is preserved; absent lock fields inherit ordinary rotation',async()=>{
    for(const [lock,normal] of [['lockTurnModel','turnModel'],['lockTurnSpeed','turnSpeed'],['lockTurnCurve','turnCurve'],
      ['lockCurveSnapAngle','curveSnapAngle'],['lockSlerpResponse','slerpResponse'],['lockSlerpSnapAngle','slerpSnapAngle'],
      ['lockSmoothTime','smoothTime'],['lockSmoothSnapAngle','smoothSnapAngle']]) assert.deepEqual(initial[lock],fixture[lock]??initial[normal]);
    for(const [key,value] of Object.entries(fixture)) assert.deepEqual(initial[key],value);
  });
  await page.locator('#switch-locking-training').click();
  await check('entry and tuning do not acquire before first game press',async()=>{
    await page.locator('#target-model').selectOption('1'); await page.waitForTimeout(120);
    const s=await snap(page); assert.equal(s.targeting.active,false);assert.equal(s.targeting.target,null);near(s.heading,Math.PI);
    assert.equal(s.debug.lockMarkerVisible,false);assert.equal(await page.locator('#targeting-hud').isVisible(),true);
  });
  const r=await page.locator('#viewport').boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.65;
  await check('first press selects north; in-place and idle both use lock turn',async()=>{
    await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(80);
    let s=await snap(page);assert.equal(s.targeting.target.id,'north');assert.equal(s.turnContext,'lock');
    assert.equal(s.mode,'in-place');assert.deepEqual(s.position,{x:0,z:0});assert.equal(s.debug.lockMarkerVisible,true);
    near(s.debug.lockMarkerPosition[2],-15);
    await page.mouse.up();s=await snap(page);assert.equal(s.turnContext,'lock');assert.equal(s.targeting.target.id,'north');
  });
  await check('all lock rotation models and curve editing are independent of ordinary settings',async()=>{
    for(const [model,field] of [['0','lockTurnSpeed'],['5','lockSlerpResponse'],['6','lockSmoothTime'],['2','lockCurveSnapAngle']]) {
      await page.locator('#lock-turn-model').selectOption(model);
      assert.equal(await page.locator(`#value-${field}`).isVisible(),true);
      assert.equal((await snap(page)).settings.turnModel,initial.turnModel);
    }
    await page.locator('#lock-turn-curve-editor [data-curve=edit]').click();
    await page.locator('.curve-number-dialog[open] input[name=speed]').fill('2750');
    await page.locator('.curve-number-dialog[open] button[type=submit]').click();
    const s=await snap(page);assert.equal(s.settings.lockTurnCurve.at(-1).speed,2750);
    assert.deepEqual(s.settings.turnCurve,initial.turnCurve);
    await page.locator('#lock-turn-model').selectOption('0');await set(page,'lockTurnSpeed',180);
    assert.equal((await snap(page)).settings.turnSpeed,initial.turnSpeed);
  });
  await check('range invalidation clears lock immediately and restoration acquires in idle',async()=>{
    await set(page,'lockRange',4);let s=await snap(page);assert.equal(s.targeting.target,null);assert.equal(s.turnContext,'ordinary');
    await set(page,'lockRange',22);s=await snap(page);assert.equal(s.targeting.target.id,'north');assert.equal(s.turnContext,'lock');
    await page.locator('#show-lock-range').check();await set(page,'lockRange',8);
    await page.waitForFunction(()=>window.__ARCHERO__.snapshot().debug.lockRangeVisible);
    near((await snap(page)).debug.lockRangeRadius,8);
    await page.locator('#target-model').selectOption('0');assert.ok(['east','west'].includes((await snap(page)).targeting.target.id));
    await page.screenshot({path:`${out}/desktop-range.png`,fullPage:true});
    await set(page,'lockRange',22);
  });
  await check('re-press and sub-threshold movement keep facing the enemy; unlocking returns to anchor steering',async()=>{
    // A is facing a side target, whereas the retained anchor direction is north.
    await page.waitForFunction(()=>{
      const s=window.__ARCHERO__.snapshot();
      return Math.abs(Math.atan2(Math.sin(s.heading-s.targetHeading),Math.cos(s.heading-s.targetHeading)))<.001;
    });
    const before=await snap(page);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+4,y);
    await page.waitForTimeout(180);
    let s=await snap(page);assert.equal(s.mode,'in-place');assert.equal(s.turnContext,'lock');
    assert.equal(s.targeting.target.id,before.targeting.target.id);
    near(s.heading,before.heading,.002);assert.deepEqual(s.offset,before.offset);assert.deepEqual(s.position,before.position);
    await page.mouse.move(x,y-50);
    await page.waitForFunction(()=>window.__ARCHERO__.snapshot().mode==='moving');
    s=await snap(page);assert.equal(s.turnContext,'ordinary');near(s.targetHeading,s.anchorHeading);
    await page.mouse.up();assert.equal((await snap(page)).turnContext,'lock');
  });
  await check('B follows the actual anchor and final release coordinate; stationary body rotation leaves anchor intact',async()=>{
    await page.locator('#target-model').selectOption('1');await set(page,'moveSpeed',1);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+50,y);
    await page.waitForFunction(()=>window.__ARCHERO__.snapshot().targeting.target?.id==='east');
    assert.equal((await snap(page)).turnContext,'ordinary');
    // Deliver a terminal coordinate that differs from the last drawn stick.
    const release=await page.evaluate(({x,y})=>{
      const s=window.__ARCHERO__.snapshot();
      window.dispatchEvent(new PointerEvent('pointerup',{pointerId:s.pointerId,pointerType:'mouse',clientX:x,clientY:y-65,bubbles:true}));
      return window.__ARCHERO__.snapshot();
    },{x,y});
    await page.mouse.up();
    assert.equal(release.mode,'idle');assert.equal(release.targeting.target.id,'north');near(release.offset.x,0);
    assert.ok(release.offset.z<0);assert.equal(release.turnContext,'lock');
    await page.waitForTimeout(250);const after=await snap(page);
    assert.deepEqual(after.offset,release.offset);assert.deepEqual(after.position,release.position);
  });
  await check('C candidate feedback, release resets exact timer while preserving old target, idle dwell then switches',async()=>{
    await page.locator('#switch-locking-training').click();await page.locator('#switch-locking-training').click();
    await page.locator('#target-model').selectOption('2');await set(page,'targetDwell',1000);
    await page.mouse.move(x,y);await page.mouse.down();
    assert.equal((await snap(page)).targeting.target.id,'north');
    await page.mouse.move(x+50,y);
    await page.waitForFunction(()=>window.__ARCHERO__.snapshot().targeting.elapsedMs>50);
    let s=await snap(page);assert.equal(s.targeting.target.id,'north');assert.equal(s.targeting.candidate.id,'east');
    assert.equal(s.debug.candidateMarkerVisible,true);
    await page.evaluate(()=>window.addEventListener('pointerup',()=>{window.__releaseSnapshot=window.__ARCHERO__.snapshot()},{once:true}));
    await page.mouse.up();s=await page.evaluate(()=>window.__releaseSnapshot);
    assert.equal(s.targeting.elapsedMs,0);assert.equal(s.targeting.target.id,'north');assert.equal(s.turnContext,'lock');
    await page.waitForFunction(()=>window.__ARCHERO__.snapshot().targeting.target?.id==='east',null,{timeout:5000});
    assert.equal((await snap(page)).mode,'idle');
  });
  await check('JSON save/reload keeps independent models and curves but never persists acquired target',async()=>{
    await set(page,'targetCone',120);await set(page,'targetAdvantage',12);await set(page,'targetDwell',230);
    const before=(await snap(page)).settings;
    await page.locator('#save-settings').click();await page.waitForFunction(()=>document.querySelector('#store-status').textContent.includes('已写入'));
    assert.deepEqual(saved.settings,before);assert.equal('targeting' in saved.settings,false);
    await page.reload();await ready(page);assert.deepEqual((await snap(page)).settings,before);
    await page.locator('#switch-locking-training').click();assert.equal((await snap(page)).targeting.active,false);
    await page.locator('#target-model').scrollIntoViewIfNeeded();
    await page.locator('.right-panel').evaluate(el=>{el.scrollTop=el.scrollHeight});
    await page.screenshot({path:`${out}/desktop-settings.png`,fullPage:true});
  });
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
  const mobile=await ctx.newPage();await prepare(mobile);
  await check('mobile controls do not acquire, real touch does; release switches turning context',async()=>{
    await mobile.locator('#switch-locking-training').tap();await mobile.locator('#open-settings').tap();
    await mobile.locator('#target-model').selectOption('1');await set(mobile,'lockRange',10);
    await mobile.locator('#lock-turn-model').selectOption('5');await set(mobile,'lockSlerpResponse',30);
    assert.equal((await snap(mobile)).targeting.active,false);
    await mobile.locator('#target-model').scrollIntoViewIfNeeded();
    await mobile.screenshot({path:`${out}/mobile-settings.png`});
    await mobile.locator('#close-settings').tap();
    const cdp=await ctx.newCDPSession(mobile);
    const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:5,radiusY:5,force:1}))});
      await mobile.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
    await touch('touchStart',[[1,150,640]]);let s=await snap(mobile);assert.equal(s.targeting.active,true);assert.equal(s.turnContext,'ordinary');
    await touch('touchMove',[[1,200,640]]);await mobile.waitForFunction(()=>window.__ARCHERO__.snapshot().targeting.target?.id==='east');
    const offset=(await snap(mobile)).offset;
    await touch('touchStart',[[1,200,640],[2,250,600]]);s=await snap(mobile);assert.deepEqual(s.offset,offset);assert.equal(s.turnContext,'ordinary');
    await touch('touchEnd',[[2,250,600]]);s=await snap(mobile);assert.equal(s.mode,'idle');assert.equal(s.turnContext,'lock');
    const stopped=s.position;await touch('touchMove',[[1,180,640]]);assert.deepEqual((await snap(mobile)).position,stopped);
    await touch('touchEnd',[]);await mobile.screenshot({path:`${out}/mobile-lock.png`});
  });
  await check('390 and 320px layouts keep controls inside viewport, settings sheet remains scrollable',async()=>{
    for(const width of [390,320]) {
      await mobile.setViewportSize({width,height:844});await mobile.waitForTimeout(100);
      assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      const rect=await mobile.locator('#viewport').boundingBox();
      for(const id of ['#switch-training','#switch-locking-training','#open-settings','#targeting-hud']) {
        const b=await mobile.locator(id).boundingBox();assert.ok(b.x>=rect.x&&b.x+b.width<=rect.x+rect.width+1);
      }
      await mobile.locator('#open-settings').tap();await mobile.locator('#lock-turn-model').scrollIntoViewIfNeeded();
      assert.equal(await mobile.locator('#lock-turn-model').isVisible(),true);assert.equal((await snap(mobile)).mode,'idle');
      await mobile.locator('#close-settings').tap();
    }
  });
  assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
  await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));
  console.log(`${results.length} targeting browser checks passed; user params unchanged.`);
} catch(error) {
  if(page&&!page.isClosed()) await page.screenshot({path:`${out}/failure.png`,fullPage:true}).catch(()=>{});
  await writeFile(`${out}/results.json`,JSON.stringify({results,errors,failure:String(error)},null,2));
  throw error;
} finally {await browser.close()}
