import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready);await page.evaluate(()=>window.__ARCHERO__.pauseForInspection(true));
 const results=await page.evaluate(async()=>{
  const source=await (await fetch('/src/hit-particles.ts')).text();
  const T=await import(source.match(/from "([^"]*three_webgpu[^" ]*)"/)[1]);
  const {HitParticles}=await import('/src/hit-particles.ts');const {HIT_DEFAULTS}=await import('/src/hit-feedback-config.ts');
  const scene=new T.Scene();scene.background=new T.Color(0x000000);
  const camera=new T.OrthographicCamera(-2,2,2,-2,.1,30);camera.position.z=10;camera.lookAt(0,0,0);camera.updateMatrixWorld();
  const renderer=new T.WebGPURenderer();renderer.setSize(128,128);await renderer.init();
  const output=new T.RenderTarget(128,128),particles=new HitParticles(scene);
  const ground=new T.Mesh(new T.PlaneGeometry(4,4),new T.MeshBasicNodeMaterial({color:0x202020}));ground.userData.hitParticleGround=true;scene.add(ground);
  const blocker=new T.Mesh(new T.BoxGeometry(1,1,.2),new T.MeshBasicNodeMaterial({color:0x202020}));blocker.position.set(.5,.5,1);blocker.visible=false;scene.add(blocker);
  particles.emit(new T.Vector3(.5,.5,-1),new T.Vector3(0,0,1),{...HIT_DEFAULTS,hitDirectionEnabled:0});particles.prepare(camera,HIT_DEFAULTS);
  async function pixel(){renderer.setRenderTarget(null);particles.renderDepth(renderer,camera);renderer.setRenderTarget(output);await renderer.compileAsync(scene,camera);renderer.render(scene,camera);return Array.from(await renderer.readRenderTargetPixelsAsync(output,80,48,1,1)).slice(0,3);}
  const throughGround=await pixel();blocker.visible=true;const behindObject=await pixel();blocker.position.z=-2;const inFrontOfObject=await pixel();
  // Ground metadata off reproduces the clipping; it must not be globally depth-disabled.
  blocker.visible=false;ground.userData.hitParticleGround=false;const groundOccludes=await pixel();
  renderer.dispose();output.dispose();return {throughGround,behindObject,inFrontOfObject,groundOccludes};
 });
 console.log(JSON.stringify(results));const sum=a=>a.reduce((x,y)=>x+y,0);
 assert.ok(sum(results.throughGround)>sum(results.behindObject)+100);
 assert.ok(sum(results.inFrontOfObject)>sum(results.behindObject)+100);
 assert.ok(sum(results.throughGround)>sum(results.groundOccludes)+100);
 assert.deepEqual(errors,[]);console.log('PASS WebGPU pixels: ground excluded, foreground objects occlude, background objects do not');
}finally{await browser.close();}
