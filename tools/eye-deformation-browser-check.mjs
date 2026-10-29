import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/eye-deformation';await mkdir(out,{recursive:true});
const source=await (await fetch('http://localhost:5173/src/slime-eye-debris.ts')).text();
const threePath=source.match(/import \* as T from "([^"]+)"/)[1];
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const errors=[];
try{
 const page=await browser.newPage({viewport:{width:480,height:360},deviceScaleFactor:1});
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/__eye-deformation-check',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0"><script type="module">
 import * as T from '${threePath}';
 import {SlimeEyeDebris} from '/src/slime-eye-debris.ts';
 import {createSlimeEyes} from '/src/slime-eyes.ts';
 import {SLIME_EYES_DEFAULTS as C} from '/src/slime-eyes-config.ts';
 import {eyeDeformation,eyeSupport} from '/src/eye-deformation.ts';
 const scene=new T.Scene();scene.background=new T.Color(0xe5e9ec);
 const renderer=new T.WebGPURenderer({antialias:true});renderer.setSize(480,360);renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);await renderer.init();
 const camera=new T.PerspectiveCamera(30,480/360,.05,80);
 scene.add(new T.HemisphereLight(0xffffff,0x8791a6,2));
 const sun=new T.DirectionalLight(0xfffaf0,3);sun.position.set(-3,7,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-8;sun.shadow.camera.right=8;sun.shadow.camera.top=8;sun.shadow.camera.bottom=-8;sun.shadow.normalBias=.015;scene.add(sun);
 const ground=new T.Mesh(new T.PlaneGeometry(40,40),new T.MeshStandardNodeMaterial({color:0xc0c9d0,roughness:.9}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
 const wall=new T.Mesh(new T.BoxGeometry(.2,4,8),new T.MeshStandardNodeMaterial({color:0xc0c9d0}));wall.position.set(2.945,2,0);wall.receiveShadow=true;scene.add(wall);
 const face=new T.Group();scene.add(face);const updateEyes=createSlimeEyes(face);updateEyes({...C,slimeEyeSize:.25});face.children[1].visible=false;const eye=face.children[0];const debris=new SlimeEyeDebris(scene);
 let mode='ground',c;
 function reset(next){mode=next;debris.clear();face.visible=true;wall.visible=next==='wall';eye.position.set(0,next==='wall'?1.2:1.8,0);scene.updateMatrixWorld(true);
 c={...C,slimeEyeEjectSpeed:next==='wall'?14:12,slimeEyeEjectGravity:next==='wall'?0:20,slimeEyeEjectSpin:10,slimeEyeCurveTime:1,slimeEyeSpeedCurve:[{time:0,progress:100},{time:100,progress:100}]};debris.setCollisions(next==='wall'?6:Infinity,Infinity,[]);
 const center=eye.position.clone().add(next==='wall'?new T.Vector3(-1,.1,-.5):new T.Vector3(-.4,.8,0));debris.emit([eye],center,c);face.visible=false;}
 function state(){const f=debris.fragments[0],pose=eyeDeformation({age:f.age,velocity:f.velocity,grounded:f.grounded,impact:f.impact,approach:debris.approach(f)},c);return {age:f.age,hitAge:f.impact?.age,phase:pose.phase,scale:pose.scale,axis:pose.axis.toArray(),position:f.object.position.toArray(),visual:f.object.matrix.elements.slice(12,15),bottom:f.object.matrix.elements[13]-eyeSupport(f.object.matrix,new T.Vector3(0,1,0))};}
 function step(t){for(let left=t;left>1e-8;){const dt=Math.min(left,1/240);debris.update(dt);left-=dt;}return state();}
 async function render(){const f=debris.fragments[0],p=new T.Vector3().setFromMatrixPosition(f.object.matrix);camera.position.copy(p).add(new T.Vector3(mode==='wall'?-1.4:0,.75,3.9));camera.lookAt(p.x,p.y-.05,p.z);await renderer.renderAsync(scene,camera);return state();}
 window.check={reset,step,state,render};
 </script></body>`}));
 await page.goto('http://localhost:5173/__eye-deformation-check');await page.waitForFunction(()=>window.check);
 const records=[];
 for(const mode of ['ground','wall']){
  const hit=await page.evaluate(mode=>{const c=window.check;c.reset(mode);for(let i=0;i<500;i++){const s=c.step(1/240);if(s.hitAge!==undefined)return s.hitAge;}throw new Error('No impact');},mode);
  for(const offset of [-.06,-.02,0,.008,.025,.055,.085,.12,.17,.23]){
   const state=await page.evaluate(async({mode,time})=>{const c=window.check;c.reset(mode);c.step(time);return await c.render();},{mode,time:hit+offset});
   assert.ok(state.bottom>=-1e-6);records.push({mode,offset,...state});await page.screenshot({path:out+'/'+mode+'-'+Math.round(offset*1000)+'.png'});
  }
 }
 assert.deepEqual(errors,[]);await writeFile(out+'/frames.json',JSON.stringify(records,null,2));console.log(JSON.stringify({frames:records.length,errors}));
}finally{await browser.close();}
