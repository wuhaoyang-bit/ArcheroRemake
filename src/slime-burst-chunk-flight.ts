import * as T from 'three/webgpu';
import {slimeFlight,type FlightSettings} from './slime-flight-motion.ts';

export type ChunkFlightPiece={
  object:T.Object3D;
  /** Local-space origin at emit (parent of object). */
  origin:T.Vector3;
  direction:T.Vector3;
  age:number;
  /** Approximate radius for ground clamp (first phase). */
  radius:number;
  grounded:boolean;
};

/**
 * Distance from mesh.position (centroid) down to the lowest local vertex.
 * Must NOT use boundingSphere radius — that is ~half-diagonal and instantly
 * "grounds" chunks while their centers are still chest-high, so they barely fly.
 */
function chunkGroundClearance(object:T.Object3D){
  if(object instanceof T.Mesh&&object.geometry){
    const g=object.geometry;
    if(!g.boundingBox)g.computeBoundingBox();
    if(g.boundingBox){
      const sy=Math.abs(object.scale.y);
      // After recenter, bbox is centered near 0; bottom is -min.y in local Y.
      return Math.max(-g.boundingBox.min.y*sy,0.05);
    }
  }
  return 0.15;
}

/**
 * `fractureBy*` bakes world verts into geometry and leaves mesh.position at 0.
 * Recenter so mesh.position is the shard centroid (needed for eye-matched radial flight).
 */
export function recenterChunkMeshes(meshes:T.Object3D[]){
  const center=new T.Vector3();
  for(const object of meshes){
    if(!(object instanceof T.Mesh)||!object.geometry)continue;
    const g=object.geometry;
    if(!g.boundingBox)g.computeBoundingBox();
    if(!g.boundingBox)continue;
    g.boundingBox.getCenter(center);
    g.translate(-center.x,-center.y,-center.z);
    g.computeBoundingBox();
    g.computeBoundingSphere();
    object.position.add(center);
    object.updateMatrixWorld(true);
  }
}

/** Preview-only: chunk shards fly with the same radial curve as slime eyes. */
export class SlimeChunkFlight{
  private pieces:ChunkFlightPiece[]=[];
  private settings:FlightSettings|null=null;

  /** Emit all meshes. center is WORLD; convert via parent.worldToLocal like eyes. */
  emit(meshes:T.Object3D[],centerWorld:T.Vector3,parent:T.Object3D,settings:FlightSettings){
    this.pieces=[];
    recenterChunkMeshes(meshes);
    parent.updateWorldMatrix(true,false);
    const localCenter=parent.worldToLocal(centerWorld.clone());
    this.settings={...settings,slimeEyeSpeedCurve:settings.slimeEyeSpeedCurve?.map(p=>({...p}))};
    for(const mesh of meshes){
      mesh.matrixAutoUpdate=true;
      const origin=mesh.position.clone();
      const direction=origin.clone().sub(localCenter);
      if(direction.lengthSq()<1e-12)direction.set(0,1,0);
      direction.normalize();
      this.pieces.push({object:mesh,origin,direction,age:0,radius:chunkGroundClearance(mesh),grounded:false});
    }
  }

  update(dt:number){
    if(dt<=0||!this.settings)return;
    const c=this.settings;
    for(const p of this.pieces){
      if(p.grounded)continue;
      p.age+=dt;
      const motion=slimeFlight(p.age,c);
      p.object.position.copy(p.origin).addScaledVector(p.direction,motion.distance);
      p.object.position.y-=motion.drop;
      const vy=p.direction.y*motion.speed-motion.fallSpeed;
      // Ground when the shard underside would hit y=0 (center at clearance).
      if(p.object.position.y<=p.radius&&vy<=0){
        p.object.position.y=p.radius;
        p.grounded=true;
      }
    }
  }

  clear(){this.pieces=[];this.settings=null;}
  get active(){return this.pieces.some(p=>!p.grounded);}
  getPieces(){return this.pieces;}
  snapshot(){return this.pieces.map(p=>({
    age:p.age,
    position:p.object.position.toArray(),
    direction:p.direction.toArray(),
    grounded:p.grounded,
  }));}
}
