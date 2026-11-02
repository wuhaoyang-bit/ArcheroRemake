import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';

const original=await readFile('public/params.json','utf8');
const out='analysis/camera-shake-check';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[],results=[];
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}});
  page.on('pageerror',e=>errors.push(e.message));
  let document={version:1,settings:{monsterCount:1,monsterSpeed:0,slimeInjectionAmount:100,slimeCapacity:100,recoilEnabled:0,cameraZoomShotEnabled:0,cameraZoomHitEnabled:0}};
  await page.route('**/params.json',r=>r.fulfill({json:document}));
  await page.route('**/__save-params',r=>{document=r.request().postDataJSON();return r.fulfill({json:{ok:true}});});
  const open=async()=>{await page.goto(process.env.ARCHERO_URL??'http://127.0.0.1:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,{},{timeout:60000});await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));};
  const snap=()=>page.evaluate(()=>window.__ARCHERO__.snapshot());
  const number=async(key,value)=>{await page.locator('#value-'+key).fill(String(value));await page.locator('#value-'+key).dispatchEvent('change');};
  const select=async(key,value)=>page.locator('#value-'+key).selectOption(String(value));
  await open();await page.locator('#settings-category').selectOption('camera-shake');
  assert.equal(await page.locator('.settings-category:visible').count(),1);
  assert.equal(await page.locator('#value-cameraShakeTier').inputValue(),'1');
  assert.equal(await page.locator('#camera-shake-edit-tier').count(),0);
  assert.equal(await page.locator('#value-cameraShakeMidA0').isVisible(),true);
  // Selection, editor and preview must follow the same setting, including undo.
  await select('cameraShakeTier',2);await page.locator('#undo-settings').click();
  assert.equal(await page.locator('#value-cameraShakeTier').inputValue(),'1');
  assert.equal(await page.locator('#value-cameraShakeMidA0').isVisible(),true);
  assert.equal(await page.locator('#value-cameraShakeStrongA0').isVisible(),false);
  await page.locator('#camera-shake-preview').click();assert.equal((await snap()).cameraShake.tier,'mid');
  await number('cameraShakeMidA0',6.5);await page.locator('#undo-settings').click();
  assert.equal((await snap()).settings.cameraShakeMidA0,4);
  await page.locator('#switch-monster-training').click();

  for(const [index,tier,prefix,amplitude] of [[0,'weak','Weak',3],[1,'mid','Mid',6],[2,'strong','Strong',10]]){
    await select('cameraShakeTier',index);await number(`cameraShake${prefix}A0`,amplitude);
    assert.equal(await page.locator('[data-shake-tier]:visible').getAttribute('data-shake-tier'),tier);
    await page.locator('#camera-shake-preview').click();assert.equal((await snap()).cameraShake.tier,tier);
    await number(`cameraShake${prefix}Duration`,30);
    near((await snap()).settings[`cameraShake${prefix}Decay`],1/30);
    await select(`cameraShake${prefix}Formula`,1);
    assert.equal(await page.locator(`#value-cameraShake${prefix}Decay`).isVisible(),true);
    assert.equal(await page.locator(`#value-cameraShake${prefix}P`).isVisible(),false);
    await number(`cameraShake${prefix}Decay`,.04);
    await select(`cameraShake${prefix}Formula`,index===2?1:0);
    await page.locator('#reset-dummies').click();
    const before=await snap();
    await page.evaluate(id=>window.__ARCHERO__.testSlimeHit(id),before.feedback[0].id);
    assert.equal((await snap()).cameraShake.triggers,0);
    const burst=await page.evaluate(()=>{
      const api=window.__ARCHERO__;let winding=false;
      for(let i=0;i<1200;i++){
        api.stepInspection(1/120);const s=api.snapshot(),gone=s.feedback[0].burst.phase==='gone';
        if(s.feedback[0].burst.phase==='winding')winding=true;
        if(!gone&&s.cameraShake.triggers)throw new Error('Shake started before explosion');
        if(gone)return {winding,shake:s.cameraShake,view:s.cameraView};
      }
      throw new Error('Explosion did not occur');
    });
    assert.equal(burst.winding,true);assert.equal(burst.shake.triggers,1);assert.equal(burst.shake.tier,tier);
    assert.equal(burst.shake.frame,0);assert.equal(burst.shake.active,true);
    await page.evaluate(()=>window.__ARCHERO__.stepInspection(1/60));
    const active=await snap();assert.ok(Math.hypot(active.cameraShake.offset.x,active.cameraShake.offset.y)>0);
    if(tier==='weak')assert.equal(active.cameraShake.offset.x,0);
    assert.equal(active.cameraView.enabled,true);near(active.cameraView.offsetX,-active.cameraShake.offset.x);near(active.cameraView.offsetY,active.cameraShake.offset.y);
    const frozen=active.cameraShake;await page.waitForTimeout(80);assert.deepEqual((await snap()).cameraShake,frozen);
    await page.evaluate(()=>{for(let i=0;i<65;i++)window.__ARCHERO__.stepInspection(1/120);});
    assert.deepEqual((await snap()).cameraShake.offset,{x:0,y:0});assert.equal((await snap()).cameraView.enabled,false);
    results.push({tier,burst,active:active.cameraShake});
  }

  // Preview changes projection, not player/target positions or joystick geometry.
  await page.locator('#reset-dummies').click();
  const baseline=await snap(),knob=await page.locator('.knob').boundingBox();
  await page.locator('#camera-shake-preview').click();const preview=await snap();
  assert.deepEqual(preview.position,baseline.position);
  assert.deepEqual(preview.trainingTargets.map(t=>({id:t.id,position:t.position})),baseline.trainingTargets.map(t=>({id:t.id,position:t.position})));
  assert.deepEqual(await page.locator('.knob').boundingBox(),knob);
  near(preview.footNdc[0]-baseline.footNdc[0],2*preview.cameraShake.offset.x/390);
  near(preview.footNdc[1]-baseline.footNdc[1],2*preview.cameraShake.offset.y/preview.cameraView.fullHeight);
  await select('cameraShakeEnabled',0);await page.evaluate(()=>window.__ARCHERO__.stepInspection(0));
  assert.equal((await snap()).cameraView.enabled,false);assert.equal(await page.locator('#camera-shake-preview').isDisabled(),true);
  await page.evaluate(()=>{const api=window.__ARCHERO__;api.testSlimeHit(api.snapshot().feedback[0].id);for(let i=0;i<600;i++)api.stepInspection(1/120);});
  assert.equal((await snap()).cameraShake.active,false);assert.equal((await snap()).cameraShake.triggers,1);
  await select('cameraShakeEnabled',1);

  await page.locator('#save-settings').click();await page.waitForFunction(()=>document.querySelector('#store-status').textContent==='已写入 params.json');
  await number('cameraShakeStrongA0',17);await page.locator('#restore').click();assert.equal((await snap()).settings.cameraShakeStrongA0,10);
  await open();await page.locator('#settings-category').selectOption('camera-shake');
  const restored=(await snap()).settings;
  assert.equal(restored.cameraShakeTier,2);assert.equal(restored.cameraShakeWeakA0,3);assert.equal(restored.cameraShakeMidA0,6);assert.equal(restored.cameraShakeStrongA0,10);
  assert.equal(await page.locator('#value-cameraShakeTier').inputValue(),'2');
  assert.equal(await page.locator('#value-cameraShakeStrongA0').isVisible(),true);
  assert.equal(await page.locator('#value-cameraShakeMidA0').isVisible(),false);
  await page.locator('#camera-shake-preview').click();assert.equal((await snap()).cameraShake.active,true);assert.equal((await snap()).cameraShake.tier,'strong');
  await page.locator('#switch-monster-training').click();assert.equal((await snap()).cameraShake.active,false);

  // Real arrow -> explosion, with zoom enabled simultaneously.
  await page.locator('#settings-category').selectOption('camera-zoom');
  await number('cameraZoomShotEnabled',1);await number('cameraZoomHitEnabled',1);await number('cameraZoomHold',.3);
  await page.locator('#settings-category').selectOption('camera-shake');
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(false));
  const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.65);
  await page.waitForFunction(()=>window.__ARCHERO__.snapshot().cameraShake.triggers>0,{},{timeout:30000});
  await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
  const live=await snap();assert.ok(live.arrows.hits>0);assert.ok(live.cameraZoom.triggers.hit>0);assert.ok(live.cameraZoom.triggers.shot>0);
  results.push({live:{arrows:live.arrows.hits,shake:live.cameraShake,zoom:live.cameraZoom}});
  await page.screenshot({path:out+'/desktop.png'});
  await page.locator('#reset-dummies').click();assert.equal((await snap()).cameraShake.active,false);assert.equal((await snap()).cameraView.enabled,false);

  await page.setViewportSize({width:390,height:844});await page.locator('#open-settings').click();
  await page.locator('#settings-category').selectOption('camera-shake');
  assert.equal(await page.locator('#value-cameraShakeTier').isVisible(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:out+'/mobile.png'});
  assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
  await writeFile(out+'/results.json',JSON.stringify({results,errors},null,2));
  console.log('PASS explosion timing, all tiers, preview projection, pause/reset/off, save/reload/undo, real arrows with zoom, mobile layout');
}finally{await browser.close();}
