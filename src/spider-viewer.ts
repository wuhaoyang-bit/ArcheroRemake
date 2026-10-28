import { JuiceCurveEditor } from './juice-curve-editor.ts';
import './juice-curve-editor.css';
import * as T from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TrainingMonsterFactory, monsterInstance } from './training-monster.ts';
import { TrainingFeedback } from './training-feedback.ts';
import { JuiceParticles, newJuiceSeed } from './juice-particles.ts';
import { HitParticles } from './hit-particles.ts';
import { HIT_CONTROLS } from './hit-feedback-config.ts';
import { DEFAULTS, LIMITS, sanitize, type SettingKey } from './config.ts';
import { loadSettings } from './settings-store.ts';
import './spider-viewer.css';
const el=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
document.querySelector('#app')!.innerHTML=`<header><div><small>ARCHERO · 动作观察室</small><h1>蜘蛛动画预览器</h1><p>拖动旋转 · 滚轮缩放 · 右键平移。暂停后也能自由观察。</p></div><a href="./">返回游戏 ↗</a></header><main><section><div class="stage" id="stage"><div id="loading">正在加载蜘蛛模型…</div></div><div class="panel"><div class="row"><label>动画 <select id="clip"><option value="Idle">待机 · Idle</option><option value="Run">移动 · Run</option><option value="Hitted">受伤 · Hitted</option><option value="Dead">死亡 · Dead</option></select></label><button id="play">暂停</button><button id="restart">从头播放</button><label><input id="loop" type="checkbox" checked>循环</label><label>预览速度 <select id="speed"><option value="0.25">0.25 倍</option><option value="0.5">0.5 倍</option><option value="1" selected>1 倍</option><option value="2">2 倍</option></select></label></div><div class="row"><button id="prev">← 上一帧</button><button id="next">下一帧 →</button><label>逐帧基准 <select id="fps"><option value="60">60 FPS</option><option value="30">30 FPS（原动画采样率）</option></select></label><output id="time"></output></div><input id="timeline" type="range" min="0" max="2" step="0.000001" value="0"><p id="timing"></p><div class="row" id="views"><button data-view="front">正面</button><button data-view="side">侧面</button><button data-view="back">背面</button><button data-view="top">俯视</button><button data-view="game">游戏斜俯视</button></div><p>空格播放 / 暂停，← → 逐帧。动画结束后保留末帧，方便观察尚未结束的受击效果。</p></div></section><aside class="panel"><h2>受伤效果与参数</h2><p>选择「受伤」后生效。读取游戏当前参数；在这里调整只影响预览，不会保存到游戏。</p><div class="row"><button id="all-on">效果全开</button><button id="all-off">只看原作动画</button><button id="reload">重读游戏参数</button></div><label class="param">命中方向（度）<input id="direction" type="number" min="-180" max="180" step="5" value="180"></label><div id="params"></div><div id="juice-speed-curve-editor" hidden></div><p id="status" role="status"></p></aside></main>`;
async function main(){
 let settings={...DEFAULTS};try{settings=await loadSettings();}catch{el('status').textContent='未能读取游戏参数，使用默认值。';}
 const scene=new T.Scene();scene.background=new T.Color('#e5e5ca');
 const camera=new T.PerspectiveCamera(38,1,.05,150);
 const renderer=new T.WebGPURenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));await renderer.init();renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;renderer.toneMapping=T.LinearToneMapping;
 const stage=el('stage');stage.replaceChildren(renderer.domElement);
 const controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.45,0);controls.minDistance=1;controls.maxDistance=40;controls.maxPolarAngle=Math.PI*.495;
 scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,1.7));const sun=new T.DirectionalLight(0xfff4ce,1.8);sun.position.set(-9,22,-8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-12,right:12,top:12,bottom:-12,near:.5,far:70});sun.shadow.bias=-.0003;scene.add(sun);
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:0xe1e1c5,roughness:1}));floor.receiveShadow=true;floor.rotation.x=-Math.PI/2;floor.position.y=-.015;floor.userData.hitParticleGround=true;scene.add(floor);
 const grid=new T.GridHelper(40,40,0xa1a388,0xc4c5a9);grid.userData.hitParticleGround=true;scene.add(grid);
 const factory=await TrainingMonsterFactory.load(),root=factory.create(),group=new T.Group();root.userData.practiceTarget='spider';group.add(root);scene.add(group);
 const instance=monsterInstance(root)!,durations=instance.animation!.durations(),feedback=new TrainingFeedback(group,[{id:'spider',x:0,z:0}],100,100);
 let seed=1;const particles=new HitParticles(scene,()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;});
 const juice=await JuiceParticles.load(scene);
 let juiceSeed=newJuiceSeed();
 let time=0,playing=true,duration=2;
 const clip=()=>el<HTMLSelectElement>('clip').value;
 const flags=['hitBaseEnabled','hitDirectionEnabled','hitParticleFeetEnabled','hitKnockEnabled','hitRimEnabled','hitSquashEnabled','juiceEnabled'] as const;
 const rows:[SettingKey,string,string,string][]=[['monsterScale','模型大小','倍','基础模型大小'],['monsterHitSpeed','受伤动画倍率','倍','仅调整原作受伤动作；与预览播放速度独立'],...HIT_CONTROLS];
 function buildControls(){el('params').innerHTML=rows.map(([key,label,unit,hint])=>{const [min,max,step]=LIMITS[key];if(key==='juiceCurve')return `<label class="param">绿汁曲线<select data-key="juiceCurve">${['Linear','OutQuad','OutCubic','OutExpo','smoothstep','指数阻力','自定义曲线'].map((name,i)=>`<option value="${i}" ${settings.juiceCurve===i?'selected':''}>${name}</option>`).join('')}</select></label>`;return `<label class="param" title="${hint}"><span>${label} <small>${unit}</small></span><input data-key="${key}" type="${key.endsWith('Enabled')?'checkbox':'number'}" min="${min}" max="${max}" step="${step}" value="${settings[key]}" ${settings[key]?'checked':''}></label>`;}).join('');}
 const juiceEditor=new JuiceCurveEditor(el('juice-speed-curve-editor'),()=>settings.juiceSpeedCurve,points=>{settings.juiceSpeedCurve=points;seek(time);});
 function length(){const native=durations[clip()]/(clip()==='Hitted'?settings.monsterHitSpeed:1);return clip()==='Hitted'?Math.max(native,settings.hitKnockEnabled?settings.hitKnockTime:0,settings.hitRimEnabled?settings.hitRimTime:0,settings.hitSquashEnabled?settings.hitSquashTime:0,settings.hitBaseEnabled||settings.hitDirectionEnabled?settings.hitParticleDuration:0,settings.juiceEnabled?settings.juiceDelay+settings.juiceLife*1.12:0):native;}
 function seek(t:number){
  el('juice-speed-curve-editor').hidden=settings.juiceCurve!==6;juiceEditor.render();
  duration=length();time=Math.max(0,Math.min(t,duration));feedback.reset();particles.clear();juice.clear();seed=123456;
  const angle=Number(el<HTMLInputElement>('direction').value)*Math.PI/180,dir=new T.Vector3(Math.sin(angle),0,Math.cos(angle));
  if(clip()==='Hitted'){
   feedback.hit('spider',{x:dir.x,z:dir.z},settings);
   const atFeet=!!settings.hitParticleFeetEnabled;
   const origin=atFeet?new T.Vector3(0,.05,0):new T.Vector3(0,instance.aimHeight*settings.monsterScale,0);
   particles.emit(origin,dir,settings,atFeet?'spider':null);
  }
  const emitTime=Math.min(time,settings.juiceDelay);
  feedback.update(emitTime,settings);
  if(clip()==='Hitted'&&time>=settings.juiceDelay)juice.emit(new T.Vector3(root.position.x,feedback.aimHeight('spider')+settings.juiceHeight,root.position.z),settings,time-settings.juiceDelay,juiceSeed);
  feedback.update(time-emitTime,settings);instance.animation!.preview(clip(),time*(clip()==='Hitted'?settings.monsterHitSpeed:1));root.updateMatrixWorld(true);
  particles.update(time,settings,id=>id==='spider'?new T.Vector3(root.position.x,.05,root.position.z):null);
  const timeline=el<HTMLInputElement>('timeline');timeline.max=String(duration);timeline.value=String(time);
  const fps=Number(el<HTMLSelectElement>('fps').value);el('time').textContent=`${time.toFixed(4)} s / ${duration.toFixed(3)} s · 第 ${Math.floor(time*fps+1e-6)} 帧`;
  el('timing').textContent=`原作动画 ${durations[clip()].toFixed(3)} 秒${clip()==='Hitted'?` → 当前倍率下 ${(durations.Hitted/settings.monsterHitSpeed).toFixed(3)} 秒；完整受击预览 ${duration.toFixed(3)} 秒`:''}`;
 }
 function setPlay(value:boolean){playing=value;el('play').textContent=value?'暂停':'播放';}
 function view(name:string){const v:Record<string,number[]>={front:[0,2,6],side:[6,2,0],back:[0,2,-6],top:[0,7,.001],game:[4,6,6]};camera.position.fromArray(v[name]);controls.target.set(0,.45,0);controls.update();}
 el('params').addEventListener('change',e=>{const input=e.target as HTMLInputElement,key=input.dataset.key as SettingKey;if(!key)return;settings[key]=sanitize(key,input.type==='checkbox'?(input.checked?1:0):input.type==='select-one'?Number(input.value):input.valueAsNumber);input.value=String(settings[key]);seek(time);});
 el('play').onclick=()=>{if(time>=duration){juiceSeed=newJuiceSeed();seek(0);}setPlay(!playing);};el('restart').onclick=()=>{juiceSeed=newJuiceSeed();seek(0);setPlay(true);};
 function step(sign:number){setPlay(false);const fps=Number(el<HTMLSelectElement>('fps').value),frame=time*fps;seek((sign>0?Math.floor(frame+1e-6)+1:Math.ceil(frame-1e-6)-1)/fps);}
 el('prev').onclick=()=>step(-1);el('next').onclick=()=>step(1);
 el('timeline').oninput=()=>{setPlay(false);seek(Number(el<HTMLInputElement>('timeline').value));};el('clip').onchange=()=>{juiceSeed=newJuiceSeed();seek(0);};el('fps').onchange=()=>seek(time);el('direction').onchange=()=>seek(time);
 el('views').onclick=e=>{const name=(e.target as HTMLElement).dataset.view;if(name)view(name);};
 for(const [id,value] of [['all-on',1],['all-off',0]] as const)el(id).onclick=()=>{for(const k of flags)settings[k]=value;buildControls();seek(time);};
 el('reload').onclick=async()=>{try{settings=await loadSettings();buildControls();seek(time);el('status').textContent='已重读游戏参数。';}catch{el('status').textContent='读取失败，保留当前预览参数。';}};
 window.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,select,textarea,button'))return;if(['Space','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='Space')el('play').click();if(e.code==='ArrowLeft')step(-1);if(e.code==='ArrowRight')step(1);});
 new ResizeObserver(()=>{const {width,height}=stage.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}).observe(stage);
 buildControls();view('game');seek(0);let previous=performance.now();
 renderer.setAnimationLoop(now=>{const dt=Math.min(.1,(now-previous)/1000);previous=now;if(playing){let next=time+dt*Number(el<HTMLSelectElement>('speed').value);if(next>duration){if(el<HTMLInputElement>('loop').checked){next%=duration;juiceSeed=newJuiceSeed();}else{next=duration;setPlay(false);}}seek(next);}controls.update();juice.prepare(camera,settings);particles.prepare(camera,settings);particles.renderDepth(renderer,camera);renderer.render(scene,camera);});
 Object.assign(window,{__SPIDER_VIEWER__:{seek:(t:number)=>{setPlay(false);seek(t);},snapshot:()=>({time,duration,clip:clip(),playing,feedback:feedback.snapshot(),particles:particles.snapshot(),juice:juice.snapshot(),camera:camera.position.toArray()})}});
}
main().catch(e=>{el('stage').textContent=`预览加载失败：${e.message}`;console.error(e);});
