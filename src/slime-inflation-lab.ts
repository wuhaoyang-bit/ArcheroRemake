import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {createYellowSlimeModel} from './yellow-slime-model.ts';
import {inflatePoint,type InflationMode} from './slime-inflation-shape.ts';
import './slime-inflation-lab.css';
const modes:InflationMode[]=['scale','bulge','super'];
const titles=['整体放大','外鼓形态插值','超椭球膨胀'];
const descriptions=['对照基准：体型变大，平面仍是平面。','朝外侧球面过渡：面中央移动更多，棱角移动较少。','改变曲面指数：方形逐渐圆润，体积可单独校正。'];
document.querySelector('#app')!.innerHTML=`<header><small>ARCHERO REMAKE / SHAPE STUDY 02</small><h1>让方块，慢慢鼓起来。</h1><p>三种方式 · 同一填充率 · 同步观察角度</p></header><section class="controls"><div class="fill-control"><label for="fill">颜料填充率 <output id="fill-value">0%</output></label><input id="fill" type="range" min="0" max="1" step=".001" value="0"></div><button id="play">播放膨胀</button><button id="reset">恢复默认</button><div class="views"><button data-view="game">游戏视角</button><button data-view="front">正面</button><button data-view="side">侧面</button></div><label><input id="wire" type="checkbox">线框</label><label><input id="volume" type="checkbox" checked>统一体积比较</label><label><input id="eyes" type="checkbox" checked>眼睛</label></section><section class="tuning"><label>满容量尺寸倍率 <output id="growth-value"></output><input id="growth" type="range" min="1" max="1.6" step=".01" value="1.35"></label><label>② 最大鼓面程度 <output id="bulge-value"></output><input id="bulge" type="range" min="0" max="1" step=".01" value=".65"></label><label>③ 满容量曲面指数 <output id="exponent-value"></output><input id="exponent" type="range" min="2" max="8" step=".1" value="3"></label></section><p class="help">拖动任一模型可同步旋转，滚轮缩放。开启统一体积时，三者体积增长相同，便于比较轮廓；关闭后，②鼓面本身也会增加体积，③圆润化可能减少体积。虚线是初始占地范围。</p><main>${modes.map((mode,i)=>`<article><div class="card-head"><span>0${i+1}</span><h2>${titles[i]}</h2></div><p>${descriptions[i]}</p><div class="stage" id="stage-${mode}"></div><output class="metrics" id="metrics-${mode}"></output></article>`).join('')}</main><footer><p>仅为形状对照，不包含内部紫色颜料、受击或爆开；不会改动游戏参数。眼睛跟随表面移动，模型脚底保持接地。</p><details><summary>公式与参考依据</summary><p>② p′ = (1−b)p + bR·p/|p|，R 取原模型最大顶点半径。③ 沿径向映射至 |x|ⁿ+|y|ⁿ+|z|ⁿ=1，再从原方块连续过渡；n 越接近 2 越圆。统一体积校正倍率为 ∛(目标体积 / 当前形状体积)。以上是研究后的对照实现，不是液体压力模拟。</p><a href="https://github.com/mrdoob/three.js/blob/dev/examples/webgpu_morphtargets.html" target="_blank" rel="noreferrer">Three.js 形态目标</a> · <a href="https://catlikecoding.com/unity/tutorials/cube-sphere/" target="_blank" rel="noreferrer">Cube Sphere</a> · <a href="https://www.povray.org/documentation/view/3.7.2/285/" target="_blank" rel="noreferrer">超椭球</a></details></footer>`;
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
 const faceBase=model.face.children.map(o=>o.position.clone().add(new T.Vector3(0,-1,0)));
 new ResizeObserver(()=>{const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();render();}).observe(host);
 return {mode,host,renderer,scene,camera,orbit,model,base,baseVolume,radius,faceBase,stats:{volume:1,height:2,width:2,minY:0}};
});
function render(){for(const s of stages)s.renderer.render(s.scene,s.camera);}
let syncing=false;
for(const stage of stages)stage.orbit.addEventListener('change',()=>{if(syncing)return;syncing=true;for(const s of stages)if(s!==stage){s.camera.position.copy(stage.camera.position);s.orbit.target.copy(stage.orbit.target);s.orbit.update();}syncing=false;render();});
function setView(name:string){syncing=true;for(const s of stages){s.camera.position.fromArray(({game:[5.4,5.4,8],front:[0,1.4,10],side:[10,1.4,0]} as Record<string,number[]>)[name]);s.orbit.target.set(0,1.4,0);s.orbit.update();}syncing=false;render();}
function update(){
 const fill=number('fill'),growth=1+(number('growth')-1)*fill,bulge=number('bulge'),exponent=number('exponent');
 document.getElementById('fill-value')!.textContent=`${Math.round(fill*100)}%`;
 for(const key of ['growth','bulge','exponent'])document.getElementById(key+'-value')!.textContent=number(key).toFixed(2);
 for(const s of stages){
  const geometry=s.model.body.geometry,p=geometry.getAttribute('position');
  for(let i=0;i<s.base.count;i++){vec.fromBufferAttribute(s.base,i);inflatePoint(out,vec,s.mode,fill,bulge,exponent,s.radius);p.setXYZ(i,out.x,out.y,out.z);}
  const rawVolume=volume(geometry),scale=growth*(input('volume').checked?Math.cbrt(s.baseVolume/rawVolume):1);
  p.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  const box=geometry.boundingBox!;s.model.root.scale.setScalar(scale);s.model.root.position.y=-box.min.y*scale;
  s.model.face.children.forEach((eye,i)=>{inflatePoint(out,s.faceBase[i],s.mode,fill,bulge,exponent,s.radius);eye.position.copy(out);});
  s.model.face.visible=input('eyes').checked;s.model.material.wireframe=input('wire').checked;
  s.stats={volume:rawVolume*scale**3/s.baseVolume,height:(box.max.y-box.min.y)*scale,width:(box.max.x-box.min.x)*scale,minY:box.min.y*scale+s.model.root.position.y};
  document.getElementById('metrics-'+s.mode)!.textContent=`体积 ${s.stats.volume.toFixed(2)}× · 宽 ${s.stats.width.toFixed(2)} · 高 ${s.stats.height.toFixed(2)}`;
 }
 render();
}
let playing=false,raf=0,start=0;
function stop(){playing=false;cancelAnimationFrame(raf);document.getElementById('play')!.textContent='播放膨胀';}
function tick(now:number){const phase=((now-start)/4000)%2;input('fill').value=String(phase<=1?phase:2-phase);update();if(playing)raf=requestAnimationFrame(tick);}
document.getElementById('play')!.onclick=()=>{if(playing){stop();return;}playing=true;start=performance.now()-number('fill')*4000;document.getElementById('play')!.textContent='暂停';raf=requestAnimationFrame(tick);};
for(const el of document.querySelectorAll<HTMLInputElement>('input'))el.addEventListener('input',()=>{if(el.id==='fill')stop();update();});
for(const el of document.querySelectorAll<HTMLButtonElement>('[data-view]'))el.onclick=()=>setView(el.dataset.view!);
document.getElementById('reset')!.onclick=()=>{stop();for(const [id,value] of Object.entries({fill:0,growth:1.35,bulge:.65,exponent:3}))input(id).value=String(value);input('volume').checked=true;input('eyes').checked=true;input('wire').checked=false;setView('game');update();};
setView('game');update();
Object.assign(window,{__INFLATION_LAB__:{setFill:(f:number)=>{stop();input('fill').value=String(f);update();},snapshot:()=>({fill:number('fill'),stages:stages.map(s=>({mode:s.mode,...s.stats,camera:s.camera.position.toArray()}))})}});
