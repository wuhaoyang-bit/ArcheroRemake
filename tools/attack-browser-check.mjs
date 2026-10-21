import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const out='analysis/attack-checks';
await mkdir(out,{recursive:true});
const original=await readFile('public/params.json','utf8');
const fixture={version:1,settings:{...JSON.parse(original).settings,targetModel:1,lockRange:30,
  targetCone:90,blendDuration:.06,lockTurnModel:0,lockTurnSpeed:180,anchorFollow:0}};
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',args:['--enable-unsafe-webgpu']});
const results=[],errors=[];
const snap=p=>p.evaluate(()=>window.__ARCHERO__.snapshot());
const frame=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
async function prepare(p) {
  p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/params.json',r=>r.fulfill({json:fixture}));
  await p.goto(process.env.BASE_URL||'http://localhost:5173');
  await p.waitForFunction(()=>window.__ARCHERO__?.snapshot().ready,null,{timeout:60000});
}
async function check(name,run){await run();results.push(name);console.log(`PASS ${name}`)}
try {
  const page=await browser.newPage({viewport:{width:1440,height:1100}});await prepare(page);
  await page.locator('#switch-locking-training').click();
  const r=await page.locator('#viewport').boundingBox(),x=r.x+r.width/2,y=r.y+r.height*.7;
  await check('entry/press do not attack; release loops attack while the player remains stationary',async()=>{
    assert.equal((await snap(page)).attackRequest,null);
    await page.mouse.move(x,y);await page.mouse.down();await frame(page);
    assert.equal((await snap(page)).attack.playing,false);
    await page.mouse.move(x+50,y);await page.waitForTimeout(80);
    await page.mouse.up();await frame(page);
    const s=await snap(page);assert.equal(s.mode,'idle');assert.equal(s.attackRequest,1);
    assert.equal(s.attack.playing,true);assert.ok(s.attack.time>0&&s.attack.time<s.attack.duration);
    assert.equal(s.turnContext,'lock');assert.deepEqual(s.targeting.target.id,'east');
    const position=s.position;
    await page.waitForTimeout(250);assert.deepEqual((await snap(page)).position,position);
    await page.screenshot({path:`${out}/desktop-shot.png`});
    await page.waitForTimeout(2300);
    const looping=await snap(page);assert.equal(looping.attack.playing,true);assert.equal(looping.attackRequest,1);
    assert.equal(looping.attack.weight,1);assert.equal(looping.attack.runWeight,0);assert.deepEqual(looping.position,position);
  });
  await check('stationary range edits preserve the locked identity and attack loop',async()=>{
    const range=page.locator('#value-lockRange');
    const set=async value=>{await range.evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('change',{bubbles:true}))},value);await frame(page)};
    const id=(await snap(page)).targeting.target.id;await set(0);let s=await snap(page);assert.equal(s.attack.playing,true);assert.equal(s.targeting.target.id,id);
    await set(30);s=await snap(page);assert.equal(s.attack.playing,true);assert.equal(s.attackRequest,1);
  });
  await check('pressing during attack immediately shows Run; next release restarts the attack',async()=>{
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.up();
    await page.waitForFunction(()=>window.__ARCHERO__.snapshot().attack.time>.15);
    await page.mouse.down();await frame(page);
    let s=await snap(page);assert.equal(s.mode,'in-place');assert.equal(s.attack.weight,0);assert.equal(s.attack.runWeight,1);
    assert.equal(s.attackRequest,null);assert.equal(s.attack.playing,false);
    await page.mouse.up();await frame(page);s=await snap(page);assert.equal(s.attackRequest,3);assert.equal(s.attack.playing,true);
  });
  await check('pointercancel, blur, capture loss and training changes do not create shots',async()=>{
    await page.mouse.down();
    await page.evaluate(()=>{const s=window.__ARCHERO__.snapshot();window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:s.pointerId,bubbles:true}))});
    await page.mouse.up();await frame(page);assert.equal((await snap(page)).attackRequest,null);
    await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
    await frame(page);assert.equal((await snap(page)).attackRequest,null);
    await page.mouse.down();
    await page.evaluate(()=>{const s=window.__ARCHERO__.snapshot();document.querySelector('#viewport').dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:s.pointerId,bubbles:true}))});
    await frame(page);assert.equal((await snap(page)).attackRequest,null);
    await page.mouse.up();await frame(page);assert.equal((await snap(page)).attackRequest,4);
    await page.locator('#switch-locking-training').click();await frame(page);assert.equal((await snap(page)).attackRequest,null);
    assert.equal((await snap(page)).attack.weight,0);
    await page.mouse.move(x,y);await page.mouse.down();await page.mouse.up();await frame(page);
    assert.equal((await snap(page)).attackRequest,null);
  });

  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const mobile=await ctx.newPage();await prepare(mobile);await mobile.locator('#switch-locking-training').tap();
  const cdp=await ctx.newCDPSession(mobile);
  const touch=async(type,points)=>{await cdp.send('Input.dispatchTouchEvent',{type,
    touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:5,radiusY:5,force:1}))});await frame(mobile)};
  await check('real multitouch: only controlling finger release attacks; cancellation does not',async()=>{
    await touch('touchStart',[[1,120,640]]);await touch('touchStart',[[1,120,640],[2,260,640]]);
    await touch('touchEnd',[[1,120,640]]);assert.equal((await snap(mobile)).attackRequest,null);
    await touch('touchEnd',[]);let s=await snap(mobile);assert.equal(s.attackRequest,1);assert.equal(s.attack.playing,true);
    await mobile.screenshot({path:`${out}/mobile-shot.png`});
    await touch('touchStart',[[3,180,640]]);s=await snap(mobile);assert.equal(s.attack.weight,0);assert.equal(s.attack.runWeight,1);
    await touch('touchCancel',[]);assert.equal((await snap(mobile)).attackRequest,null);
  });
  await check('source bow animation deforms the skinned character, preserves root and completes both phases',async()=>{
    const report=await page.evaluate(async()=>{
      const source=await (await fetch('/src/character.ts')).text();
      const THREE=await import(source.match(/import \* as THREE from "([^"]+)"/)[1]);
      const {loadCharacter}=await import('/src/character.ts');
      const {model,mixer,idle,run,attack}=await loadCharacter();
      idle.setEffectiveWeight(0);run.setEffectiveWeight(0);attack.setLoop(THREE.LoopOnce,1);attack.clampWhenFinished=true;attack.setEffectiveWeight(1).play();
      const scene=new THREE.Scene();scene.background=new THREE.Color('#e5f4bd');scene.add(model);
      scene.add(new THREE.HemisphereLight(0xffffff,0xa4b574,2));
      const sun=new THREE.DirectionalLight(0xffffff,2);sun.position.set(-3,7,6);scene.add(sun);
      const camera=new THREE.OrthographicCamera(-2.7,2.7,3.3,-2.1,.1,50);camera.position.set(6,4,8);camera.lookAt(0,1.4,0);
      const renderer=new THREE.WebGPURenderer({antialias:true});await renderer.init();renderer.setSize(480,480);
      renderer.domElement.id='attack-preview';renderer.domElement.style.cssText='position:fixed;left:0;top:0;z-index:99999';document.body.append(renderer.domElement);
      window.__attackPreview=async time=>{
        attack.time=time;mixer.update(0);model.updateMatrixWorld(true);renderer.render(scene,camera);
        const root=model.getObjectByName('CharacterRoot');const hands=['right','left'].map(name=>model.getObjectByName(name)?.getWorldPosition(new THREE.Vector3()).toArray());
        const bow=model.getObjectByName('WeaponHand1001_gong');
        return {time,root:root.getWorldPosition(new THREE.Vector3()).toArray(),hands,bowScale:bow.scale.toArray(),bowVertices:bow.geometry.attributes.position.count};
      };
      return {name:attack.getClip().name,duration:attack.getClip().duration,tracks:attack.getClip().tracks.length};
    });
    assert.equal(report.name,'BowAttack');assert.equal(report.tracks,190);assert.ok(Math.abs(report.duration-1.05)<1e-6);
    report.samples=[];
    for(const t of [0,.15,.35,.5,.55,.55+1/30,.55+1/12,.55+7/60,.7,.9,1.05]) {
      report.samples.push(await page.evaluate(t=>window.__attackPreview(t),t));
      await page.locator('#attack-preview').screenshot({path:`${out}/pose-${t.toFixed(2)}.png`});
    }
    assert.ok(report.samples.every(s=>Math.abs(s.root[0])<1e-6&&Math.abs(s.root[2])<1e-6));
    assert.ok(report.samples.every(s=>s.bowVertices===124));
    const scaleNear=(sample,expected)=>sample.bowScale.every((v,i)=>Math.abs(v-expected[i])<1e-4);
    assert.ok(scaleNear(report.samples[4],[1.3,1,.8]),'Bow reaches source draw pose at character release');
    assert.ok(scaleNear(report.samples[5],[.6,1,1.4]),'Bow plays the source recoil overshoot');
    assert.ok(scaleNear(report.samples[7],[1,1,1]),'Bow recovers to its original shape');
    await writeFile(`${out}/animation-report.json`,JSON.stringify(report,null,2));
    assert.ok(report.samples.some(s=>Math.hypot(...s.hands[1].map((v,i)=>v-report.samples[0].hands[1][i]))>.2));
  });
  await check('red bow follows the front hand; attack interruption and restart reset its shape',async()=>{
    const result=await page.evaluate(async()=>{
      const {loadCharacter}=await import('/src/character.ts');
      const {CharacterAnimation}=await import('/src/character-animation.ts');
      const c=await loadCharacter();
      const animation=new CharacterAnimation(c.mixer,c.idle,c.run,c.attack,c.attackReleaseTime);
      const bow=c.model.getObjectByName('WeaponHand1001_gong');
      const grip=c.model.getObjectByName('RedBowGrip');
      const rest=bow.scale.toArray();
      animation.update(c.attackReleaseTime+1/30,'idle',1,0,1);
      const recoil=bow.scale.toArray();
      animation.update(0,'in-place',null,0,1);
      const interrupted=bow.scale.toArray();
      animation.update(.1,'idle',2,0,1);
      const restarted=bow.scale.toArray();
      return {rest,recoil,interrupted,restarted,hand:grip.parent.name,oldBow:!!c.model.getObjectByName('Bow_WeaponHand101001')};
    });
    assert.equal(result.hand,'left');assert.equal(result.oldBow,false);
    for(const key of ['rest','interrupted','restarted']) assert.ok(result[key].every(v=>Math.abs(v-1)<1e-6));
    assert.ok(Math.abs(result.recoil[0]-.6)<1e-4);
    await writeFile(`${out}/bow-integration.json`,JSON.stringify(result,null,2));
  });
  assert.deepEqual(errors,[]);assert.equal(await readFile('public/params.json','utf8'),original);
  await writeFile(`${out}/results.json`,JSON.stringify({results,errors},null,2));
  console.log(`${results.length} attack browser checks passed; user params unchanged.`);
} finally {await browser.close()}
