import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://localhost:5173');await page.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:120000});
 await page.evaluate(async()=>{
  window.__ARCHERO__.pauseForInspection(true);
  const code=await(await fetch('/src/slime-fragment-effects.ts')).text(),sceneCode=await(await fetch('/src/scene.ts')).text();
  const T=await import(code.match(/from "([^"]*three_webgpu[^\"]*)"/)[1]);
  const {RoomEnvironment}=await import(sceneCode.match(/from "([^"]*RoomEnvironment[^\"]*)"/)[1]);
  const {SlimeFragmentEffects}=await import('/src/slime-fragment-effects.ts'),{Skin}=await import('/src/slime-fragments/skin.ts'),{DEFAULTS}=await import('/src/config.ts');
  const renderer=new T.WebGPURenderer({antialias:true});await renderer.init();renderer.setSize(1000,900);renderer.toneMapping=T.LinearToneMapping;
  renderer.domElement.style.cssText='position:fixed;inset:0;z-index:999999';document.body.appendChild(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0x193c27);
  const studio=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),env=pmrem.fromScene(studio).texture;studio.dispose();pmrem.dispose();
  scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,1.7));const sun=new T.DirectionalLight(0xfff4ce,1.8);sun.position.set(-9,22,-8);scene.add(sun);
  const ref=await(await fetch('/assets/slime-fragments/reference-body.json')).json(),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(ref.positions,3));g.setIndex(ref.indices);g.computeVertexNormals();
  const source=new T.Mesh(g,new T.MeshPhysicalNodeMaterial({color:0xffdd32,roughness:.19,metalness:0,transmission:.65,thickness:1.8,ior:1.36,attenuationColor:0xffcc20,attenuationDistance:2.6,clearcoat:.8,clearcoatRoughness:.15}));
  const fx=await SlimeFragmentEffects.load(scene,env),c={...DEFAULTS,slimeFragmentsEnabled:1};fx.emit(source,c);
  const slot=fx.pool[0];
  const columns=Math.ceil(Math.sqrt(slot.skins.length)),rows=Math.ceil(slot.skins.length/columns);
  slot.skins.forEach((skin,i)=>{const body=skin.body,rot=new T.Matrix4().makeRotationFromEuler(new T.Euler(.8+(i%3)*.7,i*.9,.3)),v=new T.Vector3();for(let k=0;k<body.x.length;k+=3){v.fromArray(body.rest,k).applyMatrix4(rot);v.add(new T.Vector3((i%columns-(columns-1)/2)*3.2,1,(Math.floor(i/columns)-(rows-1)/2)*3.2));body.x[k]=v.x;body.x[k+1]=v.y;body.x[k+2]=v.z;}skin.update();});
  const cpuMaterial=slot.material.clone();cpuMaterial.positionNode=null;cpuMaterial.normalNode=null;cpuMaterial.clearcoatNormalNode=null;
  const cpuGroup=new T.Group();
  for(const skin of slot.skins){const cpu=new Skin(skin.body,skin.original.slice(),skin.originalNormals.slice(),skin.mesh.geometry.index.array,skin.ids,skin.weights,cpuMaterial);cpu.mesh.geometry.setAttribute('fragmentInterior',skin.mesh.geometry.attributes.fragmentInterior);cpu.update();cpu.mesh.visible=true;cpuGroup.add(cpu.mesh);}
  scene.add(cpuGroup);cpuGroup.visible=false;
  const camera=new T.PerspectiveCamera(40,1000/900,.1,100);camera.position.set(0,18,22);camera.lookAt(0,0,0);window.showCpuReference=async()=>{slot.mesh.visible=false;cpuGroup.visible=true;await renderer.compileAsync(scene,camera);for(let i=0;i<3;i++){renderer.render(scene,camera);await new Promise(requestAnimationFrame);}};await renderer.compileAsync(scene,camera);for(let i=0;i<3;i++){renderer.render(scene,camera);await new Promise(requestAnimationFrame);}
 });
 await mkdir('analysis/slime-fragments',{recursive:true});
 const tag=process.argv[2]||'current';
 const gpuImage=await page.screenshot({path:`analysis/slime-fragments/material-${tag}.png`});
 await page.evaluate(()=>window.showCpuReference());
 const cpuImage=await page.screenshot({path:`analysis/slime-fragments/material-${tag}-cpu.png`});
 const comparison=await page.evaluate(async images=>{
  const pixels=await Promise.all(images.map(async data=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return ctx.getImageData(0,0,image.width,image.height).data;}));
  let error=0,count=0,large=0;for(let i=0;i<pixels[0].length;i+=4){if(pixels[0][i]<60&&pixels[1][i]<60)continue;let max=0;for(let c=0;c<3;c++){const diff=Math.abs(pixels[0][i+c]-pixels[1][i+c]);error+=diff;max=Math.max(max,diff);}count++;if(max>12)large++;}
  return {foregroundPixels:count,meanChannelError:error/(count*3),largeDifferenceFraction:large/count};
 },[gpuImage.toString('base64'),cpuImage.toString('base64')]);
 await writeFile(`analysis/slime-fragments/material-${tag}.json`,JSON.stringify(comparison,null,2));
 assert.deepEqual(errors,[]);assert.ok(comparison.meanChannelError<1,'GPU lighting must match CPU-deformed normals, including clearcoat');assert.ok(comparison.largeDifferenceFraction<.01);
 console.log('Rotated fragments match CPU shading:',comparison);

}finally{await browser.close();}
