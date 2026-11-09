// @ts-nocheck
import * as THREE from "three/webgpu";
import {vec3, vec4, float} from "three/tsl";

/**
 * Minimal ground-plane collider for preview.
 * SDF: (normal.xyz, signedDistance) — negative distance = penetration.
 */
export class CollisionGeometry {
    constructor(physics, groundY = 0) {
        this.physics = physics;
        this.groundY = groundY;
        this.object = new THREE.Object3D();
    }

    async createGeometry() {
        const y0 = this.groundY;
        const collider = (positionImmutable) => {
            const position = vec3(positionImmutable).toVar();
            const dist = position.y.sub(float(y0));
            return vec4(0, 1, 0, dist);
        };
        this.physics.addCollider(collider);
    }

    update(_delta, _elapsed) {}

    dispose() {}
}

export default CollisionGeometry;
