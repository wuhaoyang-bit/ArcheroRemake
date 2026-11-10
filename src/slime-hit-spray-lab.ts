import './slime-hit-spray-lab.css';
import * as T from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTrainingCube } from './training-monster.ts';
import { TrainingFeedback } from './training-feedback.ts';
import { JuiceParticles, JUICE_CURVE_IDS, newJuiceSeed, type JuiceCurveId } from './juice-particles.ts';
import {
  DirectionalSpray,
  DEFAULT_SPRAY_PARAMS,
  SPRAY_MODE_PRESETS,
  type SprayEmitParams,
  type SprayMode,
} from './directional-spray.ts';
import { JuiceCurveEditor } from './juice-curve-editor.ts';
import { DEFAULT_JUICE_SPEED_CURVE, type JuiceSpeedPoint } from './juice-speed-curve.ts';
import { DEFAULTS } from './config.ts';
import { loadSettings } from './settings-store.ts';
import type { HitSettings } from './hit-feedback-config.ts';

const CURVE_LABELS = ['Linear', 'OutQuad', 'OutCubic', 'OutExpo', 'smoothstep', '指数阻力', '自定义曲线'];

const el = <E extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as E;

document.querySelector('#app')!.innerHTML = `
<header>
  <div>
    <small>ARCHERO · 受击粒子实机预览</small>
    <h1>史莱姆受击 · 四散汁液 + 方向喷溅</h1>
    <p>接入项目史莱姆模型、击退/挤压/闪白与原版径向汁液；下拉切换三种方向锥，叠在汁液上一起播。</p>
  </div>
  <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end">
    <a href="./">返回游戏 ↗</a>
    <a href="http://127.0.0.1:8767/slime-hit-particle-lab/">算法对照页 ↗</a>
  </div>
</header>
<main>
  <section class="panel">
    <div class="stage" id="stage"><div id="loading">正在加载史莱姆与粒子…</div></div>
    <div class="row">
      <button type="button" id="hit" class="primary">▶ 受击一次</button>
      <button type="button" id="reset">重置位置</button>
      <label><input type="checkbox" id="loop" checked> 自动连击</label>
      <label>速度
        <select id="rate">
          <option value="1">正常</option>
          <option value="0.5">½ 慢动作</option>
          <option value="0.25">¼ 慢动作</option>
        </select>
      </label>
      <output id="clock">就绪</output>
    </div>
  </section>
  <aside class="panel">
    <h2 style="margin:0 0 10px;font-size:18px">方向喷溅</h2>
    <label class="field">效果（叠在原版四散汁液上）
      <select id="mode">
        <option value="blood">1 · 扇形飞溅</option>
        <option value="arterial">2 · 集中射流</option>
        <option value="quarks">3 · 两者叠加</option>
      </select>
    </label>
    <label class="field">命中方向 <output id="yawOut">180°</output>
      <input id="yaw" type="range" min="0" max="360" step="1" value="180">
    </label>
    <label class="field">模型朝向 <output id="facingOut">0°</output>
      <input id="facing" type="range" min="0" max="360" step="1" value="0">
    </label>
    <label class="field"><span><input type="checkbox" id="sprayOn" checked> 启用方向喷溅</span></label>
    <label class="field"><span><input type="checkbox" id="sprayDebugDir"> 方向粒子调试（射流青蓝 / 扇形橙红）</span></label>
    <label class="field">喷溅延迟 <output id="sprayDelayOut">0.00s</output>
      <input id="sprayDelay" type="range" min="0" max="0.5" step="0.01" value="0">
    </label>
    <label class="field"><span><input type="checkbox" id="flat"> 俯视平铺（关=竖直受重力）</span></label>
    <label class="field">重力（向下） <output id="gravityOut">9.8</output>
      <input id="gravity" type="range" min="0" max="20" step="0.1" value="9.8">
    </label>
    <label class="field"><span><input type="checkbox" id="juiceOn" checked> 启用原版四散汁液</span></label>

    <h3 class="section">方向粒子 · 发射</h3>
    <label class="field">数量 <output id="countOut">16</output>
      <input id="count" type="range" min="1" max="80" step="1" value="16">
    </label>
    <div class="field-row">
      <label class="field">初速 <output id="speedOut">7.6</output>
        <input id="speed" type="range" min="0" max="20" step="0.1" value="7.6">
      </label>
      <label class="field">初速± <output id="speedJitterOut">1.5</output>
        <input id="speedJitter" type="range" min="0" max="10" step="0.1" value="1.5">
      </label>
    </div>
    <div class="field-row">
      <label class="field">大小 <output id="sizeOut">0.67</output>
        <input id="size" type="range" min="0.05" max="1.2" step="0.01" value="0.67">
      </label>
      <label class="field">大小± <output id="sizeJitterOut">0.15</output>
        <input id="sizeJitter" type="range" min="0" max="0.5" step="0.01" value="0.15">
      </label>
    </div>
    <div class="field-row">
      <label class="field">寿命 <output id="lifeOut">1.30s</output>
        <input id="life" type="range" min="0.1" max="3" step="0.05" value="1.3">
      </label>
      <label class="field">寿命± <output id="lifeJitterOut">0.20s</output>
        <input id="lifeJitter" type="range" min="0" max="1" step="0.05" value="0.2">
      </label>
    </div>
    <div class="field-row">
      <label class="field">锥角° <output id="spreadOut">45</output>
        <input id="spread" type="range" min="0" max="180" step="1" value="45">
      </label>
      <label class="field">盘半径 <output id="radiusOut">0.30</output>
        <input id="radius" type="range" min="0" max="0.5" step="0.01" value="0.3">
      </label>
    </div>
    <div class="row">
      <button type="button" id="preset-mode">恢复该效果预设</button>
    </div>

    <h3 class="section">方向粒子 · 水平速度曲线</h3>
    <label class="field">曲线
      <select id="sprayCurve">${CURVE_LABELS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>
    </label>
    <label class="field">指数阻力 Drel <output id="dragRelOut">0.55</output>
      <input id="dragRel" type="range" min="0.05" max="1" step="0.05" value="0.55">
    </label>
    <div id="spray-speed-curve-editor" hidden></div>
    <div class="row">
      <button type="button" id="sync-juice-curve">从汁液曲线同步</button>
    </div>

    <div class="row" style="margin-top:12px">
      <button type="button" id="view-game">游戏斜俯视</button>
      <button type="button" id="view-top">俯视</button>
      <button type="button" id="view-side">侧面</button>
    </div>
    <p class="hint">
      刷新默认：数量 16、初速 7.6±1.5、大小 0.67±0.15、寿命 1.30±0.20、锥角 45°、盘半径 0.30、平铺关闭、延迟 0s。
      喷溅在立方体模型背面（眼睛对面）面心生成，锥轴跟随「模型朝向」（史莱姆自身 −facing），不是世界轴。
      命中 yaw 只影响击退。打开「方向粒子调试开关」后射流变青蓝、扇形变橙红；转「模型朝向」可核对喷溅是否跟着转。
      切换效果仍可载入该模式预设。本页改动只影响预览。
    </p>
    <p id="status" role="status"></p>
  </aside>
</main>
`;

async function main() {
  let settings = { ...DEFAULTS } as typeof DEFAULTS;
  try {
    settings = await loadSettings();
    el('status').textContent = '已读取游戏 params.json。';
  } catch {
    el('status').textContent = '未能读取 params，使用默认参数。';
  }
  // Preview needs juice visible even if saved params turned it off.
  settings = {
    ...settings,
    juiceEnabled: 1,
    hitKnockEnabled: settings.hitKnockEnabled ?? 1,
    hitSquashEnabled: settings.hitSquashEnabled ?? 1,
    hitRimEnabled: settings.hitRimEnabled ?? 1,
  };

  const scene = new T.Scene();
  scene.background = new T.Color('#e5e5ca');
  const camera = new T.PerspectiveCamera(38, 1, 0.05, 150);
  const renderer = new T.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  await renderer.init();
  renderer.toneMapping = T.LinearToneMapping;

  const stage = el('stage');
  stage.replaceChildren(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.7, 0);
  controls.minDistance = 2;
  controls.maxDistance = 30;
  controls.maxPolarAngle = Math.PI * 0.49;

  scene.add(new T.HemisphereLight(0xf5ffe5, 0xb6ca6c, 1.6));
  const sun = new T.DirectionalLight(0xfff4ce, 1.7);
  sun.position.set(-8, 18, -6);
  scene.add(sun);
  const floor = new T.Mesh(
    new T.PlaneGeometry(40, 40),
    new T.MeshStandardMaterial({ color: 0xe1e1c5, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.015;
  scene.add(floor);
  scene.add(new T.GridHelper(20, 20, 0xa1a388, 0xc4c5a9));

  const group = new T.Group();
  const slime = createTrainingCube();
  slime.userData.practiceTarget = 'slime';
  group.add(slime);
  scene.add(group);

  const feedback = new TrainingFeedback(group, [{ id: 'slime', x: 0, z: 0 }], 20, 20);
  const juice = await JuiceParticles.load(scene);
  juice.resolveColor = (id, out) => feedback.currentColor(id, out);
  // Keep burst glued to the slime while knockback moves it (preview only).
  juice.followOwner = true;
  const spray = await DirectionalSpray.load(scene);
  spray.follow = true;
  spray.flatXZ = false;
  spray.params = { ...DEFAULT_SPRAY_PARAMS };
  // Seed horizontal curve from juice settings; lab can diverge afterward.
  spray.applyCurveSettings(settings);
  let spraySpeedCurve: JuiceSpeedPoint[] = spray.speedCurve.map((p) => ({ ...p }));
  spray.speedCurve = spraySpeedCurve;

  const originScratch = new T.Vector3();
  const dirScratch = new T.Vector3();

  function readSprayParams(): SprayEmitParams {
    return {
      count: Number(el<HTMLInputElement>('count').value),
      speed: Number(el<HTMLInputElement>('speed').value),
      speedJitter: Number(el<HTMLInputElement>('speedJitter').value),
      size: Number(el<HTMLInputElement>('size').value),
      sizeJitter: Number(el<HTMLInputElement>('sizeJitter').value),
      life: Number(el<HTMLInputElement>('life').value),
      lifeJitter: Number(el<HTMLInputElement>('lifeJitter').value),
      spreadDeg: Number(el<HTMLInputElement>('spread').value),
      radius: Number(el<HTMLInputElement>('radius').value),
    };
  }

  function writeSprayParams(p: SprayEmitParams) {
    const set = (id: string, v: number, out: string, fmt: (n: number) => string) => {
      el<HTMLInputElement>(id).value = String(v);
      el(out).textContent = fmt(v);
    };
    set('count', p.count, 'countOut', (n) => String(Math.round(n)));
    set('speed', p.speed, 'speedOut', (n) => n.toFixed(1));
    set('speedJitter', p.speedJitter, 'speedJitterOut', (n) => n.toFixed(1));
    set('size', p.size, 'sizeOut', (n) => n.toFixed(2));
    set('sizeJitter', p.sizeJitter, 'sizeJitterOut', (n) => n.toFixed(2));
    set('life', p.life, 'lifeOut', (n) => `${n.toFixed(2)}s`);
    set('lifeJitter', p.lifeJitter, 'lifeJitterOut', (n) => `${n.toFixed(2)}s`);
    set('spread', p.spreadDeg, 'spreadOut', (n) => String(Math.round(n)));
    set('radius', p.radius, 'radiusOut', (n) => n.toFixed(2));
  }

  function syncSprayCurveUi() {
    const idx = Math.max(0, JUICE_CURVE_IDS.indexOf(spray.curve));
    el<HTMLSelectElement>('sprayCurve').value = String(idx);
    el<HTMLInputElement>('dragRel').value = String(spray.dragRel);
    el('dragRelOut').textContent = spray.dragRel.toFixed(2);
    el('spray-speed-curve-editor').hidden = spray.curve !== 'custom';
    curveEditor.render();
  }

  const curveEditor = new JuiceCurveEditor(
    el('spray-speed-curve-editor'),
    () => spraySpeedCurve,
    (points) => {
      spraySpeedCurve = points;
      spray.speedCurve = spraySpeedCurve;
    },
  );
  writeSprayParams(spray.params);
  syncSprayCurveUi();

  /** Knockback root XZ — stable while squash/rim deform the mesh. */
  function slimeRoot(id: string, out: T.Vector3) {
    const feet = feedback.feetOrigin(id, out);
    if (!feet) return null;
    feet.y = feedback.aimHeight(id);
    return feet;
  }
  function juiceFollowOrigin(id: string, out: T.Vector3) {
    const root = slimeRoot(id, out);
    if (!root) return null;
    root.y += settings.juiceHeight;
    return root;
  }
  juice.resolveFollow = (id, out) => juiceFollowOrigin(id, out);
  spray.resolveFollow = (out) => juiceFollowOrigin('slime', out);
  let juiceSeed = newJuiceSeed();
  let cooldown = 0;
  let rate = 1;
  let yaw = 180;
  let facingDeg = 0;
  let sprayDelay = 0;

  function applyFacing() {
    const rad = (facingDeg * Math.PI) / 180;
    slime.rotation.y = rad;
    // Keep feedback root in sync (TrainingFeedback wraps the same object).
    slime.updateMatrixWorld(true);
  }
  applyFacing();
  /** Directional spray armed at hit start; fires after sprayDelay from live back face. */
  let pendingSpray: { remaining: number } | null = null;
  const sprayOrigin = new T.Vector3();
  const sprayDir = new T.Vector3();

  function emitSprayFromBack() {
    if (!feedback.sprayBackAnchor('slime', sprayOrigin, sprayDir)) return;
    const height = (settings as HitSettings).sprayHeight ?? 0.1;
    sprayOrigin.y += height;
    spray.emit(sprayOrigin, sprayDir);
  }
  let autoLoop = true;
  let playing = true;
  let elapsed = 0;

  function setView(name: 'game' | 'top' | 'side') {
    const map = {
      game: [5.2, 7.2, 5.2],
      top: [0.01, 11, 0.01],
      side: [8, 2.2, 0],
    } as const;
    camera.position.fromArray(map[name]);
    controls.target.set(0, 0.7, 0);
    controls.update();
  }

  function direction() {
    const r = (yaw * Math.PI) / 180;
    // Match spider-viewer / game: sin/cos on XZ
    return dirScratch.set(Math.sin(r), 0, Math.cos(r));
  }

  function fireHit() {
    feedback.reset();
    applyFacing(); // reset() restores initial quaternion; re-apply model facing
    juice.clear();
    spray.clear();
    pendingSpray = null;
    juiceSeed = newJuiceSeed();
    const dir = direction().clone();
    const ok = feedback.hit('slime', { x: dir.x, z: dir.z }, settings);
    if (!ok) {
      el('status').textContent = '受击未生效。';
      return;
    }
    const hitSettings = {
      ...settings,
      juiceEnabled: el<HTMLInputElement>('juiceOn').checked ? 1 : 0,
    } as HitSettings & typeof settings;

    // Emit / follow from knockback root (same anchor as juiceFollowOrigin)
    const emitAt = juiceFollowOrigin('slime', originScratch)?.clone() ?? null;
    if (emitAt && hitSettings.juiceEnabled) {
      if (hitSettings.juiceDelay <= 0) {
        juice.emit(emitAt, hitSettings, 0, juiceSeed, 'slime');
      } else {
        // schedule/update adds juiceHeight — pass root height only
        juice.schedule('slime', hitSettings, (id) => slimeRoot(id, originScratch));
      }
    }

    spray.enabled = el<HTMLInputElement>('sprayOn').checked;
    spray.setDebugDir(el<HTMLInputElement>('sprayDebugDir').checked);
    spray.flatXZ = el<HTMLInputElement>('flat').checked;
    spray.mode = el<HTMLSelectElement>('mode').value as SprayMode;
    spray.params = readSprayParams();
    if(spray.mode==='arterial')spray.jetSpread=spray.params.spreadDeg;
    else spray.fanSpread=spray.params.spreadDeg;
    spray.gravity = -Math.abs(Number(el<HTMLInputElement>('gravity').value));
    const curveIdx = Number(el<HTMLSelectElement>('sprayCurve').value);
    spray.curve = (JUICE_CURVE_IDS[curveIdx] ?? 'easeOutCubic') as JuiceCurveId;
    spray.dragRel = Number(el<HTMLInputElement>('dragRel').value);
    spray.speedCurve = spraySpeedCurve;
    sprayDelay = Number(el<HTMLInputElement>('sprayDelay').value);
    if (spray.enabled) {
      // Model back face center, outward ⊥ face (independent of hit yaw).
      if (sprayDelay <= 0) emitSprayFromBack();
      else pendingSpray = { remaining: sprayDelay };
    }
    cooldown = 1.8;
    elapsed = 0;
    el('clock').textContent = '受击！';
  }

  el('hit').onclick = () => fireHit();
  el('reset').onclick = () => {
    feedback.reset();
    applyFacing();
    juice.clear();
    spray.clear();
    pendingSpray = null;
    el('clock').textContent = '已重置';
  };
  el('loop').onchange = () => {
    autoLoop = el<HTMLInputElement>('loop').checked;
  };
  el('rate').onchange = () => {
    rate = Number(el<HTMLSelectElement>('rate').value) || 1;
  };
  el('yaw').oninput = () => {
    yaw = Number(el<HTMLInputElement>('yaw').value);
    el('yawOut').textContent = `${yaw}°`;
  };
  el('facing').oninput = () => {
    facingDeg = Number(el<HTMLInputElement>('facing').value);
    el('facingOut').textContent = `${facingDeg}°`;
    applyFacing();
  };
  el('sprayDelay').oninput = () => {
    sprayDelay = Number(el<HTMLInputElement>('sprayDelay').value);
    el('sprayDelayOut').textContent = `${sprayDelay.toFixed(2)}s`;
  };
  const bindOut = (id: string, out: string, fmt: (n: number) => string) => {
    el(id).oninput = () => {
      el(out).textContent = fmt(Number(el<HTMLInputElement>(id).value));
    };
  };
  bindOut('count', 'countOut', (n) => String(Math.round(n)));
  bindOut('speed', 'speedOut', (n) => n.toFixed(1));
  bindOut('speedJitter', 'speedJitterOut', (n) => n.toFixed(1));
  bindOut('size', 'sizeOut', (n) => n.toFixed(2));
  bindOut('sizeJitter', 'sizeJitterOut', (n) => n.toFixed(2));
  bindOut('life', 'lifeOut', (n) => `${n.toFixed(2)}s`);
  bindOut('lifeJitter', 'lifeJitterOut', (n) => `${n.toFixed(2)}s`);
  bindOut('spread', 'spreadOut', (n) => String(Math.round(n)));
  bindOut('radius', 'radiusOut', (n) => n.toFixed(2));
  el('mode').onchange = () => {
    const mode = el<HTMLSelectElement>('mode').value as SprayMode;
    spray.applyModePreset(mode);
    writeSprayParams(spray.params);
    fireHit();
  };
  el('preset-mode').onclick = () => {
    const mode = el<HTMLSelectElement>('mode').value as SprayMode;
    spray.applyModePreset(mode);
    writeSprayParams(SPRAY_MODE_PRESETS[mode]);
    fireHit();
  };
  el('flat').onchange = () => {
    spray.flatXZ = el<HTMLInputElement>('flat').checked;
  };
  el('sprayDebugDir').onchange = () => {
    spray.setDebugDir(el<HTMLInputElement>('sprayDebugDir').checked);
  };
  el('gravity').oninput = () => {
    const mag = Number(el<HTMLInputElement>('gravity').value);
    el('gravityOut').textContent = mag.toFixed(1);
    spray.gravity = -Math.abs(mag);
  };
  el('sprayCurve').onchange = () => {
    const idx = Number(el<HTMLSelectElement>('sprayCurve').value);
    spray.curve = (JUICE_CURVE_IDS[idx] ?? 'easeOutCubic') as JuiceCurveId;
    el('spray-speed-curve-editor').hidden = spray.curve !== 'custom';
    if (spray.curve === 'custom') curveEditor.render();
  };
  el('dragRel').oninput = () => {
    spray.dragRel = Number(el<HTMLInputElement>('dragRel').value);
    el('dragRelOut').textContent = spray.dragRel.toFixed(2);
  };
  el('sync-juice-curve').onclick = () => {
    spray.applyCurveSettings(settings);
    spraySpeedCurve = spray.speedCurve.map((p) => ({ ...p }));
    if (!spraySpeedCurve.length) {
      spraySpeedCurve = DEFAULT_JUICE_SPEED_CURVE.map((p) => ({ ...p }));
      spray.speedCurve = spraySpeedCurve;
    }
    syncSprayCurveUi();
    el('status').textContent = '已从汁液曲线同步到方向粒子。';
    fireHit();
  };
  el('view-game').onclick = () => setView('game');
  el('view-top').onclick = () => setView('top');
  el('view-side').onclick = () => setView('side');

  new ResizeObserver(() => {
    const { width, height } = stage.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(1, height);
    camera.updateProjectionMatrix();
  }).observe(stage);

  setView('game');
  fireHit();

  let previous = performance.now();
  renderer.setAnimationLoop((now) => {
    const raw = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    if (!playing) {
      renderer.render(scene, camera);
      return;
    }
    const dt = raw * rate;
    elapsed += dt;
    cooldown = Math.max(0, cooldown - dt);

    feedback.update(dt, settings);
    feedback.animate(dt, settings);
    juice.update(dt, (id) => slimeRoot(id, originScratch));
    juice.prepare(camera, settings);

    if (pendingSpray) {
      pendingSpray.remaining -= dt;
      if (pendingSpray.remaining <= 0) {
        if (spray.enabled) emitSprayFromBack();
        pendingSpray = null;
      }
    }

    spray.update(dt);
    spray.prepare(camera);

    if (autoLoop && cooldown <= 0) fireHit();

    el('clock').textContent = `${elapsed.toFixed(2)}s · CD ${cooldown.toFixed(2)}s · ×${rate}`;
    controls.update();
    renderer.render(scene, camera);
  });

  Object.assign(window, {
    __SLIME_HIT_SPRAY_LAB__: {
      fire: fireHit,
      sprayBackAnchor: (outO?: number[], outD?: number[]) => {
        const o = sprayOrigin.set(0, 0, 0);
        const d = sprayDir.set(0, 0, 0);
        const ok = feedback.sprayBackAnchor('slime', o, d);
        if (outO) { outO[0] = o.x; outO[1] = o.y; outO[2] = o.z; }
        if (outD) { outD[0] = d.x; outD[1] = d.y; outD[2] = d.z; }
        return ok ? { origin: [o.x, o.y, o.z], dir: [d.x, d.y, d.z] } : null;
      },
      snapshot: () => ({
        yaw,
        facingDeg,
        sprayDelay,
        pendingSpray: pendingSpray ? pendingSpray.remaining : null,
        sprayActive: spray.activeCount(),
        sprayRemain: spray.sampleRemain(),
        sprayCurve: spray.curve,
        sprayDragRel: spray.dragRel,
        sprayGravity: spray.gravity,
        sprayFlat: spray.flatXZ,
        sprayDebugDir: spray.debugDir,
        sprayColor: spray.liveColorHex(),
        lastEmit: spray.lastEmit,
        sprayParams: { ...spray.params },
        mode: spray.mode,
        juice: juice.snapshot(),
        feedback: feedback.snapshot(),
      }),
    },
  });
}

main().catch((e) => {
  el('stage').textContent = `预览加载失败：${(e as Error).message}`;
  console.error(e);
});
