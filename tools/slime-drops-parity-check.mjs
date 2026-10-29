// Compare the actual INKWAVE GLSL with our TSL under identical camera, attributes
// and lighting. Reads the downloaded MIT source; no hand-recreated reference shader.
import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const out='analysis/slime-drops-parity';await mkdir(out,{recursive:true});
const original=await readFile(process.env.INKWAVE_FX_SOURCE??'../INKWAVE-preview/src/fx/fx.js','utf8');
const extract=name=>{const s=original.match(new RegExp('const '+name+' = /\\* glsl \\*/`([\\s\\S]*?)`;'))?.[1];assert.ok(s,`${name} source missing`);return s.replace('${OUT_CHUNKS}','#include <tonemapping_fragment>\n#include <colorspace_fragment>');};
const shaders={vertex:extract('DROP_VERT'),fragment:extract('DROP_FRAG')};
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1220,height:500}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 await page.route('**/droplet-parity',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><body style="margin:0;background:#222;color:white;font:16px sans-serif;display:flex;gap:10px"><section id="reference">INKWAVE · original GLSL</section><section id="port">Archero · WebGPU TSL</section></body>'}));
 await page.goto('http://127.0.0.1:5187/droplet-parity');
 await page.evaluate(async shaders=>{
  const src=await(await fetch('/src/slime-liquid-drops.ts')).text();
  const T=await import(src.match(/import \* as T from ["']([^"']+)["']/)[1]);
  const W=await import('/node_modules/three/build/three.module.js');
  const {SlimeLiquidDrops}=await import('/src/slime-liquid-drops.ts');
  const lighting={sunDirection:new T.Vector3(-.41,.83,-.38).normalize(),sunColor:new T.Color(1,.93,.84),skyColor:new T.Color(.42,.62,.95),groundColor:new T.Color(.5,.46,.42)};
  const scene=new T.Scene(),referenceScene=new W.Scene();
  scene.background=new T.Color('#26312f');referenceScene.background=new W.Color('#26312f');
  const renderer=new T.WebGPURenderer({antialias:true});await renderer.init();renderer.setSize(600,450);renderer.toneMapping=T.LinearToneMapping;
  const referenceRenderer=new W.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});referenceRenderer.setSize(600,450);referenceRenderer.toneMapping=W.NeutralToneMapping;
  document.querySelector('#port').append(renderer.domElement);document.querySelector('#reference').append(referenceRenderer.domElement);
  const camera=new T.PerspectiveCamera(40,600/450,.1,100),referenceCamera=new W.PerspectiveCamera(40,600/450,.1,100);
  camera.position.set(1,2,11);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  referenceCamera.position.copy(camera.position);referenceCamera.quaternion.copy(camera.quaternion);referenceCamera.updateMatrixWorld();
  const fx=new SlimeLiquidDrops(scene,8,lighting);
  const colors=[[1,.58,0],[0,.65,.9],[.65,.015,.18],[.025,.5,.08]];
  const speeds=[[0,0,0],[12,5,0],[-12,0,0],[0,-15,0],[0,0,12],[1,0,0],[15,0,0],[0,20,0]];
  const drops=speeds.map((v,i)=>({p:new T.Vector3((i%4-1.5)*1.85,i<4?1.1:-1.1,0),v:new T.Vector3(...v),radius:.36,color:new T.Color(...colors[i%4]),age:.3,seed:i*.14}));
  const geo=new W.InstancedBufferGeometry(),quad=new W.PlaneGeometry(2,2);geo.setIndex(quad.index);geo.setAttribute('position',quad.getAttribute('position'));geo.instanceCount=8;
  for(const name of ['aPosR','aVelS','aColA'])geo.setAttribute(name,new W.InstancedBufferAttribute(new Float32Array(32),4));
  const uniforms={uSunDirV:{value:lighting.sunDirection.clone().transformDirection(camera.matrixWorldInverse)},uUpV:{value:new T.Vector3(0,1,0).transformDirection(camera.matrixWorldInverse)},uSunCol:{value:lighting.sunColor},uSkyCol:{value:lighting.skyColor},uGroundCol:{value:lighting.groundColor}};
  const material=new W.ShaderMaterial({uniforms,vertexShader:shaders.vertex,fragmentShader:shaders.fragment,alphaToCoverage:true,fog:false});
  const reference=new W.Mesh(geo,material);reference.frustumCulled=false;referenceScene.add(reference);
  window.parity={T,renderer,fx,drops,async draw(age,tone='LinearToneMapping'){
   renderer.toneMapping=T[tone];drops.forEach(d=>d.age=age);fx.update(drops,true,false);
   for(const name of ['aPosR','aVelS','aColA']){geo.attributes[name].array.set(fx.mesh.geometry.attributes[name].array);geo.attributes[name].needsUpdate=true;}
   await renderer.renderAsync(scene,camera);referenceRenderer.render(referenceScene,referenceCamera);
  }};
  await window.parity.draw(.3);
 },shaders);
 const results=[];
 for(const [name,age,tone] of [['grown',.3,'LinearToneMapping'],['birth',.01,'LinearToneMapping'],['wobble',.6,'LinearToneMapping'],['fade',4.96,'LinearToneMapping'],['no-tone',.3,'NoToneMapping']]){
  await page.evaluate(async({age,tone})=>window.parity.draw(age,tone),{age,tone});
  const ref=await page.locator('#reference canvas').screenshot(),port=await page.locator('#port canvas').screenshot();
  const metrics=await page.evaluate(async({ref,port})=>{
   async function pixels(b64){const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return ctx.getImageData(0,0,img.width,img.height).data;}
   const a=await pixels(ref),b=await pixels(port),width=600,height=450;
   const mask=data=>Uint8Array.from({length:width*height},(_,i)=>Number(Math.max(...[0,1,2].map(k=>Math.abs(data[i*4+k]-data[k])))>10));
   const ma=mask(a),mb=mask(b);let sum=0,count=0,maxError=0,coverage=0,portCoverage=0,outsideContour=0;
   // WebGL resolves MSAA after sRGB output; WebGPU resolves in linear space.
   // Compare shading inside a 2px-eroded mask and require both contours to agree
   // within 1px. Otherwise tiny/fading drops would be dominated by AA differences.
   for(let y=2;y<height-2;y++)for(let x=2;x<width-2;x++){
    const i=y*width+x;coverage+=ma[i];portCoverage+=mb[i];
    let inside=!!ma[i],nearA=false,nearB=false;
    for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
     const j=i+dy*width+dx;inside=inside&&!!ma[j]&&!!mb[j];
     if(Math.abs(dx)<=1&&Math.abs(dy)<=1){nearA=nearA||!!ma[j];nearB=nearB||!!mb[j];}
    }
    if((ma[i]&&!nearB)||(mb[i]&&!nearA))outsideContour++;
    if(inside)for(let k=0;k<3;k++){const d=Math.abs(a[i*4+k]-b[i*4+k]);sum+=d;count++;maxError=Math.max(maxError,d);}
   }
   return {meanInteriorChannelError:sum/count,maxInteriorChannelError:maxError,interiorPixels:count/3,coverage,portCoverage,outsideContour};
  },{ref:ref.toString('base64'),port:port.toString('base64')});
  results.push({name,...metrics});
  await page.screenshot({path:`${out}/${name}.png`});
 }
 await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));
 for(const r of results){assert.ok(r.interiorPixels>100,`${r.name}: no drops rendered`);assert.ok(r.meanInteriorChannelError<1,`${r.name}: shader colour mismatch`);assert.ok(r.maxInteriorChannelError<=3,`${r.name}: highlight mismatch`);assert.equal(r.outsideContour,0,`${r.name}: silhouette differs by more than 1px`);assert.ok(Math.abs(r.coverage-r.portCoverage)/r.coverage<.03,`${r.name}: size mismatch`);}
 assert.deepEqual(errors,[]);
 console.log('PASS: original GLSL vs WebGPU TSL, eight directions/colours, growth, wobble, fade, linear output.',results);
}finally{await browser.close();}
