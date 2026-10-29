import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base='http://127.0.0.1:5187',out='analysis/eye-player';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:false,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.route('**/favicon.ico',r=>r.fulfill({status:204,body:''}));
 await page.route('**/eye-player-check',r=>r.fulfill({contentType:'text/html',body:'<body style="margin:0"></body>'}));
 await page.goto(base+'/eye-player-check');
 await page.evaluate(async()=>{
  const source=await(await fetch('/src/slime-eye-debris.ts')).text(),T=await import(source.match(/import \* as T from ["']([^"']+)["']/)[1]);
  const {SlimeEyeDebris}=await import('/src/slime-eye-debris.ts'),{createSlimeEyes}=await import('/src/slime-eyes.ts'),{SLIME_EYES_DEFAULTS:C}=await import('/src/slime-eyes-config.ts');
  const scene=new T.Scene();scene.background=new T.Color(0xadc3cc);scene.add(new T.HemisphereLight(0xffffff,0x687968,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(-4,8,4);scene.add(light);
  const renderer=new T.WebGPURenderer({antialias:true});await renderer.init();renderer.setSize(800,600);document.body.append(renderer.domElement);
  const floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardNodeMaterial({color:0x81957f}));floor.rotation.x=-Math.PI/2;scene.add(floor);
  const camera=new T.PerspectiveCamera(40,800/600,.1,100);camera.position.set(4,5,8);camera.lookAt(1,0,0);
  const body=new T.Group();scene.add(body);const eyes=createSlimeEyes(body);eyes({...C,slimeEyeSize:.25});
  const debris=new SlimeEyeDebris(scene);debris.emit([body.children[0]],new T.Vector3(),{...C,slimeEyeEjectSpeed:0});body.visible=false;debris.update(20);
  const initial=debris.snapshot()[0],x=initial.position[0],z=initial.position[2];
  const marker=new T.Mesh(new T.CylinderGeometry(.46,.46,1.5,32),new T.MeshStandardNodeMaterial({color:0x3295dd,transparent:true,opacity:.5}));marker.position.set(x-1,.75,z);scene.add(marker);
  window.check={debris,initial,async draw(){await renderer.renderAsync(scene,camera);},kick(){debris.kickPlayer({x:x-1,z,radius:.46,height:3.25},{x:x-.3,z,radius:.46,height:3.25},.1,true);marker.position.x=x-.3;return debris.snapshot()[0];},step(t){debris.update(t);return debris.snapshot()[0];}};
 });
 const records={before:await page.evaluate(async()=>{await window.check.draw();return window.check.initial;})};
 await page.screenshot({path:out+'/before.png'});
 records.kick=await page.evaluate(async()=>{const s=window.check.kick();await window.check.draw();return s;});await page.screenshot({path:out+'/contact.png'});
 records.flight=await page.evaluate(async()=>{const s=window.check.step(.15);await window.check.draw();return s;});await page.screenshot({path:out+'/flight.png'});
 assert.ok(records.before.settled);assert.ok(records.kick.velocity[0]>0&&records.kick.velocity[1]>0);assert.equal(records.kick.velocity[2],0);assert.ok(records.flight.position[0]>records.kick.position[0]);assert.ok(records.flight.position[1]>records.before.position[1]);assert.deepEqual(errors,[]);
 await writeFile(out+'/results.json',JSON.stringify({records,errors},null,2));console.log('PASS: resting eye wakes, kicks in movement direction, rises and renders without errors.');
}finally{await browser.close();}
