// @ts-nocheck
import * as THREE from "three/webgpu";
import {
    attribute,
    float,
    Fn,
    transformNormalToView,
    varying,
    vec3,
} from "three/tsl";
import {rotateByQuat} from "./math.ts";
import {SoftbodyInstance} from "./softbodyInstance.ts";

export class SoftbodyGeometry {
    physics = null;
    model = 0;
    instances = [];
    mesh = null;
    geometry = null;
    material = /** @type {any} */ (null);

    constructor(physics, model, materialClass) {
        this.physics = physics;
        this.model = model;

        this.createMaterial(materialClass);
    }

    createGeometry() {
        const { attachedTets, baryCoords, positions, normals, uvs, indices, tetIds } = this.model;
        const instanceCount = this.instances.length;
        if (instanceCount === 0) { return; }

        const vertexCount = attachedTets.length;
        const positionArray = new Float32Array(positions);
        const normalArray = new Float32Array(normals);
        const uvArray = new Float32Array(uvs);
        const tetIdArray = new Uint32Array(vertexCount);
        const vertexIdArray = new Uint32Array(vertexCount * 4);
        const tetBaryCoordsArray = new Float32Array(baryCoords);

        const instanceDataArray = new Uint32Array(instanceCount * 3);

        for (let i = 0; i < instanceCount; i++) {
            const instance = this.instances[i];
            instanceDataArray[i * 3 + 0] = instance.id;
            instanceDataArray[i * 3 + 1] = instance.tetOffset;
            instanceDataArray[i * 3 + 2] = instance.vertexOffset;
        }

        for (let i = 0; i < vertexCount; i++) {
            const tetId = attachedTets[i];
            tetIdArray[i] = tetId;
            vertexIdArray[i * 4 + 0] = tetIds[tetId * 4 + 0];
            vertexIdArray[i * 4 + 1] = tetIds[tetId * 4 + 1];
            vertexIdArray[i * 4 + 2] = tetIds[tetId * 4 + 2];
            vertexIdArray[i * 4 + 3] = tetIds[tetId * 4 + 3];
        }

        const positionBuffer = new THREE.BufferAttribute(positionArray, 3, false);
        const normalBuffer = new THREE.BufferAttribute(normalArray, 3, false);
        const uvBuffer = new THREE.BufferAttribute(uvArray, 2, false);
        const tetIdBuffer = new THREE.BufferAttribute(tetIdArray, 1, false);
        const vertexIdsBuffer = new THREE.BufferAttribute(vertexIdArray, 4, false);
        const tetBaryCoordsBuffer = new THREE.BufferAttribute(tetBaryCoordsArray, 3, false);
        const instanceDataBuffer = new THREE.InstancedBufferAttribute(instanceDataArray, 3, false);

        const geometry = new THREE.InstancedBufferGeometry();
        geometry.setAttribute("position", positionBuffer);
        geometry.setAttribute("normal", normalBuffer);
        geometry.setAttribute("uv", uvBuffer);
        geometry.setAttribute("tetId", tetIdBuffer);
        geometry.setAttribute("vertexIds", vertexIdsBuffer);
        geometry.setAttribute("tetBaryCoords", tetBaryCoordsBuffer);
        geometry.setAttribute("instanceData", instanceDataBuffer);
        geometry.setIndex(indices);
        geometry.instanceCount = instanceCount;
        this.geometry = geometry;

        const object = new THREE.Mesh(geometry, this.material);
        object.frustumCulled = false;
        object.castShadow = true;
        object.receiveShadow = true;
        this.mesh = object;

        // Also register on physics.object so demo-style scene.add(physics.object) works.
        this.physics.object.add(object);
    }

    updateCount() {
        if (this.instances.length === 0 || !this.geometry) { return; }
        const totalCount = this.physics.objectCount;
        const count = this.instances.filter(i => i.id < totalCount && i.spawned).length;
        this.geometry.instanceCount = count;
    }

    addInstance() {
        const instance = new SoftbodyInstance(this.physics, this);
        this.instances.push(instance);
        return instance;
    }

    async bake() {
        this.createGeometry();
    }

    createMaterial(materialClass) {
        const material = new materialClass({
            color: 0xffdd32,
            roughness: 0.35,
            metalness: 0,
            side: THREE.DoubleSide,
            transparent: false,
            depthWrite: true,
        });
        if ("transmission" in material) material.transmission = 0;
        if ("emissive" in material) {
            material.emissive = new THREE.Color(0xffc94a);
            material.emissiveIntensity = 0.35;
        }

        const vNormal = varying(vec3(0), "v_normalView");
        const vDistance = varying(float(0), "v_distance");
        material.positionNode = Fn(() => {
            const tetOffset = attribute("instanceData").y;
            const vertexOffset = attribute("instanceData").z;

            const tetId = attribute("tetId").add(tetOffset);

            const vertexIds = attribute("vertexIds").add(vertexOffset).toVar();
            const baryCoords = attribute("tetBaryCoords");
            const v0 = this.physics.vertexBuffer.get(vertexIds.x, "position").xyz.toVar();
            const v1 = this.physics.vertexBuffer.get(vertexIds.y, "position").xyz.toVar();
            const v2 = this.physics.vertexBuffer.get(vertexIds.z, "position").xyz.toVar();
            const v3 = this.physics.vertexBuffer.get(vertexIds.w, "position").xyz.toVar();
            const quat = this.physics.tetBuffer.get(tetId, "quat");

            const normal = rotateByQuat(attribute("normal"), quat);
            vNormal.assign(transformNormalToView(normal));
            vDistance.assign(attribute("position").length());

            const a = v1.sub(v0).mul(baryCoords.x);
            const b = v2.sub(v0).mul(baryCoords.y);
            const c = v3.sub(v0).mul(baryCoords.z);
            const position = a.add(b).add(c).add(v0).toVar();

            return position;
        })();

        this.material = material;
    }

    dispose() {
        if (this.geometry) this.geometry.dispose();
        if (this.material) this.material.dispose();
        if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
    }
}
