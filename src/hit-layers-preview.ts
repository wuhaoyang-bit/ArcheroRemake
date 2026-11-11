import './hit-layers-preview.css';
import * as T from 'three/webgpu';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createTrainingCube} from './training-monster.ts';
import {TrainingFeedback} from './training-feedback.ts';
import {DirectionalSpray} from './directional-spray.ts';
import {HitSplashEffects} from './hit-splash-effects.ts';
import {DEFAULTS,LIMITS,type Settings,type SettingKey} from './config.ts';
import {loadSettings} from './settings-store.ts';
const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
const groups:[string,[SettingKey,string][]][]=[
 ['共用方向粒子',[['sprayDelay','触发延迟（秒）'],['sprayCount','总数量'],['sprayJetShare','射流数量占比'],['spraySpeed','初速'],['spraySpeedJitter','初速变化'],['spraySize','大小'],['spraySizeJitter','大小变化'],['sprayLife','寿命（秒）'],['sprayLifeJitter','寿命变化'],['sprayGravity','重力'],['sprayHeight','生成高度偏移'],['sprayFlat','水平平铺（0/1）']]],
 ['集中射流',[['sprayJetSpread','半角'],['sprayJetSpeedScale','速度倍率'],['sprayJetSizeScale','大小倍率']]],
 ['扇形飞溅',[['sprayFanSpread','半角'],['sprayFanSpeedScale','速度倍率'],['sprayFanSizeScale','大小倍率']]],
 ['液体飞溅',[['hitSplashBackDelay','触发延迟（秒）'],['hitSplashBackScale','大小'],['hitSplashBackSpeed','播放速度']]],
];
$('app').innerHTML=`<header><div><h1>受击三层特效 · 逐帧预览</h1><p>集中射流 / 扇形飞溅 / 液体飞溅</p></div><a href="./">返回游戏</a></header><main><section class="panel"><div id="stage">正在加载当前参数与史莱姆…</div><div class="bar"><button id="play" class="primary">▶ 播放</button><button id="start">回到受击瞬间</button><button id="prev">← 上一帧</button><button id="next">下一帧 →</button><label>帧率 <select id="fps"><option>30</option><option selected>60</option><option>120</option></select></label><label>速度 <select id="rate"><option value=".25">¼</option><option value=".5">½</option><option value="1" selected>1×</option></select></label><output id="clock"></output></div><div class="timeline"><input id="timeline" aria-label="预览时间轴" type="range" min="0" max="600" step="1" value="0"></div><div class="bar"><button data-view="game">游戏视角</button><button data-view="back">背面</button><button data-view="side">侧面</button><button data-view="top">俯视</button><label><input id="model" type="checkbox" checked> 显示怪物</label><label><input id="anchors" type="checkbox" checked> 显示生成点</label></div><div class="legend">拖动旋转视角，滚轮缩放。空格播放/暂停，← → 逐帧。回退会重放同一随机样本。</div><p id="status"></p></section><aside class="panel"><h2>分层观察</h2>${[['jet','集中射流','#16cfff'],['fan','扇形飞溅','#ff6338'],['sheet','液体飞溅','#ffd34d']].map(([id,name,color])=>`<div class="layer"><label><input id="show-${id}" type="checkbox" checked><span class="swatch" style="background:${color}"></span>${name}</label><button data-solo="${id}">单独看</button></div>`).join('')}<div class="bar"><button id="all">显示三层</button><label><input id="debug" type="checkbox" checked> 区分粒子颜色</label></div><label class="control">生成位置<select id="location"><option value="back">固定背面</option><option value="game">按当前箭矢模式</option></select></label><p>默认显示全部三层；大小、速度、曲线和延迟读取当前参数。默认在背面预览；选择“按当前箭矢模式”可检查模式 2 的前方反喷。</p><div class="bar"><button id="reload">重读当前参数</button><button id="sample">换一组随机样本</button><button id="export">导出调试参数</button></div><p>调整只影响预览。导出文件保留游戏原有开关。</p>${groups.map(([name,rows])=>`<details open><summary>${name}</summary>${rows.map(([key,label])=>{const [min,max,step]=LIMITS[key];return `<label class="control">${label}<input data-number="${key}" type="number" min="${min}" max="${max}" step="${step}"><input data-range="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}"></label>`;}).join('')}</details>`).join('')}</aside></main>`;

async function main(){
 let settings:Settings=await loadSettings();
 const scene=new T.Scene();scene.background=new T.Color('#34434c');
 const camera=new T.PerspectiveCamera(38,1,.05,100);
 const renderer=new T.WebGPURenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));await renderer.init();renderer.toneMapping=T.LinearToneMapping;
 $('stage').replaceChildren(renderer.domElement);
 scene.add(new T.HemisphereLight(0xf5ffe5,0x6a8051,1.6));const light=new T.DirectionalLight(0xfff4ce,1.7);light.position.set(-8,18,-6);scene.add(light);
 const floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshBasicMaterial({color:0x384d4c}));floor.rotation.x=-Math.PI/2;floor.position.y=-.03;scene.add(floor,new T.GridHelper(20,20,0x617c79,0x465e5b));
 const studio=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);
 const environment=pmrem.fromScene(studio).texture;studio.dispose();pmrem.dispose();
 const modelGroup=new T.Group(),model=createTrainingCube(environment);model.userData.practiceTarget='preview';modelGroup.add(model);scene.add(modelGroup);
 const feedback=new TrainingFeedback(modelGroup,[{id:'preview',x:0,z:0}],24,24);
 const jetScene=new T.Scene(),fanScene=new T.Scene(),sheetScene=new T.Scene();scene.add(jetScene,fanScene,sheetScene);
 const [jet,fan,sheet]=await Promise.all([DirectionalSpray.load(jetScene),DirectionalSpray.load(fanScene),HitSplashEffects.load(sheetScene)]);
 sheet.resolveColor=(id,out)=>feedback.currentColor(id,out);
 const orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1,0);orbit.minDistance=3;orbit.maxDistance=30;
 const marker=new T.ArrowHelper(new T.Vector3(0,0,-1),new T.Vector3(),1,0xe9f7fa,.2,.12);scene.add(marker);
 const origin=new T.Vector3(),direction=new T.Vector3();
 let tick=0,seed=42,randomState=42,playing=false,accumulator=0,previous=performance.now(),ready=false;
 let resolve=(id:string,o:T.Vector3,d:T.Vector3)=>feedback.sprayBackAnchor(id,o,d);
 const dt=1/120;
 const maxTick=()=>Math.ceil(Math.max(2,settings.sprayDelay+settings.sprayLife+settings.sprayLifeJitter+.4,settings.hitSplashBackDelay+1/settings.hitSplashBackSpeed+.4)*120);
 function seeded(action:()=>void){const original=Math.random;Math.random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};try{action();}finally{Math.random=original;}}
 function previewSettings(){return {...settings,slimeCapacity:Math.max(settings.slimeCapacity,settings.slimeInjectionAmount*2),hitSplashParticlesEnabled:0};}
 function reset(){
  randomState=seed;tick=0;jet.clear();fan.clear();sheet.clear();
  seeded(()=>{
   feedback.reset();model.rotation.y=0;feedback.refresh(previewSettings());
   const front=$<HTMLSelectElement>('location').value==='game'&&settings.arrowPierceGravity===2;
   resolve=front?(id,o,d)=>feedback.sprayFrontAnchor(id,o,d):(id,o,d)=>feedback.sprayBackAnchor(id,o,d);
   const c=previewSettings();feedback.hit('preview',{x:0,z:-1},c);
   const n=Math.max(1,Math.round(c.sprayCount)),jetCount=Math.round(n*c.sprayJetShare);
   const shared={...c,sprayEnabled:1,sprayDebugDir:$<HTMLInputElement>('debug').checked?1:0,sprayHeight:front?0:c.sprayHeight};
   if(jetCount)jet.schedule('preview',{...shared,sprayMode:1,sprayCount:jetCount},resolve);
   if(n-jetCount)fan.schedule('preview',{...shared,sprayMode:0,sprayCount:n-jetCount},resolve);
   sheet.emitBack('preview',{...shared,hitSplashBackEnabled:1},resolve);
   sheet.update(0,camera,()=>null,{...c,hitSplashBackEnabled:1},resolve);
  });
 }
 function step(){seeded(()=>{const c=previewSettings();feedback.update(dt,c);feedback.animate(dt,c);jet.update(dt,resolve);fan.update(dt,resolve);sheet.update(dt,camera,()=>null,{...c,hitSplashBackEnabled:1},resolve);});tick++;}
 function render(){
  jetScene.visible=$<HTMLInputElement>('show-jet').checked;fanScene.visible=$<HTMLInputElement>('show-fan').checked;sheetScene.visible=$<HTMLInputElement>('show-sheet').checked;modelGroup.visible=$<HTMLInputElement>('model').checked;
  jet.prepare(camera);fan.prepare(camera);marker.visible=$<HTMLInputElement>('anchors').checked;
  if(resolve('preview',origin,direction)){marker.position.copy(origin);marker.position.y+=($<HTMLSelectElement>('location').value==='game'&&settings.arrowPierceGravity===2)?0:settings.sprayHeight;marker.setDirection(direction);}
  orbit.update();renderer.render(scene,camera);
  $<HTMLInputElement>('timeline').max=String(maxTick());$<HTMLInputElement>('timeline').value=String(tick);
  $('clock').textContent=`${(tick/120).toFixed(3)} s · 第 ${(tick*Number($<HTMLSelectElement>('fps').value)/120).toFixed(1)} 帧`;
  $('status').textContent=`样本 ${seed} · 射流 ${jet.activeCount()} 颗 · 扇形 ${fan.activeCount()} 颗 · 液片 ${sheet.snapshot().reduce((n,w)=>n+w.sheets,0)} 片`;
  $('play').textContent=playing?'❚❚ 暂停':'▶ 播放';
 }
 function seek(target:number,rebuild=false){const goal=Math.max(0,Math.min(maxTick(),Math.round(target)));if(rebuild||goal<tick)reset();while(tick<goal)step();render();}
 function pause(){playing=false;accumulator=0;}
 function syncInputs(){for(const [key] of groups.flatMap(g=>g[1]))for(const selector of ['data-number','data-range']){document.querySelector<HTMLInputElement>(`[${selector}="${key}"]`)!.value=String(settings[key]);}}
 function setView(view:string){const positions:Record<string,number[]>={game:[5,7,9],back:[5,5,-9],side:[9,3,0],top:[0,12,.01]};camera.position.fromArray(positions[view]);orbit.target.set(0,1,0);orbit.update();render();}
 for(const input of document.querySelectorAll<HTMLInputElement>('[data-number],[data-range]'))input.addEventListener('input',()=>{const key=(input.dataset.number??input.dataset.range) as SettingKey,value=Number(input.value);if(!Number.isFinite(value))return;const [min,max,step]=LIMITS[key];(settings as unknown as Record<string,unknown>)[key]=Number(Math.max(min,Math.min(max,Math.round(value/step)*step)).toFixed(6));syncInputs();pause();seek(tick,true);});
 $('play').onclick=()=>{if(tick>=maxTick())seek(0);playing=!playing;accumulator=0;render();};
 $('start').onclick=()=>{pause();seek(0);};
 const move=(sign:number)=>{pause();seek(tick+sign*120/Number($<HTMLSelectElement>('fps').value));};
 $('prev').onclick=()=>move(-1);$('next').onclick=()=>move(1);
 $('timeline').oninput=()=>{pause();seek(Number($<HTMLInputElement>('timeline').value));};
 for(const id of ['show-jet','show-fan','show-sheet','model','anchors','fps'])$(id).onchange=()=>render();
 $('debug').onchange=()=>{jet.setDebugDir($<HTMLInputElement>('debug').checked);fan.setDebugDir($<HTMLInputElement>('debug').checked);render();};
 $('location').onchange=()=>{pause();seek(tick,true);};
 document.querySelectorAll<HTMLButtonElement>('[data-solo]').forEach(b=>b.onclick=()=>{for(const id of ['jet','fan','sheet'])$<HTMLInputElement>('show-'+id).checked=id===b.dataset.solo;render();});
 $('all').onclick=()=>{for(const id of ['jet','fan','sheet'])$<HTMLInputElement>('show-'+id).checked=true;render();};
 document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view!));
 $('sample').onclick=()=>{pause();seed++;seek(tick,true);};
 $('reload').onclick=async()=>{pause();try{settings=await loadSettings();syncInputs();seek(tick,true);}catch(e){$('status').textContent=`读取失败：${String(e)}`;}};
 $('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,settings},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='hit-layers-params.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 window.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,select,textarea,button'))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}});
 const resize=()=>{const r=$('stage').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();render();};new ResizeObserver(resize).observe($('stage'));
 // Allocate each pool before seeding the reproducible sample: Three.js object
 // UUID generation also consumes Math.random during first-time allocation.
 feedback.refresh(previewSettings());
 for(const spray of [jet,fan]){spray.applyFromSettings({...settings,sprayEnabled:1,sprayMode:0,sprayCount:1});spray.emit(new T.Vector3(),new T.Vector3(0,0,-1));spray.clear();}
 sheet.emitBack('preview',{...settings,hitSplashBackEnabled:1},resolve);sheet.clear();
 syncInputs();reset();setView('back');resize();ready=true;
 renderer.setAnimationLoop(now=>{const elapsed=Math.min(.1,(now-previous)/1000);previous=now;if(playing){accumulator+=elapsed*Number($<HTMLSelectElement>('rate').value);const steps=Math.floor(accumulator/dt);if(steps){accumulator-=steps*dt;seek(tick+steps);if(tick>=maxTick())pause();}}render();});
 Object.assign(window,{__HIT_LAYERS__:{seek:(frame:number)=>{pause();seek(frame*120/Number($<HTMLSelectElement>('fps').value));},snapshot:()=>({ready,tick,seed,playing,settings:{...settings},jet:jet.layerSnapshot(),fan:fan.layerSnapshot(),sheet:sheet.snapshot(),feedback:feedback.snapshot(),visible:{jet:jetScene.visible,fan:fanScene.visible,sheet:sheetScene.visible}})}});
}
main().catch(e=>{$('stage').innerHTML='<div class="error">预览加载失败，请刷新重试。</div>';$('status').textContent=String(e);console.error(e);});
