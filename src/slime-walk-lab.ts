/**
 * Yellow-slime walk deform lab: OrbitControls + gait/walk params + phase curves.
 * Reuses game gaitLocalState / SlimeWalkDeform / applyWalkShear / foot glue.
 * Walk keys load/save via params.json (same store as the game).
 */
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createYellowSlimeModel } from './yellow-slime-model.ts';
import { SlimeInflationVisual } from './slime-inflation-visual.ts';
import { SLIME_INFLATION_DEFAULTS } from './slime-inflation-config.ts';
import {
  SLIME_FULLNESS_CONTROLS,
  SLIME_FULLNESS_DEFAULTS,
  SLIME_FULLNESS_LIMITS,
} from './slime-fullness-config.ts';
import {
  SLIME_WALK_DEFORM_CONTROLS,
  SLIME_WALK_DEFORM_DEFAULTS,
  SLIME_WALK_DEFORM_LIMITS,
} from './slime-walk-deform-config.ts';
import { gaitLocalState, type GaitLocalState } from './slime-fullness.ts';
import {
  SlimeWalkDeform,
  applyWalkShear,
  bodyWidthFromBendBase,
  walkFootLocalBottom,
  pauseBlendWeight,
} from './slime-walk-deform.ts';
import { DEFAULTS, LIMITS, type Settings, type SettingKey } from './config.ts';
import { loadSettings, saveSettings } from './settings-store.ts';
import { SettingsHistory } from './settings-history.ts';
import './slime-walk-lab.css';

type LabSettings = typeof SLIME_FULLNESS_DEFAULTS &
  typeof SLIME_WALK_DEFORM_DEFAULTS &
  typeof SLIME_INFLATION_DEFAULTS & {
    monsterSpeed: number;
  };

const MOVE_KEYS = [
  'slimeMovePeriod',
  'slimeMovePause',
  'slimeMovePeak',
  'slimeMoveValley',
  'slimeMovePeakAt',
] as const;

/** Keys shared with the game params panel / params.json. */
const WALK_SYNC_KEYS = [
  ...MOVE_KEYS,
  ...(Object.keys(SLIME_WALK_DEFORM_DEFAULTS) as (keyof typeof SLIME_WALK_DEFORM_DEFAULTS)[]),
  'monsterSpeed',
] as const satisfies readonly SettingKey[];

const LAB_DEFAULTS: LabSettings = {
  ...SLIME_INFLATION_DEFAULTS,
  ...SLIME_FULLNESS_DEFAULTS,
  ...SLIME_WALK_DEFORM_DEFAULTS,
  slimeInflationEnabled: 0,
  slimeBreathEnabled: 0,
  monsterSpeed: DEFAULTS.monsterSpeed,
};

const settings: LabSettings = { ...LAB_DEFAULTS };
let history = new SettingsHistory(walkSnapshot(settings));
let storeStatus = '正在读取游戏参数…';
let saving = false;

function walkSnapshot(from: LabSettings): Settings {
  const snap = structuredClone(DEFAULTS);
  for (const key of WALK_SYNC_KEYS) snap[key] = from[key] as never;
  return snap;
}

function applyWalkKeysFrom(source: Settings | LabSettings) {
  for (const key of WALK_SYNC_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      (settings as Record<string, number>)[key] = value;
    }
  }
  // Lab viewing overrides — never written back.
  settings.slimeInflationEnabled = 0;
  settings.slimeBreathEnabled = 0;
}

function refreshStoreUi() {
  const status = document.querySelector<HTMLElement>('#store-status');
  const undo = document.querySelector<HTMLButtonElement>('#undo-settings');
  const restore = document.querySelector<HTMLButtonElement>('#restore-settings');
  const save = document.querySelector<HTMLButtonElement>('#save-settings');
  if (status) status.textContent = storeStatus;
  if (undo) undo.disabled = !history.canUndo;
  if (restore) restore.disabled = !history.dirty;
  if (save) save.disabled = saving || !history.dirty;
}

type Mode = 'place' | 'shuttle';
let mode: Mode = 'place';
let playing = true;
let moveCycleAge = 0;
let shuttleX = 0;
let shuttleDir = 1;
const SHUTTLE_HALF = 4.5;

const walk = new SlimeWalkDeform();
const walkScaleMatrix = new T.Matrix4();
const worldRotation = new T.Quaternion();
const bendInverseRot = new T.Quaternion();
const bendLocalDir = new T.Vector3();

const CURVES = [
  { id: 'mult', label: '速度 mult', color: '#2f7d32', enabled: true },
  { id: 'e', label: '扁度 e', color: '#c45c12', enabled: true },
  { id: 'lean', label: '前倾 lean', color: '#2b5ea8', enabled: true },
  { id: 'sy', label: '高度 sy', color: '#7a3ea8', enabled: true },
] as const;

document.querySelector('#app')!.innerHTML = `
<header>
  <div>
    <span>ARCHERO REMAKE / WALK LAB</span>
    <h1>史莱姆 · 行走形变</h1>
  </div>
  <span>360° 观察 · 相位曲线 · 与游戏 params 同步</span>
</header>
<main>
  <div class="stage-wrap">
    <div id="viewport" aria-label="可旋转的史莱姆行走预览">
      <div class="stage-caption"><span>拖动旋转 / 滚轮缩放</span><span>WALK DEFORM</span></div>
    </div>
    <section class="curve-panel">
      <h2>一个 gait 周期内的相位</h2>
      <p class="curve-help">横轴 = period + pause。竖线 = 当前相位。速度/扁度/前倾目标/理想高度同轴对照；拧「峰位置」可直接看峰往哪挪、回高有多陡。</p>
      <canvas id="curve" width="900" height="168"></canvas>
      <div class="legend" id="legend"></div>
    </section>
  </div>
  <aside>
    <p class="eyebrow">调试</p>
    <h2>边看边拧</h2>
    <p class="intro">复用游戏同一套 gait 与行走形变。启动时读取 <code>params.json</code>；保存后写回，游戏页刷新后生效。</p>
    <div class="row" id="store-row">
      <button type="button" id="save-settings" disabled>保存到游戏</button>
      <button type="button" id="undo-settings" disabled>撤回</button>
      <button type="button" id="restore-settings" disabled>撤回全部</button>
      <button type="button" id="reload-settings">读取游戏参数</button>
    </div>
    <p class="note" id="store-status" role="status" aria-live="polite">正在读取游戏参数…</p>
    <div class="row" id="mode-row">
      <button type="button" data-mode="place" aria-pressed="true">原地循环</button>
      <button type="button" data-mode="shuttle" aria-pressed="false">直线来回</button>
    </div>
    <div class="row">
      <button type="button" data-view="game">游戏视角</button>
      <button type="button" data-view="front">正面</button>
      <button type="button" data-view="side">侧面</button>
    </div>
    <div class="row">
      <button type="button" id="toggle-play" aria-pressed="true">暂停</button>
      <button type="button" id="reset-phase">相位归零</button>
      <button type="button" id="reset-defaults">恢复代码默认</button>
    </div>
    <div class="live" id="live"></div>
    <div id="controls"></div>
    <p class="note">来回模式用「怪物追赶速度」× gait mult 推进。原地模式只播形变、不平移。本页关闭鼓胀/呼吸仅方便观察，不会写入游戏。</p>
  </aside>
</main>
<footer>
  <span>脚钉 · shearAtHeight · 弹簧与游戏一致</span>
  <a href="./">返回游戏</a>
</footer>
`;

const host = document.querySelector<HTMLElement>('#viewport')!;
const curveCanvas = document.querySelector<HTMLCanvasElement>('#curve')!;
const curveCtx = curveCanvas.getContext('2d')!;
const controlsHost = document.querySelector<HTMLElement>('#controls')!;
const liveEl = document.querySelector<HTMLElement>('#live')!;
const legendEl = document.querySelector<HTMLElement>('#legend')!;

legendEl.innerHTML = CURVES.map(
  (c) =>
    `<label><input type="checkbox" data-curve="${c.id}" checked><i style="background:${c.color}"></i>${c.label}</label>`,
).join('');

function limitsFor(key: string): [number, number, number] {
  if (key in LIMITS) return LIMITS[key as SettingKey];
  return (
    (SLIME_FULLNESS_LIMITS as Record<string, [number, number, number]>)[key] ??
    (SLIME_WALK_DEFORM_LIMITS as Record<string, [number, number, number]>)[key]
  );
}

function buildControls() {
  const blocks: { title: string; items: [string, string, string, string][] }[] = [
    {
      title: '怪物训练场 · 速度',
      items: [['monsterSpeed', '怪物追赶速度', 'u/s', '与游戏侧栏同键；来回模式乘在 gait mult 上。']],
    },
    {
      title: '行走 · 速度驼峰',
      items: SLIME_FULLNESS_CONTROLS.filter((r) => (MOVE_KEYS as readonly string[]).includes(r[0])),
    },
    {
      title: '行走 · 形变',
      items: SLIME_WALK_DEFORM_CONTROLS as [string, string, string, string][],
    },
  ];
  controlsHost.innerHTML = blocks
    .map((block) => {
      const rows = block.items
        .map(([key, name, unit, hint]) => {
          const [min, max, step] = limitsFor(key);
          const value = (settings as Record<string, number>)[key];
          const isToggle = min === 0 && max === 1 && step === 1;
          if (isToggle) {
            return `<div class="setting" title="${hint}"><label class="setting-label"><span>${name}</span>
              <input id="lab-${key}" data-key="${key}" type="checkbox" ${value ? 'checked' : ''}>
            </label><p class="hint">${hint}</p></div>`;
          }
          return `<div class="setting" title="${hint}">
            <div class="setting-label"><label for="lab-${key}">${name}</label>
              <div class="numeric"><input id="lab-${key}" data-key="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${value}"><span>${unit}</span></div>
            </div>
            <input id="slider-${key}" data-key="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">
            <p class="hint">${hint}</p>
          </div>`;
        })
        .join('');
      return `<p class="section-title">${block.title}</p>${rows}`;
    })
    .join('');
}

buildControls();

function syncControlValues() {
  for (const key of WALK_SYNC_KEYS) {
    const v = (settings as Record<string, number>)[key];
    const num = document.querySelector<HTMLInputElement>(`#lab-${key}`);
    const slider = document.querySelector<HTMLInputElement>(`#slider-${key}`);
    if (num?.type === 'checkbox') num.checked = !!v;
    else if (num) num.value = String(v);
    if (slider) slider.value = String(v);
  }
}

function setSetting(key: string, raw: number, recordHistory = true) {
  const [min, max, step] = limitsFor(key);
  let v = Number(raw);
  if (!Number.isFinite(v)) return;
  if (min === 0 && max === 1 && step === 1) v = v ? 1 : 0;
  else v = Math.min(max, Math.max(min, v));
  if ((settings as Record<string, number>)[key] === v) {
    syncControlValues();
    return;
  }
  if (recordHistory) history.begin();
  (settings as Record<string, number>)[key] = v;
  if (recordHistory) {
    history.record(walkSnapshot(settings));
    history.end();
  }
  syncControlValues();
  storeStatus = history.dirty ? '有未保存的修改' : '与已保存基准一致';
  refreshStoreUi();
}

controlsHost.addEventListener('pointerdown', (ev) => {
  const t = ev.target as HTMLElement;
  if (t.matches('input[type=range],input[type=number],input[type=checkbox]')) history.begin();
});
controlsHost.addEventListener('pointerup', () => history.end());
controlsHost.addEventListener('input', (ev) => {
  const t = ev.target as HTMLInputElement;
  const key = t.dataset.key;
  if (!key) return;
  // Range/number: record once per change without double begin/end from setSetting.
  const [min, max, step] = limitsFor(key);
  let v = t.type === 'checkbox' ? (t.checked ? 1 : 0) : Number(t.value);
  if (!Number.isFinite(v)) return;
  if (!(min === 0 && max === 1 && step === 1)) v = Math.min(max, Math.max(min, v));
  if ((settings as Record<string, number>)[key] === v) return;
  (settings as Record<string, number>)[key] = v;
  history.record(walkSnapshot(settings));
  syncControlValues();
  storeStatus = '有未保存的修改';
  refreshStoreUi();
});
controlsHost.addEventListener('change', () => {
  history.end();
  refreshStoreUi();
});

// --- Three.js stage ---
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
host.prepend(renderer.domElement);

const scene = new T.Scene();
scene.background = new T.Color('#e9e7dc');
const camera = new T.PerspectiveCamera(35, 1, 0.1, 80);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 16;
controls.maxPolarAngle = Math.PI * 0.49;
controls.target.set(0, 0.95, 0);

const pmrem = new T.PMREMGenerator(renderer);
const room = new RoomEnvironment();
scene.environment = pmrem.fromScene(room).texture;
room.dispose();
pmrem.dispose();

scene.add(new T.HemisphereLight(0xfffbed, 0x877d54, 2));
const light = new T.DirectionalLight(0xfff7df, 3);
light.position.set(-3, 7, 5);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8 });
light.shadow.normalBias = 0.025;
scene.add(light);

const floor = new T.Mesh(
  new T.PlaneGeometry(40, 40),
  new T.MeshStandardMaterial({ color: 0xe9e7dc, roughness: 0.9 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.012;
floor.receiveShadow = true;
scene.add(floor);
const grid = new T.GridHelper(16, 32, 0xc6c3b4, 0xd8d5c8);
grid.position.y = -0.009;
scene.add(grid);

const model = createYellowSlimeModel();
const inflation = new SlimeInflationVisual(model, 1.8);
inflation.apply(settings);
const visual = new T.Group();
visual.name = 'WalkLabVisual';
visual.matrixAutoUpdate = false;
visual.add(model.root);
const root = new T.Group();
root.name = 'WalkLabRoot';
root.add(visual);
scene.add(root);

function setView(name: string) {
  camera.position.fromArray(
    ({ game: [4.6, 4.6, 6.8], front: [0, 1.5, 8], side: [8, 1.6, 0] } as Record<string, number[]>)[
      name
    ],
  );
  controls.target.set(root.position.x, 0.95, 0);
  controls.update();
}

function idealSy(st: GaitLocalState, moving: boolean) {
  if (!moving) return settings.slimeWalkIdleSy;
  if (st.inPause) {
    const w = pauseBlendWeight(st);
    return settings.slimeWalkRestSy + (settings.slimeWalkPauseSy - settings.slimeWalkRestSy) * w;
  }
  return settings.slimeWalkRestSy + (settings.slimeWalkPeakSy - settings.slimeWalkRestSy) * st.e;
}

function leanTargetOf(st: GaitLocalState, moving: boolean) {
  return !moving || st.inPause ? 0 : st.humpU;
}

function sampleCycle(n = 120) {
  const period = Math.max(1e-6, settings.slimeMovePeriod);
  const pause = Math.max(0, settings.slimeMovePause);
  const cycle = period + pause;
  const points: { t: number; mult: number; e: number; lean: number; sy: number; inPause: boolean }[] =
    [];
  for (let i = 0; i <= n; i++) {
    const age = (i / n) * cycle;
    const st = gaitLocalState(age, settings);
    points.push({
      t: age / cycle,
      mult: st.mult,
      e: st.e,
      lean: leanTargetOf(st, true),
      sy: idealSy(st, true),
      inPause: st.inPause,
    });
  }
  return { cycle, period, pause, points };
}

function drawCurves(playT: number) {
  const { cycle, period, points } = sampleCycle(160);
  const w = curveCanvas.width;
  const h = curveCanvas.height;
  const pad = { l: 36, r: 12, t: 12, b: 22 };
  const iw = w - pad.l - pad.r;
  const ih = h - pad.t - pad.b;
  const ctx = curveCtx;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#f7f6ef';
  ctx.fillRect(0, 0, w, h);

  // pause band
  const pauseStart = period / cycle;
  ctx.fillStyle = 'rgba(140, 145, 120, 0.12)';
  ctx.fillRect(pad.l + pauseStart * iw, pad.t, (1 - pauseStart) * iw, ih);

  // grid
  ctx.strokeStyle = '#e0e3d4';
  ctx.lineWidth = 1;
  for (let g = 0; g <= 4; g++) {
    const y = pad.t + (ih * g) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + iw, y);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(pad.l + pauseStart * iw, pad.t);
  ctx.lineTo(pad.l + pauseStart * iw, pad.t + ih);
  ctx.strokeStyle = '#b8bda8';
  ctx.setLineDash([4, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  const enabled = new Set(
    [...legendEl.querySelectorAll<HTMLInputElement>('input[data-curve]:checked')].map(
      (el) => el.dataset.curve!,
    ),
  );

  const syMin = 0.5;
  const syMax = 1.5;
  const norm = {
    mult: (v: number) => v / Math.max(1e-6, settings.slimeMovePeak),
    e: (v: number) => v,
    lean: (v: number) => v,
    sy: (v: number) => (v - syMin) / (syMax - syMin),
  };

  const series: Record<string, (p: (typeof points)[0]) => number> = {
    mult: (p) => p.mult,
    e: (p) => p.e,
    lean: (p) => p.lean,
    sy: (p) => p.sy,
  };

  for (const c of CURVES) {
    if (!enabled.has(c.id)) continue;
    ctx.beginPath();
    ctx.strokeStyle = c.color;
    ctx.lineWidth = 2;
    points.forEach((p, i) => {
      const x = pad.l + p.t * iw;
      const y = pad.t + ih * (1 - Math.min(1, Math.max(0, norm[c.id](series[c.id](p)))));
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  // playhead
  const t = ((playT % cycle) + cycle) % cycle / cycle;
  const px = pad.l + t * iw;
  ctx.strokeStyle = '#33382c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(px, pad.t);
  ctx.lineTo(px, pad.t + ih);
  ctx.stroke();

  // live dots at playhead
  const st = gaitLocalState(moveCycleAge, settings);
  const liveVals: Record<string, number> = {
    mult: st.mult,
    e: st.e,
    lean: walk.lean01,
    sy: walk.sy,
  };
  for (const c of CURVES) {
    if (!enabled.has(c.id)) continue;
    const y = pad.t + ih * (1 - Math.min(1, Math.max(0, norm[c.id](liveVals[c.id]))));
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(px, y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#6d7460';
  ctx.font = '10px system-ui,sans-serif';
  ctx.fillText('period', pad.l + 4, h - 6);
  ctx.fillText('pause', pad.l + pauseStart * iw + 4, h - 6);
  ctx.fillText('0', pad.l - 10, pad.t + ih + 2);
  ctx.fillText('1', pad.l - 10, pad.t + 10);
}

function applyPose(dt: number, moving: boolean) {
  if (!settings.slimeWalkEnabled) {
    walk.reset();
  } else {
    const st = gaitLocalState(moveCycleAge, settings);
    walk.update(dt, st, moving, settings);
  }

  inflation.invalidateShape();
  inflation.apply(settings);

  if (settings.slimeWalkEnabled) {
    const width = bodyWidthFromBendBase(inflation.bendBase);
    if (width > 1e-8) {
      walk.bodyWidth = width;
      walk.shearTop = walk.leanUpper01 * settings.slimeWalkMaxLean * width;
      walk.shearBelly = walk.lean01 * settings.slimeWalkMaxLean * width * 0.55;
      const fy = root.rotation.y;
      const worldFwdX = Math.sin(fy);
      const worldFwdZ = Math.cos(fy);
      root.getWorldQuaternion(worldRotation);
      bendLocalDir
        .set(worldFwdX, 0, worldFwdZ)
        .applyQuaternion(bendInverseRot.copy(worldRotation).invert());
      bendLocalDir.y = 0;
      if (bendLocalDir.lengthSq() < 1e-12) bendLocalDir.set(0, 0, 1);
      else bendLocalDir.normalize();
      applyWalkShear(
        inflation.bendPositions,
        inflation.bendBase,
        bendLocalDir.x,
        bendLocalDir.z,
        walk.shearBelly,
        walk.shearTop,
      );
      walk.projectEyeFollow(bendLocalDir.x, bendLocalDir.z);
      inflation.bendFace.position.set(walk.eyeFollowX, 0, walk.eyeFollowZ);
      walk.applied = true;
    }
    walkScaleMatrix.makeScale(walk.sx, walk.sy, walk.sx);
    visual.matrix.copy(walkScaleMatrix);
    const L = walkFootLocalBottom(inflation.modelRoot.position.y, inflation.modelRoot.scale.y);
    const syTotal = visual.matrix.elements[5];
    visual.matrix.elements[13] = -syTotal * L;
  } else {
    visual.matrix.identity();
    inflation.bendFace.position.set(0, 0, 0);
    walk.applied = false;
  }
  visual.scale.set(1, 1, 1);
  visual.matrixWorldNeedsUpdate = true;
}

function updateLiveHud(st: GaitLocalState, moving: boolean) {
  const cycle = st.cycle;
  const phase = cycle > 0 ? ((moveCycleAge % cycle) + cycle) % cycle : 0;
  liveEl.innerHTML = `
    <div><strong>模式</strong> ${mode === 'place' ? '原地' : '来回'} · <strong>播放</strong> ${playing ? '开' : '停'}</div>
    <div><strong>age</strong> ${moveCycleAge.toFixed(2)}s · <strong>相位</strong> ${phase.toFixed(2)} / ${cycle.toFixed(2)}s ${st.inPause ? '(pause)' : '(period)'}</div>
    <div><strong>mult</strong> ${st.mult.toFixed(3)} · <strong>e</strong> ${st.e.toFixed(3)} · <strong>humpU</strong> ${st.humpU.toFixed(3)}</div>
    <div><strong>lean01</strong> ${walk.lean01.toFixed(3)} <span style="color:#888">(目标 ${leanTargetOf(st, moving).toFixed(3)})</span> · <strong>upper</strong> ${walk.leanUpper01.toFixed(3)}</div>
    <div><strong>sx/sy</strong> ${walk.sx.toFixed(3)} / ${walk.sy.toFixed(3)} <span style="color:#888">(理想 sy ${idealSy(st, moving).toFixed(3)})</span></div>
    <div><strong>eye</strong> ${walk.eyeFollow.toFixed(3)} · <strong>moving</strong> ${moving}</div>
  `;
}

new ResizeObserver(() => {
  const { width, height } = host.getBoundingClientRect();
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  const rect = curveCanvas.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio, 2);
  curveCanvas.width = Math.max(300, Math.floor(rect.width * dpr));
  curveCanvas.height = Math.max(120, Math.floor(168 * dpr));
}).observe(host);

for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
  btn.onclick = () => {
    mode = btn.dataset.mode as Mode;
    for (const b of document.querySelectorAll<HTMLButtonElement>('[data-mode]')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === mode));
    }
    if (mode === 'place') {
      shuttleX = 0;
      root.position.x = 0;
      root.rotation.y = 0;
    }
  };
}
for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-view]')) {
  btn.onclick = () => setView(btn.dataset.view!);
}
document.querySelector<HTMLButtonElement>('#toggle-play')!.onclick = (ev) => {
  playing = !playing;
  const b = ev.currentTarget as HTMLButtonElement;
  b.textContent = playing ? '暂停' : '继续';
  b.setAttribute('aria-pressed', String(playing));
};
document.querySelector<HTMLButtonElement>('#reset-phase')!.onclick = () => {
  moveCycleAge = 0;
  walk.reset();
  shuttleX = 0;
  shuttleDir = 1;
  root.position.x = 0;
};
document.querySelector<HTMLButtonElement>('#reset-defaults')!.onclick = () => {
  history.begin();
  Object.assign(settings, LAB_DEFAULTS);
  settings.slimeInflationEnabled = 0;
  settings.slimeBreathEnabled = 0;
  history.record(walkSnapshot(settings));
  history.end();
  syncControlValues();
  moveCycleAge = 0;
  walk.reset();
  shuttleX = 0;
  shuttleDir = 1;
  root.position.set(0, 0, 0);
  root.rotation.y = 0;
  inflation.invalidateShape();
  inflation.apply(settings);
  storeStatus = '已恢复代码默认（未保存到游戏）';
  refreshStoreUi();
};

async function reloadFromGame() {
  try {
    const loaded = await loadSettings();
    applyWalkKeysFrom(loaded);
    history = new SettingsHistory(walkSnapshot(settings));
    syncControlValues();
    moveCycleAge = 0;
    walk.reset();
    inflation.invalidateShape();
    inflation.apply(settings);
    storeStatus = '已读取游戏 params.json';
    refreshStoreUi();
  } catch (e) {
    storeStatus = `读取失败：${e instanceof Error ? e.message : String(e)}`;
    refreshStoreUi();
  }
}

document.querySelector<HTMLButtonElement>('#reload-settings')!.onclick = () => {
  void reloadFromGame();
};
document.querySelector<HTMLButtonElement>('#undo-settings')!.onclick = () => {
  applyWalkKeysFrom(history.undo());
  syncControlValues();
  storeStatus = history.dirty ? '已撤回一步；仍有未保存修改' : '已撤回；与基准一致';
  refreshStoreUi();
};
document.querySelector<HTMLButtonElement>('#restore-settings')!.onclick = () => {
  applyWalkKeysFrom(history.undoAll());
  syncControlValues();
  storeStatus = '已撤回全部未保存修改';
  refreshStoreUi();
};
document.querySelector<HTMLButtonElement>('#save-settings')!.onclick = async () => {
  if (saving) return;
  saving = true;
  refreshStoreUi();
  storeStatus = '保存中…';
  refreshStoreUi();
  try {
    const latest = await loadSettings();
    for (const key of WALK_SYNC_KEYS) latest[key] = settings[key] as never;
    await saveSettings(latest);
    history.saved(walkSnapshot(settings));
    storeStatus = '已写入 params.json；刷新游戏页后生效';
  } catch (e) {
    storeStatus = `保存失败：${e instanceof Error ? e.message : String(e)}`;
  } finally {
    saving = false;
    refreshStoreUi();
  }
};

legendEl.addEventListener('change', () => drawCurves(moveCycleAge));

setView('game');
refreshStoreUi();
void reloadFromGame();

let last = performance.now();
renderer.setAnimationLoop(() => {
  const now = performance.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05;

  if (playing) {
    // Lab always advances the gait clock while playing (including pause), so curves show a full cycle.
    moveCycleAge += dt;
    const st = gaitLocalState(moveCycleAge, settings);
    if (mode === 'place') {
      root.rotation.y = 0;
    } else {
      const step = settings.monsterSpeed * st.mult * dt;
      if (step > 1e-8) {
        shuttleX += shuttleDir * step;
        if (shuttleX > SHUTTLE_HALF) {
          shuttleX = SHUTTLE_HALF;
          shuttleDir = -1;
        } else if (shuttleX < -SHUTTLE_HALF) {
          shuttleX = -SHUTTLE_HALF;
          shuttleDir = 1;
        }
      }
      root.position.x = shuttleX;
      root.rotation.y = shuttleDir > 0 ? Math.PI / 2 : -Math.PI / 2;
      controls.target.x = root.position.x;
    }
    applyPose(dt, true);
    updateLiveHud(st, true);
    drawCurves(moveCycleAge);
  } else {
    const st = gaitLocalState(moveCycleAge, settings);
    applyPose(dt, false);
    updateLiveHud(st, false);
    drawCurves(moveCycleAge);
  }

  controls.update();
  renderer.render(scene, camera);
});

Object.assign(window, {
  __SLIME_WALK_LAB__: {
    snapshot: () => ({
      ready: true,
      mode,
      playing,
      moveCycleAge,
      dirty: history.dirty,
      canUndo: history.canUndo,
      storeStatus,
      settings: { ...settings },
      walk: {
        lean01: walk.lean01,
        leanUpper01: walk.leanUpper01,
        sx: walk.sx,
        sy: walk.sy,
        eyeFollow: walk.eyeFollow,
        bodyWidth: walk.bodyWidth,
        applied: walk.applied,
      },
      gait: gaitLocalState(moveCycleAge, settings),
    }),
    setMode: (m: Mode) => {
      document.querySelector<HTMLButtonElement>(`[data-mode="${m}"]`)?.click();
    },
    setSetting,
    reloadFromGame,
  },
});
