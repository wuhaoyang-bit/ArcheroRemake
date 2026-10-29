import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/slime-ground-trail';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/assets/lush-burst/scene.bin',r=>r.fulfill({path:'public/assets/lush-burst/scene.bin',contentType:'application/octet-stream'}));
 await page.route('**/params.json',async r=>{const response=await r.fetch(),j=await response.json();Object.assign(j.settings,{puddleRenderer:2,puddleEnabled:1,monsterCount:2,monsterSpeed:2});await r.fulfill({json:j});});
 await page.route(/\/src\/main\.ts(?:\?.*)?$/,async r=>{const response=await r.fetch(),source=await response.text();assert.match(source,/__ARCHERO__:\s*\{/);await r.fulfill({response,body:source.replace(/__ARCHERO__:\s*\{/,'__ARCHERO__: { testGame:game, testController:controller,')});});
 await page.goto('http://127.0.0.1:5173');
 await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,{},{timeout:240000});console.log('Game ready');
 await page.locator('#switch-monster-training').click();
 await page.evaluate(()=>{
  const a=window.__ARCHERO__;a.pauseForInspection(true);const g=a.testGame,c=a.testController;
  c.position={x:0,z:5};c.settings.viewWidth=11;
  g.feedback.dummies.forEach((d,i)=>{Object.assign(d.response.position,{x:i?1.6:-1.6,z:i?-1:0});d.response.reset();});
  g.feedback.refresh(c.settings);g.burstEffects.clear();g.advanceFeedback(0);g.sync(0);g.render();
 });
 const step=async(n)=>page.evaluate(n=>{const a=window.__ARCHERO__;for(let i=0;i<n;i++)a.stepInspection(1/120);return a.snapshot().burstEffects.ground.trail;},n);
 const moving=await step(190);console.log('Moving',JSON.stringify({marks:moving.marks,strands:moving.strands,attached:moving.attached,breaking:moving.breaking}));
 assert.ok(moving.marks>0);assert.ok(moving.attached>0);
 await page.locator('#settings-category').selectOption('slime-trail');
 await page.locator('#viewport').screenshot({path:`${out}/moving.png`});
 // A low camera using the actual scene makes the material and ground junction reviewable.
 await page.evaluate(()=>{const g=window.__ARCHERO__.testGame;g.camera.left=-3.2;g.camera.right=3.2;g.camera.top=5.8;g.camera.bottom=-5.8;g.camera.position.set(4,3,-5);g.camera.lookAt(0,.2,1.8);g.camera.updateProjectionMatrix();g.camera.updateMatrixWorld();g.render();});
 await page.locator('#viewport').screenshot({path:`${out}/material-close.png`});
 const turning=await page.evaluate(()=>{const a=window.__ARCHERO__;a.testController.position={x:5,z:2};for(let i=0;i<12;i++)a.stepInspection(1/120);return a.snapshot().burstEffects.ground.trail;});
 let matches=0;for(const anchor of turning.anchors){const old=moving.anchors.find(a=>a.id===anchor.id&&a.markId===anchor.markId);if(old){assert.deepEqual(anchor.ground,old.ground);matches++;}}assert.ok(matches>0);
 await page.locator('#viewport').screenshot({path:`${out}/turning.png`});
 await page.locator('#value-slimeStrandWidth').fill('0.24');await page.locator('#value-slimeStrandWidth').press('Tab');
 assert.equal(await page.evaluate(()=>window.__ARCHERO__.testController.settings.slimeStrandWidth),.24);
 await page.locator('#undo-settings').click();assert.equal(await page.evaluate(()=>window.__ARCHERO__.testController.settings.slimeStrandWidth),.15);
 const materials=await page.evaluate(()=>{const a=window.__ARCHERO__,g=a.testGame,c=a.testController.settings;c.puddleRoughness=.33;g.advanceFeedback(0);const floor=g.scene.getObjectByName('UnifiedSlimeSurface').material,strand=g.scene.getObjectByName('SlimeGroundStrands').material;return {floor:{roughness:floor.roughness,ior:floor.ior,metalness:floor.metalness,transmission:floor.transmission},strand:{roughness:strand.roughness,ior:strand.ior,metalness:strand.metalness,transmission:strand.transmission}};});
 assert.deepEqual(materials.floor,materials.strand);
 const stopped=await page.evaluate(()=>{window.__ARCHERO__.testController.settings.monsterSpeed=0;return 0;}).then(()=>step(100));assert.equal(stopped.strands,0);assert.ok(stopped.marks>0);
 const switched=await page.evaluate(()=>{const a=window.__ARCHERO__;a.testController.settings.puddleRenderer=1;a.stepInspection(0);return a.testGame.scene.getObjectByName('SlimeGroundStrands').visible;});assert.equal(switched,false);
 await page.evaluate(()=>{const a=window.__ARCHERO__;a.testController.settings.puddleRenderer=2;a.stepInspection(0);});
 await page.locator('#reset-dummies').click();const reset=await page.evaluate(()=>window.__ARCHERO__.snapshot().burstEffects.ground.trail);assert.equal(reset.marks,0);assert.equal(reset.strands,0);
 assert.deepEqual(errors,[]);
 await writeFile(`${out}/results.json`,JSON.stringify({moving,turning,stopped,materials,reset,errors},null,2));
 console.log('PASS: real game movement, pinned anchors through turns, live controls and undo, shared liquid material properties, stop/retract, mode switch, reset; no WebGPU errors.');
}finally{await browser.close();}
