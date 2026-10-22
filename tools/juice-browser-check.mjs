import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {HIT_DEFAULTS} from '../src/hit-feedback-config.ts';
const original=await readFile('public/params.json','utf8'),settings={...JSON.parse(original).settings,...HIT_DEFAULTS,monsterScale:1,monsterHitSpeed:1,arrowPierce:0,arrowsPerAttack:1,attackSpeed:1,targetModel:1,targetCone:45,lockRange:30};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const errors=[],page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5173/juice-lab.html');await page.waitForFunction(()=>window.__JUICE_LAB__);
 const lab=await page.evaluate(()=>{window.__JUICE_LAB__.seek(7);const before=window.__JUICE_LAB__.snapshot();window.__JUICE_LAB__.seek(8);return {before,after:window.__JUICE_LAB__.snapshot()};});
 assert.equal(lab.before.juice.active,0);assert.equal(lab.after.juice.active,16);assert.equal(lab.after.params.curve,'easeOutCubic');assert.equal(lab.after.params.size,.6);assert.equal(lab.after.params.delay,.13);
 await page.evaluate(()=>window.__JUICE_LAB__.seek(25));await mkdir('analysis/juice',{recursive:true});await page.screenshot({path:'analysis/juice/lab.png'});
 const compare=lab.after.juice.particles;
 assert.equal(await page.locator('#seed').count(),0);await page.locator('#burst').click();await page.evaluate(()=>window.__JUICE_LAB__.seek(8));assert.notDeepEqual((await page.evaluate(()=>window.__JUICE_LAB__.snapshot())).juice.particles,compare);
 await page.route('**/params.json',r=>r.fulfill({json:{version:1,settings}}));await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);
 assert.equal(await page.locator('#value-juiceCurve').inputValue(),'2');assert.equal(await page.locator('#value-juiceColor').inputValue(),'#55991e');assert.equal(await page.locator('#value-juiceSize').inputValue(),'0.6');
 await page.locator('#switch-locking-training').click();const box=await page.locator('#viewport').boundingBox();await page.mouse.click(box.x+box.width/2,box.y+box.height*.65);
 await page.waitForFunction(()=>{const s=window.__ARCHERO__.snapshot();return s.juice.active>0&&s.particles.active>0;});await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 const s=await page.evaluate(()=>window.__ARCHERO__.snapshot());const group=s.juice.particles.slice(0,16);assert.equal(group.length,16);
 for(let i=0;i<16;i++){
  const p=group[i];assert.ok(p.s0>=.52&&p.s0<=.68&&p.speed0>=3&&p.speed0<=5);
  const u=p.age/p.life;assert.ok(Math.abs(p.size-Math.max(.01,p.s0*(1-u)**3))<1e-8);
  assert.ok(Math.abs(p.position[0]-p.ox-p.dirX*p.speed0*p.life*(1-(1-u)**4)/4)<1e-8);
 }
 const target=s.feedback.find(d=>d.id===s.arrows.lastHit);assert.ok(Math.abs(group[0].oy-target.aimHeight-.1)<1e-8);
 await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(false));await page.waitForFunction(()=>window.__ARCHERO__.snapshot().juice.particles.some(p=>p.age>.2));await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 await page.locator('#viewport').screenshot({path:'analysis/juice/game.png'});
 await page.locator('#reset-dummies').click();const reset=await page.evaluate(()=>window.__ARCHERO__.snapshot());assert.equal(reset.juice.active,0);assert.equal(reset.juice.pending.length,0);
 await page.goto('http://127.0.0.1:5173/spider-viewer.html');await page.waitForFunction(()=>window.__SPIDER_VIEWER__);await page.selectOption('#clip','Hitted');
 const seek=t=>page.evaluate(t=>{window.__SPIDER_VIEWER__.seek(t);return window.__SPIDER_VIEWER__.snapshot();},t);
 assert.equal((await seek(.129)).juice.active,0);assert.equal((await seek(.13)).juice.active,16);const first=await seek(.5);await seek(1);assert.deepEqual((await seek(.5)).juice.particles,first.juice.particles);
 await page.locator('[data-key="juiceDelay"]').fill('.4');await page.locator('[data-key="juiceDelay"]').dispatchEvent('change');assert.equal((await seek(.399)).juice.active,0);assert.equal((await seek(.4)).juice.active,16);
 await page.locator('#all-off').click();assert.equal((await seek(.5)).juice.active,0);
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);console.log('PASS lab/game random bursts within screenshot ranges and matching OutCubic trajectories; independent delayed emission; sparks coexist; reset; viewer seek and timing control; settings preserved');
}finally{await browser.close();}
