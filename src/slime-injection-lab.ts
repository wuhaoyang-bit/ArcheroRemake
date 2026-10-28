import {INJECTION_CURVES,InjectionResponse,injectionProgress} from './slime-injection-curves.ts';
import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createYellowSlimeModel} from './yellow-slime-model.ts';
import {inflatePoint} from './slime-inflation-shape.ts';
import './slime-inflation-lab.css';
import './slime-injection-lab.css';
const modes=INJECTION_CURVES.map(c=>c.id);
document.querySelector('#app')!.innerHTML=`<header><small>ARCHERO REMAKE / INJECTION STUDY 03</small><h1>同一箭，四种撑开的感觉。</h1><p>已选方案 02 · 外鼓形态插值 / 比较每次命中后的膨胀节奏</p></header>
<section class="controls"><button id="shoot">射一箭 · 同步</button><button id="burst">三连射</button><button id="clear">清空 / 重置</button><button id="pause">暂停</button><label>播放速度 <select id="speed"><option value="1">正常</option><option value=".25">1/4 慢放</option><option value=".1">1/10 慢放</option></select></label><div class="views"><button data-view="game">游戏视角</button><button data-view="front">正面</button><button data-view="side">侧面</button></div><label><input id="wire" type="checkbox">线框</label><label><input id="eyes" type="checkbox" checked>眼睛</label></section>
<section class="tuning"><label>每箭注入量 / 容量 100 <output id="dose-value"></output><input id="dose" type="range" min="5" max="50" step="5" value="20"></label><label>满容量尺寸倍率 <output id="growth-value"></output><input id="growth" type="range" min="1.1" max="1.6" step=".01" value="1.35"></label><label>最大鼓面程度 <output id="bulge-value"></output><input id="bulge" type="range" min="0" max="1" step=".01" value=".65"></label></section>
<p class="help" id="status">点击“射一箭”：箭接触身体时累计注入量，外形按四种曲线追上新体型。</p>
<main>${INJECTION_CURVES.map((curve,i)=>`<article><div class="card-head"><span>0${i+1}</span><h2>${curve.name}</h2></div><p class="reason">${curve.reason}</p><div class="stage" id="stage-${curve.id}"></div><output class="metrics" id="metrics-${curve.id}"></output><svg class="response-graph" id="graph-${curve.id}" viewBox="0 0 400 160" role="img" aria-label="${curve.name}的时间响应曲线"></svg><p class="timing">${['OutCubic · 0.32 秒','等待 0.06 秒 + 五次缓入缓出 0.42 秒','阻尼弹簧 · 5.5 Hz / 阻尼 0.55','先注入 25% · 停顿 0.06 秒 · 再扩散 75%'][i]}</p></article>`).join('')}</main>
<footer><p>四组使用相同模型、注入量与目标体积；曲线纵轴为“本次外形增长完成度”。超过 100% 表示形状超调，不是多注入颜料。连射从当前外形接续，填充满后保留形状，暂不爆开。</p><p>这是命中节奏预览：箭的接触时刻为演示事件，尚未接入游戏碰撞。未加入压缩、闪光、镜头震动或内部颜料，以便只比较膨胀曲线。所有设置只影响本页。</p></footer>`;
const input=(id:string)=>document.getElementById(id) as HTMLInputElement;
const number=(id:string)=>Number(input(id).value);
const vec=new T.Vector3(),out=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3();
function volume(geometry:T.BufferGeometry){const p=geometry.getAttribute('position'),index=geometry.index!;let sum=0;for(let i=0;i<index.count;i+=3){a.fromBufferAttribute(p,index.getX(i));b.fromBufferAttribute(p,index.getX(i+1));c.fromBufferAttribute(p,index.getX(i+2));sum+=a.dot(b.cross(c))/6;}return Math.abs(sum);}
const stages=modes.map(mode=>{
 const host=document.getElementById('stage-'+mode)!;
 const renderer=new T.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;host.append(renderer.domElement);
 const scene=new T.Scene();scene.background=new T.Color('#e9e7dc');
 const camera=new T.PerspectiveCamera(36,1,.1,50),orbit=new OrbitControls(camera,renderer.domElement);orbit.enablePan=false;orbit.minDistance=6;orbit.maxDistance=14;orbit.maxPolarAngle=Math.PI*.49;orbit.target.set(0,1.4,0);
 const room=new RoomEnvironment(),pmrem=new T.PMREMGenerator(renderer);scene.environment=pmrem.fromScene(room).texture;room.dispose();pmrem.dispose();
 scene.add(new T.HemisphereLight(0xfffbed,0x877d54,2));const light=new T.DirectionalLight(0xfff7df,3);light.position.set(-3,7,5);light.castShadow=true;light.shadow.mapSize.set(1024,1024);Object.assign(light.shadow.camera,{left:-5,right:5,top:5,bottom:-5});light.shadow.normalBias=.025;scene.add(light);
 const floor=new T.Mesh(new T.PlaneGeometry(100,100),new T.MeshStandardMaterial({color:0xe9e7dc,roughness:.9}));floor.rotation.x=-Math.PI/2;floor.position.y=-.012;floor.receiveShadow=true;scene.add(floor);
 const footprint=new T.Line(new T.BufferGeometry().setFromPoints([new T.Vector3(-1,.005,-1),new T.Vector3(1,.005,-1),new T.Vector3(1,.005,1),new T.Vector3(-1,.005,1),new T.Vector3(-1,.005,-1)]),new T.LineDashedMaterial({color:0x8f947b,dashSize:.08,gapSize:.05}));footprint.computeLineDistances();scene.add(footprint);
 const model=createYellowSlimeModel();scene.add(model.root);const original=model.body.geometry;const g=new T.BoxGeometry(2,2,2,32,32,32);const gp=g.getAttribute('position'),inner=new T.Vector3();for(let i=0;i<gp.count;i++){vec.fromBufferAttribute(gp,i);inner.copy(vec).clampScalar(-.76,.76);out.copy(vec).sub(inner).normalize().multiplyScalar(.24).add(inner);gp.setXYZ(i,out.x,out.y,out.z);}g.deleteAttribute('normal');g.deleteAttribute('uv');(model.body as T.Mesh<T.BufferGeometry>).geometry=mergeVertices(g,1e-5);original.dispose();g.dispose();model.body.geometry.computeVertexNormals();model.body.position.y=0;
 const base=model.body.geometry.getAttribute('position').clone(),baseVolume=volume(model.body.geometry);let radius=0;for(let i=0;i<base.count;i++)radius=Math.max(radius,vec.fromBufferAttribute(base,i).length());
 const response=new InjectionResponse(mode);
 const arrow=new T.Group();const shaft=new T.Mesh(new T.CylinderGeometry(.022,.022,.75,8),new T.MeshStandardMaterial({color:0x65472c}));shaft.rotation.x=Math.PI/2;shaft.position.z=.5;arrow.add(shaft);const bag=new T.Mesh(new T.SphereGeometry(.12,16,12),new T.MeshPhysicalMaterial({color:0x9c4ed8,roughness:.2,transmission:.2,thickness:.15}));bag.scale.set(.8,.8,1.25);arrow.add(bag);arrow.visible=false;scene.add(arrow);
 const faceBase=model.face.children.map(o=>o.position.clone().add(new T.Vector3(0,-1,0)));
 new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}).observe(host);
 return {mode,response,arrow,host,renderer,scene,camera,orbit,model,base,baseVolume,radius,faceBase,stats:{volume:1,height:2,width:2,minY:0}};
});
function render(){for(const s of stages)s.renderer.render(s.scene,s.camera);}
let syncing=false;
for(const stage of stages)stage.orbit.addEventListener('change',()=>{if(syncing)return;syncing=true;for(const s of stages)if(s!==stage){s.camera.position.copy(stage.camera.position);s.orbit.target.copy(stage.orbit.target);s.orbit.update();}syncing=false;render();});
function setView(name:string){syncing=true;for(const s of stages){s.camera.position.fromArray(({game:[4,4.2,6.2],front:[0,1.4,8],side:[8,1.4,0]} as Record<string,number[]>)[name]);s.orbit.target.set(0,1.4,0);s.orbit.update();}syncing=false;render();}
function graph(id:string){
 const curve=INJECTION_CURVES.find(c=>c.id===id)!;const svg=document.getElementById('graph-'+id)!;
 const x=(t:number)=>38+t/1.1*345,y=(v:number)=>128-v*88;
 svg.innerHTML=`<path d="M38 22V128H383" fill="none" stroke="#9ba18b"/><path d="M38 ${y(1)}H383" stroke="#a5aa93" stroke-dasharray="4 4"/><text x="2" y="${y(1)+4}">100%</text><text x="14" y="132">0</text><text x="38" y="151">0s</text><text x="348" y="151">1.1s</text><path d="${Array.from({length:221},(_,i)=>{const t=i/200;return `${i?'L':'M'}${x(t).toFixed(2)},${y(injectionProgress(curve.id,t)).toFixed(2)}`;}).join(' ')}" fill="none" stroke="#7e4ab0" stroke-width="2.6"/><circle class="cursor" r="4" fill="#49345c" cx="38" cy="128"/>`;
}
for(const c of INJECTION_CURVES)graph(c.id);
let simulationTime=0,shots:{at:number;dose:number}[]=[],hits=0,paused=false;
function update(){
 const bulge=number('bulge');for(const key of ['dose','growth','bulge'])document.getElementById(key+'-value')!.textContent=number(key).toFixed(key==='dose'?0:2);
 for(const s of stages){
  const fill=Math.max(0,s.response.visual),growth=1+(number('growth')-1)*fill;
  const geometry=s.model.body.geometry,p=geometry.getAttribute('position');
  for(let i=0;i<s.base.count;i++){vec.fromBufferAttribute(s.base,i);inflatePoint(out,vec,'bulge',fill,Math.min(bulge,1/Math.max(1,fill)),3,s.radius);p.setXYZ(i,out.x,out.y,out.z);}
  const rawVolume=volume(geometry),scale=growth*Math.cbrt(s.baseVolume/rawVolume);
  p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const box=geometry.boundingBox!;s.model.root.scale.setScalar(scale);s.model.root.position.y=-box.min.y*scale;
  s.model.face.children.forEach((eye,i)=>{inflatePoint(out,s.faceBase[i],'bulge',fill,Math.min(bulge,1/Math.max(1,fill)),3,s.radius);eye.position.copy(out);});
  s.model.face.visible=input('eyes').checked;s.model.material.wireframe=input('wire').checked;
  s.stats={volume:rawVolume*scale**3/s.baseVolume,height:(box.max.y-box.min.y)*scale,width:(box.max.x-box.min.x)*scale,minY:box.min.y*scale+s.model.root.position.y};
  document.getElementById('metrics-'+s.mode)!.textContent=`注入 ${Math.round(s.response.target*100)} / 100 · 外形 ${(fill*100).toFixed(1)}% · 体积 ${s.stats.volume.toFixed(2)}×`;
  const cursor=document.querySelector('#graph-'+s.mode+' .cursor')!;const age=Number.isFinite(s.response.age)?Math.min(1.1,s.response.age):0;cursor.setAttribute('cx',String(38+age/1.1*345));cursor.setAttribute('cy',String(128-injectionProgress(s.mode,age)*88));
  const next=shots.find(shot=>shot.at-simulationTime<=.22);s.arrow.visible=!!next;
  if(next){s.arrow.position.set(0,s.stats.height*.52,s.stats.width/2+.15+Math.max(0,next.at-simulationTime)/.22*3);}
 }
 document.getElementById('status')!.textContent=`已命中 ${hits} 箭 · 实际注入 ${Math.round(stages[0].response.target*100)} / 100${stages[0].response.target>=1?' · 已满，点击清空可重新测试':''}${paused?' · 已暂停':''}`;
 render();
}
function advance(dt:number){
 const end=simulationTime+dt;
 while(shots.length&&shots[0].at<=end){const shot=shots.shift()!;for(const s of stages)s.response.update(Math.max(0,shot.at-simulationTime));simulationTime=shot.at;for(const s of stages)s.response.hit(shot.dose);hits++;}
 for(const s of stages)s.response.update(Math.max(0,end-simulationTime));simulationTime=end;update();
}
function shoot(count:number){if(stages[0].response.target>=1)return;for(let i=0;i<count;i++)shots.push({at:simulationTime+.22+i*.18,dose:number('dose')/100});shots.sort((a,b)=>a.at-b.at);update();}
function clear(){shots=[];hits=0;simulationTime=0;for(const s of stages)s.response.reset();update();}
document.getElementById('shoot')!.onclick=()=>shoot(1);document.getElementById('burst')!.onclick=()=>shoot(3);document.getElementById('clear')!.onclick=clear;
document.getElementById('pause')!.onclick=()=>{paused=!paused;document.getElementById('pause')!.textContent=paused?'继续':'暂停';update();};
for(const el of document.querySelectorAll<HTMLInputElement>('input'))el.addEventListener('input',update);
for(const el of document.querySelectorAll<HTMLButtonElement>('[data-view]'))el.onclick=()=>setView(el.dataset.view!);
setView('game');update();let last=performance.now();
function tick(now:number){const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&(shots.length||stages.some(s=>s.response.age<1.1)))advance(dt*number('speed'));requestAnimationFrame(tick);}requestAnimationFrame(tick);
Object.assign(window,{__INJECTION_LAB__:{shoot,clear,advance:(dt:number)=>{paused=true;advance(dt);},snapshot:()=>({hits,simulationTime,pending:shots.length,stages:stages.map(s=>({mode:s.mode,target:s.response.target,visual:s.response.visual,age:s.response.age,...s.stats}))})}});
