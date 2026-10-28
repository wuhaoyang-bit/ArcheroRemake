import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createYellowSlimeModel } from './yellow-slime-model.ts';
import './yellow-slime-lab.css';

document.querySelector('#app')!.innerHTML=`<header><span>ARCHERO REMAKE / MODEL STUDY 01</span><span>黄色史莱姆 · 外形试验</span></header><main><section class="model-stage"><div class="model-title"><p>YELLOW JELLY</p><h1>一块柔软的黄色。</h1><span>圆角 · 半透明 · 静态模型</span></div><div id="model-viewport" aria-label="可旋转的黄色方块模型"></div><div class="stage-caption"><span>拖动旋转 / 滚轮缩放 / 双指缩放</span><span>01 — SOFT CUBE</span></div></section><aside><p class="eyebrow">外观观察</p><h2>先看身体的感觉</h2><p class="intro">黄色外壳带一点软胶的透光感。这个版本只观察模型，尚未加入颜料、膨胀与受击动画。</p><div class="views"><button data-view="game">游戏视角</button><button data-view="front">正面</button><button data-view="side">侧面</button></div><label>透光程度 <output id="transmission-value">65%</output><input id="transmission" type="range" min="0" max="1" step=".01" value=".65"></label><label>表面粗糙度 <output id="roughness-value">19%</output><input id="roughness" type="range" min=".05" max=".7" step=".01" value=".19"></label><label class="check"><input id="face" type="checkbox" checked>显示眼睛</label><button id="reset">恢复初始外观</button><p class="note">参数只影响本页预览，不会改动游戏设置。</p></aside></main><footer>透明材质与轮廓草模 / 脚底为模型原点</footer>`;
const host=document.querySelector<HTMLElement>('#model-viewport')!;
const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.15;
host.append(renderer.domElement);
const scene=new T.Scene();scene.background=new T.Color('#e9e7dc');
const camera=new T.PerspectiveCamera(35,1,.1,80),controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=4;controls.maxDistance=13;controls.maxPolarAngle=Math.PI*.49;controls.target.set(0,.95,0);
const pmrem=new T.PMREMGenerator(renderer),room=new RoomEnvironment();const env=pmrem.fromScene(room);scene.environment=env.texture;room.dispose();pmrem.dispose();
scene.add(new T.HemisphereLight(0xfffbed,0x877d54,2));
const light=new T.DirectionalLight(0xfff7df,3);light.position.set(-3,7,5);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5});light.shadow.normalBias=.025;light.shadow.bias=-.0002;scene.add(light);
const floor=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0xe9e7dc,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;scene.add(floor);
const grid=new T.GridHelper(14,28,0xc6c3b4,0xd8d5c8);grid.position.y=-.009;scene.add(grid);
const model=createYellowSlimeModel();scene.add(model.root);
function view(name:string){camera.position.fromArray(({game:[4.4,4.8,6.5],front:[0,1.5,7.5],side:[7.5,1.8,0]} as Record<string,number[]>)[name]);controls.target.set(0,.95,0);controls.update();}
for(const button of document.querySelectorAll<HTMLButtonElement>('[data-view]'))button.onclick=()=>view(button.dataset.view!);
for(const key of ['transmission','roughness'] as const){const input=document.querySelector<HTMLInputElement>('#'+key)!;input.oninput=()=>{model.material[key]=Number(input.value);document.querySelector('#'+key+'-value')!.textContent=`${Math.round(Number(input.value)*100)}%`;};}
document.querySelector<HTMLInputElement>('#face')!.onchange=e=>{model.face.visible=(e.target as HTMLInputElement).checked;};
document.querySelector<HTMLButtonElement>('#reset')!.onclick=()=>{for(const [key,value] of [['transmission',.65],['roughness',.19]] as const){const input=document.querySelector<HTMLInputElement>('#'+key)!;input.value=String(value);input.dispatchEvent(new Event('input'));}model.face.visible=true;document.querySelector<HTMLInputElement>('#face')!.checked=true;view('game');};
new ResizeObserver(()=>{const {width,height}=host.getBoundingClientRect();renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();}).observe(host);
view('game');renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
host.dataset.ready='true';
