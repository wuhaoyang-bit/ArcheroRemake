import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { AnimationBlend, follow, type MovementController } from './controller.ts';
import { ASPECT } from './config.ts';
import { isAndroidApp } from './settings-store.ts';

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 });
const rand = (i: number) => { const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };

function groundCircle(radius: number, color: number, opacity = 1) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function buildRoom(size: number) {
  const group = new THREE.Group();
  const positions: number[] = [], colors: number[] = [], normals: number[] = [];
  const n = Math.round(size), tile = size / n, c = new THREE.Color();
  for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
    const x0 = -size / 2 + x * tile, z0 = -size / 2 + z * tile;
    c.setHSL(0.222 + rand(z * n + x) * 0.012, 0.74, 0.20 + ((x + z) % 2) * 0.017 + rand(x * n + z + 2) * 0.009);
    for (const [dx, dz] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) {
      positions.push(x0 + dx * tile, 0, z0 + dz * tile);
      normals.push(0, 1, 0); colors.push(c.r, c.g, c.b);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const floor = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  floor.receiveShadow = true; group.add(floor);

  const base = new THREE.Mesh(new RoundedBoxGeometry(size + 0.48, 0.4, size + 0.48, 2, 0.12), mat(0x87925b));
  base.position.y = -0.25; base.receiveShadow = true; group.add(base);
  const count = Math.ceil(size / 0.78), block = new THREE.InstancedMesh(new RoundedBoxGeometry(size / count - 0.04, 0.34, 0.31, 2, 0.06), mat(0xa2af82), count * 4);
  const dummy = new THREE.Object3D();
  for (let edge = 0; edge < 4; edge++) for (let i = 0; i < count; i++) {
    const along = -size / 2 + (i + 0.5) * size / count;
    dummy.position.set(edge < 2 ? along : (edge === 2 ? -1 : 1) * size / 2, 0.1, edge < 2 ? (edge === 0 ? -1 : 1) * size / 2 : along);
    dummy.rotation.y = edge < 2 ? 0 : Math.PI / 2; dummy.updateMatrix();
    block.setMatrixAt(edge * count + i, dummy.matrix);
    block.setColorAt(edge * count + i, new THREE.Color().setHSL(0.22, 0.17, 0.46 + rand(i + edge * count) * 0.10));
  }
  block.castShadow = true; block.receiveShadow = true; group.add(block);

  // All scenery sits outside the walkable square. No interior obstacles.
  const trees = 68, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.19, 1.2, 6), mat(0x685439), trees);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(0.95, 1.8, 7), mat(0x448b64), trees * 3);
  for (let i = 0; i < trees; i++) {
    let x: number, z: number;
    if (i < 44) { x = (i % 2 ? 1 : -1) * (size / 2 + 0.95 + rand(i + 50) * 2.8); z = -size / 2 - 9 + Math.floor(i / 2) * (size + 18) / 21; }
    else { x = (rand(i + 90) - 0.5) * (size + 12); z = (i % 2 ? 1 : -1) * (size / 2 + 3 + rand(i + 25) * 13); }
    const s = 0.7 + rand(i + 500) * 0.6;
    dummy.position.set(x, 0.4, z); dummy.rotation.set(0, rand(i) * 6, 0); dummy.scale.setScalar(s); dummy.updateMatrix(); trunk.setMatrixAt(i, dummy.matrix);
    for (let tier = 0; tier < 3; tier++) {
      dummy.position.y = (1.2 + tier * 0.62) * s; dummy.scale.setScalar(s * (1 - tier * 0.18)); dummy.updateMatrix(); crowns.setMatrixAt(i * 3 + tier, dummy.matrix);
      crowns.setColorAt(i * 3 + tier, new THREE.Color().setHSL(0.37 + rand(i + 7) * 0.045, 0.36, 0.27 + tier * 0.033 + rand(i) * 0.055));
    }
  }
  trunk.castShadow = true; crowns.castShadow = true; crowns.receiveShadow = true; group.add(trunk, crowns);

  const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.38, 0), mat(0x9ba08b), 36);
  for (let i = 0; i < 36; i++) {
    dummy.position.set((i % 2 ? 1 : -1) * (size / 2 + 0.6 + rand(i + 81) * 1.8), 0.09, (rand(i + 68) - 0.5) * (size + 15));
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
  cameraZ: number;
  blend = new AnimationBlend();
  mixer!: THREE.AnimationMixer;
  idle!: THREE.AnimationAction;
  run!: THREE.AnimationAction;
  private room!: THREE.Group;
  private roomSize = 0;
  private viewWidth = 0;
  private offset = Infinity;
  private aspect = ASPECT;
  readonly tilt = Math.asin(0.82);

  constructor(private viewport: HTMLElement, private controller: MovementController) {
    this.cameraZ = controller.position.z;
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
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.viewport.prepend(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xd5e4bd);
    this.scene.fog = new THREE.Fog(0xd5e4bd, 36, 65);
    this.scene.add(new THREE.HemisphereLight(0xe1f3ff, 0x829657, 1.45));
    const sun = new THREE.DirectionalLight(0xfff2d3, 2.3);
    sun.position.set(-9, 22, -8); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.near = 0.5; sun.shadow.camera.far = 70;
    sun.shadow.camera.left = sun.shadow.camera.bottom = -24;
    sun.shadow.camera.right = sun.shadow.camera.top = 24;
    sun.shadow.normalBias = 0.045; sun.shadow.bias = -0.0001;
    this.scene.add(sun);
    const outside = new THREE.Mesh(new THREE.PlaneGeometry(120, 160), mat(0x8fa45e));
    outside.rotation.x = -Math.PI / 2; outside.position.y = -0.22; outside.receiveShadow = true; this.scene.add(outside);
    this.setRoom();
    const halo = groundCircle(1.05, 0x63e5d6, 0.15); halo.position.y = 0.025; this.player.add(halo);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.01, 1.05, 48), new THREE.MeshBasicMaterial({ color: 0x8df3e3, transparent: true, opacity: 0.72, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; this.player.add(ring, this.body); this.scene.add(this.player);
    const glow = groundCircle(0.30, 0x52d9f1, 0.22), rim = groundCircle(0.23, 0x3fbddf), core = groundCircle(0.125, 0xf0ffff);
    glow.position.y = 0.055; rim.position.y = 0.06; core.position.y = 0.065;
    this.anchor.add(glow, rim, core); this.anchor.visible = false; this.scene.add(this.anchor);

    const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/rogue.glb`);
    for (const name of ['Knife', 'Knife_Offhand', '1H_Crossbow', '2H_Crossbow', 'Throwable']) {
      const object = gltf.scene.getObjectByName(name); if (object) object.visible = false;
    }
    const box = new THREE.Box3().setFromObject(gltf.scene), scale = 3.25 / (box.max.y - box.min.y);
    gltf.scene.scale.setScalar(scale); gltf.scene.position.y = -box.min.y * scale;
    gltf.scene.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
    this.body.add(gltf.scene);
    this.mixer = new THREE.AnimationMixer(gltf.scene);
    const idle = THREE.AnimationClip.findByName(gltf.animations, 'Idle'), run = THREE.AnimationClip.findByName(gltf.animations, 'Run');
    if (!idle || !run) throw new Error('角色资源缺少 Idle 或 Run 动画。');
    this.idle = this.mixer.clipAction(idle).play(); this.run = this.mixer.clipAction(run).play();
    this.idle.setEffectiveWeight(1); this.run.setEffectiveWeight(0);
    this.sync(0);
    this.resize();
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.render(this.scene, this.camera);
  }

  private setRoom() {
    if (this.room) { this.scene.remove(this.room); disposeGroup(this.room); }
    this.roomSize = this.controller.settings.roomSize;
    this.room = buildRoom(this.roomSize); this.scene.add(this.room);
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
    if (this.roomSize !== ctl.settings.roomSize) this.setRoom();
    if (this.viewWidth !== ctl.settings.viewWidth || this.offset !== ctl.settings.cameraOffset) this.projection();
    this.player.position.set(ctl.position.x, 0, ctl.position.z);
    this.body.rotation.y = ctl.heading;
    const target = ctl.anchor;
    this.anchor.position.set(target.x, 0, target.z); this.anchor.visible = ctl.anchorVisible;
    this.blend.setTarget(ctl.mode === 'idle' ? 0 : 1, ctl.settings.blendDuration);
    const weight = this.blend.update(dt);
    this.idle.setEffectiveWeight(1 - weight); this.run.setEffectiveWeight(weight);
    this.run.setEffectiveTimeScale(ctl.settings.runSpeed);
    this.mixer.update(dt);
    this.cameraZ = follow(this.cameraZ, ctl.position.z, ctl.settings.cameraResponse, dt);
    this.camera.position.set(0, 24, this.cameraZ + 24 / Math.tan(this.tilt));
    this.camera.lookAt(0, 0, this.cameraZ);
    this.camera.updateMatrixWorld();
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
