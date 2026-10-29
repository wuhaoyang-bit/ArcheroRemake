import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/puddle-color-fix';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:720}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 await page.route('**/puddle-check',r=>r.fulfill({contentType:'text/html',body:'<html><body style="margin:0"></body></html>'}));
 await page.route('**/assets/lush-burst/scene.bin',r=>r.fulfill({path:'public/assets/lush-burst/scene.bin',contentType:'application/octet-stream'}));
 await page.goto('http://127.0.0.1:5187/puddle-check');
 const result=await page.evaluate(async()=>{
  const source=await (await fetch('/src/lush-burst-effects.ts')).text();
  const T=await import(source.match(/import \* as T from ["']([^"']+)["']/)[1]);
  const lab=await (await fetch('/src/slime-burst-lab.ts')).text();
  const {RoomEnvironment}=await import(lab.match(/import \{ RoomEnvironment \} from ["']([^"']+)["']/)[1]);
  const {LushBurstEffects}=await import('/src/lush-burst-effects.ts');
  const {loadSettings}=await import('/src/settings-store.ts');
  const c=await loadSettings();Object.assign(c,{puddleRenderer:1,puddleSize:5,puddleSizeRange:0,puddleRotation:0,puddleRotationRange:0,puddleShape:1,puddleX:0,puddleZ:0,puddleDelay:0,puddleLifetime:0});
  for(let i=0;i<6;i++)c[`burstLayer${i}Enabled`]=0;
  const renderer=new T.WebGPURenderer({antialias:true});await renderer.init();renderer.setSize(1000,720);renderer.toneMapping=T.ACESFilmicToneMapping;document.body.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color('#29392e');scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,1.7));const sun=new T.DirectionalLight(0xfff4ce,1.8);sun.position.set(-9,22,-8);scene.add(sun);
  const camera=new T.PerspectiveCamera(38,1000/720,.05,200);camera.position.set(5,6,8);camera.lookAt(0,0,0);
  const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room).texture;
  const fx=await LushBurstEffects.load(scene,()=>{},environment),color=new T.Color().setRGB(c.slimeColorEndR/255,c.slimeColorEndG/255,c.slimeColorEndB/255,T.SRGBColorSpace);
  fx.emit(new T.Vector3(),new T.Vector3(),c,()=>.5,color);fx.update(4,c,24,24,camera);
  const batch=scene.getObjectByName('CurveFluidPuddle1'),matrix=new T.Matrix4(),v=new T.Vector3(),q=new T.Quaternion(),scale=new T.Vector3();
  const pose=()=>{batch.getMatrixAt(0,matrix);matrix.decompose(v,q,scale);const rgb=new T.Color();batch.getColorAt(0,rgb);return {position:v.toArray(),scale:scale.toArray(),color:rgb.toArray(),version:batch.instanceMatrix.version,age:fx.snapshot().puddles[0].age};};
  const initial=pose();fx.update(0,{...c,puddleSize:10,puddleX:2,puddleZ:-1,puddleRotation:45},24,24,camera);const edited=pose();
  fx.update(0,{...c,puddleSize:10,puddleX:2,puddleZ:-1,puddleRotation:45},24,24,camera);const unchanged=pose();
  fx.update(0,{...c,puddleFrequency:.2,puddleDamping:.05},24,24,camera);const retimed=fx.snapshot().puddles[0];
  fx.update(0,c,24,24,camera);
  const floor=scene.getObjectByName('LushPersistentYellowPaint');
  Object.assign(window,{puddleCheck:{fx,c,scene,camera,renderer,batch,floor,color}});
  renderer.setAnimationLoop(()=>renderer.render(scene,camera));
  return {initial,edited,unchanged,retimed,sourceColor:color.toArray(),meshMaterial:{envMap:!!batch.material.envMap,envMapIntensity:batch.material.envMapIntensity,specularIntensity:batch.material.specularIntensity,ior:batch.material.ior},oldMaterial:{envMap:!!floor.material.envMap,specularIntensity:floor.material.specularIntensity,ior:floor.material.ior}};
 });
 assert.equal(result.meshMaterial.envMapIntensity,0);
 result.sourceColor.forEach((v,i)=>assert.ok(Math.abs(v-result.initial.color[i])<1e-6));
 assert.ok(Math.abs(result.edited.scale[0]/result.initial.scale[0]-2)<1e-6);assert.deepEqual(result.edited.position,[2,.00800000037997961,-1]);assert.equal(result.edited.age,result.initial.age);assert.deepEqual(result.edited.color,result.initial.color);assert.equal(result.unchanged.version,result.edited.version);assert.equal(result.retimed.settled,false);
 for(const mode of ['old','mesh','mesh-previous-environment']){
  await page.evaluate(mode=>{const {fx,c,camera,batch}=window.puddleCheck;fx.update(0,{...c,puddleRenderer:mode==='old'?0:1},24,24,camera);batch.material.envMapIntensity=mode==='mesh-previous-environment'?1:0;},mode);
  await page.waitForTimeout(250);await page.screenshot({path:`${out}/${mode}.png`});
 }
 assert.deepEqual(errors,[]);await writeFile(`${out}/results.json`,JSON.stringify({result,errors},null,2));console.log(JSON.stringify(result));console.log('PASS: live GPU scale/position, stable body colour, no idle uploads, spring retuning; controlled lighting comparison captured.');
}finally{await browser.close();}
