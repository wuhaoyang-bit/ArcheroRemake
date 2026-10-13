import './styles.css';
import { ASPECT, DEFAULTS, DESIGN_WIDTH, LIMITS, type SettingKey } from './config.ts';
import { MovementController, wrapAngle } from './controller.ts';
import { GameScene } from './scene.ts';
import { loadSettings, saveSettings } from './settings-store.ts';

const arrow = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 24 24 8M9 8h15v15M7 17l8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const settings: { title: string; items: [SettingKey, string, string, string][] }[] = [
  { title: '轮盘与锚点', items: [
    ['joystickRadius', '摇杆半径', 'px', '以 390 像素宽的竖屏为基准，随游戏视口等比缩放。'],
    ['unlockDistance', '首次解锁距离', 'px', '每次按下或换指后生效。解锁后回到阈值内也不会重新锁定。'],
    ['anchorScale', '地面映射比例', '单位/px', '限制后的摇杆偏移，按同一比例映射到地面两轴。'],
  ] },
  { title: '角色', items: [
    ['moveSpeed', '移动速度', '单位/s', '真正移动时立即使用固定速度，与身体朝向和摇杆幅度无关。'],
    ['turnSpeed', '转向速度', '°/s', '按最短角度转向，松手后仍会继续转完。'],
    ['blendDuration', '动画融合', 's', 'Idle 与 Run 的姿态融合时长，不影响实际位移。'],
    ['runSpeed', 'Run 动画速度', '倍', '独立控制原地跑步与移动时的 Run 播放速度，不改变位移速度、Idle 或融合时长。'],
  ] },
  { title: '房间与镜头', items: [
    ['roomSize', '房间边长', '单位', '调整方形房间的可移动范围。'],
    ['cameraResponse', '跟随响应', '1/s', '越大越快追近。镜头仅纵向跟随，松手后继续收拢。'],
    ['cameraOffset', '脚下目标线', '%', '0 为画面中线，正值向下偏移；镜头保留平滑滞后。'],
    ['viewWidth', '固定视野宽度', '单位', '手动校准构图，游玩中不自动缩放。'],
  ] },
];

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header"><a class="brand" href="./" aria-label="ArcheroRemake 首页"><span class="brand-mark">${arrow}</span><span>Archero<span class="brand-light">Remake</span><small>移动手感试验</small></span></a><span class="edition"><i></i> FIRST PLAYABLE <b>01</b></span></header>
  <main class="workspace">
    <aside class="panel left-panel" data-ui aria-label="参数调试">
      <div class="panel-heading"><div><span class="eyebrow">TUNING</span><h1>找到你的手感<span class="title-dot">.</span></h1></div><button class="icon-button mobile-only" id="close-settings" aria-label="关闭调试面板">×</button></div>
      <div class="settings-scroll">${settings.map(group => `<section class="setting-group"><h2>${group.title}</h2>${group.items.map(([key, name, unit, hint]) => {
        const [min, max, step] = LIMITS[key];
        return `<div class="setting" title="${hint}"><div class="setting-label"><label for="slider-${key}">${name}</label><div class="numeric"><input id="value-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}" aria-label="${name}数值"><span>${unit}</span></div></div><input id="slider-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}" aria-label="${name}"></div>`;
      }).join('')}</section>`).join('')}</div>
      <div class="panel-footer"><div class="store-actions"><button id="save-settings" class="text-button save-button" disabled>保存 JSON <span>↓</span></button><button id="restore" class="text-button" disabled>恢复默认 <span>↺</span></button></div><p id="store-status" role="status" aria-live="polite">正在读取参数…</p><p>参数即时生效 · 像素以 390 宽度为基准</p></div>
    </aside>
    <section class="stage" aria-label="游戏测试区域">
      <div class="viewport" id="viewport">
        <div class="game-top"><div class="game-label"><i></i><span>移动试验场</span></div><button id="open-settings" class="mobile-only" data-ui aria-label="打开调试面板">调参 <span>☷</span></button></div>
        <div class="state-pill"><i></i><span id="game-state">准备中</span></div>
        <div class="joystick" id="joystick" aria-hidden="true"><div class="joystick-ring"><span class="chevron top"></span><span class="chevron right"></span><span class="chevron bottom"></span><span class="chevron left"></span><div class="threshold"></div></div><div class="knob"></div></div>
        <div class="game-hint" id="game-hint">按住任意位置，拖动开始移动</div>
        <div class="loading" id="loading"><span class="loader"></span><strong>正在准备试验场</strong><p>加载角色与 WebGPU 渲染器</p></div>
      </div>
    </section>
    <aside class="panel right-panel" data-ui aria-label="实时状态">
      <div class="panel-heading"><div><span class="eyebrow">LIVE INSPECTOR</span><h2 class="large-heading">每一步，都看得见</h2></div><span class="live-dot"></span></div>
      <section class="status-card"><span class="eyebrow">角色状态</span><strong id="mode-label">待机</strong><div class="state-track"><span data-mode="idle">待机</span><span data-mode="in-place">原地跑步</span><span data-mode="moving">移动</span></div></section>
      <dl class="telemetry"><div><dt>当前控制点</dt><dd id="pointer-label">—</dd></div><div><dt>摇杆锁定</dt><dd id="lock-label">—</dd></div><div><dt>摇杆偏移</dt><dd id="stick-label">0.0 / 0.0</dd></div><div><dt>锚点偏移</dt><dd id="anchor-label">0.00 / 0.00</dd></div><div><dt>角色坐标</dt><dd id="position-label">0.00 / 0.00</dd></div><div><dt>剩余转角</dt><dd id="angle-label">0.0°</dd></div><div><dt>镜头纵向差</dt><dd id="camera-label">0.000</dd></div></dl>
      <section class="blend-meter"><div><span>Idle</span><span id="blend-label">100% / 0%</span><span>Run</span></div><div class="meter"><i id="blend-fill"></i></div></section>
      <section class="guide"><span class="eyebrow">试试这些动作</span><div><b>01</b><p>轻按，微微拖动<small>阈值内原地跑步，摇杆保持居中</small></p></div><div><b>02</b><p>越过阈值，再回拉<small>解锁后持续移动，不再重复解锁</small></p></div><div><b>03</b><p>手机上，用第二指接管<small>移动延续，新摇杆等待首次解锁</small></p></div></section>
      <div class="renderer-info"><span><i></i> WEBGPU</span><span id="fps-label">— FPS</span></div>
    </aside>
  </main>
  <footer class="app-footer"><span>ARCHEROREMAKE / V0.1</span><span>鼠标拖动 · 手机触摸</span><span>THREE.JS + WEBGPU</span></footer>`;

const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const viewport = element('viewport'), stage = document.querySelector<HTMLElement>('.stage')!;
const joystick = element('joystick'), knob = joystick.querySelector<HTMLElement>('.knob')!;
const controller = new MovementController();
const game = new GameScene(viewport, controller);
const modeNames = { idle: '待机', 'in-place': '原地跑步', moving: '移动中' };
let ready = false, uiTime = 0, frameCount = 0, fpsTime = 0, lastFrame = 0, viewScale = 1;
let savedSettings = '', saving = false;
const saveButton = element<HTMLButtonElement>('save-settings');
const storeStatus = element('store-status');
document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => { input.disabled = true; });

function showStoreStatus(message: string, error = false) {
  storeStatus.textContent = message;
  storeStatus.classList.toggle('store-error', error);
}
function settingsChanged() {
  showStoreStatus(saving ? '保存中…另有新修改' : JSON.stringify(controller.settings) === savedSettings ? '与已保存参数一致' : '有未保存的修改');
}

function layout() {
  const rect = stage.getBoundingClientRect();
  const width = Math.min(rect.width, rect.height * ASPECT);
  viewport.style.width = `${width}px`; viewport.style.height = `${width / ASPECT}px`;
  viewScale = width / DESIGN_WIDTH;
  joystick.style.setProperty('--scale', `${viewScale}`);
  game.resize(); drawJoystick();
}
new ResizeObserver(layout).observe(stage);

function drawJoystick() {
  const rect = viewport.getBoundingClientRect(), active = controller.pointerId !== null;
  const x = active ? controller.center.x - rect.left : rect.width / 2;
  const y = active ? controller.center.y - rect.top : rect.height * 0.846;
  joystick.style.left = `${x}px`; joystick.style.top = `${y}px`;
  joystick.style.setProperty('--radius', `${controller.settings.joystickRadius}px`);
  joystick.style.setProperty('--threshold', `${controller.settings.unlockDistance}px`);
  joystick.classList.toggle('active', active); joystick.classList.toggle('unlocked', controller.unlocked);
  knob.style.transform = `translate(calc(-50% + ${controller.stick.x}px), calc(-50% + ${controller.stick.y}px))`;
  element('game-hint').classList.toggle('hidden', active);
}

function captureRelease() {
  const id = controller.pointerId;
  controller.cancel();
  if (id !== null && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  drawJoystick(); updateTelemetry();
}

viewport.addEventListener('pointerdown', event => {
  if (!ready || (event.target as HTMLElement).closest('[data-ui]')) return;
  if (event.pointerType !== 'mouse' && event.pointerType !== 'touch') return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  controller.press(event.pointerId, event.clientX, event.clientY);
  viewport.setPointerCapture(event.pointerId);
  drawJoystick(); updateTelemetry();
});
viewport.addEventListener('pointermove', event => {
  if (event.pointerId !== controller.pointerId) return;
  event.preventDefault();
  // Pointer capture preserves control outside the portrait viewport.
  controller.move(event.pointerId, (event.clientX - controller.center.x) / viewScale, (event.clientY - controller.center.y) / viewScale);
  drawJoystick();
});
function endPointer(event: PointerEvent) {
  if (event.pointerId !== controller.pointerId) return;
  captureRelease();
}
viewport.addEventListener('pointerup', endPointer);
viewport.addEventListener('pointercancel', endPointer);
viewport.addEventListener('lostpointercapture', endPointer);
viewport.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', captureRelease);
document.addEventListener('visibilitychange', () => { if (document.hidden) captureRelease(); lastFrame = 0; });

function syncSettings() {
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => {
    const key = input.dataset.setting as SettingKey, value = controller.settings[key];
    input.value = String(value);
    const [min, max] = LIMITS[key]; input.style.setProperty('--fill', `${(value - min) / (max - min) * 100}%`);
  });
  drawJoystick();
}
document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => {
  input.addEventListener(input.type === 'range' ? 'input' : 'change', () => {
    controller.set(input.dataset.setting as SettingKey, input.valueAsNumber);
    syncSettings(); settingsChanged();
  });
});
element('restore').addEventListener('click', () => {
  for (const key of Object.keys(DEFAULTS) as SettingKey[]) controller.set(key, DEFAULTS[key]);
  syncSettings(); settingsChanged();
});
saveButton.addEventListener('click', async () => {
  if (saving) return;
  const snapshot = { ...controller.settings };
  saving = true; saveButton.disabled = true; showStoreStatus('保存中…');
  try {
    await saveSettings(snapshot);
    savedSettings = JSON.stringify(snapshot);
    showStoreStatus(JSON.stringify(controller.settings) === savedSettings ? '已写入 params.json' : '已保存；另有新修改未保存');
  } catch (error) {
    showStoreStatus(`保存失败：${error instanceof Error ? error.message : '请重试'}`, true);
  } finally { saving = false; saveButton.disabled = false; }
});
element('open-settings').addEventListener('click', () => document.body.classList.add('settings-open'));
element('close-settings').addEventListener('click', () => document.body.classList.remove('settings-open'));

function updateTelemetry() {
  element('mode-label').textContent = element('game-state').textContent = modeNames[controller.mode];
  viewport.dataset.mode = controller.mode;
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach(node => node.classList.toggle('selected', node.dataset.mode === controller.mode));
  element('pointer-label').textContent = controller.pointerId === null ? '—' : `#${controller.pointerId}`;
  element('lock-label').textContent = controller.pointerId === null ? '等待按下' : controller.unlocked ? '已解锁' : '已锁定';
  element('stick-label').textContent = `${controller.stick.x.toFixed(1)} / ${controller.stick.y.toFixed(1)}`;
  element('anchor-label').textContent = `${controller.offset.x.toFixed(2)} / ${controller.offset.z.toFixed(2)}`;
  element('position-label').textContent = `${controller.position.x.toFixed(2)} / ${controller.position.z.toFixed(2)}`;
  element('angle-label').textContent = `${(Math.abs(wrapAngle(controller.targetHeading - controller.heading)) * 180 / Math.PI).toFixed(1)}°`;
  element('camera-label').textContent = (controller.position.z - game.cameraZ).toFixed(3);
  const weight = Math.round(game.blend.weight * 100);
  element('blend-label').textContent = `${100 - weight}% / ${weight}%`;
  element('blend-fill').style.width = `${weight}%`;
}

function frame(time: number) {
  // Discard suspension gaps; normal motion uses bounded substeps, independent of display rate.
  let remaining = lastFrame ? Math.min((time - lastFrame) / 1000, 0.1) : 0;
  lastFrame = time;
  const dt = remaining;
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    controller.update(step); game.sync(step); remaining -= step;
  }
  game.render();
  uiTime += dt; fpsTime += dt; frameCount++;
  if (uiTime >= 0.08) { updateTelemetry(); uiTime = 0; }
  if (fpsTime >= 0.5) { element('fps-label').textContent = `${Math.round(frameCount / fpsTime)} FPS`; fpsTime = 0; frameCount = 0; }
}

async function start() {
  layout(); syncSettings();
  try {
    const loaded = await loadSettings();
    for (const key of Object.keys(DEFAULTS) as SettingKey[]) controller.set(key, loaded[key]);
    savedSettings = JSON.stringify(controller.settings);
    showStoreStatus('已读取 params.json');
  } catch (error) {
    showStoreStatus(`${error instanceof Error ? error.message : '读取失败'}，暂用默认值`, true);
  }
  // Saved tuning never restores a previous game session or its anchor memory.
  controller.position = { x: 0, z: controller.settings.roomSize * 0.27 };
  game.cameraZ = controller.position.z;
  syncSettings();
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => { input.disabled = false; });
  element<HTMLButtonElement>('restore').disabled = false; saveButton.disabled = false;
  try {
    await game.init();
    ready = true; element('loading').remove(); updateTelemetry();
    game.renderer.setAnimationLoop(frame);
    if (import.meta.env.DEV) {
      Object.assign(window, { __ARCHERO__: {
        snapshot: () => ({ ...controller.snapshot(), settings: { ...controller.settings }, center: { ...controller.center }, cameraZ: game.cameraZ, cameraX: game.camera.position.x, footNdc: game.player.position.clone().project(game.camera).toArray(), anchorNdc: game.anchor.position.clone().project(game.camera).toArray(), runWeight: game.blend.weight, runTime: game.run.time, runTimeScale: game.run.getEffectiveTimeScale(), idleTimeScale: game.idle.getEffectiveTimeScale(), renderer: 'webgpu', ready }),
      } });
    }
  } catch (error) {
    console.error(error);
    const loading = element('loading'); loading.replaceChildren(); loading.classList.add('load-error');
    const title = document.createElement('strong'); title.textContent = '暂时无法进入试验场';
    const description = document.createElement('p'); description.textContent = error instanceof Error ? error.message : '加载失败，请刷新重试。';
    const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.onclick = () => location.reload();
    loading.append(title, description, retry);
    element('game-state').textContent = '未就绪';
  }
}
void start();
