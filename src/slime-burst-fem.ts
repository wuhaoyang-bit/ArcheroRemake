/**
 * Preview-only holtsetio FEM softbody facade for ArcheroRemake.
 *
 * Softbody verts live in **world space** on the GPU. Do not translate the
 * returned `root` for flight — keep root at identity and call
 * `setChunkWorldPosition` after kinematic move (identity quat, zero velocity).
 * Calling reset every frame re-snaps rest shape at that position.
 */
import * as THREE from "three/webgpu";
import type {Material, Object3D, Vector3, WebGPURenderer} from "three/webgpu";
import {FEMPhysics} from "./slime-burst-fem/FEMPhysics.ts";
import {conf} from "./slime-burst-fem/conf.ts";
import {CollisionGeometry} from "./slime-burst-fem/collisionGeometry.ts";
import {TetVisualizer} from "./slime-burst-tet-visualizer.ts";

export type SoftbodyModel = {
  tetVerts: ArrayLike<number>;
  tetIds: ArrayLike<number>;
  positions: ArrayLike<number>;
  indices: ArrayLike<number>;
  normals: ArrayLike<number>;
  uvs: ArrayLike<number>;
  attachedTets: ArrayLike<number>;
  baryCoords: ArrayLike<number>;
};

type ChunkHandle = {
  root: Object3D;
  instance: {id: number; reset: Function; spawned: boolean};
  geometry: {mesh: THREE.Mesh | null; dispose: () => void; updateCount: () => void};
  dispose: () => void;
};

export class SlimeBurstFem {
  readonly object: THREE.Object3D;
  private readonly renderer: WebGPURenderer;
  private readonly physics: InstanceType<typeof FEMPhysics>;
  private readonly chunks: ChunkHandle[] = [];
  private collision: CollisionGeometry | null = null;
  private tetVisualizer: TetVisualizer | null = null;
  private baked = false;
  private groundY: number;

  constructor(renderer: WebGPURenderer, opts?: {groundY?: number}) {
    this.renderer = renderer;
    this.groundY = opts?.groundY ?? 0;
    this.physics = new FEMPhysics(renderer);
    this.object = this.physics.object;
    conf.stepsPerSecond = 30;
    conf.maxStepsPerFrame = 1;
    conf.bodies = 0;
  }

  /**
   * Register one chunk SoftbodyModel (must be before bake).
   * Returns a root Group (identity) — add `this.object` OR `root` to the scene
   * (mesh is parented under `physics.object`, which is also this.object).
   */
  async addChunk(
    model: SoftbodyModel,
    material?: Material,
  ): Promise<{root: Object3D; dispose(): void}> {
    if (this.baked) {
      throw new Error("SlimeBurstFem.addChunk: call before bake()");
    }

    // MeshPhysicalNodeMaterial: MeshBasicNodeMaterial + storage positionNode failed to draw
    // (hard shells were hidden → burst looked empty). Physical matches holtsetio path.
    const geometry = this.physics.addGeometry(model, THREE.MeshPhysicalNodeMaterial) as unknown as {
      material: THREE.MeshPhysicalNodeMaterial;
      mesh: THREE.Mesh | null;
      dispose: () => void;
      updateCount: () => void;
      addInstance?: () => {id: number; reset: Function; spawned: boolean};
    };
    if (material) {
      const built = geometry.material;
      const target = material as THREE.MeshPhysicalNodeMaterial;
      if (built?.positionNode) {
        target.positionNode = built.positionNode;
      }
      geometry.material = target;
      built?.dispose?.();
    }

    const instance = this.physics.addInstance(geometry);
    conf.bodies = this.physics.objects.length;

    const root = new THREE.Group();
    root.name = `slime-burst-fem-chunk-${instance.id}`;

    const handle: ChunkHandle = {
      root,
      instance,
      geometry,
      dispose: () => {
        instance.spawned = false;
        geometry.updateCount();
        if (root.parent) root.parent.remove(root);
      },
    };
    this.chunks.push(handle);
    return {root, dispose: handle.dispose};
  }

  async bake(): Promise<void> {
    if (this.baked) return;
    conf.bodies = this.chunks.length;
    this.collision = new CollisionGeometry(this.physics, this.groundY);
    await this.collision.createGeometry();
    await this.physics.bake();
    this.physics.objectCount = 0; // force update() to sync dispatch counts
    this.baked = true;
  }

  async update(dt: number, elapsed: number): Promise<void> {
    if (!this.baked) return;
    conf.bodies = Math.max(conf.bodies, this.chunks.filter((c) => c.instance.spawned).length);
    if (conf.bodies === 0 && this.chunks.length > 0) {
      // Keep kernel window covering all registered objects even if none spawned yet.
      conf.bodies = this.chunks.length;
    }
    await this.physics.update(dt, elapsed);
  }

  /**
   * Place a chunk once at spawn.
   * `velocity` is **world units/sec**. FEM Verlet stores
   * `prevPosition = position - resetVelocity`, then
   * `v = (pos-prev)/dt = resetVelocity/dt`, so we pass `velocity * dt`.
   * Passing raw u/s (e.g. 24) made chunks fly at ~720 u/s and leave the screen.
   */
  async spawnChunk(
    index: number,
    position: Vector3,
    velocity?: Vector3,
  ): Promise<void> {
    const chunk = this.chunks[index];
    if (!chunk) return;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3(1, 1, 1);
    const dt = 1 / Math.max(1, conf.stepsPerSecond);
    const v = velocity?.clone().multiplyScalar(dt) ?? new THREE.Vector3(0, 0, 0);
    // Await reset so instance.spawned + geometry.instanceCount update before we hide hard shells.
    await chunk.instance.reset(position, q, s, v);
    // bake() forces objectCount=0; bump it so updateCount keeps instanceCount > 0.
    const spawned = this.chunks.filter((c) => c.instance.spawned).length;
    conf.bodies = Math.max(conf.bodies, spawned, this.chunks.length);
    (this.physics as {objectCount: number}).objectCount = conf.bodies;
    chunk.geometry.updateCount();
    chunk.root.position.copy(position);
  }

  /** @deprecated Prefer spawnChunk once; per-frame calls kill softbody deformation. */
  setChunkWorldPosition(index: number, position: Vector3): void {
    void this.spawnChunk(index, position);
  }

  setGravity(x: number, y: number, z: number): void {
    const g = (this.physics.uniforms as {gravity?: {value: THREE.Vector3}}).gravity;
    g?.value.set(x, y, z);
  }

  setStepsPerSecond(n: number): void {
    conf.stepsPerSecond = Math.max(1, n);
  }

  setRotationRefinementSteps(n: number): void {
    const u = (this.physics.uniforms as {rotationRefinementSteps?: {value: number}}).rotationRefinementSteps;
    if (u) u.value = Math.max(1, n | 0);
  }

  /** Optional tet wire overlay; create after bake. */
  getTetVisualizer(): Object3D | null {
    if (!this.baked) return null;
    if (!this.tetVisualizer) {
      this.tetVisualizer = new TetVisualizer(this.physics);
      this.tetVisualizer.object.visible = false;
      this.object.add(this.tetVisualizer.object);
    }
    return this.tetVisualizer.object;
  }

  dispose(): void {
    this.tetVisualizer?.dispose();
    this.tetVisualizer = null;
    this.collision?.dispose();
    this.collision = null;
    this.chunks.forEach((c) => c.dispose());
    this.chunks.length = 0;
    this.physics.dispose();
    conf.bodies = 0;
    this.baked = false;
  }
}

export {FEMPhysics} from "./slime-burst-fem/FEMPhysics.ts";
export {conf as slimeBurstFemConf} from "./slime-burst-fem/conf.ts";
export {CollisionGeometry} from "./slime-burst-fem/collisionGeometry.ts";
export {TetVisualizer} from "./slime-burst-tet-visualizer.ts";
