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
import {TrainingFeedback} from './training-feedback.ts';
import {BurstShockwaveEffects} from './burst-shockwave.ts';
import {LushBurstEffects} from './lush-burst-effects.ts';
import {SlimeBurstPosePlayback} from './slime-burst-pose-playback.ts';
import {buildChunkSoftbodyModelLite} from './slime-burst-centroid-fan.ts';
import {SlimeBurstFem} from './slime-burst-fem.ts';
import {slimeFlight} from './slime-flight-motion.ts';
import './slime-burst-pose-preview.css';

/** Softbody budget: convex-cage FEM on a few shards; rest stay hard shells. */
const SOFT_CHUNK_LIMIT=2;

const $=<E extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as E;

document.querySelector('#app')!.innerHTML=`
<header>
  <div>
    <h1>蓄爆 → 全特效 → 软碎块</h1>
    <p>预览页专用：从蓄力播到爆开（颜色/凸面/大小跟游戏一致），播放完整爆炸特效，碎块按眼球同曲线外飞并可叠软体。编辑模式仍可切块与鼓面。</p>
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
        <strong id="overlay-label">Burst vanish pose</strong>
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
    <div id="transport" class="transport" hidden>
      <div class="row">
        <button type="button" id="play-burst">从蓄力播放</button>
        <button type="button" id="pause-burst">暂停</button>
        <button type="button" id="restart-burst">重播</button>
        <label>速度
          <select id="play-speed" aria-label="播放速度">
            <option value=".25">0.25×</option>
            <option value=".5">0.5×</option>
            <option value="1" selected>1×</option>
            <option value="2">2×</option>
          </select>
        </label>
        <label class="check"><input id="play-loop" type="checkbox">循环</label>
      </div>
      <input id="play-seek" type="range" min="0" max="720" value="0" step="1" aria-label="蓄爆时间轴">
      <p id="play-time" class="chunk-info">—</p>
    </div>
  </main>
  <aside>
    <h2>页面模式</h2>
    <div class="mode-row" role="group" aria-label="页面模式">
      <button type="button" id="ui-edit" class="mode active">编辑</button>
      <button type="button" id="ui-play" class="mode">播放</button>
    </div>
    <p class="intro" id="mode-intro">编辑：定格蓄满姿态，切块与鼓面调试。播放：从蓄力到爆开完整电影。</p>
    <div id="stats"></div>

    <div id="play-panel" hidden>
      <h2>播放 · 飞溅与软体</h2>
      <label class="check"><input id="softbody-enabled" type="checkbox">软体效果（凸包粗笼 FEM，最多 ${SOFT_CHUNK_LIMIT} 块）</label>
      <p class="chunk-info">默认关：爆点 FEM bake 会卡死主线程。需要时再勾选；进入播放会预热着色器。硬壳飞溅更流畅。</p>
      <label class="check"><input id="show-tet-wire" type="checkbox">显示 tet 线框</label>
      <label class="field">FEM stepsPerSecond
        <input id="fem-steps" type="range" min="15" max="60" step="15" value="30">
        <output id="fem-steps-value">30</output>
      </label>
      <p id="play-hint" class="chunk-info">碎块速度曲线与眼球共用 slimeEyeEject* 参数（默认 Speed=14）。</p>
    </div>

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
type UiMode='edit'|'play';

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
  root.userData.practiceTarget='preview';
  const feedbackGroup=new T.Group();
  feedbackGroup.name='PosePreviewFeedback';
  feedbackGroup.add(root);
  scene.add(feedbackGroup);

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

  $('loading').textContent='正在加载爆炸与液体资源…';
  const shockwave=new BurstShockwaveEffects(renderer,scene,camera);
  const effects=await LushBurstEffects.load(scene,()=>{},environment);
  const feedback=new TrainingFeedback(feedbackGroup,[{id:'preview',x:0,z:0}],24,24);
  // Warm GPU pipelines once at load: first burst otherwise freezes ~1s on shader compile
  // (shockwave RenderPipeline + Lush node materials + eye debris).
  try{
    $('loading').textContent='正在预热爆炸着色器…';
    const tWarm=performance.now();
    // Emit a real wave so the refraction pass compiles with non-zero strength uniforms.
    shockwave.emit(new T.Vector3(0,1,0),c);
    shockwave.warmup(c);
    effects.prepareWarmup(1,c,camera,24,24);
    feedback.prepareEyeDebris(c);
    renderer.render(scene,camera);
    effects.clear();
    feedback.eyeDebris.clear();
    feedback.reset();
    shockwave.clear();
    console.info(`[perf] burst fx warmup ${Math.round(performance.now()-tWarm)}ms`);
  }catch(e){console.warn('burst fx warmup skipped',e);}

  let autoRotate=false;
  let chunkMode:ChunkMode=faceDoc.cutMode;
  let pieces:ChunkPiece[]=[];
  let selected:ChunkPiece|null=null;
  /** Seed actually used for the current pieces (before post-cut increment). */
  let activeCutSeed=faceDoc.cutSeed;
  let nextCutSeed=faceDoc.cutSeed;
  $<HTMLSelectElement>('chunk-mode').value=chunkMode;
  let interactMode:InteractMode='move';
  let uiMode:UiMode='edit';
  let dragging=false;
  let selectedFace:FaceBulgeEntry|null=null;
  let selectedPatchLoop:number[]|null=null;
  let selectedChunkIndex=-1;
  let panelSyncing=false;
  let fem:SlimeBurstFem|null=null;
  let femReady=false;
  let baseCamPos=camera.position.clone();
  let softElapsed=0;

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

  async function disposeFem(){
    fem?.dispose();
    fem=null;
    femReady=false;
    softElapsed=0;
  }

  const yieldFrame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));

  /** Compile FEM compute pipelines once before burst so first soft attach is cheaper. */
  async function prewarmFem(){
    if(!$<HTMLInputElement>('softbody-enabled').checked)return;
    $('message').textContent='软体着色器预热中…';
    const t0=performance.now();
    try{
      const warm=new SlimeBurstFem(renderer,{groundY:0});
      const box=new T.BoxGeometry(0.4,0.4,0.4);
      const model=buildChunkSoftbodyModelLite(box);
      box.dispose();
      await warm.addChunk(model);
      await warm.bake();
      warm.dispose();
      console.info(`[perf] fem prewarm ${Math.round(performance.now()-t0)}ms`);
      $('message').textContent=`软体预热完成（${Math.round(performance.now()-t0)}ms），可播放。`;
    }catch(e){
      console.warn('fem prewarm failed',e);
      $('message').textContent=`软体预热失败：${e instanceof Error?e.message:String(e)}`;
    }
  }

  async function attachSoftChunks(chunkPieces:ChunkPiece[]){
    await disposeFem();
    if(!$<HTMLInputElement>('softbody-enabled').checked||!chunkPieces.length)return;
    for(const p of chunkPieces)p.mesh.visible=true;
    const softPieces=chunkPieces.slice(0,SOFT_CHUNK_LIMIT);
    // Let hard shells + Lush paint for a couple frames before FEM bake monopolizes the GPU.
    $('message').textContent='硬壳已飞出 · 软体编译中…';
    await yieldFrame();
    await yieldFrame();
    const t0=performance.now();
    try{
      fem=new SlimeBurstFem(renderer,{groundY:0});
      scene.add(fem.object);
      let tetTotal=0;
      for(const p of softPieces){
        const model=buildChunkSoftbodyModelLite(p.mesh.geometry);
        tetTotal+=(model.tetIds.length/4)|0;
        await fem.addChunk(model);
      }
      const tBake=performance.now();
      await fem.bake();
      console.info(`[perf] fem bake ${Math.round(performance.now()-tBake)}ms · total attach ${Math.round(performance.now()-t0)}ms · ~${tetTotal} tet`);
      fem.setStepsPerSecond(Number($<HTMLInputElement>('fem-steps').value)||30);
      // Match hard-shell eye gravity (do not ×2 — that pulls soft chunks away from the eye curve).
      const g=c.slimeEyeEjectGravity??9.8;
      fem.setGravity(0,-Math.abs(g),0);
      const wire=fem.getTetVisualizer();
      if(wire)wire.visible=$<HTMLInputElement>('show-tet-wire').checked;

      const flightPieces=playback.chunkFlight.getPieces();
      let spawned=0;
      for(let i=0;i<softPieces.length;i++){
        const fp=flightPieces[i];
        if(!fp)break;
        // Deferred attach: use current flight age so speed matches the hard shell already in air.
        const motion=slimeFlight(fp.age,c);
        const velocity=fp.direction.clone().multiplyScalar(motion.speed);
        velocity.y-=motion.fallSpeed;
        await fem.spawnChunk(i,fp.object.position.clone(),velocity);
        spawned++;
      }
      // Only hide hard shells that have a live soft twin — never leave the burst empty.
      const softOk=spawned>0;
      if(softOk){
        for(let i=0;i<spawned;i++)softPieces[i].mesh.visible=false;
      }
      femReady=softOk;
      const softMeshes=fem.object.children.filter((o):o is T.Mesh=> (o as T.Mesh).isMesh);
      const instanceCounts=softMeshes.map(m=>(m.geometry as T.InstancedBufferGeometry)?.instanceCount??-1);
      console.info(`[perf] soft spawn ${spawned} · instanceCounts=${instanceCounts.join(',')}`);
      if(!softOk||instanceCounts.every(n=>n<=0)){
        for(const p of chunkPieces)p.mesh.visible=true;
        $('message').textContent=`软体已 bake 但未显示，保留硬壳 · ~${tetTotal} tet`;
      }else{
        $('message').textContent=`软体 ${spawned}/${chunkPieces.length} 块 · ~${tetTotal} tet · bake ${Math.round(performance.now()-tBake)}ms`;
      }
    }catch(e){
      console.warn('softbody attach failed; keeping hard shells',e);
      await disposeFem();
      for(const p of chunkPieces)p.mesh.visible=true;
      $('message').textContent=`软体失败（硬壳仍飞）：${e instanceof Error?e.message:String(e)}`;
    }
  }

  const playback=new SlimeBurstPosePlayback(
    feedback,
    effects,
    shockwave,
    root,
    chunkRoot,
    ()=>c,
    ()=>chunkMode,
    ()=>faceDoc,
    ()=>activeCutSeed,
    {
      onChunkInfo:text=>{
        pieces=playback.pieces;
        $('chunk-info').textContent=text;
        $('message').textContent=text;
        $('overlay-label').textContent='Chunks flying';
      },
      onMessage:text=>{$('message').textContent=text;},
      onPhase:(phase,detail)=>{
        $('overlay-label').textContent='Playback';
        $('pose-title').textContent=phase;
        $('pose-sub').textContent=detail;
        $('play-time').textContent=`${phase} · ${detail}`;
        $<HTMLInputElement>('play-seek').value=String(playback.frame);
        $<HTMLInputElement>('play-seek').max=String(playback.total);
      },
      onSoftChunks:async(chunkPieces)=>{
        pieces=chunkPieces;
        await attachSoftChunks(chunkPieces);
      },
      // Softbody flies on its own after spawnChunk impulse — no per-frame kinematic reset.
      onSoftSync:()=>{},
      onSoftUpdate:async(dt,elapsed)=>{
        if(!fem||!femReady)return;
        softElapsed=elapsed;
        try{
          await fem.update(dt,elapsed);
        }catch(e){
          console.warn('fem.update failed',e);
          $('message').textContent=`软体步进失败：${e instanceof Error?e.message:String(e)}`;
          for(const p of pieces)p.mesh.visible=true;
          await disposeFem();
        }
      },
    },
  );
  playback.setCamera(camera);
  playback.softbodyEnabled=$<HTMLInputElement>('softbody-enabled').checked;

  function setUiMode(mode:UiMode){
    uiMode=mode;
    $('ui-edit').classList.toggle('active',mode==='edit');
    $('ui-play').classList.toggle('active',mode==='play');
    $('transport').hidden=mode!=='play';
    $('play-panel').hidden=mode!=='play';
    $('mode-intro').textContent=mode==='edit'
      ?'编辑：定格蓄满姿态，切块与鼓面调试。'
      :'播放：从蓄力开始，完整爆炸特效 + 碎块外飞（眼球同曲线）+ 可选软体。';
    if(mode==='edit'){
      playback.stop();
      playback.clearChunks();
      void disposeFem();
      effects.clear();
      shockwave.clear();
      feedback.reset();
      feedback.eyeDebris.clear();
      root.visible=true;
      pieces=[];
      applyBurstVanishPose(root,c,computePose(c));
      renderStats(computePose(c));
      $('overlay-label').textContent='Burst vanish pose';
      $('message').textContent='已回到编辑模式。';
    }else{
      clearChunks();
      clearFaceSelection();
      setChunkSelected(null,pieces);
      selected=null;
      void disposeFem();
      playback.measure();
      $<HTMLInputElement>('play-seek').max=String(playback.total);
      $('message').textContent='播放模式：点「从蓄力播放」。';
      if($<HTMLInputElement>('softbody-enabled').checked)void prewarmFem();
    }
  }

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
  $('ui-edit').onclick=()=>setUiMode('edit');
  $('ui-play').onclick=()=>setUiMode('play');
  $('play-burst').onclick=()=>{
    playback.softbodyEnabled=$<HTMLInputElement>('softbody-enabled').checked;
    activeCutSeed=nextCutSeed;
    playback.playFromWindup(camera);
    $('pause-burst').textContent='暂停';
  };
  $('pause-burst').onclick=()=>{
    if(playback.playing){
      playback.stop();
      $('pause-burst').textContent='继续';
    }else{
      playback.togglePlay(camera);
      $('pause-burst').textContent='暂停';
    }
  };
  $('restart-burst').onclick=()=>$('play-burst').click();
  $<HTMLInputElement>('play-seek').oninput=e=>{
    playback.seek(Number((e.target as HTMLInputElement).value),camera);
  };
  $('softbody-enabled').onchange=()=>{
    playback.softbodyEnabled=$<HTMLInputElement>('softbody-enabled').checked;
    if(uiMode==='play'&&playback.softbodyEnabled)void prewarmFem();
  };
  $('show-tet-wire').onchange=()=>{
    const wire=fem?.getTetVisualizer();
    if(wire)wire.visible=$<HTMLInputElement>('show-tet-wire').checked;
  };
  $('fem-steps').oninput=()=>{
    const v=Number($<HTMLInputElement>('fem-steps').value)||30;
    $('fem-steps-value').textContent=String(v);
    fem?.setStepsPerSecond(v);
  };

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
    if(uiMode!=='edit'||!pieces.length||ev.button!==0)return;
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
    if(uiMode!=='edit'||!pieces.length||interactMode!=='bulge')return;
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
          hardVisible:pieces.filter(p=>p.mesh.visible).length,
          soft:{
            ready:femReady,
            children:fem?.object.children.length??0,
            meshes:(fem?.object.children??[]).filter((o):o is T.Mesh=>(o as T.Mesh).isMesh).map(m=>({
              name:m.name,
              visible:m.visible,
              instanceCount:(m.geometry as T.InstancedBufferGeometry)?.instanceCount??null,
            })),
          },
          mode:chunkMode,
          interactMode,
          uiMode,
          play:{frame:playback.frame,total:playback.total,wind:playback.windFrame,burst:playback.burstFrame,playing:playback.playing},
          flight:playback.chunkFlight.snapshot(),
          faceDoc:cloneFaceBulgeDoc(faceDoc),
          selectedFace,
        }),
        cut:()=>cutChunks(),
        reload:()=>$('reload').click(),
        play:()=>$('play-burst').click(),
      },
    });
  }

  setUiMode('edit');

  renderer.setAnimationLoop((now:number)=>{
    if(uiMode==='edit'){
      if(autoRotate&&root.visible)root.rotation.y+=0.006;
      orbit.update();
      renderer.render(scene,camera);
      return;
    }
    baseCamPos.copy(camera.position);
    const speed=Number($<HTMLSelectElement>('play-speed').value)||1;
    const loop=$<HTMLInputElement>('play-loop').checked;
    playback.tick(now,speed,camera,loop);
    const shake=playback.shakeOffset();
    camera.position.set(baseCamPos.x+shake.x*.02,baseCamPos.y+shake.y*.02,baseCamPos.z);
    orbit.update();
    // playback.tick → shockwave.render already composites the scene
  });
}

void main().catch(e=>{
  console.error(e);
  $('loading').textContent=`加载失败：${e}`;
});
