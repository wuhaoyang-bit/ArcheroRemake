// @ts-nocheck
import * as THREE from "three/webgpu";

export class SoftbodyInstance {
    physics = null;
    vertices = [];
    tets = [];
    age = 0;
    spawned = false;
    outOfSight = false;

    constructor(physics, geometry) {
        this.physics = physics;
        this.geometry = geometry;

        const params = this.physics._addObject(this);

        this.id = params.id;
        this.tetOffset = params.tetStart;
        this.vertexOffset = params.vertexStart;

        this.createTetrahedralGeometry();
    }

    createTetrahedralGeometry() {
        // SoftbodyModel verts are already world-scale (centroid-fan); no upstream *3.
        const { tetVerts, tetIds } = this.geometry.model;
        for (let i = 0; i < tetVerts.length; i += 3) {
            const x = tetVerts[i];
            const y = tetVerts[i + 1];
            const z = tetVerts[i + 2];
            const vertex = this.physics.addVertex(this.id, x, y, z);
            this.vertices.push(vertex);
        }
        for (let i = 0; i < tetIds.length; i += 4) {
            const a = this.vertices[tetIds[i]];
            const b = this.vertices[tetIds[i + 1]];
            const c = this.vertices[tetIds[i + 2]];
            const d = this.vertices[tetIds[i + 3]];
            this.tets.push(this.physics.addTet(this.id, a, b, c, d));
        }
    }

    /**
     * Place/activate this instance in world space.
     * `velocity` here is holtsetio's Verlet delta (displacement per FEM step),
     * i.e. worldVelocity * dt — callers that have u/s must convert first
     * (see SlimeBurstFem.spawnChunk).
     */
    async reset(position, quaternion = null, scale = null, velocity = null) {
        const s = scale ?? new THREE.Vector3(1, 1, 1);
        const q = quaternion ?? new THREE.Quaternion();
        const v = velocity ?? new THREE.Vector3(0, 0, 0);
        await this.physics.resetObject(this.id, position, q, s, v);
        this.age = 0;
        this.spawned = true;
        this.outOfSight = false;
        this.geometry.updateCount();
    }

    async update(interval) {
        this.age += interval;
        const position = this.physics.getPosition(this.id);
        this.outOfSight = !this.spawned || position.z > 70;
    }
}
