import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import {mkdir,writeFile} from 'node:fs/promises';
const out='analysis/eye-hit';await mkdir(out,{recursive:true});
const source=await (await fetch('http://localhost:5173/src/training-feedback.ts')).text(),threePath=source.match(/import \* as T from "([^"]+)"/)[1];
const monsterPath=source.match(/from "([^"]*training-monster[^"]*)"/)[1];
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});const errors=[];
try{
 const p=await b.newPage({viewport:{width:640,height:520}});p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await p.route('**/__eye-hit-check',r=>r.fulfill({contentType:'text/html',body:`<body style="margin:0"><script type="module">
 import * as T from '${threePath}';import {TrainingFeedback} from '/src/training-feedback.ts';import {createTrainingCube} from '${monsterPath}';import {DEFAULTS} from '/src/config.ts';import {parseSettingsDocument} from '/src/settings-store.ts';
 const saved=parseSettingsDocument(await (await fetch('/params.json')).json()),c={...DEFAULTS,...saved,burstEnabled:0,monsterScale:1,hitRimEnabled:0,slimeEyeSize:.25,slimeInjectionAmount:20};
 const renderer=new T.WebGPURenderer({antialias:true});renderer.setSize(640,520);renderer.shadowMap.enabled=true;document.body.append(renderer.domElement);await renderer.init();
 const scene=new T.Scene();scene.background=new T.Color(0xdde7ed);scene.add(new T.HemisphereLight(0xffffff,0x8d9da5,2.5));const sun=new T.DirectionalLight(0xfff9e6,2.5);sun.position.set(3,7,5);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.normalBias=.02;scene.add(sun);
 const floor=new T.Mesh(new T.PlaneGeometry(50,50),new T.MeshStandardNodeMaterial({color:0xb8c6cc,roughness:.8}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
 const camera=new T.PerspectiveCamera(32,640/520,.05,80),group=new T.Group();scene.add(group);const root=createTrainingCube();root.userData.practiceTarget='a';group.add(root);const f=new TrainingFeedback(group,[{id:'a',x:0,z:0}],16,38);
 window.check={async sample(mode,time){f.reset();const s={...c,hitSquashMode:mode==='side'?1:0};f.refresh(s);f.hit('a',mode==='side'?{x:1,z:0}:{x:0,z:-1},s);for(let left=time;left>1e-8;){const dt=Math.min(left,1/240);f.update(dt,s);left-=dt;}camera.position.set(root.position.x+3.3,2.7,root.position.z+5.5);camera.lookAt(root.position.x,1,root.position.z);await renderer.renderAsync(scene,camera);return f.snapshot()[0];}};
 </script></body>`}));
 console.log('reference scene');await p.goto('http://localhost:5173/__eye-hit-check');await p.waitForFunction(()=>window.check);const records=[];
 for(const mode of ['front','side'])for(const t of [0,.035,.07,.11,.147,.19,.23,.45,.7,.9]){const s=await p.evaluate(async({mode,t})=>await window.check.sample(mode,t),{mode,t});records.push({mode,t,...s});await p.screenshot({path:out+'/'+mode+'-'+Math.round(t*1000)+'.png'});}
 assert.deepEqual(errors,[]);await writeFile(out+'/frames.json',JSON.stringify(records,null,2));
 if(process.argv.includes('--frames-only')){console.log(JSON.stringify({frames:records.length,errors}));await b.close();process.exit(0);}
 console.log('frames done',records[0].eyeHit);await p.setViewportSize({width:1440,height:1000});console.log('game startup');await p.goto('http://localhost:5173',{waitUntil:'domcontentloaded'});console.log('dom loaded');await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,{},{timeout:180000});console.log('game ready');await p.locator('#settings-category').selectOption('hit');assert.ok(await p.locator('#value-eyeHitPull').isVisible());
 await p.locator('#value-eyeHitRestoreSpeed').fill('1.5');await p.locator('#value-eyeHitRestoreSpeed').dispatchEvent('change');assert.equal(await p.evaluate(()=>window.__ARCHERO__.snapshot().settings.eyeHitRestoreSpeed),1.5);
 for(const id of ['eye-hit-pull-editor','eye-hit-return-editor','eye-hit-absorb-editor']){assert.equal(await p.locator('#'+id+' svg').count(),1);}
 await p.locator('#eye-hit-pull-editor [data-curve="expand"]').click();assert.equal(await p.locator('dialog[open]').count(),1);await p.locator('dialog[open] .curve-close').click();
 await p.locator('#eye-hit-preview').scrollIntoViewIfNeeded();await p.screenshot({path:out+'/controls.png'});assert.deepEqual(errors,[]);console.log(JSON.stringify({frames:records.length,ui:'passed',errors}));
}catch(e){console.error(errors);throw e;}finally{await b.close();}
