/**
 * INKWAVE droplet renderer, ported from GLSL to Three.js TSL (WebGPU).
 * Derived from src/fx/fx.js at slrgt/inkwave@7c970e6.
 * Copyright (c) 2026 Jayden Davis. MIT; see public/licenses/INKWAVE-LICENSE.txt.
 */
import * as T from 'three/webgpu';
import {
  Fn, attribute, cameraViewMatrix, cameraWorldMatrix, float, mix,
  toneMapping, smoothstep, uniform, varying, vec2, vec3, vec4,
} from 'three/tsl';

export interface LiquidDropVisual {
  p:T.Vector3; v:T.Vector3; radius:number; color:T.Color; age:number; seed:number;
}
export interface LiquidDropLighting {
  sunDirection:T.Vector3; sunColor:T.Color; skyColor:T.Color; groundColor:T.Color;
}

/** Two triangles per drop. Positions/colours are world-space / linear RGB. */
export class SlimeLiquidDrops {
  readonly mesh:T.Mesh<T.InstancedBufferGeometry,T.NodeMaterial>;
  private posRadius:T.InstancedBufferAttribute;
  private velocityStretch:T.InstancedBufferAttribute;
  private colorGloss:T.InstancedBufferAttribute;

  constructor(scene:T.Scene,readonly capacity:number,lighting?:LiquidDropLighting){
    // Match the game's light direction and warm key without multiplying its PBR
    // light intensity a second time. Neutral-ish indoor fill replaces INKWAVE's sky.
    const sun=scene.children.find((o):o is T.DirectionalLight=>o instanceof T.DirectionalLight);
    const hemi=scene.children.find((o):o is T.HemisphereLight=>o instanceof T.HemisphereLight);
    const light=lighting??{
      sunDirection:sun?sun.getWorldPosition(new T.Vector3()).sub(sun.target.getWorldPosition(new T.Vector3())).normalize():new T.Vector3(-.41,.83,-.38).normalize(),
      sunColor:sun?.color.clone()??new T.Color(1,.93,.84),
      skyColor:hemi?hemi.color.clone().multiplyScalar(.65):new T.Color(.42,.62,.95),
      groundColor:hemi?hemi.groundColor.clone().multiplyScalar(.5):new T.Color(.5,.46,.42),
    };
    const sunDir=uniform(light.sunDirection.clone().normalize());
    const sunCol=uniform(light.sunColor.clone()),skyCol=uniform(light.skyColor.clone()),groundCol=uniform(light.groundColor.clone());
    const sunV=cameraViewMatrix.mul(vec4(sunDir,0)).xyz;
    const upV=cameraViewMatrix.mul(vec4(0,1,0,0)).xyz;

    const base=new T.PlaneGeometry(2,2),geo=new T.InstancedBufferGeometry();
    geo.setIndex(base.index!);geo.setAttribute('position',base.getAttribute('position'));geo.setAttribute('normal',base.getAttribute('normal'));base.dispose();
    const buffer=(name:string)=>{const a=new T.InstancedBufferAttribute(new Float32Array(capacity*4),4).setUsage(T.DynamicDrawUsage);geo.setAttribute(name,a);return a;};
    this.posRadius=buffer('aPosR');this.velocityStretch=buffer('aVelS');this.colorGloss=buffer('aColA');geo.instanceCount=0;

    const pr=attribute('aPosR','vec4'),vs=attribute('aVelS','vec4'),ca=attribute('aColA','vec4');
    const position=attribute('position','vec3');
    const vv=cameraViewMatrix.mul(vec4(vs.xyz,0)).xyz;
    const s3=vv.length(),s2=vv.xy.length();
    const axis=s2.greaterThan(1e-4).select(vv.xy.div(s2.max(1e-4)),vec2(0,1));
    const stretch=vs.w.sub(1).mul(s2.div(s3.max(1e-4))).add(1);
    const side=vec2(axis.y,axis.x.negate());
    const coords=varying(position.xy),ax=varying(axis),colGloss=varying(ca);
    const tail=varying(stretch.sub(1.15).div(1.1).clamp());

    const mat=new T.NodeMaterial();mat.name='INKWAVE liquid drops (TSL)';
    mat.alphaToCoverage=true;mat.fog=false;
    // positionNode is also reused by Three's shadow pass, so the light gets the
    // same velocity-aligned silhouette, rather than the untransformed quad.
    mat.positionNode=Fn(()=>{
      const center=cameraViewMatrix.mul(vec4(pr.xyz,1)).xyz.toVar();
      center.xy.addAssign(axis.mul(position.y).mul(pr.w).mul(stretch).add(side.mul(position.x).mul(pr.w).div(stretch.sqrt())));
      center.addAssign(center.negate().normalize().mul(pr.w).mul(.6));
      // The owned mesh stays at the world origin; simulation already supplies world positions.
      return cameraWorldMatrix.mul(vec4(center,1)).xyz;
    })();

    // Capsule with different head/tail radii: slow = sphere, fast = teardrop.
    const yc=tail.mul(.42),rh=yc.oneMinus(),rt=mix(rh,.1,tail);
    const pa=coords.sub(vec2(0,yc)),ba=vec2(0,rt.sub(1).sub(yc));
    const h=tail.greaterThan(0).select(pa.dot(ba).div(ba.dot(ba).max(1e-8)).clamp(),float(0));
    const offset=pa.sub(ba.mul(h)),radius=mix(rh,rt,h),sd=offset.length().sub(radius);
    // Shadow masks must not shade the rectangular billboard. No derivative or
    // view-dependent colour is needed in this depth-only pass.
    mat.maskShadowNode=sd.lessThan(0);
    mat.fragmentNode=Fn(()=>{
      const fw=sd.fwidth().max(1e-4),coverage=smoothstep(fw.negate(),fw,sd).oneMinus();
      coverage.lessThanEqual(0).discard();
      const q=offset.div(radius.max(1e-3)).toVar();
      const z=q.dot(q).oneMinus().max(0).sqrt();
      const bx=vec2(ax.y,ax.x.negate());
      const n=vec3(bx.mul(q.x).add(ax.mul(q.y)),z.add(.05)).normalize().toVar();
      const color=colGloss.rgb,g=colGloss.a,edge=z.oneMinus();
      const amb=mix(groundCol,skyCol,n.dot(upV).mul(.5).add(.5));
      const base=color.mul(amb.mul(.55).add(sunCol.mul(n.dot(sunV).mul(.6).add(.4).clamp()).mul(.8)).add(.14)).toVar();
      const sxy=vec2(sunV.xy.dot(bx),sunV.xy.dot(ax)).add(1e-4).normalize();
      const trans=q.dot(sxy).negate().clamp().pow(1.5).mul(edge.mul(.65).add(.35));
      base.addAssign(color.mul(color.add(.25)).mul(trans).mul(.7).mul(g));
      base.mulAssign(mix(1,.6,edge.pow(2.2).mul(g)));
      const reflected=vec3(0,0,-1).reflect(n).toVar();
      const env=mix(groundCol.mul(.7),skyCol.mul(1.4),smoothstep(-.15,.35,reflected.dot(upV)));
      const fres=edge.pow(4).mul(.96).add(.04).mul(g);
      const lit=mix(base,env,fres.mul(.42)).toVar();
      const rl=reflected.dot(sunV).clamp();
      lit.addAssign(sunCol.mul(rl.pow(150).mul(7).add(rl.pow(16).mul(.28))).mul(g));
      lit.mulAssign(mix(.85,1,g));
      // Match the source's Neutral curve. Game and lab use LinearToneMapping at
      // exposure 1: WebGPU applies that globally, ignoring material.toneMapped.
      // ToneMappingNode returns vec4 at runtime, so take RGB explicitly to retain coverage.
      return vec4(toneMapping(T.NeutralToneMapping,float(1),lit).rgb,coverage);
    })();
    this.mesh=new T.Mesh(geo,mat);this.mesh.name='SlimeLiquidDrops';this.mesh.frustumCulled=false;this.mesh.renderOrder=4;this.mesh.visible=false;scene.add(this.mesh);
  }

  update(drops:readonly LiquidDropVisual[],visible:boolean,castShadow:boolean){
    this.mesh.visible=visible;this.mesh.castShadow=castShadow;
    if(!visible)return;
    const count=Math.min(drops.length,this.capacity);
    for(let i=0;i<count;i++){
      const d=drops[i];
      let stretch=1+Math.min(d.v.length()*.062,2.3);
      stretch*=1+.14*Math.sin(d.age*38+d.seed*20)*Math.min(1,d.age*6);
      const grow=Math.min(1,d.age*22+.35),fade=T.MathUtils.clamp((5-d.age)/.12,0,1);
      this.posRadius.setXYZW(i,d.p.x,d.p.y,d.p.z,d.radius*grow*fade);
      this.velocityStretch.setXYZW(i,d.v.x,d.v.y,d.v.z,Math.max(1,stretch));
      this.colorGloss.setXYZW(i,d.color.r,d.color.g,d.color.b,1);
    }
    this.mesh.geometry.instanceCount=count;
    if(count)for(const a of [this.posRadius,this.velocityStretch,this.colorGloss]){a.clearUpdateRanges();a.addUpdateRange(0,count*4);a.needsUpdate=true;}
  }

  clear(){this.mesh.geometry.instanceCount=0;this.mesh.visible=false;}
}
