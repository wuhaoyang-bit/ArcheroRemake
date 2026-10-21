import { HitParticles } from './hit-particles.ts';
import { TrainingFeedback } from './training-feedback.ts';
import { ArrowProjectiles } from './arrow-projectiles.ts';
import { LockRingView } from './lock-ring-view.ts';
import { buildTraining } from './training-scene.ts';
import { buildLockingTraining } from './locking-training-scene.ts';
import * as THREE from 'three/webgpu';
import { loadCharacter } from './character.ts';
import { CharacterAnimation } from './character-animation.ts';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AnimationBlend, follow, type MovementController } from './controller.ts';
import { ASPECT } from './config.ts';
import { isAndroidApp } from './settings-store.ts';

const CAMERA_TILT = Math.asin(0.82);
// Reference: about 11 tiles across the 16-unit room, nearly square on screen.
// This adjusts floor geometry only; joystick-to-ground mapping is unchanged.
const FLOOR_TILE_WIDTH = 16 / 11;
const FLOOR_TILE_DEPTH = FLOOR_TILE_WIDTH / Math.sin(CAMERA_TILT);

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 });
const rand = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

function groundCircle(radius: number, color: number, opacity = 1) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function buildRoom(size: number, length: number) {
  const group = new THREE.Group();
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  const n = Math.ceil(size / FLOOR_TILE_WIDTH), rows = Math.ceil(length / FLOOR_TILE_DEPTH), c = new THREE.Color();
  for (let z = 0; z < rows; z++) for (let x = 0; x < n; x++) {
    const x0 = -size / 2 + x * FLOOR_TILE_WIDTH, z0 = -length / 2 + z * FLOOR_TILE_DEPTH;
    const tile = Math.min(FLOOR_TILE_WIDTH, size / 2 - x0);
    const tileZ = Math.min(FLOOR_TILE_DEPTH, length / 2 - z0);
    c.setHSL(0.205 + rand(z * n + x) * 0.008, 0.84, 0.34 + ((x + z) % 2) * 0.035 + rand(x * n + z + 2) * 0.012);
    for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) {
      positions.push(x0 + dx * tile, 0, z0 + dz * tileZ);
      normals.push(0, 1, 0); colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  floor.userData.hitParticleGround = true;
  floor.receiveShadow = true; group.add(floor);

  const base = new THREE.Mesh(new RoundedBoxGeometry(size + 0.48, 0.4, length + 0.48, 2, 0.12), mat(0xd3ad63));
  base.userData.hitParticleGround = true;
  base.position.y = -0.25; base.receiveShadow = true; group.add(base);
  const across = Math.ceil(size / 0.78), alongCount = Math.ceil(length / 0.78);
  const count = 2 * (across + alongCount);
  const block = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 0.34, 0.31, 2, 0.06), mat(0xffffff), count);
  const dummy = new THREE.Object3D();
  let index = 0;
  for (let edge = 0; edge < 4; edge++) {
    const span = edge < 2 ? size : length, segments = edge < 2 ? across : alongCount;
    for (let i = 0; i < segments; i++) {
      const along = -span / 2 + (i + 0.5) * span / segments;
      dummy.position.set(edge < 2 ? along : (edge === 2 ? -1 : 1) * size / 2, 0.1, edge < 2 ? (edge === 0 ? -1 : 1) * length / 2 : along);
      dummy.scale.set(span / segments - 0.04, 1, 1);
      dummy.rotation.y = edge < 2 ? 0 : Math.PI / 2; dummy.updateMatrix();
      block.setMatrixAt(index, dummy.matrix);
      block.setColorAt(index, new THREE.Color().setHSL(0.22, 0.28, 0.48 + rand(index) * 0.10));
      index++;
    }
  }
  block.castShadow = true; block.receiveShadow = true; group.add(block);

  // All scenery sits outside the walkable rectangle. No interior obstacles.
  const trees = 68, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.19, 1.2, 6), mat(0x685439), trees);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.95, 1.8, 7), mat(0xffffff), trees * 3);
  for (let i = 0; i < trees; i++) {
    let x: number, z: number;
    if (i < 44) { x = (i % 2 ? 1 : -1) * (size / 2 + 0.95 + rand(i + 50) * 2.8); z = -length / 2 - 9 + Math.floor(i / 2) * (length + 18) / 21; }
    else { x = (rand(i + 90) - 0.5) * (size + 12); z = (i % 2 ? 1 : -1) * (length / 2 + 3 + rand(i + 25) * 13); }
    const s = 0.7 + rand(i + 500) * 0.6;
    dummy.position.set(x, 0.4, z); dummy.rotation.set(0, rand(i) * 6, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
    for (let tier = 0; tier < 3; tier++) {
      dummy.position.y = (1.2 + tier * 0.62) * s; dummy.scale.setScalar(s * (1 - tier * 0.18)); dummy.updateMatrix(); crowns.setMatrixAt(i * 3 + tier, dummy.matrix);
      crowns.setColorAt(i * 3 + tier, new THREE.Color().setHSL(0.37 + rand(i + 7) * 0.045, 0.52, 0.34 + tier * 0.033 + rand(i) * 0.055));
    }
  }
  trunk.castShadow = true; crowns.castShadow = true; crowns.receiveShadow = true; group.add(trunk, crowns);

  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.38, 0), mat(0x9ba08b), 36);
  for (let i = 0; i < 36; i++) {
    dummy.position.set((i % 2 ? 1 : -1) * (size / 2 + 0.6 + rand(i + 81) * 1.8), 0.09, (rand(i + 68) - 0.5) * (length + 15));
    dummy.rotation.set(rand(i), rand(i + 5) * 6, rand(i + 9)); dummy.scale.set(0.6 + rand(i), 0.45 + rand(i + 22) * 0.5, 0.9); dummy.updateMatrix(); stones.setMatrixAt(i, dummy.matrix);
  }
  stones.castShadow = true; stones.receiveShadow = true; group.add(stones);
  return group;
}

function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  group.traverse(object => { if (object instanceof THREE.Mesh) { geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(m => materials.add(m)); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
}

export class GameScene {
  renderer!: THREE.WebGPURenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera();
  player = new THREE.Group();
  body = new THREE.Group();
  anchor = new THREE.Group();
  showHeading = false;
  showIdleAnchor = false;
  showAnchorOutline = false;
  anchorOutline = new THREE.Mesh(new THREE.RingGeometry(0.235, 0.275, 48),
    new THREE.MeshBasicMaterial({ color: 0x9ff5ff, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  headingGuide = new THREE.Group();
  lockRangeGuide = new THREE.Mesh(new THREE.RingGeometry(.996, 1, 192),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false, side: THREE.DoubleSide }));
  candidateMarker = new THREE.Mesh(new THREE.RingGeometry(1.12, 1.17, 64),
    new THREE.MeshBasicMaterial({ color: 0xfff4cd, transparent: true, opacity: .8, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
  rings: LockRingView;
  cameraZ: number;
  animation!: CharacterAnimation;
  arrows?: ArrowProjectiles;
  private bowGrip!: THREE.Object3D;
  private shotOrigin = new THREE.Vector3();
  private shotAim = new THREE.Vector3();
  blend = new AnimationBlend();
  mixer!: THREE.AnimationMixer;
  idle!: THREE.AnimationAction;
  run!: THREE.AnimationAction;
  private room!: THREE.Group;
  private trainingMode = 'free';
  feedback?: TrainingFeedback;
  particles?: HitParticles;
  private practiceRevision=-1;
  private trainingVisual?: THREE.Group;
  private roomSize = 0;
  private roomLength = 0;
  private viewWidth = 0;
  private offset = Infinity;
  private aspect = ASPECT;
  readonly tilt = CAMERA_TILT;

  constructor(private viewport: HTMLElement, private controller: MovementController) {
    this.cameraZ = controller.position.z;
    this.rings = new LockRingView(viewport);
  }

  async init() {
    if (!window.isSecureContext) throw new Error('请通过 localhost 或 HTTPS 打开页面，才能使用 WebGPU。手机访问请使用 HTTPS 测试地址。');
    if (!navigator.gpu || !await navigator.gpu.requestAdapter()) throw new Error(isAndroidApp()
      ? '当前 Android WebView 未能启用 WebGPU。请更新系统的 Android System WebView 后重试；若仍不可用，需要检查该设备的 WebGPU 支持。'
      : '当前浏览器未能启用 WebGPU。请使用支持 WebGPU 的浏览器，并确认硬件加速已开启。');
    this.renderer = new THREE.WebGPURenderer({ antialias: true, powerPreference: 'high-performance' });
    await this.renderer.init();
    if (!('isWebGPUBackend' in this.renderer.backend) || !this.renderer.backend.isWebGPUBackend) {
      this.renderer.dispose(); throw new Error('WebGPU 初始化失败，请检查浏览器和设备支持。');
    }
    this.renderer.domElement.id = 'game-canvas';
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.LinearToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.viewport.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xe5f4bd);
    this.scene.fog = new THREE.Fog(0xe5f4bd, 36, 65);
    this.scene.add(new THREE.HemisphereLight(0xf5ffe5, 0xb6ca6c, 1.7));
    const sun = new THREE.DirectionalLight(0xfff4ce, 1.8);
    sun.position.set(-9, 22, -8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 70;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -55;
    sun.shadow.camera.right = sun.shadow.camera.top = 55;
    sun.shadow.normalBias = 0.045; sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), mat(0xa0c74b));
    outside.rotation.x = -Math.PI / 2; outside.position.y = -0.22; outside.receiveShadow = true; this.scene.add(outside);
    this.particles=new HitParticles(this.scene);
    this.setRoom();
    const halo = groundCircle(1.05, 0x63e5d6, 0.15); halo.position.y = 0.025; this.player.add(halo);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.01, 1.05, 48), new THREE.MeshBasicMaterial({ color: 0x8df3e3, transparent: true, opacity: 0.72, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; this.player.add(ring, this.body); this.scene.add(this.player);
    const glow = groundCircle(0.30, 0x52d9f1, 0.22), rim = groundCircle(0.23, 0x3fbddf), core = groundCircle(0.125, 0xf0ffff);
    glow.position.y = 0.055; rim.position.y = 0.06; core.position.y = 0.065;
    // Overlay only the perimeter; leave the normal anchor fill depth-tested.
    this.anchorOutline.rotation.x = -Math.PI / 2;
    this.anchorOutline.position.y = 0.07;
    this.anchorOutline.renderOrder = 101;
    this.anchorOutline.visible = false;
    this.anchor.add(this.anchorOutline);
    this.anchor.add(glow, rim, core); this.anchor.visible = false; this.scene.add(this.anchor);

    // A narrow ground strip is a readable line on both WebGPU desktop and mobile.
    const headingLine = new THREE.Mesh(new THREE.PlaneGeometry(0.055, 2.8),
      new THREE.MeshBasicMaterial({ color: 0xff647a, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
    headingLine.rotation.x = -Math.PI / 2;
    headingLine.position.set(0, 0.085, 1.4);
    headingLine.renderOrder = 100;
    this.headingGuide.add(headingLine);
    this.headingGuide.visible = false;
    this.player.add(this.headingGuide);
    for (const marker of [this.lockRangeGuide, this.candidateMarker]) {
      marker.rotation.x = -Math.PI / 2; marker.visible = false;
      this.scene.add(marker);
    }
    this.candidateMarker.renderOrder = 102;

    const [character, arrows] = await Promise.all([loadCharacter(), ArrowProjectiles.load(this.scene)]);
    this.arrows = arrows;
    this.arrows.setTargets(this.feedback?.proxies ?? []);
    this.arrows.onHit=hit=>{if(!this.controller.combatTraining)return;if(this.feedback?.hit(hit.id,hit.direction,this.controller.settings))this.particles?.emit(hit.point,hit.direction,this.controller.settings);};
    this.bowGrip = character.model.getObjectByName('RedBowGrip')!;
    this.body.add(character.model);
    this.mixer = character.mixer;
    this.idle = character.idle;
    this.run = character.run;
    this.animation = new CharacterAnimation(character.mixer, character.idle, character.run, character.attack, character.attackReleaseTime);
    this.blend = this.animation.blend;
    this.sync(0);
    this.resize();
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private setRoom() {
    this.particles?.clear();
    this.practiceRevision=this.controller.practiceRevision;
    this.feedback=undefined;
    if (this.room) { this.scene.remove(this.room); disposeGroup(this.room); }
    this.roomSize = this.controller.settings.roomSize;
    this.roomLength = this.controller.settings.roomLength;
    this.trainingMode = this.controller.training;
    this.room = buildRoom(this.roomSize, this.roomLength);
    this.trainingVisual = this.trainingMode === 'obstacles' ? buildTraining(this.roomSize, this.roomLength)
      : this.controller.combatTraining ? buildLockingTraining(this.roomSize, this.roomLength,this.controller.getPracticeTargets()) : undefined;
    if (this.trainingVisual) this.room.add(this.trainingVisual);
    if(this.controller.combatTraining&&this.trainingVisual)this.feedback=new TrainingFeedback(this.trainingVisual,this.controller.getPracticeTargets(),this.roomSize,this.roomLength);
    this.scene.add(this.room);
    this.arrows?.setTargets(this.feedback?.proxies ?? []);
  }

  resetDummies(){this.controller.cancel();this.arrows?.clear();this.particles?.clear();this.feedback?.reset();this.controller.refreshTargetPositions();this.sync(0);}

  advanceFeedback(dt:number){
    if(this.trainingMode!==this.controller.training || this.practiceRevision!==this.controller.practiceRevision || this.roomSize!==this.controller.settings.roomSize || this.roomLength!==this.controller.settings.roomLength)this.setRoom();
    this.feedback?.update(dt,this.controller.settings);
    if(this.controller.training==='monsters'){this.feedback?.pursue(dt,this.controller.position,this.controller.settings.monsterSpeed,this.controller.settings);this.controller.resolveMonsterContacts();this.feedback?.refresh(this.controller.settings);}
    this.particles?.update(dt,this.controller.settings);
  }

  /** Read-only visual diagnostics for the development browser checks. */
  trainingTargetsSnapshot() {
    return this.trainingVisual?.children.filter(object => object.userData.practiceTarget).map(object => ({
      id: object.userData.practiceTarget as string,
      position: object.position.toArray(),
      ndc: object.position.clone().project(this.camera).toArray(),
    })) ?? [];
  }

  resize() {
    if (!this.renderer) return;
    const { width, height } = this.viewport.getBoundingClientRect();
    this.aspect = width / height;
    this.renderer.setSize(width, height, false);
    this.projection();
  }

  private projection() {
    this.viewWidth = this.controller.settings.viewWidth;
    this.offset = this.controller.settings.cameraOffset;
    const height = this.viewWidth / this.aspect, shift = this.offset / 100 * height;
    this.camera.left = -this.viewWidth / 2; this.camera.right = this.viewWidth / 2;
    this.camera.top = height / 2 + shift; this.camera.bottom = -height / 2 + shift;
    this.camera.near = 0.1; this.camera.far = 140; this.camera.updateProjectionMatrix();
  }

  sync(dt: number) {
    const ctl = this.controller;
    if (this.practiceRevision!==ctl.practiceRevision || this.trainingMode !== ctl.training || this.roomSize !== ctl.settings.roomSize || this.roomLength !== ctl.settings.roomLength) this.setRoom();
    if (this.viewWidth !== ctl.settings.viewWidth || this.offset !== ctl.settings.cameraOffset) this.projection();
    this.trainingVisual?.userData.setProgress?.(ctl.passedCheckpoints, dt);
    this.player.position.set(ctl.position.x, 0, ctl.position.z);
    this.body.rotation.y = ctl.heading;
    const target = ctl.anchor;
    this.anchor.position.set(target.x, 0, target.z); this.anchor.visible = ctl.anchorVisible || this.showIdleAnchor;
    this.anchorOutline.visible = this.showAnchorOutline;
    this.headingGuide.visible = this.showHeading;
    this.headingGuide.rotation.y = ctl.heading;
    this.lockRangeGuide.visible = ctl.combatTraining && !!ctl.settings.showLockRange && ctl.settings.lockRange > 0;
    this.lockRangeGuide.position.set(ctl.position.x, .045, ctl.position.z);
    this.lockRangeGuide.scale.setScalar(ctl.settings.lockRange);
    for (const [marker, target] of [[this.candidateMarker, ctl.targeting.candidate]] as const) {
      marker.visible = ctl.combatTraining && target !== null;
      if (target) marker.position.set(target.x, .08, target.z);
    }
    this.feedback?.refresh(ctl.settings);
    this.trainingVisual?.updateWorldMatrix(true, true);
    this.bowGrip.scale.setScalar(ctl.settings.bowScale);
    this.arrows?.setScale(ctl.settings.arrowScale);
    this.arrows?.setSpeed(ctl.settings.arrowSpeed);
    this.arrows?.update(dt);
    this.animation.update(dt, ctl.mode, ctl.activeAttackRequest, ctl.settings.blendDuration, ctl.settings.runSpeed, remaining => {
      const enemy = ctl.targeting.target;
      if (!enemy || !ctl.combatTraining) return;
      this.bowGrip.getWorldPosition(this.shotOrigin);
      this.shotAim.set(enemy.x, 1.65, enemy.z);
      this.arrows?.fire(this.shotOrigin, this.shotAim, Math.max(32, ctl.settings.lockRange + 4), remaining);
    }, ctl.settings.attackSpeed);
    this.cameraZ = follow(this.cameraZ, ctl.position.z, ctl.settings.cameraResponse, dt);
    this.camera.position.set(0, 24, this.cameraZ + 24 / Math.tan(this.tilt));
    this.camera.lookAt(0, 0, this.cameraZ);
    this.camera.updateMatrixWorld();
    this.rings.update(dt, ctl.settings, this.camera, ctl.position, ctl.combatTraining ? ctl.targeting.target : null, this.animation.snapshot());
  }

  render() { this.particles?.prepare(this.camera,this.controller.settings);this.particles?.renderDepth(this.renderer,this.camera);this.renderer.render(this.scene, this.camera); }
}
