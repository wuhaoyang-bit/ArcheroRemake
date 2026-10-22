import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
const original=await readFile('public/params.json','utf8');
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const p=await b.newPage({viewport:{width:1440,height:1100}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 const edit=async(value)=>{await p.locator('#juice-speed-curve-editor [data-curve="edit"]').click();const d=p.locator('dialog[open]');await d.locator('[name=progress]').fill(String(value));await d.locator('[type=submit]').click();};
 await p.goto('http://127.0.0.1:5173/juice-lab.html');await p.waitForFunction(()=>window.__JUICE_LAB__);await p.selectOption('#curveSelect','custom');assert.ok(await p.locator('#juice-speed-curve-editor').isVisible());
 await edit(12);assert.equal((await p.evaluate(()=>window.__JUICE_LAB__.snapshot())).params.speedCurve.at(-1).progress,12);
 // Add a point using the same double-click interaction as rotation tuning.
 const svg=p.locator('#juice-speed-curve-editor svg'),box=await svg.boundingBox();await svg.dblclick({position:{x:box.width*(70+620*.8)/720,y:box.height*(345-300*.25)/400}});
 assert.equal((await p.evaluate(()=>window.__JUICE_LAB__.snapshot())).params.speedCurve.length,6);
 // Drag the new point and retain it when the lab re-renders.
 let state=await p.evaluate(()=>window.__JUICE_LAB__.snapshot());const point=state.params.speedCurve.find(v=>v.time>75&&v.time<85);assert.ok(point);
 const start={x:box.x+box.width*(70+620*point.time/100)/720,y:box.y+box.height*(345-300*point.progress/300)/400};await p.mouse.move(start.x,start.y);await p.mouse.down();await p.mouse.move(start.x+box.width*.02,start.y-10,{steps:5});await p.mouse.up();state=await p.evaluate(()=>window.__JUICE_LAB__.snapshot());assert.ok(state.params.speedCurve.some(v=>v.time>81&&v.time<86));
 await p.locator('#juice-speed-curve-editor [data-curve="expand"]').click();assert.match(await p.locator('dialog[open] h2').textContent(),/速度/);await p.locator('dialog[open] .curve-close').click();
 await p.evaluate(()=>window.__JUICE_LAB__.seek(40));await mkdir('analysis/juice',{recursive:true});await p.screenshot({path:'analysis/juice/custom-curve.png'});
 await p.goto('http://127.0.0.1:5173/');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);await p.selectOption('#value-juiceCurve','6');assert.ok(await p.locator('#juice-speed-curve-editor').isVisible());await edit(9);
 const current=await p.evaluate(()=>window.__ARCHERO__.snapshot().settings);assert.equal(current.juiceSpeedCurve.at(-1).progress,9);
 let saved;await p.route('**/__save-params',async route=>{saved=route.request().postDataJSON();await route.fulfill({json:{ok:true}});});await p.locator('#save-settings').click();await p.waitForTimeout(150);assert.equal(saved.settings.juiceSpeedCurve.at(-1).progress,9);
 await p.route('**/params.json',route=>route.fulfill({json:saved}));await p.reload();await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);assert.equal((await p.evaluate(()=>window.__ARCHERO__.snapshot())).settings.juiceSpeedCurve.at(-1).progress,9);
 await edit(15);await p.locator('#undo-settings').click();assert.equal((await p.evaluate(()=>window.__ARCHERO__.snapshot())).settings.juiceSpeedCurve.at(-1).progress,9);
 await p.goto('http://127.0.0.1:5173/spider-viewer.html');await p.waitForFunction(()=>window.__SPIDER_VIEWER__);await p.selectOption('[data-key="juiceCurve"]','6');assert.ok(await p.locator('#juice-speed-curve-editor').isVisible());await edit(20);await p.selectOption('#clip','Hitted');await p.evaluate(()=>window.__SPIDER_VIEWER__.seek(.4));assert.ok((await p.evaluate(()=>window.__SPIDER_VIEWER__.snapshot())).juice.active>0);
 assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);console.log('PASS lab custom curve: numeric edits/add/drag/expand; game edit/save/reload/undo via isolated persistence; viewer; no user JSON writes');
}finally{await b.close();}
