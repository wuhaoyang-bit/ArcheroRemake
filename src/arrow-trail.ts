import { ARROW_TRAIL_DEFAULTS, type ArrowTrailSettings } from './arrow-trail-config.ts';
import * as T from 'three/webgpu';
import { uv, uniform } from 'three/tsl';

/** Camera-facing white ribbon: attached at the tail, tapered along the flown path. */
export class ArrowTrail {
  readonly mesh:T.Mesh;
  private opacity=uniform(.9);
  private fade=uniform(.65);
  private positions=new T.BufferAttribute(new Float32Array(13*2*3),3).setUsage(T.DynamicDrawUsage);
  private side=new T.Vector3();
  private view=new T.Vector3();
  constructor(){
    const geometry=new T.BufferGeometry(),coords:number[]=[],indices:number[]=[];
    for(let i=0;i<=12;i++){
      coords.push(1-i/12,0,1-i/12,1);
      if(i<12){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    geometry.setAttribute('position',this.positions);
    geometry.setAttribute('uv',new T.Float32BufferAttribute(coords,2));geometry.setIndex(indices);
    const material=new T.MeshBasicNodeMaterial({color:0xffffff,transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});
    material.opacityNode=uv().x.pow(this.fade).mul(this.opacity);
    this.mesh=new T.Mesh(geometry,material);this.mesh.name='ArrowTailTrail';
    this.mesh.frustumCulled=false;this.mesh.visible=false;
  }
  update(tail:T.Vector3,direction:T.Vector3,distance:number,scale:number,camera:T.Camera,c:ArrowTrailSettings=ARROW_TRAIL_DEFAULTS){
    const length=Math.min(distance,c.arrowTrailLength*scale);
    this.mesh.visible=!!c.arrowTrailEnabled&&length>1e-6&&c.arrowTrailWidth>0&&c.arrowTrailOpacity>0;
    this.opacity.value=c.arrowTrailOpacity;this.fade.value=c.arrowTrailFade;
    if(!this.mesh.visible)return;
    camera.getWorldPosition(this.view);this.view.sub(tail).normalize();
    this.side.crossVectors(direction,this.view);
    if(this.side.lengthSq()<1e-8)this.side.set(1,0,0).applyQuaternion(camera.quaternion);
    this.side.normalize();this.mesh.position.copy(tail);
    for(let i=0;i<=12;i++){
      const t=i/12,halfWidth=c.arrowTrailWidth*.5*scale*Math.pow(1-t,c.arrowTrailTaper);
      for(let j=0;j<2;j++){
        const width=(j===0?-1:1)*halfWidth;
        this.positions.setXYZ(i*2+j,-direction.x*length*t+this.side.x*width,-direction.y*length*t+this.side.y*width,-direction.z*length*t+this.side.z*width);
      }
    }
    this.positions.needsUpdate=true;
  }
  clear(){this.mesh.visible=false;}
}
