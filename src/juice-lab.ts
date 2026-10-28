import { JuiceCurveEditor } from './juice-curve-editor.ts';
import { DEFAULT_JUICE_SPEED_CURVE } from './juice-speed-curve.ts';
import './juice-curve-editor.css';
/**
 * Top-down juice burst lab — single view, curve dropdown, live remain-curve readout.
 * Shares spawn/curve math with in-game JuiceParticles. Screenshot defaults.
 */
import * as T from 'three/webgpu';
import { TrainingMonsterFactory, monsterInstance } from './training-monster.ts';
import { TrainingFeedback } from './training-feedback.ts';
import { HIT_DEFAULTS, type HitSettings } from './hit-feedback-config.ts';
import { DEFAULTS } from './config.ts';
import {
  JuiceParticles,
  newJuiceSeed,
  JUICE_CURVE_IDS,
  buildJuiceSpawns,
  juiceIntegrateRemain,
  juiceRemain,
  type JuiceCurveId,
} from './juice-particles.ts';
import './juice-lab.css';

const CAMERA_TILT = Math.asin(0.82);
const DT = 1 / 60;
const VIEW_WIDTH = DEFAULTS.viewWidth;

type Spawn = ReturnType<typeof buildJuiceSpawns>[number];

const CURVES: { id: JuiceCurveId; title: string; blurb: string }[] = [
  { id: 'custom', title: '自定义曲线', blurb: '手动编辑速度百分比' },
  { id: 'linear', title: 'Linear', blurb: '剩余 y=1−u' },
  { id: 'easeOutQuad', title: 'OutQuad', blurb: '剩余 y=(1−u)²' },
  { id: 'easeOutCubic', title: 'OutCubic', blurb: '剩余 y=(1−u)³' },
  { id: 'easeOutExpo', title: 'OutExpo', blurb: '剩余 y≈2^(−10u)' },
  { id: 'smoothstep', title: 'smoothstep', blurb: '剩余 y=1−t²(3−2t)' },
  { id: 'dragHalfLife', title: '指数阻力', blurb: '剩余 y=2^(−u/Drel)' },
];

const el = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;

document.querySelector('#app')!.innerHTML = `
<header>
  <div>
    <small>ARCHERO · 绿汁 lab</small>
    <h1>俯视外爆 · 曲线切换预览</h1>
    <p>圆盘出生、水平四周爆开；预设曲线同步控制速度与尺寸；自定义曲线单独控制速度。左侧切换曲线，并显示当前运动在曲线上的位置。</p>
  </div>
  <a href="./spider-viewer.html">蜘蛛预览器 ↗</a>
</header>
<div class="layout">
  <aside class="panel">
    <h2>控制</h2>
    <p class="hint">单视口预览。曲线图纵轴 = 剩余速度/尺寸比例 y。</p>
    <div class="bar">
      <button type="button" class="primary" id="burst">迸发</button>
      <button type="button" id="play" aria-pressed="false">播放</button>
      <button type="button" id="prev">◀</button>
      <button type="button" id="next">▶</button>
    </div>
    <label>帧 <output id="frameLabel">0</output>/<output id="frameMax">120</output></label>
    <input id="timeline" type="range" min="0" max="120" value="0" step="1">
    <div class="mono" id="timeReadout">t=0.000s</div>

    <h3>曲线</h3>
    <label>当前曲线
      <select id="curveSelect">${CURVES.map((c) => `<option value="${c.id}">${c.title} — ${c.blurb}</option>`).join('')}</select>
    </label>
    <div id="juice-speed-curve-editor" hidden></div>
    <div class="curve-box">
      <canvas id="curveCanvas" width="560" height="320"></canvas>
      <div class="curve-readout" id="curveReadout">—</div>
    </div>

    <h3>出生</h3>
    <label>命中后迸发时间 <output id="delayLabel">0.13</output> s<input id="delay" type="range" min="0" max="3" step="0.01" value="0.13"></label>
    <label>粒子数 <output id="countLabel">16</output>
      <input id="count" type="range" min="8" max="64" value="16" step="1"></label>
    <label>圆盘半径 <output id="radiusLabel">0.34</output>
      <input id="radius" type="range" min="0.05" max="1.2" value="0.34" step="0.01"></label>
    <label>发射高度偏移 <output id="heightLabel">0.10</output>（相对 aimHeight）
      <input id="height" type="range" min="-0.4" max="0.8" value="0.1" step="0.01"></label>

    <h3>初速（水平）</h3>
    <label>初速基准 <output id="speedLabel">4.0</output>
      <input id="speed" type="range" min="0" max="20" value="4" step="0.1"></label>
    <label>初速随机 ± <output id="speedJitterLabel">1.0</output>
      <input id="speedJitter" type="range" min="0" max="10" value="1" step="0.1"></label>

    <h3>尺寸（世界单位）</h3>
    <label>尺寸基准 <output id="sizeLabel">0.60</output>
      <input id="size" type="range" min="0.01" max="2" value="0.60" step="0.01"></label>
    <label>尺寸随机 ± <output id="sizeJitterLabel">0.08</output>
      <input id="sizeJitter" type="range" min="0" max="1" value="0.08" step="0.01"></label>

    <h3>寿命 / 阻力</h3>
    <label>寿命 s <output id="lifeLabel">1.80</output>
      <input id="life" type="range" min="0.35" max="2.5" value="1.8" step="0.05"></label>
    <label>指数阻力 Drel <output id="dragRelLabel">0.55</output>
      <input id="dragRel" type="range" min="0.1" max="1" value="0.55" step="0.05"></label>
    <p class="hint">每次点击「迸发」自动生成新的随机分布；逐帧回看保留当前这一波。</p>

    <h3>颜色 / 深度</h3>
    <label>汁液颜色（可吸色）
      <input id="color" type="color" value="#55991e"></label>
    <label class="inline"><input id="depthTest" type="checkbox" checked> 深度遮挡</label>
    <div class="tex">
      <img id="texPreview" src="${import.meta.env.BASE_URL}juice-lab/juice.png" alt="mask" width="48" height="48">
      <code class="mono">白膜 × 颜色染色 · 单波瞬时</code>
    </div>
  </aside>
  <div class="stage-wrap">
    <div class="top">
      <h3 id="stageTitle">easeOutCubic</h3>
      <span class="mono" id="stageSub">剩余 y=(1−u)³</span>
    </div>
    <div class="stage" id="stage"></div>
    <div class="readout" id="readout">—</div>
  </div>
</div>`;

let burstSeed=newJuiceSeed();
let customSpeedCurve=DEFAULT_JUICE_SPEED_CURVE.map(p=>({...p}));
function params() {
  return {
    speedCurve: customSpeedCurve,
    delay: +el<HTMLInputElement>('delay').value,
    curve: el<HTMLSelectElement>('curveSelect').value as JuiceCurveId,
    count: +el<HTMLInputElement>('count').value,
    radius: +el<HTMLInputElement>('radius').value,
    height: +el<HTMLInputElement>('height').value,
    speed: +el<HTMLInputElement>('speed').value,
    speedJitter: +el<HTMLInputElement>('speedJitter').value,
    size: +el<HTMLInputElement>('size').value,
    sizeJitter: +el<HTMLInputElement>('sizeJitter').value,
    life: +el<HTMLInputElement>('life').value,
    dragRel: +el<HTMLInputElement>('dragRel').value,
    seed: burstSeed,
    color: el<HTMLInputElement>('color').value,
    depthTest: el<HTMLInputElement>('depthTest').checked,
  };
}

function spawnBurst(p: ReturnType<typeof params>, origin: T.Vector3): Spawn[] {
  return buildJuiceSpawns(origin, {
    count: p.count,
    speed: p.speed,
    speedJitter: p.speedJitter,
    radius: p.radius,
    life: p.life,
    size: p.size,
    sizeJitter: p.sizeJitter,
    seed: p.seed,
  });
}

async function main() {
  const stage = el('stage');
  const scene = new T.Scene();
  scene.background = new T.Color('#e5e5ca');
  const camera = new T.OrthographicCamera();
  const renderer = new T.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  await renderer.init();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  stage.replaceChildren(renderer.domElement);

  scene.add(new T.HemisphereLight(0xf5ffe5, 0xb6ca6c, 1.7));
  const sun = new T.DirectionalLight(0xfff4ce, 1.6);
  sun.position.set(-9, 22, -8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 0.5, far: 70 });
  scene.add(sun);

  const floor = new T.Mesh(
    new T.PlaneGeometry(28, 28),
    new T.MeshStandardMaterial({ color: 0xe1e1c5, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(new T.GridHelper(14, 14, 0xa1a388, 0xc4c5a9));

  const factory = await TrainingMonsterFactory.load();
  const spiderRoot = factory.create();
  spiderRoot.userData.practiceTarget = 'spider';
  const group = new T.Group();
  group.add(spiderRoot);
  scene.add(group);
  const instance = monsterInstance(spiderRoot)!;
  const hitSettings: HitSettings & { monsterScale: number; monsterHitSpeed: number } = {
    ...HIT_DEFAULTS,
    hitBaseEnabled: 0,
    hitDirectionEnabled: 0,
    hitParticleFeetEnabled: 0,
    hitKnockEnabled: 0,
    hitRimEnabled: 1,
    hitSquashEnabled: 1,
    monsterScale: DEFAULTS.monsterScale,
    monsterHitSpeed: DEFAULTS.monsterHitSpeed,
  };
  const feedback = new TrainingFeedback(group, [{ id: 'spider', x: 0, z: 0 }], 8, 8);
  const hitDir = { x: 0, z: 1 };

  const juice = await JuiceParticles.load(scene);
  const curveCanvas = el<HTMLCanvasElement>('curveCanvas');
  const curveCtx = curveCanvas.getContext('2d')!;

  let burst: Spawn[] = [];
  let emitFrame = 0;
  let frame = 0;
  let playing = false;
  let raf = 0;

  // Screenshot / in-game default
  el<HTMLSelectElement>('curveSelect').value = 'easeOutCubic';

  const speedEditor=new JuiceCurveEditor(el('juice-speed-curve-editor'),()=>customSpeedCurve,points=>{customSpeedCurve=points;render();});
  function syncLabels() {
    const p = params();
    el('juice-speed-curve-editor').hidden=p.curve!=='custom';
    speedEditor.render();
    el('delayLabel').textContent=p.delay.toFixed(2);
    el('countLabel').textContent = String(p.count);
    el('radiusLabel').textContent = p.radius.toFixed(2);
    el('heightLabel').textContent = p.height.toFixed(2);
    el('speedLabel').textContent = p.speed.toFixed(1);
    el('speedJitterLabel').textContent = p.speedJitter.toFixed(1);
    el('sizeLabel').textContent = String(p.size);
    el('sizeJitterLabel').textContent = String(p.sizeJitter);
    el('lifeLabel').textContent = p.life.toFixed(2);
    el('dragRelLabel').textContent = p.dragRel.toFixed(2);
    const meta = CURVES.find((c) => c.id === p.curve)!;
    el('stageTitle').textContent = meta.title;
    el('stageSub').textContent = meta.blurb;
    const maxFrame = Math.ceil(Math.max(p.delay+p.life * 1.12, hitSettings.hitSquashTime) / DT);
    el<HTMLInputElement>('timeline').max = String(maxFrame);
    el('frameMax').textContent = String(maxFrame);
    el<HTMLImageElement>('texPreview').style.background = p.color;
  }

  function layoutCamera() {
    const { width, height } = stage.getBoundingClientRect();
    if (width < 2 || height < 2) return;
    renderer.setSize(width, height);
    const aspect = width / height;
    const viewW = VIEW_WIDTH;
    const viewH = viewW / aspect;
    Object.assign(camera, {
      left: -viewW / 2, right: viewW / 2, top: viewH / 2, bottom: -viewH / 2,
      near: 0.1, far: 140,
    });
    camera.updateProjectionMatrix();
    const cameraZ = 0;
    camera.position.set(0, 24, cameraZ + 24 / Math.tan(CAMERA_TILT));
    camera.lookAt(0, 0, cameraZ);
    camera.updateMatrixWorld();
  }

  function origin() {
    return new T.Vector3(spiderRoot.position.x, feedback.aimHeight('spider') + params().height, spiderRoot.position.z);
  }

  /** Average particle normalized age among alive particles; before emit → 0. */
  function avgState(particleAge: number, p: ReturnType<typeof params>) {
    if (particleAge < 0 || burst.length === 0) {
      return { u: 0, y: 1, alive: 0, avgSpeed: 0, avgSize: 0, avgSpeed0: p.speed };
    }
    let alive = 0;
    let sumU = 0;
    let sumY = 0;
    let sumSpeed = 0;
    let sumSize = 0;
    let sumSpeed0 = 0;
    for (const sp of burst) {
      if (particleAge >= sp.life) continue;
      const u = particleAge / sp.life;
      const y = juiceRemain(p.curve, u, p.dragRel,customSpeedCurve);
      alive++;
      sumU += u;
      sumY += y;
      sumSpeed += sp.speed0 * y;
      sumSize += sp.s0 * juiceRemain(p.curve==='custom'?'easeOutCubic':p.curve,u,p.dragRel);
      sumSpeed0 += sp.speed0;
    }
    if (!alive) return { u: 1, y: 0, alive: 0, avgSpeed: 0, avgSize: 0, avgSpeed0: p.speed };
    return {
      u: sumU / alive,
      y: sumY / alive,
      alive,
      avgSpeed: sumSpeed / alive,
      avgSize: sumSize / alive,
      avgSpeed0: sumSpeed0 / alive,
    };
  }

  function drawCurve(p: ReturnType<typeof params>, markerU: number, markerY: number) {
    const ctx = curveCtx;
    const w = curveCanvas.width;
    const h = curveCanvas.height;
    const pad = 36;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1a2216';
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = '#2f3a28';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const x = pad + ((w - 2 * pad) * i) / 4;
      const y = pad + ((h - 2 * pad) * i) / 4;
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    }

    const X = (u: number) => pad + u * (w - 2 * pad);
    const yMax=p.curve==='custom'?Math.max(1,...customSpeedCurve.map(p=>p.progress/100)):1;
    const Y = (y: number) => h - pad - y/yMax * (h - 2 * pad);

    ctx.strokeStyle = '#556348';
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(w - pad, Y(0)); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, Y(1)); ctx.lineTo(w - pad, Y(1)); ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = '#d9c17a';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    const N = 120;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const y = juiceRemain(p.curve, u, p.dragRel,customSpeedCurve);
      const x = X(u), yy = Y(y);
      if (i === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();

    // marker: current average remain
    const um = Math.min(1, Math.max(0, markerU));
    const ym = Math.min(yMax, Math.max(0, markerY));
    ctx.strokeStyle = '#7eb8c4';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(um), pad); ctx.lineTo(X(um), h - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, Y(ym)); ctx.lineTo(w - pad, Y(ym)); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#e8ebdc';
    ctx.beginPath();
    ctx.arc(X(um), Y(ym), 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1a4d57';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#9aa88a';
    ctx.font = '12px ui-monospace, Menlo, sans-serif';
    ctx.fillText('u = age/life', w - pad - 88, h - 10);
    ctx.fillText('y 剩余', 8, pad + 4);

    const midSpeed = params().speed;
    el('curveReadout').textContent =
      `u=${um.toFixed(3)} · y=${ym.toFixed(3)} · v≈${(midSpeed * ym).toFixed(2)}（按中位初速） · 曲线 ${p.curve}`;
  }

  function doBurst() {
    burstSeed=newJuiceSeed();
    feedback.reset();
    feedback.hit('spider', hitDir, hitSettings);
    instance.animation!.preview('Hitted', 0);
    spiderRoot.updateMatrixWorld(true);
    emitFrame = Math.max(0, params().delay / DT);
    burst = spawnBurst(params(), origin());
    frame = 0;
    el<HTMLInputElement>('timeline').value = '0';
    render();
  }

  function render() {
    syncLabels();
    const p = params();
    const t = frame * DT;
    emitFrame=p.delay/DT;
    el('frameLabel').textContent = String(frame);
    el<HTMLInputElement>('timeline').value = String(frame);
    el('timeReadout').textContent =
      `t=${t.toFixed(3)}s · emit@${(emitFrame * DT).toFixed(3)}s · 水平外爆 · 无重力`;

    feedback.reset();
    feedback.hit('spider', hitDir, hitSettings);
    const emitTime=p.delay;
    emitFrame=emitTime/DT;
    feedback.update(Math.min(t,emitTime),hitSettings);
    burst=spawnBurst(p,origin());
    const particleAge=t-emitTime;
    juice.clear();
    const c={...hitSettings,juiceEnabled:1,juiceCount:p.count,juiceSpeed:p.speed,juiceSpeedJitter:p.speedJitter,juiceRadius:p.radius,juiceLife:p.life,juiceSize:p.size,juiceSizeJitter:p.sizeJitter,juiceSpeedCurve:customSpeedCurve,juiceCurve:JUICE_CURVE_IDS.indexOf(p.curve),juiceDragRel:p.dragRel,juiceColor:parseInt(p.color.slice(1),16),juiceDepthTest:p.depthTest?1:0};
    if(particleAge>=0)juice.emit(origin(),c,particleAge,burstSeed);
    feedback.update(Math.max(0,t-emitTime),hitSettings);
    const hitDur=instance.animation!.durations().Hitted;
    instance.animation!.preview('Hitted',Math.min(t*hitSettings.monsterHitSpeed,hitDur));
    spiderRoot.updateMatrixWorld(true);
    layoutCamera();
    juice.prepare(camera,c);

    const st = avgState(particleAge, p);
    el('readout').textContent =
      `alive ${st.alive} · ⌀u ${st.u.toFixed(3)} · ⌀y ${st.y.toFixed(3)} · ⌀v ${st.avgSpeed.toFixed(2)} · ⌀s ${st.avgSize.toFixed(3)} · curve ${p.curve}`;
    drawCurve(p, st.u, st.y);

    layoutCamera();
    renderer.render(scene, camera);
  }

  function setPlaying(v: boolean) {
    playing = v;
    el('play').textContent = v ? '暂停' : '播放';
    el('play').setAttribute('aria-pressed', String(v));
    if (v) {
      cancelAnimationFrame(raf);
      const loop = () => {
        if (!playing) return;
        const max = +el<HTMLInputElement>('timeline').max;
        if (frame >= max) { setPlaying(false); return; }
        frame += 1;
        render();
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    } else cancelAnimationFrame(raf);
  }

  el('burst').onclick = () => { setPlaying(false); doBurst(); };
  el('play').onclick = () => {
    if (!playing && frame >= +el<HTMLInputElement>('timeline').max) { frame = 0; render(); }
    setPlaying(!playing);
  };
  el('prev').onclick = () => { setPlaying(false); frame = Math.max(0, frame - 1); render(); };
  el('next').onclick = () => {
    setPlaying(false);
    frame = Math.min(+el<HTMLInputElement>('timeline').max, frame + 1);
    render();
  };
  el<HTMLInputElement>('timeline').oninput = () => {
    setPlaying(false);
    frame = +el<HTMLInputElement>('timeline').value;
    render();
  };

  const rebuildIds = ['delay','count', 'radius', 'height', 'speed', 'speedJitter', 'size', 'sizeJitter', 'life'];
  for (const id of [...rebuildIds, 'dragRel', 'color', 'curveSelect', 'depthTest']) {
    el(id).addEventListener('input', () => {
      syncLabels();
      if (rebuildIds.includes(id)) burst = spawnBurst(params(), origin());
      render();
    });
    el(id).addEventListener('change', () => {
      syncLabels();
      if (id === 'curveSelect' || id === 'depthTest') render();
    });
  }

  window.addEventListener('keydown', (e) => {
    if ((e.target as HTMLElement).matches('input,select,textarea,button')) return;
    if (e.code === 'Space') { e.preventDefault(); el('play').click(); }
    if (e.code === 'ArrowLeft') { e.preventDefault(); el('prev').click(); }
    if (e.code === 'ArrowRight') { e.preventDefault(); el('next').click(); }
  });

  new ResizeObserver(() => render()).observe(stage);
  doBurst();
  Object.assign(window, {
    __JUICE_LAB__: {
      seek: (f: number) => { setPlaying(false); frame = f; render(); },
      snapshot: () => ({ frame, emitFrame, params: params(),juice:juice.snapshot() }),
    },
  });
}

main().catch((e) => {
  document.body.insertAdjacentHTML('beforeend', `<p style="color:#f88;padding:20px">加载失败：${(e as Error).message}</p>`);
  console.error(e);
});
