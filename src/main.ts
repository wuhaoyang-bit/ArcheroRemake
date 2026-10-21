import { HIT_CONTROLS } from './hit-feedback-config.ts';
import { ProgressCurveEditor } from './progress-curve-editor.ts';
import { AnchorCurveEditor } from './anchor-curve-editor.ts';
import { TurnCurveEditor } from './turn-curve-editor.ts';
import './styles.css';
import { ASPECT, DEFAULTS, DESIGN_WIDTH, LIMITS, type SettingKey } from './config.ts';
import { MovementController, wrapAngle } from './controller.ts';
import { GameScene } from './scene.ts';
import { loadSettings, saveSettings } from './settings-store.ts';
import { SettingsHistory } from './settings-history.ts';
import type { Settings } from './config.ts';

const arrow = '<svg viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M8 24 24 8M9 8h15v15M7 17l8 8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const settings: { title: string; items: [SettingKey, string, string, string][] }[] = [
  { title: '轮盘与锚点', items: [
    ['joystickRadius', '摇杆半径', 'px', '以 390 像素宽的竖屏为基准，随游戏视口等比缩放。'],
    ['unlockDistance', '移动阈值（首次解锁）', 'px', '每次按下或换指后生效。解锁后回到阈值内也不会重新锁定。'],
    ['anchorScale', '地面映射比例', '单位/px', '限制后的摇杆偏移，按同一比例映射到地面两轴。'],
  ] },
  { title: '角色', items: [
    ['moveSpeed', '基础移动速度', '单位/s', '恒速模型直接使用；曲线模型乘以当前角度差对应的速度百分比。移动方向始终由实际锚点决定。'],
    ['turnSpeed', '匀速转向速度', '°/s', '仅匀速模型使用；保留原有固定角速度实验参数。'],
    ['curveSnapAngle', '曲线到位角度阈值', '°', '仅自定义曲线使用；到位时对齐目标。'],
    ['slerpResponse', 'Slerp 追赶系数', '1/s', '每步插值比例 = 系数 × dt，限制到 0～1。默认按 60 FPS、120 Hz 子步，第 9 帧到位校准。'],
    ['slerpSnapAngle', 'Slerp 到位阈值', '°', '剩余角度进入阈值后对齐目标；不改变锚点。'],
    ['smoothTime', 'SmoothDampAngle 平滑时间', 's', '越小越快；不是固定完成时长。默认 0.03039 秒。'],
    ['smoothSnapAngle', 'SmoothDampAngle 到位阈值', '°', '到位后清零角速度；松手仍继续转身。反向时清除反向惯性，以保持既定最短路径。'],
    ['blendDuration', '动画融合', 's', 'Idle、Run 与射箭动作的姿态融合时长，不影响实际位移；按下轮盘会立即打断射箭并切回 Run。'],
    ['runSpeed', 'Run 动画速度', '倍', '独立控制原地跑步与移动时的 Run 播放速度，不改变位移速度、Idle 或融合时长。'],
  ] },
  { title: '弓与箭', items: [
    ['bowScale', '弓缩放', '倍', '以握把为中心调整弓的大小，保留拉弓与回弹动作。'],
    ['arrowSpeed', '箭飞行速度', '单位/s', '调整箭的匀速飞行速度，立即作用于飞行中的箭；不改变射箭动作频率。'],
    ['arrowScale', '箭缩放', '倍', '调整箭的大小，立即生效，飞行速度保持不变。'],
  ] },
  { title: '锁定训练场 · 受击反馈', items: HIT_CONTROLS },
  { title: '房间与镜头', items: [
    ['roomSize', '房间宽度', '单位', '调整横向可移动范围。'],
    ['roomLength', '房间纵向长度', '单位', '调整画面上下方向的可移动范围，独立于宽度。'],
    ['cameraResponse', '跟随响应', '1/s', '越大越快追近。镜头仅纵向跟随，松手后继续收拢。'],
    ['cameraOffset', '脚下目标线', '%', '0 为画面中线，正值向下偏移；镜头保留平滑滞后。'],
    ['viewWidth', '固定视野宽度', '单位', '手动校准构图，游玩中不自动缩放。'],
  ] },
  { title: '目标锁定', items: [
    ['lockRange', '锁定距离', '单位', '双方脚下中心的地面距离；屏幕外也参与选敌。'],
    ['targetCone', '方向扇形总角度', '°', 'B / C 使用，左右各占一半角度；方向取实际移动锚点。'],
    ['targetAdvantage', 'C：切换角度优势', '°', '新候选比旧目标更贴合锚点方向，优势达到此值才开始累计时间。'],
    ['targetDwell', 'C：候选持续时间', 'ms', '同一候选连续满足优势的时间。松手归零；旧目标失效立即重选。'],
  ] },
  { title: '锁定圆环 UI', items: [
    ['ringPlayerDiameter', '角色圆直径', 'px', '390 宽基准；下一次入场生效。'],
    ['ringTargetDiameter', '目标圆最终直径', 'px', '390 宽基准；下一次入场生效。'],
    ['ringPlayerStroke', '角色圆线宽', 'px', '下一次入场生效。'],
    ['ringTargetStroke', '目标圆基础线宽', 'px', '实际粗细由下方粗细曲线倍率决定；下一次入场生效。'],
    ['ringPlayerHeight', '角色圆心高度', '单位', '脚下向上固定高度，不受动画影响；下一次入场生效。'],
    ['ringTargetHeight', '目标圆心高度', '单位', '假人脚下向上固定高度；下一次入场生效。'],
    ['ringWaveDuration', '冲击波扩散时长', 's', '下一次锁定入场生效。'],
    ['ringWaveDistance', '冲击波扩散距离', 'px', '额外半径，390 宽基准；0 关闭。下一次入场生效。'],
    ['ringWaveStroke', '冲击波初始粗细', 'px', '随扩散完成度逐渐减至 0；下一次入场生效。'],
    ['ringSwitchDuration', '换目标动画时长', 's', '控制整段扩张收紧的速度；下一次入场生效。'],
    ['ringSwitchAmount', '换目标额外放大幅度', '%', '30% 表示最大尺寸为正常的 130%；0 关闭脉冲。下一次入场生效。'],
    ['ringDuration', '收缩时长', 's', '下一次入场生效。'],
    ['ringLinkThreshold', '连线出现完成度', '%', '收缩完成度达到此值时显示圆外连线；下一次入场生效。'],
    ['ringLinkStroke', '连线粗细', 'px', '390 宽基准像素；下一次入场生效。'],
  ] },
  { title: '旋转角速度－锁定', items: [
    ['lockTurnSpeed', '锁定：匀速转向速度', '°/s', '待机或原地跑步时，朝锁定敌人转向所用的速度。'],
    ['lockCurveSnapAngle', '锁定：曲线到位阈值', '°', '锁定自定义曲线的到位角差。'],
    ['lockSlerpResponse', '锁定：Slerp 追赶系数', '1/s', '独立于普通转向的 Slerp 参数。'],
    ['lockSlerpSnapAngle', '锁定：Slerp 到位阈值', '°', '进入此角差后对齐敌人方向。'],
    ['lockSmoothTime', '锁定：平滑时间', 's', 'SmoothDampAngle 的平滑时间，越小追赶越快。'],
    ['lockSmoothSnapAngle', '锁定：平滑到位阈值', '°', '到位后对齐方向并清零角速度。'],
  ] },
];

const targetingControls = `<div class="turn-model-field"><label for="target-model">选敌模型</label><select id="target-model" disabled><option value="0">A · 最近目标</option><option value="1">B · 方向扇形</option><option value="2">C · 方向＋保留条件</option></select><p id="target-model-hint" class="threshold-help"></p></div><label class="threshold-toggle"><input id="show-lock-range" type="checkbox" disabled>显示锁定距离范围</label><p class="threshold-help">锁定训练场中，首次按下开始选敌；待机或原地跑步时身体朝敌人转向，真正移动时朝移动锚点转向。红圈为当前目标，浅色圈为 C 待确认候选。</p>`;
const lockTurnControls = `<div class="turn-model-field"><label for="lock-turn-model">锁定转向模型</label><select id="lock-turn-model" disabled><option value="0">匀速转向</option><option value="2">自定义转向曲线</option><option value="5">Slerp</option><option value="6">SmoothDampAngle</option></select><p class="threshold-help">待机或原地跑步且有目标时使用；真正移动时使用普通转向。两套配置分别保存。旧参数首次加载时复制当前普通转向配置。</p><div id="lock-turn-curve-editor" hidden></div></div>`;

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="app-header"><a class="brand" href="./" aria-label="ArcheroRemake 首页"><span class="brand-mark">${arrow}</span><span>Archero<span class="brand-light">Remake</span><small>移动手感试验</small></span></a><span class="edition"><i></i> FIRST PLAYABLE <b>01</b></span></header>
  <main class="workspace">
    <aside class="panel left-panel" data-ui aria-label="参数调试">
      <div class="panel-heading"><div><span class="eyebrow">TUNING</span><h1>找到你的手感<span class="title-dot">.</span></h1></div><button class="icon-button mobile-only" id="close-settings" aria-label="关闭调试面板">×</button></div>
      <div class="settings-scroll">${settings.map(group => `<section class="setting-group"><h2>${group.title}</h2>${group.title === '目标锁定' ? targetingControls : group.title === '旋转角速度－锁定' ? lockTurnControls : ''}${group.title === '角色' ? '<div class="turn-model-field"><label for="turn-model">旋转角速度模型</label><select id="turn-model" disabled><option value="0">匀速转向</option><option value="2">自定义转向曲线</option><option value="5">Slerp</option><option value="6">SmoothDampAngle</option></select><p id="turn-model-hint" class="threshold-help"></p><div id="turn-curve-editor" hidden></div></div>' : ''}${group.items.map(([key, name, unit, hint]) => {
        const [min, max, step] = LIMITS[key];
        return `<div class="setting" title="${hint}"><div class="setting-label"><label for="slider-${key}">${name}</label><div class="numeric"><input id="value-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}" aria-label="${name}数值"><span>${unit}</span></div></div><input id="slider-${key}" data-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULTS[key]}" aria-label="${name}"></div>`;
      }).join('')}${group.title === '锁定圆环 UI' ? '<p class="threshold-help">以下曲线及本组全部参数在下一次锁定入场生效。换目标沿用当前值；失去全部目标后重新锁定才应用新值。</p><div id="ring-curve-editor"></div><h3>冲击波扩散 / 时间进度</h3><div id="ring-wave-editor"></div><h3>换目标扩张 / 时间进度</h3><div id="ring-switch-editor"></div><h3>连线粗细 / 攻击动画进度</h3><div id="link-attack-editor"></div><h3>目标圆粗细 / 收缩完成度</h3><div id="ring-stroke-editor"></div><div id="ring-preview" class="ring-preview"><label for="ring-preview-progress">收缩预览 <output id="ring-preview-label">未锁定</output></label><input id="ring-preview-progress" type="range" min="0" max="100" step="0.1" value="0" disabled><button id="ring-preview-resume" disabled>恢复自动播放</button><p class="threshold-help">有锁定目标时可拖动。拖后停留在指定完成度，换目标保留预览；丢锁退出。仅改变圆环，不影响角色操作。参数修改仍在下一次入场生效。</p></div>' : ''}${group.title === '轮盘与锚点' ? '<label class="threshold-toggle"><input id="show-threshold" type="checkbox">显示移动阈值范围</label><p class="threshold-help">黄圈为首次解锁边界，越过后变青色；回圈内不会再次锁定。</p>' : ''}</section>`).join('')}<section class="setting-group"><h2>移动速度模型</h2><div class="turn-model-field"><label for="move-model">移动速度模型</label><select id="move-model" disabled><option value="0">恒定移动速度</option><option value="1">角度差曲线</option></select><p class="threshold-help">身体与实际锚点方向的最短角度差 → 基础移动速度百分比。100% 保持当前速度，80% 为当前速度的八成。默认全程 100%。</p></div><div id="move-curve-editor" hidden></div></section><section class="setting-group"><h2>锚点防抖</h2><label class="threshold-toggle"><input id="anchor-follow" type="checkbox">启用锚点跟随</label><div id="anchor-curve-editor"></div></section><section class="setting-group"><h2>朝向调试</h2><label class="threshold-toggle"><input id="show-heading" type="checkbox">显示角色朝向线</label><label class="threshold-toggle debug-toggle"><input id="show-idle-anchor" type="checkbox">待机时也显示移动锚点</label><label class="threshold-toggle debug-toggle"><input id="show-anchor-outline" type="checkbox">锚点遮挡轮廓</label><p class="threshold-help">粉红直线代表角色当前朝向；蓝点代表移动锚点；遮挡轮廓让浅蓝圆环透过角色显示。开关仅用于本次页面调试。</p></section></div>
      <div class="panel-footer"><div class="store-actions"><button id="save-settings" class="text-button save-button" disabled>保存 JSON <span>↓</span></button><button id="undo-settings" class="text-button" disabled>撤回</button><button id="restore" class="text-button" disabled>撤回全部</button></div><p id="store-status" role="status" aria-live="polite">正在读取参数…</p><p>圆环参数下次入场生效 · 其余即时生效 · 390 宽基准</p></div>
    </aside>
    <section class="stage" aria-label="游戏测试区域">
      <div class="viewport" id="viewport">
        <div class="game-top"><div class="game-label"><i></i><span id="training-label">移动试验场</span></div><div class="training-actions"><div class="training-arena-buttons"><button id="reset-dummies" class="training-arena-button" data-ui hidden>重置假人</button><button id="switch-training" class="training-arena-button" data-ui aria-pressed="false" disabled>障碍物训练场</button><button id="switch-locking-training" class="training-arena-button" data-ui aria-pressed="false" disabled>锁定训练场</button></div><button id="open-settings" class="mobile-only" data-ui aria-label="打开调试面板">调参 <span>☷</span></button></div></div><div id="targeting-hud" class="targeting-hud" hidden></div><div id="training-result" role="status" aria-live="polite" hidden></div>
        <div class="state-pill"><i></i><span id="game-state">准备中</span></div>
        <div class="joystick" id="joystick" aria-hidden="true"><div class="joystick-ring"><span class="chevron top"></span><span class="chevron right"></span><span class="chevron bottom"></span><span class="chevron left"></span></div><div class="knob"></div><div class="threshold"></div></div>
        <div class="game-hint" id="game-hint">按住任意位置，拖动开始移动</div>
        <div class="loading" id="loading"><span class="loader"></span><strong>正在准备试验场</strong><p>加载角色与 WebGPU 渲染器</p></div>
      </div>
    </section>
    <aside class="panel right-panel" data-ui aria-label="实时状态">
      <div class="panel-heading"><div><span class="eyebrow">LIVE INSPECTOR</span><h2 class="large-heading">每一步，都看得见</h2></div><span class="live-dot"></span></div>
      <section class="status-card"><span class="eyebrow">角色状态</span><strong id="mode-label">待机</strong><div class="state-track"><span data-mode="idle">待机</span><span data-mode="in-place">原地跑步</span><span data-mode="moving">移动</span></div></section>
      <dl class="telemetry"><div><dt>当前控制点</dt><dd id="pointer-label">—</dd></div><div><dt>摇杆锁定</dt><dd id="lock-label">—</dd></div><div><dt>摇杆偏移</dt><dd id="stick-label">0.0 / 0.0</dd></div><div><dt>角色朝向</dt><dd id="heading-label">0.0°</dd></div><div><dt>锚点方向</dt><dd id="anchor-heading-label">—</dd></div><div><dt>锚点相对 X / Z</dt><dd id="anchor-label">0.00 / 0.00</dd></div><div><dt>目标锚点 X / Z</dt><dd id="target-anchor-label">0.00 / 0.00</dd></div><div><dt>锚点跟随距离差</dt><dd id="anchor-gap-label">0.000</dd></div><div><dt>角色坐标</dt><dd id="position-label">0.00 / 0.00</dd></div><div><dt>转向模型</dt><dd id="turn-model-label">匀速</dd></div><div><dt>移动计算角度差</dt><dd id="move-angle-label">—</dd></div><div><dt>移动速度倍率</dt><dd id="move-ratio-label">—</dd></div><div><dt>速度减少</dt><dd id="move-reduction-label">—</dd></div><div><dt>移动指令速度</dt><dd id="move-speed-label">0.00 单位/s</dd></div><div><dt>实际角速度</dt><dd id="angular-speed-label">0.0°/s</dd></div><div><dt>当前角度差</dt><dd id="angle-label">0.0°</dd></div><div><dt>镜头纵向差</dt><dd id="camera-label">0.000</dd></div><div><dt>选敌状态</dt><dd id="targeting-state-label">—</dd></div><div><dt>选敌模型</dt><dd id="targeting-model-label">A · 最近</dd></div><div><dt>锁定目标</dt><dd id="target-label">无</dd></div><div><dt>目标距离 / 范围</dt><dd id="target-distance-label">—</dd></div><div><dt>待确认候选</dt><dd id="candidate-label">无</dd></div><div><dt>当前转向配置</dt><dd id="turn-context-label">普通转向</dd></div></dl>
      <p class="threshold-help">角度：上 0°、右 90°、下 180°、左 270°。相对坐标为地面单位，X 向右、Z 向下。移动计算角度差为本步转身前的采样值；速度减少仅统计曲线减速，不含碰墙或松手停止。</p>
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
const ringEditor = new ProgressCurveEditor(element('ring-curve-editor'), () => controller.settings.ringCurve, points => {
  controller.setRingCurve(points); settingsChanged();
});
const waveEditor=new ProgressCurveEditor(element('ring-wave-editor'),()=>controller.settings.ringWaveCurve,points=>{controller.setRingWaveCurve(points);settingsChanged();},false,false,false,true);
const switchEditor=new ProgressCurveEditor(element('ring-switch-editor'),()=>controller.settings.ringSwitchCurve,points=>{controller.setRingSwitchCurve(points);settingsChanged();},false,false,true);
const strokeEditor = new ProgressCurveEditor(element('ring-stroke-editor'),
  () => controller.settings.ringStrokeCurve.map(p=>({time:p.completion,progress:p.width})),points=>{
    controller.setRingStrokeCurve(points.map(p=>({completion:p.time,width:p.progress})));settingsChanged();
  },true);
const linkAttackEditor=new ProgressCurveEditor(element('link-attack-editor'),
  ()=>controller.settings.ringLinkAttackCurve.map(p=>({time:p.completion,progress:p.width})),points=>{
    controller.setRingLinkAttackCurve(points.map(p=>({completion:p.time,width:p.progress})));settingsChanged();
  },true,true);
const previewSlider=element<HTMLInputElement>('ring-preview-progress');
previewSlider.addEventListener('input',()=>{game.rings.state.seek(previewSlider.valueAsNumber/100);game.sync(0);});
element('ring-preview-resume').addEventListener('click',()=>game.rings.state.resume());
const curveEditor = new TurnCurveEditor(element('turn-curve-editor'), () => controller.settings, points => {
  controller.setCurve(points); settingsChanged();
}, () => { controller.set('curveSnapAngle', DEFAULTS.curveSnapAngle); syncSettings(); settingsChanged(); });
const lockCurveEditor = new TurnCurveEditor(element('lock-turn-curve-editor'), () => ({turnCurve: controller.settings.lockTurnCurve}), points => {
  controller.setLockCurve(points); settingsChanged();
}, () => { controller.set('lockCurveSnapAngle', DEFAULTS.lockCurveSnapAngle); syncSettings(); settingsChanged(); }, {
  title: '锁定转向速度曲线', speedLabel: '角速度', unit: '°/s', defaults: DEFAULTS.lockTurnCurve,
  warning: '存在非零角度的零速度点：锁定转向可能停在该角度。',
});
const smoothPreviews = ['turn', 'lock-turn'].map((prefix, i) => {
  const select = element<HTMLSelectElement>(prefix + '-model');
  select.add(new Option('自定义转向曲线－二阶平滑', '7'));
  const root = document.createElement('div');
  root.id = prefix + '-smooth-preview'; root.hidden = true;
  element(prefix + '-curve-editor').after(root);
  return new TurnCurveEditor(root, () => ({turnCurve: i ? controller.settings.lockTurnCurve : controller.settings.turnCurve}),
    () => {}, () => {}, {title: i ? '锁定转向速度曲线' : '转向速度曲线', speedLabel: '角速度', unit: '°/s',
      defaults: DEFAULTS.turnCurve, warning: '存在非零角度的零速度点：转向不会越过该点。'}, true);
});
const anchorEditor = new AnchorCurveEditor(element('anchor-curve-editor'), () => controller.settings.anchorCurve, points => {
  controller.setAnchorCurve(points); settingsChanged();
});
element('anchor-follow').addEventListener('change', () => {
  controller.set('anchorFollow', element<HTMLInputElement>('anchor-follow').checked ? 1 : 0);
  syncSettings(); settingsChanged();
});
const moveEditor = new TurnCurveEditor(element('move-curve-editor'), () => ({turnCurve:controller.settings.moveCurve}), points => {
  controller.setMoveCurve(points); settingsChanged();
}, () => { syncSettings(); settingsChanged(); }, {
  title:'移动速度 / 角度差曲线',speedLabel:'移动速度',unit:'%',defaults:DEFAULTS.moveCurve,
  warning:'存在非零角度的零速度点：该角度下停止位移，但身体仍会转向。',
});
element('move-model').addEventListener('change', () => {
  controller.set('moveModel', Number(element<HTMLSelectElement>('move-model').value));
  syncSettings(); settingsChanged();
});
const modeNames = { idle: '待机', 'in-place': '原地跑步', moving: '移动中' };
let ready = false, uiTime = 0, frameCount = 0, fpsTime = 0, lastFrame = 0, viewScale = 1;
let history: SettingsHistory | undefined, saving = false;
const saveButton = element<HTMLButtonElement>('save-settings');
const storeStatus = element('store-status');
document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => { input.disabled = true; });

function showStoreStatus(message: string, error = false) {
  storeStatus.textContent = message;
  storeStatus.classList.toggle('store-error', error);
}
function settingsChanged() {
  smoothPreviews.forEach(preview => preview.render());
  history?.record(controller.settings);
  updateHistoryButtons();
  showStoreStatus(saving ? '保存中…另有新修改' : history?.dirty ? '有未保存的修改' : '与基准参数一致');
}
function updateHistoryButtons() {
  element<HTMLButtonElement>('undo-settings').disabled = !history?.canUndo;
  element<HTMLButtonElement>('restore').disabled = !history?.dirty;
}

// Group continuous pointer/keyboard edits, including graphs in body-level dialogs.
let editPointer: number | null = null;
const dragControl = (target: EventTarget | null) => target instanceof Element
  && !!target.closest('[data-setting][type="range"], .curve-graph');
document.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !dragControl(event.target)) return;
  history?.end(); history?.begin(); editPointer = event.pointerId;
}, true);
function endEdit(event?: PointerEvent) {
  if (event && event.pointerId !== editPointer) return;
  history?.end(); editPointer = null; updateHistoryButtons();
}
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
  window.addEventListener(type, endEdit);
}
window.addEventListener('blur', () => endEdit());
document.addEventListener('visibilitychange', () => { if (document.hidden) endEdit(); });
document.addEventListener('keydown', event => {
  if (dragControl(event.target) && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) history?.begin();
}, true);
document.addEventListener('keyup', () => { if (editPointer === null) endEdit(); });
document.addEventListener('focusout', () => { if (editPointer === null) endEdit(); });
// One button action may update both a curve and its arrival threshold.
document.addEventListener('click', event => {
  if (!(event.target instanceof Element) || !event.target.closest('[data-curve="generate"]')) return;
  history?.begin();
}, true);
document.addEventListener('click', event => {
  if (event.target instanceof Element && event.target.closest('[data-curve="generate"]')) endEdit();
});

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
  joystick.classList.toggle('show-threshold', !!controller.settings.showThreshold);
  joystick.classList.toggle('active', active); joystick.classList.toggle('unlocked', controller.unlocked);
  knob.style.transform = `translate(calc(-50% + ${controller.stick.x}px), calc(-50% + ${controller.stick.y}px))`;
  element('game-hint').classList.toggle('hidden', active);
}

function captureRelease(finalInput?: { x: number; y: number }, id = controller.pointerId, reason: 'pointerup' | 'cancel' = 'cancel') {
  if (id !== null) controller.release(id, finalInput, reason);
  else controller.cancel();
  if (id !== null && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
  drawJoystick(); updateTelemetry();
}

let resultTimer: ReturnType<typeof setTimeout> | undefined;
function switchTraining(training: MovementController['training']) {
  captureRelease();
  controller.setTraining(training);
  game.rings.reset();
  game.cameraZ = controller.position.z;
  clearTimeout(resultTimer); element('training-result').hidden = true;
  const obstacles = training === 'obstacles', locking = training === 'locking';
  element('reset-dummies').hidden=!locking;
  element('training-label').textContent = obstacles ? '障碍物训练场' : locking ? '锁定训练场' : '移动试验场';
  element('switch-training').textContent = obstacles ? '返回普通训练场' : '障碍物训练场';
  element('switch-locking-training').textContent = locking ? '返回普通训练场' : '锁定训练场';
  element('switch-training').setAttribute('aria-pressed', String(obstacles));
  element('switch-locking-training').setAttribute('aria-pressed', String(locking));
  element('game-hint').textContent = obstacles ? '沿曲线依次经过白圈 · 通过后变绿'
    : locking ? '原地跑步朝目标 · 松手射箭 · 拖动移动' : '按住任意位置，拖动开始移动';
  game.sync(0); drawJoystick(); updateTelemetry();
}
element('reset-dummies').addEventListener('click',()=>{if(ready){game.resetDummies();updateTelemetry();}});
element('switch-training').addEventListener('click', () => {
  switchTraining(controller.training === 'obstacles' ? 'free' : 'obstacles');
});
element('switch-locking-training').addEventListener('click', () => {
  switchTraining(controller.training === 'locking' ? 'free' : 'locking');
});

viewport.addEventListener('pointerdown', event => {
  if (!ready || (event.target as HTMLElement).closest('[data-ui]')) return;
  if (event.pointerType !== 'mouse' && event.pointerType !== 'touch') return;
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  controller.press(event.pointerId, event.clientX, event.clientY);
  viewport.setPointerCapture(event.pointerId);
  drawJoystick(); updateTelemetry();
});
function updatePointerPosition(event: PointerEvent) {
  // Pointer capture preserves control outside the portrait viewport.
  controller.move(event.pointerId, (event.clientX - controller.center.x) / viewScale, (event.clientY - controller.center.y) / viewScale);
}
viewport.addEventListener('pointermove', event => {
  if (event.pointerId !== controller.pointerId) return;
  event.preventDefault();
  updatePointerPosition(event);
  drawJoystick();
});
function endPointer(event: PointerEvent) {
  if (!controller.canRelease(event.pointerId)) return;
  // Commit the final pointer position directly to the anchor, not the visual stick.
  captureRelease(event.type === 'pointerup' ? {
    x: (event.clientX - controller.center.x) / viewScale,
    y: (event.clientY - controller.center.y) / viewScale,
  } : undefined, event.pointerId, event.type === 'pointerup' ? 'pointerup' : 'cancel');
}
// Capture may already be lost, so terminal events can target outside the viewport.
window.addEventListener('pointerup', endPointer, true);
window.addEventListener('pointercancel', endPointer, true);
viewport.addEventListener('lostpointercapture', event => {
  controller.loseCapture(event.pointerId);
  drawJoystick(); updateTelemetry();
});
viewport.addEventListener('contextmenu', event => event.preventDefault());
window.addEventListener('blur', () => captureRelease());
document.addEventListener('visibilitychange', () => { if (document.hidden) captureRelease(); lastFrame = 0; });

function syncSettings() {
  const model = controller.settings.turnModel;
  element<HTMLSelectElement>('turn-model').value = String(model);
  element('turn-model-hint').textContent = ({
    0: '固定角速度、最短路径。',
    2: '根据剩余角度查曲线速度。横轴从左侧 180° 到右侧 0°。',
    7: '以原控制点生成 C2 连续速度曲线，驱动实际转向；不是将二阶导数当作速度。',
    5: '从当前朝向向最新目标做球面插值，越接近越慢。默认 180° 转向第 4 帧约 173.6°，第 9 帧到位（60 FPS）。',
    6: 'Unity SmoothDampAngle 递推，保留角速度。默认 180° 转向第 4 帧约 168°，第 9 帧到位（60 FPS）。反向时沿用最短路径保护。',
  } as Record<number, string>)[model];
  element('turn-curve-editor').hidden = model !== 2;
  element('turn-smooth-preview').hidden = model !== 7;
  smoothPreviews.forEach(preview => preview.render());
  const owners: Partial<Record<SettingKey, number>> = {
    turnSpeed: 0, curveSnapAngle: 2, slerpResponse: 5, slerpSnapAngle: 5,
    smoothTime: 6, smoothSnapAngle: 6,
  };
  for (const key of Object.keys(owners) as SettingKey[]) {
    element('slider-' + key).closest<HTMLElement>('.setting')!.hidden = owners[key] !== model;
  }
  curveEditor.render();
  const lockModel = controller.settings.lockTurnModel;
  element<HTMLSelectElement>('lock-turn-model').value = String(lockModel);
  element('lock-turn-curve-editor').hidden = lockModel !== 2;
  element('lock-turn-smooth-preview').hidden = lockModel !== 7;
  const lockOwners: Partial<Record<SettingKey, number>> = {
    lockTurnSpeed: 0, lockCurveSnapAngle: 2, lockSlerpResponse: 5, lockSlerpSnapAngle: 5,
    lockSmoothTime: 6, lockSmoothSnapAngle: 6,
  };
  for (const key of Object.keys(lockOwners) as SettingKey[]) {
    element('slider-' + key).closest<HTMLElement>('.setting')!.hidden = lockOwners[key] !== lockModel;
  }
  lockCurveEditor.render();
  const targetModel = controller.settings.targetModel;
  element<HTMLSelectElement>('target-model').value = String(targetModel);
  element<HTMLInputElement>('show-lock-range').checked = !!controller.settings.showLockRange;
  element('target-model-hint').textContent = [
    '范围内始终选择最近目标。',
    '扇形内选择夹角最小者，同角度取最近；无候选时无目标。',
    '新候选须具备角度优势并持续足够久；旧目标在距离内可保留在扇形外。同角度更近不会触发切换。',
  ][targetModel];
  element('slider-targetCone').closest<HTMLElement>('.setting')!.hidden = targetModel === 0;
  for (const key of ['targetAdvantage', 'targetDwell']) element('slider-' + key).closest<HTMLElement>('.setting')!.hidden = targetModel !== 2;
  moveEditor.render();
  element<HTMLSelectElement>('move-model').value = String(controller.settings.moveModel);
  element('move-curve-editor').hidden = controller.settings.moveModel !== 1;
  anchorEditor.render();
  ringEditor.render();waveEditor.render();switchEditor.render();strokeEditor.render();linkAttackEditor.render();
  element<HTMLInputElement>('anchor-follow').checked = !!controller.settings.anchorFollow;
  element<HTMLInputElement>('show-threshold').checked = !!controller.settings.showThreshold;
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
element('turn-model').addEventListener('change', () => {
  controller.set('turnModel', Number(element<HTMLSelectElement>('turn-model').value));
  syncSettings(); settingsChanged(); updateTelemetry();
});
for (const [id, key] of [['target-model', 'targetModel'], ['lock-turn-model', 'lockTurnModel']] as const) {
  element(id).addEventListener('change', () => {
    controller.set(key, Number(element<HTMLSelectElement>(id).value));
    syncSettings(); settingsChanged(); updateTelemetry();
  });
}
element('show-lock-range').addEventListener('change', () => {
  controller.set('showLockRange', element<HTMLInputElement>('show-lock-range').checked ? 1 : 0);
  syncSettings(); settingsChanged();
});
element('show-heading').addEventListener('change', () => {
  game.showHeading = element<HTMLInputElement>('show-heading').checked;
});
element('show-anchor-outline').addEventListener('change', () => {
  game.showAnchorOutline = element<HTMLInputElement>('show-anchor-outline').checked;
});
element('show-idle-anchor').addEventListener('change', () => {
  game.showIdleAnchor = element<HTMLInputElement>('show-idle-anchor').checked;
});
element('show-threshold').addEventListener('change', () => {
  controller.set('showThreshold', element<HTMLInputElement>('show-threshold').checked ? 1 : 0);
  syncSettings(); settingsChanged();
});
function applySettings(next: Settings) {
  controller.setCurve(next.turnCurve); controller.setLockCurve(next.lockTurnCurve);
  controller.setMoveCurve(next.moveCurve); controller.setAnchorCurve(next.anchorCurve);
  controller.setRingCurve(next.ringCurve); controller.setRingWaveCurve(next.ringWaveCurve);
  controller.setRingSwitchCurve(next.ringSwitchCurve); controller.setRingStrokeCurve(next.ringStrokeCurve);
  controller.setRingLinkAttackCurve(next.ringLinkAttackCurve);
  for (const key of Object.keys(LIMITS) as SettingKey[]) {
    if (controller.settings[key] !== next[key]) controller.set(key, next[key]);
  }
}
for (const id of ['undo-settings', 'restore']) element(id).addEventListener('click', () => {
  if (!history) return;
  applySettings(id === 'restore' ? history.undoAll() : history.undo());
  syncSettings(); settingsChanged(); updateTelemetry();
});
saveButton.addEventListener('click', async () => {
  if (saving) return;
  const snapshot = structuredClone(controller.settings);
  saving = true; saveButton.disabled = true; showStoreStatus('保存中…');
  try {
    await saveSettings(snapshot);
    history?.saved(snapshot); updateHistoryButtons();
    showStoreStatus(history?.dirty ? '已保存；另有新修改未保存' : '已写入 params.json');
  } catch (error) {
    showStoreStatus(`保存失败：${error instanceof Error ? error.message : '请重试'}`, true);
  } finally { saving = false; saveButton.disabled = false; }
});
element('open-settings').addEventListener('click', () => document.body.classList.add('settings-open'));
element('close-settings').addEventListener('click', () => document.body.classList.remove('settings-open'));

const displayAngle = (heading: number) => {
  const degrees = ((180 - heading * 180 / Math.PI) % 360 + 360) % 360;
  return `${(Math.round(degrees * 10) / 10 % 360).toFixed(1)}°`;
};
function updateTelemetry() {
  element('mode-label').textContent = element('game-state').textContent = modeNames[controller.mode];
  viewport.dataset.mode = controller.mode;
  document.querySelectorAll<HTMLElement>('[data-mode]').forEach(node => node.classList.toggle('selected', node.dataset.mode === controller.mode));
  element('pointer-label').textContent = controller.pointerId === null ? '—' : `#${controller.pointerId}`;
  element('lock-label').textContent = controller.pointerId === null ? '等待按下' : controller.unlocked ? '已解锁' : '已锁定';
  element('stick-label').textContent = `${controller.stick.x.toFixed(1)} / ${controller.stick.y.toFixed(1)}`;
  element('heading-label').textContent = displayAngle(controller.heading);
  element('anchor-heading-label').textContent = Math.hypot(controller.offset.x, controller.offset.z) > 0
    ? displayAngle(Math.atan2(controller.offset.x, controller.offset.z)) : '与角色重合';
  element('anchor-label').textContent = `${controller.offset.x.toFixed(3)} / ${controller.offset.z.toFixed(3)}`;
  element('position-label').textContent = `${controller.position.x.toFixed(2)} / ${controller.position.z.toFixed(2)}`;
  element('turn-model-label').textContent = ({ 0: '匀速', 2: '自定义曲线', 5: 'Slerp', 6: 'SmoothDampAngle', 7: '自定义曲线－二阶平滑' } as Record<number, string>)[controller.activeTurnModel];
  const targeting = controller.targeting, inLocking = controller.training === 'locking';
  element('targeting-state-label').textContent = !inLocking ? '当前场地无目标' : targeting.active ? '已启用' : '等待首次按下';
  element('targeting-model-label').textContent = ['A · 最近', 'B · 方向', 'C · 保留'][controller.settings.targetModel];
  element('target-label').textContent = targeting.target?.label ?? '无';
  element('candidate-label').textContent = targeting.candidate
    ? `${targeting.candidate.label} · ${Math.round(targeting.elapsed * 1000)} / ${controller.settings.targetDwell}ms` : '无';
  element('turn-context-label').textContent = controller.usesLockTurn ? '锁定转向' : '普通转向';
  element('target-distance-label').textContent = targeting.target
    ? `${Math.hypot(targeting.target.x-controller.position.x, targeting.target.z-controller.position.z).toFixed(2)} / ${controller.settings.lockRange}` : '—';
  element('targeting-hud').hidden = !inLocking;
  element('targeting-hud').textContent = !targeting.active ? '锁定未启用 · 按下开始' : `${['A 最近', 'B 方向', 'C 保留'][controller.settings.targetModel]} · ${targeting.target?.label ?? '无目标'}`;
  element('angular-speed-label').textContent = `${controller.angularSpeed.toFixed(1)}°/s`;
  element('target-anchor-label').textContent = `${controller.targetOffset.x.toFixed(3)} / ${controller.targetOffset.z.toFixed(3)}`;
  element('anchor-gap-label').textContent = Math.hypot(controller.targetOffset.x-controller.offset.x,controller.targetOffset.z-controller.offset.z).toFixed(4);
  const moving = controller.mode === 'moving' && controller.direction !== null;
  element('move-angle-label').textContent = moving ? `${controller.movementAngleError.toFixed(1)}°` : '—';
  element('move-ratio-label').textContent = moving ? `${(controller.movementSpeedRatio*100).toFixed(1)}%` : '—';
  const reduction = Math.max(0,controller.movementBaseSpeed-controller.movementSpeed);
  const reductionPercent = Math.max(0,1-controller.movementSpeedRatio)*100;
  element('move-reduction-label').textContent = moving ? `${reduction.toFixed(2)} 单位/s · ${reductionPercent.toFixed(1)}%` : '—（未移动）';
  element('move-speed-label').textContent = `${controller.movementSpeed.toFixed(2)} 单位/s`;
  element('angle-label').textContent = `${(Math.abs(wrapAngle(controller.targetHeading - controller.heading)) * 180 / Math.PI).toFixed(1)}°`;
  element('camera-label').textContent = (controller.position.z - game.cameraZ).toFixed(3);
  const weight = Math.round(game.blend.weight * 100);
  const attack = game.animation?.snapshot();
  element('blend-label').textContent = attack?.playing
    ? `射箭 ${Math.round(attack.weight * 100)}%` : `${100 - weight}% / ${weight}%`;
  element('blend-fill').style.width = `${weight}%`;
}

function frame(time: number) {
  // Discard suspension gaps; normal motion uses bounded substeps, independent of display rate.
  let remaining = lastFrame ? Math.min((time - lastFrame) / 1000, 0.1) : 0;
  lastFrame = time;
  const dt = remaining;
  while (remaining > 0) {
    const step = Math.min(remaining, 1 / 120);
    const completed = controller.completions, pointer = controller.pointerId;
    game.advanceFeedback(step);
    controller.update(step);
    if (controller.completions !== completed) {
      if (pointer !== null && viewport.hasPointerCapture(pointer)) viewport.releasePointerCapture(pointer);
      game.cameraZ = controller.position.z;
      const message = element('training-result');
      message.textContent = `训练成功！已完成 ${controller.completions} 次 · 新一轮开始`;
      message.hidden = false; clearTimeout(resultTimer);
      resultTimer = setTimeout(() => { message.hidden = true; }, 2200);
      drawJoystick(); updateTelemetry();
    }
    game.sync(step); remaining -= step;
  }
  linkAttackEditor.setPlayback(game.animation.snapshot());
  const rings=game.rings.state,active=rings.targetId!==null;
  previewSlider.disabled=!active;previewSlider.value=String(rings.completion*100);
  previewSlider.style.setProperty('--fill',`${rings.completion*100}%`);
  element('ring-preview').classList.toggle('active',active);
  element<HTMLButtonElement>('ring-preview-resume').disabled=!active||rings.preview===null;
  element('ring-preview-label').textContent=active?`${(rings.completion*100).toFixed(1)}% · ${rings.preview===null?'自动':'手动预览'} · ${rings.stroke.toFixed(2)} px`:'未锁定';
  game.render();
  uiTime += dt; fpsTime += dt; frameCount++;
  if (uiTime >= 0.08) { updateTelemetry(); uiTime = 0; }
  if (fpsTime >= 0.5) { element('fps-label').textContent = `${Math.round(frameCount / fpsTime)} FPS`; fpsTime = 0; frameCount = 0; }
}

async function start() {
  layout(); syncSettings();
  try {
    const loaded = await loadSettings();
    for (const key of Object.keys(LIMITS) as SettingKey[]) controller.set(key, loaded[key]);
    controller.setCurve(loaded.turnCurve);
    controller.setLockCurve(loaded.lockTurnCurve);
    controller.setMoveCurve(loaded.moveCurve);
    controller.setAnchorCurve(loaded.anchorCurve);
    controller.setRingCurve(loaded.ringCurve);controller.setRingWaveCurve(loaded.ringWaveCurve);controller.setRingSwitchCurve(loaded.ringSwitchCurve);controller.setRingStrokeCurve(loaded.ringStrokeCurve);controller.setRingLinkAttackCurve(loaded.ringLinkAttackCurve);
    showStoreStatus('已读取 params.json');
  } catch (error) {
    showStoreStatus(`${error instanceof Error ? error.message : '读取失败'}，暂用默认值`, true);
  }
  history = new SettingsHistory(controller.settings);
  updateHistoryButtons();
  // Saved tuning never restores a previous game session or its anchor memory.
  controller.position = { x: 0, z: controller.settings.roomSize * 0.27 };
  game.cameraZ = controller.position.z;
  syncSettings();
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input => { input.disabled = false; });
  element<HTMLSelectElement>('turn-model').disabled = false;
  element<HTMLSelectElement>('move-model').disabled = false;
  for (const id of ['target-model', 'lock-turn-model', 'show-lock-range']) element<HTMLInputElement>(id).disabled = false;
  saveButton.disabled = false;
  try {
    await game.init();
    ready = true;
    element<HTMLButtonElement>('switch-training').disabled = false;
    element<HTMLButtonElement>('switch-locking-training').disabled = false;
    element('loading').remove(); updateTelemetry();
    game.renderer.setAnimationLoop(frame);
    if (import.meta.env.DEV) {
      Object.assign(window, { __ARCHERO__: {
        pauseForInspection: (paused:boolean) => {game.renderer.setAnimationLoop(paused?null:frame);lastFrame=0;if(paused)game.render();},
        snapshot: () => ({ ...controller.snapshot(), settings: { ...controller.settings }, center: { ...controller.center }, cameraZ: game.cameraZ, cameraX: game.camera.position.x, footNdc: game.player.position.clone().project(game.camera).toArray(), anchorNdc: game.anchor.position.clone().project(game.camera).toArray(), trainingTargets: game.trainingTargetsSnapshot(), feedback: game.feedback?.snapshot() ?? [], particles: game.particles?.snapshot(), attack: game.animation.snapshot(), arrows: game.arrows?.snapshot(), runWeight: game.blend.weight, runTime: game.run.time, runTimeScale: game.run.getEffectiveTimeScale(), idleTimeScale: game.idle.getEffectiveTimeScale(), debug: { headingVisible: game.headingGuide.visible, heading: game.headingGuide.rotation.y, anchorVisible: game.anchor.visible, anchorOutlineVisible: game.anchor.visible && game.anchorOutline.visible, lockRangeVisible: game.lockRangeGuide.visible, lockRangeRadius: game.lockRangeGuide.scale.x, rings: game.rings.state.snapshot(), candidateMarkerVisible: game.candidateMarker.visible }, renderer: 'webgpu', ready }),
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
