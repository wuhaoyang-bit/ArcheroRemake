import * as T from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {DEFAULTS,type Settings} from './config.ts';
import {loadSettings} from './settings-store.ts';
import {SettingsHistory} from './settings-history.ts';
import {burstEndTime,burstSample,burstEyePose} from './slime-burst-state.ts';
import {createTrainingCube,monsterInstance} from './training-monster.ts';
import {hitDeformation} from './hit-deformation.ts';
import {type ChunkMode,type ChunkPiece,disposeChunks,fractureByPlanes,fractureByVoronoi} from './slime-burst-chunks.ts';
import {
  DEFAULT_FACE_BULGE,
  cloneFaceBulgeDoc,
  faceIdFromPlane,
  findFacePatch,
  faceLoopFor,
  makeFaceHighlight,
  reapplyChunkFaceBulges,
  type FaceBulgeDocument,
  type FaceBulgeEntry,
  type FaceBulgeParams,
} from './slime-burst-face-bulge.ts';
import {loadFaceBulgeDocument,saveFaceBulgeDocument,upsertFaceEntry} from './slime-burst-face-bulge-store.ts';
import './slime-burst-pose-preview.css';

const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;

document.querySelector('#app')!.innerHTML=`
<header>
  <div>
    <h1>爆开瞬间 · 史莱姆模型定格</h1>
    <p>定格消失瞬间外形，切开碎块。移动模式拖动碎块；凸起模式双击某个面，用项目同一套 <code>inflatePoint('bulge')</code> 调鼓面，并可撤回 / 保存到 JSON。</p>
  </div>
  <div class="links">
    <a href="./slime-burst-lab.html">逐帧调试页 ↗</a>
    <a href="./index.html">返回游戏 ↗</a>
  </div>
</header>
<div class="layout">
  <main>
    <div id="view">
      <div class="overlay">
        <strong>Burst vanish pose</strong>
        <div id="pose-title">计算中…</div>
        <div id="pose-sub"></div>
      </div>
      <div class="view-tools">
        <button type="button" data-view="perspective">透视</button>
        <button type="button" data-view="front">正面</button>
        <button type="button" data-view="side">侧面</button>
        <button type="button" data-view="top">俯视</button>
      </div>
      <div id="loading">正在加载参数与模型…</div>
    </div>
  </main>
  <aside>
    <h2>这一帧在算什么</h2>
    <p class="intro">游戏里 <code>gone</code> 那一帧会先写蓄爆终点姿态再隐藏。本页定格该姿态，并支持切块与按面鼓面调试。</p>
    <div id="stats"></div>

    <h2>切块预览</h2>
    <label class="field">切割方式
      <select id="chunk-mode" aria-label="切割方式">
        <option value="voronoi">Voronoi 碎裂（three-pinata）</option>
        <option value="plane">平面递归切开（ConvexObjectBreaker）</option>
      </select>
    </label>
    <div class="row">
      <button type="button" id="cut">切开并拼接</button>
      <button type="button" id="reset-chunks" disabled>碎块归位</button>
      <button type="button" id="show-whole">显示整模</button>
    </div>
    <p id="chunk-info" class="chunk-info">尚未切开。</p>

    <h2>交互模式</h2>
    <div class="mode-row" role="group" aria-label="交互模式">
      <button type="button" id="mode-move" class="mode active">移动模式</button>
      <button type="button" id="mode-bulge" class="mode">凸起模式</button>
    </div>
    <p id="mode-hint" class="chunk-info">移动：单击选中碎块并拖动。凸起：双击某个面选中，下方调鼓面参数。</p>

    <div id="face-panel" class="face-panel" hidden>
      <h2>选中切面 · 鼓面参数</h2>
      <p id="face-label" class="chunk-info">未选中面</p>
      <label class="check"><input id="face-enabled" type="checkbox">启用凸面（inflatePoint bulge）</label>
      <label class="field">鼓面程度 bulge
        <input id="face-bulge" type="range" min="0" max="1" step=".01" value=".65">
        <output id="face-bulge-value">0.65</output>
      </label>
      <label class="field">填充 fill
        <input id="face-fill" type="range" min="0" max="1" step=".01" value="1">
        <output id="face-fill-value">1.00</output>
      </label>
      <label class="field">密分环数 rings
        <input id="face-rings" type="range" min="2" max="12" step="1" value="6">
        <output id="face-rings-value">6</output>
      </label>
      <div class="row">
        <button type="button" id="face-clear">清除此面鼓面</button>
      </div>
    </div>

    <h2>鼓面参数存档</h2>
    <p id="store-status" class="chunk-info">…</p>
    <div class="row">
      <button type="button" id="save-face-bulge" disabled>保存到 JSON</button>
      <button type="button" id="undo-face-bulge" disabled>撤回</button>
      <button type="button" id="undo-all-face-bulge" disabled>撤回全部</button>
    </div>

    <div class="row">
      <button type="button" id="reload">重新读取游戏参数</button>
    </div>
    <label class="check"><input id="wire" type="checkbox">线框</label>
    <label class="check"><input id="eyes" type="checkbox" checked>显示眼睛（整模）</label>
    <label class="check"><input id="rotate" type="checkbox">自动旋转（整模）</label>
    <div id="message" role="status"></div>
    <p class="note">切开后碎块保持刀切平面。凸起模式里双击选中的面才会套用史莱姆 <code>inflatePoint('bulge')</code>。存档写入 <code>public/slime-burst-face-bulge.json</code>，撤回/保存流程与行走调试页同一套 SettingsHistory。</p>
  </aside>
</div>`;

const views:Record<string,[number,number,number]>={
  perspective:[6.2,4.6,7.4],
  front:[0,2.2,9.2],
  side:[9.2,2.4,0],
  top:[0,11,.02],
};

type PoseSnapshot={
  age:number;
  scale:number;
  bulgeProgress:number;
  phaseDeg:number;
  effectiveBulge:number;
  eye:{weight:number;out:number;angle:number};
  fill:number;
  slimeMaxScale:number;
  slimeBulge:number;
  burstBulge:number;
  burstScale:number;
  monsterScale:number;
};

type InteractMode='move'|'bulge';

function computePose(c:Settings):PoseSnapshot{
  const age=burstEndTime(c);
  const sample=burstSample(age,c);
  const eye=burstEyePose(age,c);
  const slimeBulge=c.slimeBulge;
  const effectiveBulge=slimeBulge+(Math.max(slimeBulge,c.burstBulge)-slimeBulge)*sample.bulgeProgress;
  return {
    age,
    scale:sample.scale,
    bulgeProgress:sample.bulgeProgress,
    phaseDeg:sample.phase*180/Math.PI,
    effectiveBulge,
    eye,
    fill:1,
    slimeMaxScale:c.slimeMaxScale,
    slimeBulge,
    burstBulge:c.burstBulge,
    burstScale:c.burstScale,
    monsterScale:c.monsterScale??1,
  };
}

function renderStats(pose:PoseSnapshot){
  const rows:[string,string][]=[
    ['蓄爆结束时刻',`${pose.age.toFixed(4)} s`],
    ['整体缩放 (burstSample)',`${pose.scale.toFixed(4)} ×`],
    ['monsterScale',`${pose.monsterScale.toFixed(3)} ×`],
    ['合成均匀缩放',`${(pose.monsterScale*pose.scale).toFixed(4)} ×`],
    ['鼓面进度',`${pose.bulgeProgress.toFixed(3)}`],
    ['有效鼓面 slimeBulge',`${pose.effectiveBulge.toFixed(3)}`],
    ['基线 / 目标鼓面',`${pose.slimeBulge.toFixed(2)} → ${pose.burstBulge.toFixed(2)}`],
    ['充盈 fill',`${pose.fill.toFixed(2)}（满）`],
    ['充盈尺寸 slimeMaxScale',`${pose.slimeMaxScale.toFixed(3)}`],
    ['消失相位',`${pose.phaseDeg.toFixed(1)}°`],
    ['眼球 weight / out / angle',`${pose.eye.weight.toFixed(2)} / ${pose.eye.out.toFixed(2)} / ${pose.eye.angle.toFixed(1)}°`],
  ];
  $('stats').innerHTML=rows.map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('pose-title').textContent=`消失瞬间 · t = ${pose.age.toFixed(3)} s`;
  $('pose-sub').textContent=`缩放 ${pose.scale.toFixed(3)}× · 鼓面 ${pose.effectiveBulge.toFixed(3)}\n眼球外推 ${pose.eye.out.toFixed(2)} · ${pose.eye.angle.toFixed(0)}°`;
}

function ensureVisualWrapper(root:T.Object3D){
  let visual=root.getObjectByName('WholeDummyVisual') as T.Object3D|undefined;
  if(visual)return visual;
  visual=new T.Group();
  visual.name='WholeDummyVisual';
  visual.matrixAutoUpdate=false;
  while(root.children.length)visual.add(root.children[0]);
  root.add(visual);
  return visual;
}

function applyBurstVanishPose(root:T.Object3D,c:Settings,pose:PoseSnapshot){
  const monster=monsterInstance(root);
  const inflation=monster?.inflation;
  if(!inflation)throw new Error('预览需要黄色史莱姆 inflation 模型');
  const state=inflation.state;
  state.amount=c.slimeCapacity;
  state.target=state.visual=state.colorFill=1;
  state.age=Infinity;
  const shape={...c,slimeBulge:pose.effectiveBulge};
  inflation.invalidateShape();
  inflation.apply(shape,0);
  inflation.eyeHit.apply(c,inflation.copyColor(new T.Color()),pose.eye);
  const visual=ensureVisualWrapper(root);
  const worldRotation=new T.Quaternion();
  root.getWorldQuaternion(worldRotation);
  hitDeformation(visual.matrix,1,pose.monsterScale*pose.scale,0,0,{x:0,z:-1},worldRotation);
  visual.scale.set(1,1,1);
  visual.matrixWorldNeedsUpdate=true;
  root.visible=true;
  root.updateWorldMatrix(true,true);
}

function setChunkSelected(piece:ChunkPiece|null,pieces:ChunkPiece[]){
  for(const p of pieces){
    const mats=Array.isArray(p.mesh.material)?p.mesh.material:[p.mesh.material];
    for(const m of mats){
      const mat=m as {emissive?:T.Color;emissiveIntensity?:number};
      if(!mat.emissive)continue;
      mat.emissive.setHex(p===piece?0x3355aa:0x000000);
      if(typeof mat.emissiveIntensity==='number')mat.emissiveIntensity=p===piece?0.55:0;
    }
  }
}

async function main(){
  let c:Settings={...DEFAULTS};
  try{c=await loadSettings();}catch{ $('message').textContent='无法读取 params.json，已用 DEFAULTS。';}

  let faceDoc=await loadFaceBulgeDocument();
  // SettingsHistory is the same undo/save bookkeeping as walk/lab pages.
  let history=new SettingsHistory(cloneFaceBulgeDoc(faceDoc) as unknown as Settings);
  let storeStatus='已加载切面鼓面 JSON';
  let saving=false;

  const scene=new T.Scene();
  scene.background=new T.Color('#29392e');
  const camera=new T.PerspectiveCamera(38,1,.05,200);
  const renderer=new T.WebGPURenderer({antialias:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  await renderer.init();
  renderer.shadowMap.enabled=true;
  renderer.toneMapping=T.LinearToneMapping;
  renderer.toneMappingExposure=1.15;
  $('view').prepend(renderer.domElement);

  scene.add(new T.HemisphereLight(0xf5ffe5,0xb6ca6c,2.1));
  const sun=new T.DirectionalLight(0xfff4ce,2.4);
  sun.position.set(-8,18,-6);
  sun.castShadow=true;
  scene.add(sun);

  const env=new RoomEnvironment();
  const pmrem=new T.PMREMGenerator(renderer);
  const environment=pmrem.fromScene(env).texture;
  env.dispose();
  pmrem.dispose();
  scene.environment=environment;

  const ground=new T.Mesh(new T.PlaneGeometry(20,20),new T.MeshStandardMaterial({color:0x3f5a48,roughness:.88}));
  ground.rotation.x=-Math.PI/2;
  ground.receiveShadow=true;
  scene.add(ground);
  const grid=new T.GridHelper(20,20,0x70816a,0x485e4c);
  grid.position.y=.004;
  scene.add(grid);

  const root=createTrainingCube(environment);
  root.userData.practiceTarget='burst-pose';
  scene.add(root);

  const chunkRoot=new T.Group();
  chunkRoot.name='SlimeChunks';
  scene.add(chunkRoot);
  const highlightRoot=new T.Group();
  highlightRoot.name='FaceHighlight';
  scene.add(highlightRoot);

  const orbit=new OrbitControls(camera,renderer.domElement);
  orbit.target.set(0,1.2,0);
  orbit.enableDamping=true;
  orbit.minDistance=2;
  orbit.maxDistance=40;
  camera.position.fromArray(views.perspective);
  orbit.update();

  let autoRotate=false;
  let chunkMode:ChunkMode=faceDoc.cutMode;
  let pieces:ChunkPiece[]=[];
  let selected:ChunkPiece|null=null;
  /** Seed actually used for the current pieces (before post-cut increment). */
  let activeCutSeed=faceDoc.cutSeed;
  let nextCutSeed=faceDoc.cutSeed;
  $<HTMLSelectElement>('chunk-mode').value=chunkMode;
  let interactMode:InteractMode='move';
  let dragging=false;
  let selectedFace:FaceBulgeEntry|null=null;
  let selectedPatchLoop:number[]|null=null;
  let selectedChunkIndex=-1;
  let panelSyncing=false;

  const dragPlane=new T.Plane();
  const dragOffset=new T.Vector3();
  const pointer=new T.Vector2();
  const raycaster=new T.Raycaster();
  const hitPoint=new T.Vector3();

  const pose=computePose(c);
  applyBurstVanishPose(root,c,pose);
  renderStats(pose);

  const inflation=monsterInstance(root)!.inflation!;
  const bodyMat=inflation.body.material as T.MeshPhysicalMaterial;

  function refreshStoreUi(){
    $('store-status').textContent=storeStatus;
    $('save-face-bulge').toggleAttribute('disabled',saving||!history.dirty);
    $('undo-face-bulge').toggleAttribute('disabled',!history.canUndo);
    $('undo-all-face-bulge').toggleAttribute('disabled',!history.dirty);
  }

  function applyFaceDoc(next:FaceBulgeDocument,record:boolean){
    faceDoc=cloneFaceBulgeDoc(next);
    if(record){
      history.record(cloneFaceBulgeDoc(faceDoc) as unknown as Settings);
      storeStatus='有未保存的修改';
      refreshStoreUi();
    }
  }

  function setWire(on:boolean){
    bodyMat.wireframe=on;
    for(const p of pieces){
      const mats=Array.isArray(p.mesh.material)?p.mesh.material:[p.mesh.material];
      for(const m of mats)if('wireframe' in m)(m as T.MeshStandardMaterial).wireframe=on;
    }
  }
  function setEyes(on:boolean){inflation.bendFace.visible=on;}

  function clearFaceHighlight(){
    const attached=highlightRoot.userData.attached as T.Line|undefined;
    if(attached?.parent)attached.parent.remove(attached);
    if(attached){
      attached.geometry.dispose();
      (attached.material as T.Material).dispose();
    }
    highlightRoot.userData.attached=null;
  }

  function clearFaceSelection(){
    clearFaceHighlight();
    selectedFace=null;
    selectedPatchLoop=null;
    selectedChunkIndex=-1;
    $('face-panel').hidden=true;
  }

  function showFaceHighlight(mesh:T.Mesh,loop:number[]){
    clearFaceHighlight();
    if(!loop.length)return;
    const line=makeFaceHighlight(mesh,loop);
    mesh.add(line);
    highlightRoot.userData.attached=line;
  }

  function clearChunks(){
    disposeChunks(pieces);
    pieces=[];
    selected=null;
    clearFaceSelection();
    chunkRoot.clear();
    $('reset-chunks').toggleAttribute('disabled',true);
    $('chunk-info').textContent='尚未切开。';
  }

  function showWhole(){
    clearChunks();
    root.visible=true;
    $('message').textContent='已显示整模。';
  }

  function applyDocToPieces(){
    if(!pieces.length)return;
    if(faceDoc.cutMode!==chunkMode||faceDoc.cutSeed!==activeCutSeed)return;
    for(const p of pieces){
      const idx=p.mesh.userData.chunkIndex as number;
      reapplyChunkFaceBulges(p.mesh,idx,faceDoc);
    }
  }

  function cutChunks(){
    $('message').textContent='正在切开…';
    clearChunks();
    applyBurstVanishPose(root,c,computePose(c));
    root.updateWorldMatrix(true,true);
    const body=inflation.body as unknown as import('three').Mesh;
    const seed=nextCutSeed;
    try{
      const made=chunkMode==='voronoi'?fractureByVoronoi(body,6,seed):fractureByPlanes(body,6,seed);
      pieces=made;
      activeCutSeed=seed;
      nextCutSeed=seed+1;
      for(const p of pieces)chunkRoot.add(p.mesh);
      root.visible=false;
      $('reset-chunks').toggleAttribute('disabled',false);
      const vols=pieces.map(p=>{
        const b=new T.Box3().setFromObject(p.mesh);
        const s=b.getSize(new T.Vector3());
        return s.x*s.y*s.z;
      });
      const min=Math.min(...vols),max=Math.max(...vols);
      $('chunk-info').textContent=`已切 ${pieces.length} 块 · ${chunkMode} · 种子 ${activeCutSeed} · 体积比约 ${(max/min).toFixed(2)}:1。`;
      $('message').textContent=`切开完成（${chunkMode}）。`;
      // Rebind saved faces when mode+seed match.
      if(faceDoc.cutMode===chunkMode&&faceDoc.cutSeed===activeCutSeed)applyDocToPieces();
      else $('message').textContent+=` 当前 JSON 绑定 ${faceDoc.cutMode}/种子${faceDoc.cutSeed}，与本次切开不同，未自动套用。`;
    }catch(e){
      console.error(e);
      root.visible=true;
      $('message').textContent=`切开失败：${e}`;
      $('chunk-info').textContent='切开失败，请换一种方式或刷新后重试。';
    }
  }

  function resetChunkHomes(){
    for(const p of pieces){
      p.mesh.position.copy(p.homePosition);
      p.mesh.quaternion.copy(p.homeQuaternion);
    }
    setChunkSelected(null,pieces);
    selected=null;
    $('message').textContent='碎块已归位拼接。';
  }

  function setInteractMode(mode:InteractMode){
    interactMode=mode;
    $('mode-move').classList.toggle('active',mode==='move');
    $('mode-bulge').classList.toggle('active',mode==='bulge');
    $('mode-hint').textContent=mode==='move'
      ?'移动：单击选中碎块并拖动；空白处拖动画布。'
      :'凸起：双击某个碎块的某个面选中；下方调 bulge/fill；可撤回/保存。';
    if(mode==='move'){
      // keep face panel if a face is selected, but dragging takes over
    }else{
      setChunkSelected(null,pieces);
      selected=null;
      dragging=false;
      orbit.enabled=true;
    }
  }

  function syncFacePanelFromSelection(){
    panelSyncing=true;
    const panel=$('face-panel');
    if(!selectedFace){
      panel.hidden=true;
      panelSyncing=false;
      return;
    }
    panel.hidden=false;
    $('face-label').textContent=`${selectedFace.id} · chunk ${selectedFace.chunkIndex}`;
    $<HTMLInputElement>('face-enabled').checked=selectedFace.params.enabled;
    $<HTMLInputElement>('face-bulge').value=String(selectedFace.params.bulge);
    $('face-bulge-value').textContent=selectedFace.params.bulge.toFixed(2);
    $<HTMLInputElement>('face-fill').value=String(selectedFace.params.fill);
    $('face-fill-value').textContent=selectedFace.params.fill.toFixed(2);
    $<HTMLInputElement>('face-rings').value=String(selectedFace.params.rings);
    $('face-rings-value').textContent=String(selectedFace.params.rings);
    panelSyncing=false;
  }

  function readPanelParams():FaceBulgeParams{
    return {
      enabled:$<HTMLInputElement>('face-enabled').checked,
      bulge:Number($<HTMLInputElement>('face-bulge').value),
      fill:Number($<HTMLInputElement>('face-fill').value),
      rings:Number($<HTMLInputElement>('face-rings').value),
    };
  }

  function commitSelectedFaceParams(record:boolean){
    if(!selectedFace||selectedChunkIndex<0||panelSyncing)return;
    const params=readPanelParams();
    selectedFace={...selectedFace,params};
    $('face-bulge-value').textContent=params.bulge.toFixed(2);
    $('face-fill-value').textContent=params.fill.toFixed(2);
    $('face-rings-value').textContent=String(params.rings);

    let next=cloneFaceBulgeDoc(faceDoc);
    next.cutMode=chunkMode;
    next.cutSeed=activeCutSeed;
    next=upsertFaceEntry(next,selectedFace);
    applyFaceDoc(next,record);

    const piece=pieces.find(p=>(p.mesh.userData.chunkIndex as number)===selectedChunkIndex);
    if(piece){
      reapplyChunkFaceBulges(piece.mesh,selectedChunkIndex,faceDoc);
      const loop=faceLoopFor(piece.mesh,selectedFace.id,selectedPatchLoop??undefined);
      selectedPatchLoop=loop.slice();
      showFaceHighlight(piece.mesh,loop);
    }
  }

  function refresh(next:Settings){
    c=next;
    const p=computePose(c);
    applyBurstVanishPose(root,c,p);
    renderStats(p);
    setWire($<HTMLInputElement>('wire').checked);
    setEyes($<HTMLInputElement>('eyes').checked);
    if(pieces.length)cutChunks();
  }

  // —— wire UI ——
  $('reload').onclick=async()=>{
    try{
      refresh(await loadSettings());
      $('message').textContent=`已重新读取游戏参数 · ${new Date().toLocaleTimeString()}`;
    }catch(e){
      $('message').textContent=`读取失败：${e}`;
    }
  };
  $('wire').onchange=()=>setWire($<HTMLInputElement>('wire').checked);
  $('eyes').onchange=()=>setEyes($<HTMLInputElement>('eyes').checked);
  $('rotate').onchange=()=>{autoRotate=$<HTMLInputElement>('rotate').checked;};
  $('chunk-mode').onchange=()=>{chunkMode=$<HTMLSelectElement>('chunk-mode').value as ChunkMode;};
  $('cut').onclick=()=>cutChunks();
  $('reset-chunks').onclick=()=>resetChunkHomes();
  $('show-whole').onclick=()=>showWhole();
  $('mode-move').onclick=()=>setInteractMode('move');
  $('mode-bulge').onclick=()=>setInteractMode('bulge');

  for(const id of ['face-bulge','face-fill','face-rings']){
    $(id).addEventListener('pointerdown',()=>history.begin());
    $(id).addEventListener('input',()=>commitSelectedFaceParams(true));
    $(id).addEventListener('pointerup',()=>history.end());
    $(id).addEventListener('change',()=>{commitSelectedFaceParams(true);history.end();});
  }
  $('face-enabled').onchange=()=>{
    history.begin();
    commitSelectedFaceParams(true);
    history.end();
  };
  $('face-clear').onclick=()=>{
    if(!selectedFace)return;
    $<HTMLInputElement>('face-enabled').checked=false;
    history.begin();
    commitSelectedFaceParams(true);
    history.end();
  };

  $('undo-face-bulge').onclick=()=>{
    faceDoc=cloneFaceBulgeDoc(history.undo() as unknown as FaceBulgeDocument);
    storeStatus=history.dirty?'已撤回一步；仍有未保存修改':'已撤回；与基准一致';
    refreshStoreUi();
    applyDocToPieces();
    if(selectedFace){
      selectedFace=faceDoc.faces.find(f=>f.id===selectedFace!.id)??null;
      syncFacePanelFromSelection();
    }
  };
  $('undo-all-face-bulge').onclick=()=>{
    faceDoc=cloneFaceBulgeDoc(history.undoAll() as unknown as FaceBulgeDocument);
    storeStatus='已撤回全部未保存修改';
    refreshStoreUi();
    applyDocToPieces();
    clearFaceSelection();
  };
  $('save-face-bulge').onclick=async()=>{
    saving=true;refreshStoreUi();storeStatus='保存中…';
    try{
      const toSave=cloneFaceBulgeDoc(faceDoc);
      toSave.cutMode=chunkMode;
      toSave.cutSeed=activeCutSeed;
      await saveFaceBulgeDocument(toSave);
      faceDoc=toSave;
      history.saved(cloneFaceBulgeDoc(faceDoc) as unknown as Settings);
      storeStatus=`已保存 · ${new Date().toLocaleTimeString()}`;
    }catch(e){
      storeStatus=`保存失败：${e instanceof Error?e.message:String(e)}`;
    }finally{
      saving=false;refreshStoreUi();
    }
  };

  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>{
    b.onclick=()=>{
      camera.position.fromArray(views[b.dataset.view!]);
      orbit.target.set(0,1.2,0);
      orbit.update();
    };
  });

  const canvas=renderer.domElement;
  function ndc(ev:PointerEvent|MouseEvent){
    const r=canvas.getBoundingClientRect();
    pointer.x=((ev.clientX-r.left)/r.width)*2-1;
    pointer.y=-((ev.clientY-r.top)/r.height)*2+1;
  }

  canvas.addEventListener('pointerdown',ev=>{
    if(!pieces.length||ev.button!==0)return;
    if(interactMode!=='move')return;
    ndc(ev);
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(pieces.map(p=>p.mesh),false);
    if(!hits.length){
      setChunkSelected(null,pieces);
      selected=null;
      return;
    }
    const mesh=hits[0].object as T.Mesh;
    selected=pieces.find(p=>p.mesh===mesh)??null;
    setChunkSelected(selected,pieces);
    if(!selected)return;
    dragging=true;
    orbit.enabled=false;
    canvas.setPointerCapture(ev.pointerId);
    dragPlane.setFromNormalAndCoplanarPoint(new T.Vector3(0,1,0),selected.mesh.position);
    if(raycaster.ray.intersectPlane(dragPlane,hitPoint))dragOffset.copy(hitPoint).sub(selected.mesh.position);
    $('chunk-info').textContent=`已选中 ${selected.mesh.name}。拖动移动。`;
  });

  canvas.addEventListener('pointermove',ev=>{
    if(!dragging||!selected||interactMode!=='move')return;
    ndc(ev);
    raycaster.setFromCamera(pointer,camera);
    if(!raycaster.ray.intersectPlane(dragPlane,hitPoint))return;
    selected.mesh.position.copy(hitPoint).sub(dragOffset);
  });

  const endDrag=(ev:PointerEvent)=>{
    if(!dragging)return;
    dragging=false;
    orbit.enabled=true;
    try{canvas.releasePointerCapture(ev.pointerId);}catch{/* */}
  };
  canvas.addEventListener('pointerup',endDrag);
  canvas.addEventListener('pointercancel',endDrag);

  canvas.addEventListener('dblclick',ev=>{
    if(!pieces.length||interactMode!=='bulge')return;
    ndc(ev);
    raycaster.setFromCamera(pointer,camera);
    const hits=raycaster.intersectObjects(pieces.map(p=>p.mesh),false);
    if(!hits.length||hits[0].faceIndex==null){
      clearFaceSelection();
      $('message').textContent='未点到面。';
      return;
    }
    const hit=hits[0];
    const mesh=hit.object as T.Mesh;
    const piece=pieces.find(p=>p.mesh===mesh);
    if(!piece)return;
    const chunkIndex=mesh.userData.chunkIndex as number;
    const patch=findFacePatch(mesh,hit.faceIndex!);
    if(!patch){
      $('message').textContent='无法识别该面。';
      return;
    }
    const id=faceIdFromPlane(chunkIndex,patch.normal,patch.point);
    const existing=faceDoc.faces.find(f=>f.id===id);
    selectedFace=existing??{
      id,
      chunkIndex,
      normal:[patch.normal.x,patch.normal.y,patch.normal.z],
      point:[patch.point.x,patch.point.y,patch.point.z],
      params:{...DEFAULT_FACE_BULGE},
    };
    selectedChunkIndex=chunkIndex;
    selectedPatchLoop=patch.loop.slice();
    showFaceHighlight(mesh,patch.loop);
    syncFacePanelFromSelection();
    $('message').textContent=`已选中面 ${id}。调整下方参数。`;
    $('face-panel').hidden=false;
  });

  let lastW=0,lastH=0;
  const resize=()=>{
    const r=$('view').getBoundingClientRect();
    const w=Math.max(1,Math.floor(r.width));
    const h=Math.max(1,Math.floor(r.height));
    if(w===lastW&&h===lastH)return;
    lastW=w;lastH=h;
    renderer.setSize(w,h,false);
    camera.aspect=w/h;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe($('view'));
  resize();

  setInteractMode('move');
  refreshStoreUi();
  $('loading').remove();
  $('message').textContent=`已按当前参数定格 · t=${pose.age.toFixed(4)}s · 可点「切开并拼接」`;

  if(import.meta.env.DEV){
    Object.assign(window,{
      __BURST_POSE__:{
        snapshot:()=>({
          settings:{...c},
          pose:computePose(c),
          chunks:pieces.length,
          mode:chunkMode,
          interactMode,
          faceDoc:cloneFaceBulgeDoc(faceDoc),
          selectedFace,
        }),
        cut:()=>cutChunks(),
        reload:()=>$('reload').click(),
      },
    });
  }

  renderer.setAnimationLoop(()=>{
    if(autoRotate&&root.visible)root.rotation.y+=0.006;
    orbit.update();
    renderer.render(scene,camera);
  });
}

void main().catch(e=>{
  console.error(e);
  $('loading').textContent=`加载失败：${e}`;
});
