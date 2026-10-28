import {slimeColorMarkup,bindSlimeColors} from './slime-color-controls.ts';
import {createSettingsSidebar} from './settings-sidebar.ts';
import {SLIME_FULLNESS_CONTROLS} from './slime-fullness-config.ts';
import { finishGpuWarmup } from './gpu-warmup.ts';
import * as T from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {DEFAULTS,LIMITS,sanitize,type Settings,type SettingKey} from './config.ts';
import {BURST_CONTROLS} from './slime-burst-config.ts';
import {HIT_CONTROLS} from './hit-feedback-config.ts';
import {SLIME_INFLATION_CONTROLS} from './slime-inflation-config.ts';
import {SlimeInflationState} from './slime-inflation-state.ts';
import {SlimeBurstState} from './slime-burst-state.ts';
import {HitResponse} from './hit-response.ts';
import {SlimeBurstPreview} from './slime-burst-preview.ts';
import {createTrainingCube,monsterInstance} from './training-monster.ts';
import {TrainingFeedback} from './training-feedback.ts';
import {LushBurstEffects} from './lush-burst-effects.ts';
import {loadSettings,saveSettings,settingsDocument,parseSettingsDocument} from './settings-store.ts';
import './slime-burst-lab.css';

const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;
type Control=[SettingKey,string,string,string];
const groups:{title:string;rows:Control[]}[]=[
 {title:'蓄爆节奏与形态',rows:BURST_CONTROLS.filter(r=>!r[0].startsWith('puddle')&&!r[0].startsWith('burstLayer'))},
 {title:'六层爆开特效',rows:BURST_CONTROLS.filter(r=>r[0].startsWith('burstLayer'))},
 {title:'地面液滩',rows:BURST_CONTROLS.filter(r=>r[0].startsWith('puddle'))},
 {title:'最后一箭 · 受击反馈',rows:HIT_CONTROLS.filter(r=>r[0].startsWith('hit'))},
 {title:'注入与弹性鼓胀',rows:[...SLIME_INFLATION_CONTROLS.filter(r=>!SLIME_FULLNESS_CONTROLS.some(f=>f[0]===r[0])),['monsterScale','怪物尺寸','倍','与游戏中的模型尺寸一致。']]},
];
groups.push({title:'充盈变色与行走',rows:SLIME_FULLNESS_CONTROLS});
const keys=[...new Set(groups.flatMap(g=>g.rows.map(r=>r[0])))];
let c:Settings={...DEFAULTS},frame=0,total=720,playing=false,ready=false,accumulator=0,last=0,seed=1,windFrame=0,burstFrame=0;
const STEP=1/120;
let feedback:TrainingFeedback,effects:LushBurstEffects,root:T.Group,renderer:T.WebGPURenderer,orbit:OrbitControls;
let seekMode=false,event:{center:T.Vector3;feet:T.Vector3;frame:number}|undefined;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.05,200);
const views:Record<string,[number,number,number]>={perspective:[7,5,9],front:[0,2,11],side:[11,2,0],top:[0,12,.01]};
const phaseNames={alive:'最后一箭 · 未触发撑爆',feedback:'最后一箭 · 受伤反馈 / 衔接',winding:'蓄爆 · 加速伸缩与鼓面增长',gone:'模型消失 · 爆开与液滩'};

document.querySelector('#app')!.innerHTML=`<header><div><h1>怪物爆炸 · 逐帧调试</h1><p>受击 → 蓄爆 → 爆开 → 液滩。复用游戏动画与材质，可从任意帧向前或向后查看。</p></div><a href="./index.html">返回游戏 ↗</a></header><div class="layout"><main><div id="view"><div class="overlay"><div id="phase">准备中</div><div id="detail"></div></div><div class="view-tools"><button data-view="perspective">透视</button><button data-view="front">正面</button><button data-view="side">侧面</button><button data-view="top">俯视</button></div><div id="loading">正在加载怪物与爆开资源…</div></div><div class="transport"><div class="row"><button id="play">播放</button><button id="restart">从头重播</button><button id="prev" title="左方向键">← 上一帧</button><button id="next" title="右方向键">下一帧 →</button><label>步进 <select id="fps"><option value="120">120 fps</option><option value="60">60 fps</option><option value="30">30 fps</option></select></label><label>速度 <select id="speed"><option value=".1">0.1×</option><option value=".25">0.25×</option><option value=".5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option></select></label><label><input id="loop" type="checkbox">循环</label></div><input id="seek" type="range" min="0" max="720" value="0" step="1" aria-label="爆炸动画时间轴"><div class="row"><label>帧 <input id="frame-number" type="number" min="0" value="0" step="1"></label><span id="time"></span></div><div class="row" id="markers"><button data-mark="0">最后一箭</button><button data-mark="wind">蓄爆开始</button><button data-mark="before">消失前一帧</button><button data-mark="burst">模型消失</button><button data-mark="end">时间轴末尾</button></div><p class="help">空格播放 / 暂停，← → 逐帧。拖动画面旋转，滚轮缩放。初始预填到“差最后一箭充满”，第 0 帧为最后一箭命中。随机种子固定，倒放不会更换液滩。</p></div></main><aside><div class="row"><button id="load">读取游戏参数</button><button id="save">保存到游戏</button><button id="defaults">恢复本页默认</button><button id="export">导出 JSON</button><label>导入 <input id="import" type="file" accept="application/json,.json" style="max-width:150px"></label></div><p>调参后暂停并重算当前时刻。只有点击“保存到游戏”才写入游戏参数；游戏页刷新后使用新值。</p><div id="message" role="status"></div><div class="row"><label>随机种子 <input id="seed" type="number" value="1" min="0" step="1" style="width:80px"></label><label>爆开后预览 <input id="tail" type="number" value="4" min="1" max="120" step="1" style="width:65px">秒</label></div><div class="row" style="margin-top:12px" aria-label="液滩材质对比"><strong>液滩对比</strong><label><input type="checkbox" data-puddle-toggle="puddleHighlightEnabled">大高光</label><label><input type="checkbox" data-puddle-toggle="puddleGradientEnabled">明暗渐变</label><label><input type="checkbox" data-puddle-toggle="puddleShadowEnabled">贴地阴影</label></div><input id="filter" placeholder="筛选参数名称…" aria-label="筛选参数">${groups.map((g,i)=>`<details ${i===0?'open':''}><summary>${g.title}</summary>${g.rows.map(([key,label,unit,hint])=>{const colorMarkup=slimeColorMarkup(key);if(colorMarkup!==undefined)return colorMarkup;const [min,max,step]=LIMITS[key];return `<div class="control" data-control="${key}"><label>${label}${unit?` (${unit})`:''}<input data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" aria-label="${label}"></label><input data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}滑块"><small>${hint}</small></div>`;}).join('')}</details>`).join('')}<details><summary>尺寸与时间曲线</summary><div id="burst-curve"></div><div id="puddle-curve"></div></details></aside></div>`;
const labAside=document.querySelector<HTMLElement>('aside')!,labSections=[...labAside.querySelectorAll<HTMLElement>(':scope > details')];
const labContent=document.createElement('div');labContent.className='lab-settings-sections';labSections[0].before(labContent);
const labCategory=createSettingsSidebar(labContent,labSections,[
 {id:'fullness',label:'史莱姆 · 充盈与行走',sections:['充盈变色与行走','注入与弹性鼓胀']},
 {id:'puddle',label:'地面液体 · 外观与展开',sections:['地面液滩']},
 {id:'burst',label:'怪物爆炸 · 动画与特效',sections:['蓄爆节奏与形态','六层爆开特效','尺寸与时间曲线']},
 {id:'hit',label:'受击反馈',sections:['最后一箭 · 受击反馈']},
],'lab-settings-category');
for(const category of labContent.querySelectorAll('.settings-category')){const first=category.querySelector('details');if(first)first.open=true;}
const burstCurve=new SlimeBurstPreview($('burst-curve'),()=>c),puddleCurve=new SlimeBurstPreview($('puddle-curve'),()=>c,true);
function message(s:string){$('message').textContent=s;}
function stop(){playing=false;accumulator=0;$('play').textContent='播放';}
function random(){let n=seed|0;return ()=>{n=(Math.imul(n,1664525)+1013904223)|0;return (n>>>0)/4294967296;};}
const slimeColors=bindSlimeColors(()=>c,values=>{Object.assign(c,values);updateInputs();rebuild();message('颜色已更新，尚未保存到游戏。');});
function updateInputs(){slimeColors.render();document.querySelectorAll<HTMLInputElement>('[data-puddle-toggle]').forEach(el=>el.checked=!!c[el.dataset.puddleToggle as SettingKey]);document.querySelectorAll<HTMLInputElement>('[data-key]').forEach(el=>el.value=String(c[el.dataset.key as SettingKey]));burstCurve.render();puddleCurve.render();}
function prefill(){const state=monsterInstance(root)!.inflation!.state;state.amount=Math.max(0,c.slimeCapacity-c.slimeInjectionAmount);state.colorFill=state.target=state.visual=state.amount/c.slimeCapacity;}
function reset(){effects.clear();feedback.reset();prefill();frame=0;event=undefined;feedback.hit('preview',{x:0,z:-1},c);feedback.refresh(c);}
function advance(){frame++;feedback.update(STEP,c);if(!seekMode)effects.update(STEP,c,24,24,camera);}
function seek(to:number){if(!ready)return;stop();to=Math.max(0,Math.min(total,Math.round(to)));seekMode=true;reset();while(frame<to)advance();seekMode=false;
 // Replay the state machine at 120 Hz, then evaluate baked FX and springs directly at this age.
 if(event){effects.update((event.frame-1)*STEP,c,24,24,camera);effects.emit(event.center,event.feet,c,random());effects.update((frame-event.frame+1)*STEP,c,24,24,camera);}else effects.update(frame*STEP,c,24,24,camera);
 updateReadout();}
function measure(){
 const state=new SlimeInflationState();state.amount=Math.max(0,c.slimeCapacity-c.slimeInjectionAmount);state.colorFill=state.target=state.visual=state.amount/c.slimeCapacity;state.hit(c);
 const hit=new HitResponse({x:0,z:0},{x:12,z:12});hit.hit({x:0,z:-1},c);hit.update(0,c);
 const burst=new SlimeBurstState(),canBurst=state.amount>=c.slimeCapacity&&burst.fill(c);let ticks=0;windFrame=burstFrame=0;
 while(ticks<120*3600){ticks++;hit.update(STEP,c);state.update(STEP,c);const complete=hit.complete(c)&&!Number.isFinite(state.age);burst.update(STEP,complete,Math.max(hit.remaining(c),state.remaining));if(!windFrame&&burst.phase==='winding')windFrame=ticks;if(burst.phase==='gone'){burstFrame=ticks;break;}if(!canBurst&&complete)break;}
 $('markers').querySelector<HTMLButtonElement>('[data-mark="wind"]')!.title=`${(windFrame*STEP).toFixed(3)} s`;
 $('markers').querySelector<HTMLButtonElement>('[data-mark="burst"]')!.title=`${(burstFrame*STEP).toFixed(3)} s`;
 total=(burstFrame||ticks)+Math.round(Number($<HTMLInputElement>('tail').value)*120);$<HTMLInputElement>('seek').max=String(total);$<HTMLInputElement>('frame-number').max=String(Math.ceil(total/stride()));document.querySelectorAll<HTMLButtonElement>('[data-mark="wind"],[data-mark="burst"],[data-mark="before"]').forEach(b=>b.disabled=!canBurst);
}
function stride(){return 120/Number($<HTMLSelectElement>('fps').value);}
function updateReadout(){const d=feedback.snapshot()[0],s=effects.snapshot();$('phase').textContent=phaseNames[d.burst.phase];$('detail').textContent=`注入 ${d.inflation?.amount.toFixed(1)} / ${c.slimeCapacity}　整体缩放 ${d.scale.toFixed(3)} 倍\n特效粒子 ${s.bursts.reduce((n,b)=>n+b.visible,0)}　液滩 ${s.puddles[0]?.scale.toFixed(3)??'0.000'} 倍`;$<HTMLInputElement>('seek').value=String(frame);$<HTMLInputElement>('frame-number').value=String(frame/stride());$('time').textContent=`${(frame*STEP).toFixed(3)} / ${(total*STEP).toFixed(3)} s · 内部帧 ${frame}`;}
function rebuild(){if(!ready)return;const time=frame;measure();seek(time);}
$('play').onclick=()=>{if(!ready)return;if(playing){stop();return;}if(frame>=total)seek(0);playing=true;$('play').textContent='暂停';};
$('restart').onclick=()=>{seek(0);if(ready){playing=true;$('play').textContent='暂停';}};
$('prev').onclick=()=>seek(frame-stride());$('next').onclick=()=>seek(frame+stride());
$<HTMLInputElement>('seek').oninput=e=>seek(Number((e.target as HTMLInputElement).value));
$<HTMLInputElement>('frame-number').onchange=e=>seek(Number((e.target as HTMLInputElement).value)*stride());
$('fps').onchange=()=>{if(ready){measure();updateReadout();}};
$('seed').onchange=()=>{seed=Number($<HTMLInputElement>('seed').value)||0;rebuild();};
$('tail').onchange=()=>{const el=$<HTMLInputElement>('tail');el.value=String(Math.max(1,Math.min(120,Number(el.value)||4)));rebuild();};
$('markers').onclick=e=>{const mark=(e.target as HTMLElement).dataset.mark;if(mark!==undefined)seek(mark==='wind'?windFrame:mark==='burst'?burstFrame:mark==='before'?burstFrame-1:mark==='end'?total:0);};
window.addEventListener('keydown',e=>{if((e.target as HTMLElement).matches('input,select,textarea,button'))return;if(e.code==='Space'){e.preventDefault();$('play').click();}if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();seek(frame+(e.code==='ArrowLeft'?-1:1)*stride());}});
let changeFrame=0;
document.querySelectorAll<HTMLInputElement>('[data-key]').forEach(el=>el.addEventListener('input',()=>{if(!Number.isFinite(el.valueAsNumber))return;const key=el.dataset.key as SettingKey;c[key]=sanitize(key,el.valueAsNumber);document.querySelectorAll<HTMLInputElement>(`[data-puddle-toggle="${key}"]`).forEach(x=>x.checked=!!c[key]);document.querySelectorAll<HTMLInputElement>(`[data-key="${key}"]`).forEach(x=>{if(x!==el)x.value=String(c[key]);});stop();cancelAnimationFrame(changeFrame);changeFrame=requestAnimationFrame(()=>{rebuild();burstCurve.render();puddleCurve.render();message('已在当前时刻应用修改，尚未保存到游戏。');});}));
document.querySelectorAll<HTMLInputElement>('[data-puddle-toggle]').forEach(el=>el.onchange=()=>{c[el.dataset.puddleToggle as SettingKey]=el.checked?1:0;updateInputs();rebuild();message('已切换液滩效果，尚未保存到游戏。');});
$('filter').oninput=()=>{const q=$<HTMLInputElement>('filter').value.trim().toLowerCase();document.querySelectorAll<HTMLElement>('[data-control]').forEach(el=>el.hidden=!`${el.textContent} ${el.dataset.control}`.toLowerCase().includes(q));if(q){const match=[...labContent.querySelectorAll<HTMLElement>('[data-control]')].find(el=>!el.hidden);const category=match?.closest<HTMLElement>('[data-category]');if(category){labCategory.value=category.dataset.category!;labCategory.dispatchEvent(new Event('change'));}}if(q)document.querySelectorAll<HTMLDetailsElement>('aside details').forEach(el=>{if(el.querySelector('[data-control]'))el.open=true;});};
$('defaults').onclick=()=>{for(const key of keys)c[key]=DEFAULTS[key];updateInputs();rebuild();message('已恢复本页默认参数，尚未保存到游戏。');};
$('load').onclick=async()=>{try{c=await loadSettings();updateInputs();rebuild();message('已读取游戏保存的参数。');}catch(e){message(String(e));}};
$('save').onclick=async()=>{try{const latest=await loadSettings();for(const key of keys)latest[key]=c[key];await saveSettings(latest);message('已保存本页参数到游戏；刷新游戏页生效。');}catch(e){message(`保存失败：${e}`);}};
$('export').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(settingsDocument(c),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='slime-burst-settings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onchange=async()=>{try{const file=$<HTMLInputElement>('import').files?.[0];if(!file)return;const imported=parseSettingsDocument(JSON.parse(await file.text()));for(const key of keys)c[key]=imported[key];updateInputs();rebuild();message('已导入本页参数，尚未保存到游戏。');}catch(e){message(`导入失败：${e}`);}};
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.onclick=()=>{if(!ready)return;camera.position.fromArray(views[b.dataset.view!]);orbit.target.set(0,1,-.5);orbit.update();});

async function init(){try{
 $('loading').innerHTML='<span id="lab-loading-stage">正在准备资源…</span><progress id="lab-loading-progress" max="100" value="0" aria-label="爆炸调试页加载进度"></progress><span id="lab-loading-percent">0%</span>';
 const report=(p:number,stage:string)=>{$<HTMLProgressElement>('lab-loading-progress').value=p*100;$('lab-loading-stage').textContent=stage;$('lab-loading-percent').textContent=`${Math.round(p*100)}%`;};
 report(.02,'正在启动渲染器');
 try{c=await loadSettings();}catch{message('无法读取游戏参数，已使用默认值。');}updateInputs();
 renderer=new T.WebGPURenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));await renderer.init();renderer.shadowMap.enabled=true;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
 $('view').prepend(renderer.domElement);scene.background=new T.Color('#29392e');scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,1.7));const sun=new T.DirectionalLight(0xfff4ce,1.8);sun.position.set(-9,22,-8);sun.castShadow=true;scene.add(sun);
 const env=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);const environment=pmrem.fromScene(env).texture;env.dispose();pmrem.dispose();
 const ground=new T.Mesh(new T.PlaneGeometry(24,24),new T.MeshStandardMaterial({color:0x344b3b,roughness:.85}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);const grid=new T.GridHelper(24,24,0x70816a,0x485e4c);grid.position.y=.005;scene.add(grid);
 camera.position.fromArray(views.perspective);orbit=new OrbitControls(camera,renderer.domElement);orbit.target.set(0,1,-.5);orbit.enableDamping=false;orbit.minDistance=2;orbit.maxDistance=50;orbit.update();
 root=createTrainingCube(environment);root.userData.practiceTarget='preview';const group=new T.Group();group.add(root);scene.add(group);feedback=new TrainingFeedback(group,[{id:'preview',x:0,z:0}],24,24);effects=await LushBurstEffects.load(scene,p=>report(.1+p*.55,'正在加载爆炸与液体资源'));
 feedback.onBurst=(center,feet)=>{event={center:center.clone(),feet:feet.clone(),frame};if(!seekMode)effects.emit(center,feet,c,random());};
 const resize=()=>{const r=$('view').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe($('view'));resize();
 report(.65,'正在准备爆炸与液体效果');await new Promise<void>(resolve=>setTimeout(resolve,0));
 try{effects.prepareWarmup(1,c,camera,24,24);await renderer.compileAsync(scene,camera,null,e=>{if(e.total)report(.65+.33*e.loaded/e.total,'正在准备爆炸与液体效果');});renderer.render(scene,camera);await finishGpuWarmup(renderer);}finally{effects.clear();}
 ready=true;measure();seek(0);renderer.render(scene,camera);await finishGpuWarmup(renderer);report(1,'准备完成');$('loading').remove();
 renderer.setAnimationLoop(now=>{const dt=last?Math.min(.1,(now-last)/1000):0;last=now;if(playing){accumulator+=dt*Number($<HTMLSelectElement>('speed').value);while(accumulator>=STEP&&frame<total){advance();accumulator-=STEP;}if(frame>=total){if($<HTMLInputElement>('loop').checked){seek(0);playing=true;$('play').textContent='暂停';}else stop();}updateReadout();}effects.update(0,c,24,24,camera);renderer.render(scene,camera);});
 if(import.meta.env.DEV)Object.assign(window,{__BURST_LAB__:{seek,snapshot:()=>({ready,frame,total,windFrame,burstFrame,playing,feedback:feedback.snapshot(),effects:effects.snapshot(),settings:{...c}})}});
 }catch(e){console.error(e);$('loading').textContent=`加载失败：${e}。请刷新重试。`;}}
void init();
