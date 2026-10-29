import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/unified-slime';await mkdir(out,{recursive:true});const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{const page=await browser.newPage({viewport:{width:1100,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));await page.route('**/unified-check',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));await page.goto('http://127.0.0.1:5187/unified-check');
await page.evaluate(async()=>{const src=await(await fetch('/src/unified-slime-liquid.ts')).text(),T=await import(src.match(/import \* as T from ["']([^"']+)["']/)[1]);const {UnifiedSlimeLiquid}=await import('/src/unified-slime-liquid.ts'),{BURST_DEFAULTS}=await import('/src/slime-burst-config.ts');
const c={...BURST_DEFAULTS,puddleRenderer:2,puddleEnabled:1,puddleSize:3,puddleLifetime:0,puddleRoughness:.12};const renderer=new T.WebGPURenderer({antialias:true});await renderer.init();renderer.setSize(1100,800);renderer.toneMapping=T.LinearToneMapping;document.body.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color(0x27342f);scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,1.7));const sun=new T.DirectionalLight(0xfff4ce,1.8);sun.position.set(-9,22,-8);scene.add(sun);
const ground=new T.Mesh(new T.PlaneGeometry(16,38),new T.MeshStandardNodeMaterial({color:0x435943,roughness:.9}));ground.rotation.x=-Math.PI/2;scene.add(ground);
const camera=new T.PerspectiveCamera(40,1100/800,.1,100);camera.position.set(7,8,10);camera.lookAt(0,0,0);const fx=new UnifiedSlimeLiquid(scene);
const p=(x,z)=>({origin:{x,z,shape:0,angleRandom:0,sizeRandom:0,bodyColor:[1,.58,0]},age:2,c:{...c,puddleColorR:1,puddleColorG:.58,puddleColorB:0},x,z,shape:0,angle:0,size:3,scale:1,settled:true,opacity:1});const puddles=[p(-1,0),p(1,0)];
window.check={T,fx,c,puddles,renderer,scene,camera,async draw(dt=0){fx.update(dt,puddles,c,16,38);await renderer.renderAsync(scene,camera);return fx.snapshot();}};
await window.check.draw();});
await page.screenshot({path:out+'/merged.png'});
const frames=[];
await page.evaluate(()=>{const {fx,T,c}=window.check;let seed=7;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);fx.emit(new T.Vector3(0,1.6,0),c,random,new T.Color(1,.58,0));});
for(const [name,dt] of [['launch',.12],['flight',.3],['land',.5],['settled',1.2]]){frames.push(await page.evaluate(dt=>window.check.draw(dt),dt));await page.screenshot({path:`${out}/${name}.png`});}
const wet=await page.evaluate(async()=>{const {fx,c}=window.check;fx.playerStep({x:-.7,z:0},{x:0,z:0},.1,c);return await window.check.draw(.08);});await page.screenshot({path:out+'/footstep.png'});
assert.ok(frames.at(-1).deposits>0);assert.equal(wet.footsteps,1);assert.ok(wet.ripples>0);assert.deepEqual(errors,[]);
await writeFile(out+'/results.json',JSON.stringify({frames,wet,errors},null,2));console.log('PASS: merged surface, animated drops, deposits, ripples, wet footsteps; no WebGPU errors.');
}finally{await browser.close();}
