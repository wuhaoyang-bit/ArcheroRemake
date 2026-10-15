import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/__anchor-drag-test',r=>r.fulfill({contentType:'text/html',body:'<style>svg{width:720px;max-width:100%;touch-action:none}svg>*{pointer-events:none}dialog{width:80vw}</style><div id="editor"></div>'}));
 await page.goto('http://localhost:5173/__anchor-drag-test');
 await page.evaluate(async()=>{
  const {AnchorCurveEditor}=await import('/src/anchor-curve-editor.ts');
  const {DEFAULT_ANCHOR_CURVE}=await import('/src/anchor-follow.ts');
  window.points=structuredClone(DEFAULT_ANCHOR_CURVE);
  window.editor=new AnchorCurveEditor(document.querySelector('#editor'),()=>window.points,p=>window.points=p);
 });
 const points=()=>page.evaluate(()=>window.points);
 const drag=async(index,dx,dy)=>{
  const p=await page.locator('#editor svg circle').nth(index).boundingBox();
  await page.mouse.move(p.x+p.width/2,p.y+p.height/2);await page.mouse.down();
  await page.mouse.move(p.x+p.width/2+dx,p.y+p.height/2+dy,{steps:6});await page.mouse.up();
 };
 await drag(3,25,-30);
 let value=(await points())[3];assert.ok(value.distance>.35 && value.speed>4);
 await drag(0,30,-35);value=(await points())[0];assert.equal(value.distance,0);assert.ok(value.speed>0);
 await drag(2,600,0);let all=await points();assert.equal(all.length,5);assert.ok(all[2].distance<all[3].distance);
 await drag(4,60,-60);all=await points();assert.ok(all[4].distance>.6);assert.ok(all[4].speed>30);
 await page.locator('#editor svg circle').nth(4).dblclick({force:true});assert.equal(await page.locator('dialog[open] [name="speed"]').count(),1);
 await page.locator('dialog[open] [type="button"]').click();
 await page.locator('#editor [data-anchor="expand"]').click();
 const before=await points(),r=await page.locator('.curve-dialog[open] svg circle').nth(4).boundingBox();
 // Browser touch events exercise Pointer Events/capture, with the same path as mobile input.
 const cdp=await page.context().newCDPSession(page),x=r.x+r.width/2,y=r.y+r.height/2;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-25,y:y+25}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok((await points())[4].speed<before[4].speed);
 assert.deepEqual(errors,[]);console.log('PASS: mouse/touch drag, zero endpoint, ordered points, last-point resize, double-click editor.');
}finally{await browser.close();}
