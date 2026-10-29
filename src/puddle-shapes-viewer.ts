import * as T from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {CurveFluidPuddles,type CurvePuddle} from './curve-fluid-puddles.ts';
import {loadSettings,saveSettings} from './settings-store.ts';
import type {Settings} from './config.ts';
import './puddle-shapes-viewer.css';

document.querySelector('#app')!.innerHTML=`<header><div><h1>液滩形状观察</h1><p>看清轮廓、孔洞与厚度，再选择允许随机出现的形状。</p></div><a href="./index.html">返回游戏 ↗</a></header><main><div class="toolbar"><label>渲染方式 <select id="mode"><option value="1">CurveFluid · 三维液滩</option><option value="0">旧版 · 平面液滩</option></select></label><button data-camera="top">俯视轮廓</button><button data-camera="perspective">透视</button><button data-camera="side">低角度</button><button id="all">并排观察</button><label><input id="wireframe" type="checkbox">线框</label><label><input id="rotate" type="checkbox">自动旋转</label></div><div id="view"><div id="loading">正在加载液滩形状…</div></div><p class="hint">拖动旋转，滚轮缩放。并排从左到右为形状 1、2、3；尺寸和朝向固定，方便比较。旧版显示原始笔刷轮廓，三维版显示游戏网格。取消随机候选后仍可观察该形状。</p><div class="cards">${[1,2,3].map(i=>`<article class="card" data-card="${i}"><h2>形状 ${i}</h2><p>同一尺寸 · 固定朝向</p><label><input type="checkbox" data-allow="${i}" checked>允许随机出现</label><button data-inspect="${i}">单独观察</button></article>`).join('')}</div><footer><button id="save" disabled>保存随机候选</button><button id="reload" disabled>重新读取</button><span id="count"></span></footer><p id="status" role="status">两种渲染方式分别保存候选。每种至少保留一个形状。</p><p id="error" role="alert"></p><p class="hint">保存会将游戏的“液滩形状”设为随机，不改变当前渲染方式。游戏或调试页刷新后，新生成的随机液滩只从所选候选中选择。</p><p class="hint">三维素材：<a href="./assets/curve-fluid/credits.html" target="_blank" rel="noopener">Curve Fluid / FuLi · CC BY 4.0</a></p></main>`;
const $=<E extends HTMLElement>(id:string)=>document.getElementById(id) as E;
let settings:Settings,mode=1,masks=[7,7],savedMasks=[7,7],selection=0,ready=false,saving=false;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,1,.05,200),renderer=new T.WebGPURenderer({antialias:true});
let orbit:OrbitControls,ground:CurveFluidPuddles,planes:T.Mesh[]=[];
function status(text:string){$('status').textContent=text;}
function controls(){
 document.querySelectorAll<HTMLInputElement>('[data-allow]').forEach(el=>{el.checked=!!(masks[mode]&(1<<(Number(el.dataset.allow)-1)));el.disabled=saving||!ready;});
 document.querySelectorAll<HTMLElement>('[data-card]').forEach(el=>el.classList.toggle('selected',Number(el.dataset.card)===selection));
 $('count').textContent=`本组已选 ${[0,1,2].filter(i=>masks[mode]&(1<<i)).length} / 3`;
 $<HTMLButtonElement>('save').disabled=!ready||saving||masks.some(m=>m===0);
 $<HTMLButtonElement>('reload').disabled=!ready||saving;
 $<HTMLInputElement>('wireframe').disabled=mode===0;
 $('error').textContent=masks.some(m=>m===0)?'每种渲染方式至少保留一个形状，才能保存。':'';
}
function cameraView(name:string){
 const distance=selection?8:17;
 camera.position.fromArray(name==='top'?[0,distance,.001]:name==='side'?[0,distance*.12,distance]:[distance*.25,distance*.7,distance*.85]);
 orbit.target.set(0,0,0);orbit.update();
}
function draw(){
 if(!ready)return;
 const color=new T.Color().setRGB(settings.slimeColorEndR/255,settings.slimeColorEndG/255,settings.slimeColorEndB/255,T.SRGBColorSpace);
 const c={...settings,puddleEnabled:1,puddleSize:4,puddleRenderer:mode,puddleShape:0,puddleColorR:color.r,puddleColorG:color.g,puddleColorB:color.b};
 const ids=selection?[selection-1]:[0,1,2];
 const puddles:CurvePuddle[]=ids.map((shape,i)=>({origin:{x:0,z:0,shape,angleRandom:0,sizeRandom:0},c,age:4,x:selection?0:(i-1)*5,z:0,shape,angle:0,size:4,scale:1,settled:true,opacity:1}));
 ground.update(mode===1?puddles:[],c);
 planes.forEach((p,i)=>{p.visible=mode===0&&(!selection||selection===i+1);p.position.x=selection?0:(i-1)*5;(p.material as T.MeshBasicMaterial).color.copy(color);});
 scene.children.filter(o=>o.name.startsWith('CurveFluidPuddle')).forEach(o=>{const mat=(o as T.Mesh).material as T.MeshPhysicalNodeMaterial;const wire=$<HTMLInputElement>('wireframe').checked;if(mat.wireframe!==wire){mat.wireframe=wire;mat.needsUpdate=true;}});
 controls();
}
$<HTMLSelectElement>('mode').onchange=()=>{mode=Number($<HTMLSelectElement>('mode').value);selection=0;draw();if(ready)cameraView('perspective');};
document.querySelectorAll<HTMLButtonElement>('[data-camera]').forEach(b=>b.onclick=()=>{if(ready)cameraView(b.dataset.camera!);});
document.querySelectorAll<HTMLButtonElement>('[data-inspect]').forEach(b=>b.onclick=()=>{selection=Number(b.dataset.inspect);draw();if(ready)cameraView('perspective');});
document.querySelectorAll<HTMLInputElement>('[data-allow]').forEach(el=>el.onchange=()=>{const bit=1<<(Number(el.dataset.allow)-1);masks[mode]=el.checked?masks[mode]|bit:masks[mode]&~bit;controls();status('候选已修改，尚未保存。');});
$('all').onclick=()=>{selection=0;draw();if(ready)cameraView('perspective');};
$('wireframe').onchange=draw;
$('rotate').onchange=()=>{if(orbit)orbit.autoRotate=$<HTMLInputElement>('rotate').checked;};
$('save').onclick=async()=>{
 if(!ready||saving||masks.some(m=>m===0))return;
 const chosen=masks.slice();saving=true;controls();status('正在保存…');
 try{const latest=await loadSettings();await saveSettings({...latest,puddleCanvasShapes:chosen[0],puddleCurveShapes:chosen[1],puddleShape:0});savedMasks=chosen;status('已保存。游戏或爆炸调试页刷新后使用这些随机候选。');}catch(e){status(`保存失败：${e instanceof Error?e.message:String(e)}`);}finally{saving=false;controls();}
};
$('reload').onclick=async()=>{try{settings=await loadSettings();masks=[settings.puddleCanvasShapes,settings.puddleCurveShapes];savedMasks=masks.slice();draw();status('已读取保存的随机候选。');}catch(e){status(`读取失败：${e}`);}};
window.addEventListener('beforeunload',e=>{if(masks.some((m,i)=>m!==savedMasks[i])){e.preventDefault();e.returnValue='';}});
async function init(){try{
 settings=await loadSettings();masks=[settings.puddleCanvasShapes,settings.puddleCurveShapes];savedMasks=masks.slice();
 await renderer.init();renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.toneMapping=T.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;$('view').prepend(renderer.domElement);
 scene.background=new T.Color('#223428');scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,1.7));const sun=new T.DirectionalLight(0xfff4ce,1.8);sun.position.set(-9,22,-8);sun.castShadow=true;sun.shadow.camera.left=sun.shadow.camera.bottom=-12;sun.shadow.camera.right=sun.shadow.camera.top=12;scene.add(sun);
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer),environment=pmrem.fromScene(room).texture;room.dispose();pmrem.dispose();
 const floor=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshStandardMaterial({color:'#344b3b',roughness:.85}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);const grid=new T.GridHelper(30,30,0x687b64,0x42543f);grid.position.y=.003;scene.add(grid);
 ground=await CurveFluidPuddles.load(scene,environment);
 planes=await Promise.all([1,2,3].map(async i=>{const map=await new T.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/lush-burst/T_VFX_Lush_Splat_0${i}.png`);const mat=new T.MeshBasicMaterial({color:new T.Color(settings.puddleColorR,settings.puddleColorG,settings.puddleColorB),map,transparent:true,depthWrite:false,side:T.DoubleSide});const mesh=new T.Mesh(new T.PlaneGeometry(4,4),mat);mesh.rotation.x=-Math.PI/2;mesh.position.y=.015;scene.add(mesh);return mesh;}));
 orbit=new OrbitControls(camera,renderer.domElement);orbit.minDistance=3;orbit.maxDistance=40;orbit.maxPolarAngle=Math.PI*.49;orbit.enableDamping=true;
 const resize=()=>{const r=$('view').getBoundingClientRect();renderer.setSize(r.width,r.height);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};new ResizeObserver(resize).observe($('view'));resize();
 ready=true;draw();cameraView('perspective');$('loading').remove();let last=0;renderer.setAnimationLoop(t=>{orbit.update(last?Math.min(.1,(t-last)/1000):0);last=t;renderer.render(scene,camera);});
 if(import.meta.env.DEV)Object.assign(window,{__PUDDLE_SHAPES__:{snapshot:()=>({ready,mode,selection,masks:[...masks],savedMasks:[...savedMasks],ground:ground.snapshot()})}});
}catch(e){$('loading').textContent=`加载失败：${e instanceof Error?e.message:String(e)}`;}}
void init();
