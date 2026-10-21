// REEBOO masks, ramps and base parameters: Copyright (c) 2026 REEBOO Labs, MIT.
// See public/licenses/REEBOO-LICENSE.txt. Ported to TSL for the existing WebGPU renderer.
import * as T from 'three/webgpu';
import { uv, attribute, float, max, smoothstep, texture, orthographicDepthToViewZ, cameraNear, cameraFar, positionView } from 'three/tsl';
import type { HitSettings } from './hit-feedback-config.ts';
type Kind='flash'|'glow'|'ring'|'spark'|'ember'|'direction';
type Particle={active:boolean;age:number;life:number;kind:Kind;origin:T.Vector3;velocity:T.Vector3;position:T.Vector3;initialVelocity:T.Vector3;drag:number;gravity:number;scale:number;spin:number;pathCount:number;path:T.Vector3[];speeds:T.Vector3[]};
type Batch={mesh:T.InstancedMesh;shape:T.InstancedBufferAttribute;tint:T.InstancedBufferAttribute;alpha:T.InstancedBufferAttribute;particles:Particle[]};
const ramps:Record<string,number[][]>={flash:[[0,1,1,1,1],[.5,1,.8,.45,1],[1,1,.5,.15,0]],glow:[[0,1,.75,.4,.8],[1,1,.35,.08,0]],ring:[[0,1,.9,.7,1],[1,1,.5,.2,0]],spark:[[0,1,1,.9,1],[.3,1,.75,.3,1],[1,1,.3,.05,0]],ember:[[0,1,.85,.5,1],[.7,1,.45,.1,1],[1,1,.3,.05,0]]};
const lerp=T.MathUtils.lerp,smooth=(t:number)=>t*t*(3-2*t),random=(a:number,b:number)=>lerp(a,b,Math.random());
export class HitParticles {
  private depthTarget=new T.RenderTarget(1,1,{depthTexture:new T.DepthTexture(1,1),samples:0});
  private depthMaterial=new T.MeshBasicNodeMaterial({colorWrite:false});
  private targetSize=new T.Vector2();
  group=new T.Group();private batches:Batch[]=[];private lights:{light:T.PointLight;age:number}[]=[];
  private matrix=new T.Object3D();private basis=new T.Matrix4();private side=new T.Vector3();private front=new T.Vector3();private y=new T.Vector3();private view=new T.Vector3();private color=new T.Color();
  emitted=0;
  constructor(private scene:T.Scene){this.group.name='HitParticles';scene.add(this.group);this.allocate();for(let i=0;i<8;i++){const light=new T.PointLight(0xffb866,0,4,2);light.castShadow=false;scene.add(light);this.lights.push({light,age:Infinity});}}
  private allocate(){const geometry=new T.PlaneGeometry(1,1);const shape=new T.InstancedBufferAttribute(new Float32Array(256),1).setUsage(T.DynamicDrawUsage),tint=new T.InstancedBufferAttribute(new Float32Array(256*3),3).setUsage(T.DynamicDrawUsage),alpha=new T.InstancedBufferAttribute(new Float32Array(256),1).setUsage(T.DynamicDrawUsage);geometry.setAttribute('hitShape',shape);geometry.setAttribute('hitTint',tint);geometry.setAttribute('hitAlpha',alpha);
    const p=uv().mul(2).sub(1),r=p.length(),s=attribute('hitShape','float');
    const radial=smoothstep(0,s.greaterThan(3.5).select(.8,1),float(1).sub(r).clamp());
    const star=r.mul(r).mul(-9).exp().add(max(p.x.abs().mul(-28).exp().mul(float(1).sub(p.y.abs())),p.y.abs().mul(-28).exp().mul(float(1).sub(p.x.abs()))).mul(.9)).clamp();
    const spark=float(1).sub(p.x.abs()).clamp().pow(2.5).mul(float(1).sub(p.y.abs()).clamp().pow(.6));
    const ring=float(1).sub(smoothstep(0,.05,r.sub(.95).abs())).mul(r.lessThanEqual(1).select(1,0));
    const mask=s.lessThan(.5).select(radial,s.lessThan(1.5).select(star,s.lessThan(2.5).select(spark,s.lessThan(3.5).select(ring,radial))));
    // Orthographic view-space depth: preserve opaque occlusion and soften intersections.
    const sceneZ=orthographicDepthToViewZ(texture(this.depthTarget.depthTexture!).r,cameraNear,cameraFar);
    const soft=smoothstep(0,.25,positionView.z.sub(sceneZ));
    const material=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,blending:T.AdditiveBlending,toneMapped:false});
    material.colorNode=attribute('hitTint','vec3');material.opacityNode=mask.mul(attribute('hitAlpha','float')).mul(soft);
    const mesh=new T.InstancedMesh(geometry,material,256);mesh.name='REEBOO pooled hit quads';mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=10;this.group.add(mesh);
    this.batches.push({mesh,shape,tint,alpha,particles:Array.from({length:256},()=>({active:false,age:0,life:0,kind:'spark',origin:new T.Vector3(),velocity:new T.Vector3(),position:new T.Vector3(),initialVelocity:new T.Vector3(),drag:0,gravity:0,scale:1,spin:0,pathCount:0,path:[],speeds:[]}))});
  }
  private spawn(kind:Kind,origin:T.Vector3,velocity:T.Vector3,life:number,scale:number,drag=0,gravity=0){let batch=this.batches.find(b=>b.particles.some(p=>!p.active));if(!batch){this.allocate();batch=this.batches.at(-1)!;}const p=batch.particles.find(p=>!p.active)!;Object.assign(p,{active:true,age:0,life,kind,scale,drag,gravity,spin:kind==='flash'?random(0,Math.PI/2):0});p.origin.copy(origin);p.initialVelocity.copy(velocity);p.velocity.copy(velocity);p.position.copy(origin);p.pathCount=0;
    if(kind==='spark'||kind==='ember'){const pos=new T.Vector3(),vel=velocity.clone();const save=()=>{const k=p.pathCount++;(p.path[k]??=new T.Vector3()).copy(pos);(p.speeds[k]??=new T.Vector3()).copy(vel);};save();for(let i=0;i<=Math.ceil(life*240);i++){vel.y-=gravity/240;const speed=vel.length();vel.multiplyScalar(speed?Math.max(0,speed-drag/240)/speed:0);pos.addScaledVector(vel,1/240);save();}}
    this.emitted++;
  }
  emit(origin:T.Vector3,direction:T.Vector3,c:HitSettings){const zero=new T.Vector3();if(c.hitBaseEnabled){this.spawn('flash',origin,zero,.12,random(2.2,2.6));this.spawn('glow',origin,zero,.2,1.2);this.spawn('ring',origin,zero,.2,2.2);
    for(const kind of ['spark','ember'] as const)for(let i=0;i<(kind==='spark'?20:10);i++){const y=random(-1,1),a=random(0,Math.PI*2),s=Math.sqrt(1-y*y),v=new T.Vector3(s*Math.cos(a),y,s*Math.sin(a)).multiplyScalar(kind==='spark'?random(6,12):random(2,4.5));this.spawn(kind,origin,v,kind==='spark'?random(.2,.4):random(.48,.8),kind==='spark'?random(.6,1.1):1,kind==='spark'?random(10,16):random(2,3),kind==='spark'?6:2);}
    const slot=this.lights.find(l=>l.age>=.25)??this.lights.reduce((a,b)=>a.age>b.age?a:b);slot.age=0;slot.light.position.copy(origin).y+=.3;
    }
    if(c.hitDirectionEnabled){const axis=direction.clone().normalize(),reference=Math.abs(axis.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0),u=new T.Vector3().crossVectors(axis,reference).normalize(),v=new T.Vector3().crossVectors(axis,u);for(let i=0;i<Math.round(c.hitParticleCount);i++){const cos=1-Math.random()*(1-Math.cos(c.hitParticleAngle*Math.PI/180)),sin=Math.sqrt(1-cos*cos),phi=random(0,Math.PI*2),velocity=axis.clone().multiplyScalar(cos).addScaledVector(u,sin*Math.cos(phi)).addScaledVector(v,sin*Math.sin(phi)).multiplyScalar(random(Math.min(c.hitParticleMinSpeed,c.hitParticleMaxSpeed),Math.max(c.hitParticleMinSpeed,c.hitParticleMaxSpeed)));this.spawn('direction',origin,velocity,c.hitParticleLife*random(.72,1),random(.6,1.1)*c.hitParticleSize,c.hitParticleDrag);}}
  }
  update(dt:number,c:HitSettings){for(const b of this.batches)for(const p of b.particles){if(!p.active)continue;p.age+=dt;if(p.age>=p.life){p.active=false;continue;}if(p.kind==='direction'){const decay=Math.exp(-p.drag*p.age);p.velocity.copy(p.initialVelocity).multiplyScalar(decay);p.position.copy(p.origin).addScaledVector(p.initialVelocity,p.drag>1e-8?(1-decay)/p.drag:p.age);}else if(p.pathCount){const t=p.age*240,i=Math.min(Math.floor(t),p.pathCount-2),f=t-i;p.position.copy(p.path[i]).lerp(p.path[i+1],f).add(p.origin);p.velocity.copy(p.speeds[i]).lerp(p.speeds[i+1],f);}}
    for(const l of this.lights){l.age+=dt;l.light.intensity=c.hitBaseEnabled&&l.age<.25?5*Math.pow(2,-10*l.age/.25):0;}
  }
  prepare(camera:T.Camera,c:HitSettings){for(const b of this.batches){let count=0;for(const p of b.particles){if(!p.active||!(p.kind==='direction'?c.hitDirectionEnabled:c.hitBaseEnabled))continue;const age=p.age/p.life;let shape=0,energy=2,w=1,h=1,s=p.scale;switch(p.kind){case 'flash':shape=1;energy=6;s*=lerp(1,.25,smooth(age));break;case 'glow':s*=lerp(.6,1,smooth(age));break;case 'ring':shape=3;energy=4;s*=age<.3?lerp(.15,.75,smooth(age/.3)):lerp(.75,1,smooth((age-.3)/.7));break;case 'spark':case 'direction':shape=2;energy=6;w=.07;h=.6;s*=1-smooth(age);break;case 'ember':shape=4;energy=5;w=h=.09;break;}
      this.matrix.position.copy(p.position);this.matrix.scale.set(w*s,h*s,1);
      if(shape===2){this.y.copy(p.velocity).normalize();if(this.y.lengthSq()<1e-6)this.y.set(0,1,0);camera.getWorldDirection(this.view).negate();this.side.crossVectors(this.y,this.view).normalize();if(this.side.lengthSq()<1e-6)this.side.set(1,0,0);this.front.crossVectors(this.side,this.y).normalize();this.basis.makeBasis(this.side,this.y,this.front);this.matrix.quaternion.setFromRotationMatrix(this.basis);}else{this.matrix.quaternion.copy(camera.quaternion);this.matrix.rotateZ(p.spin);}
      this.matrix.updateMatrix();b.mesh.setMatrixAt(count,this.matrix.matrix);b.shape.setX(count,shape);const pts=ramps[p.kind==='direction'?'spark':p.kind];let k=1;while(k<pts.length-1&&age>pts[k][0])k++;const a=pts[k-1],z=pts[k],f=(age-a[0])/(z[0]-a[0]);this.color.setRGB(lerp(a[1],z[1],f),lerp(a[2],z[2],f),lerp(a[3],z[3],f),T.SRGBColorSpace).multiplyScalar(energy);b.tint.setXYZ(count,this.color.r,this.color.g,this.color.b);b.alpha.setX(count,lerp(a[4],z[4],f));count++;
    }b.mesh.count=count;b.mesh.instanceMatrix.needsUpdate=true;b.shape.needsUpdate=b.tint.needsUpdate=b.alpha.needsUpdate=true;}}
  renderDepth(renderer:T.WebGPURenderer,camera:T.Camera){
    if(!this.batches.some(b=>b.mesh.count>0))return;
    renderer.getDrawingBufferSize(this.targetSize);if(this.depthTarget.width!==this.targetSize.x||this.depthTarget.height!==this.targetSize.y)this.depthTarget.setSize(this.targetSize.x,this.targetSize.y);
    const previousTarget=renderer.getRenderTarget(),previousOverride=this.scene.overrideMaterial,visible=this.group.visible;
    try{this.group.visible=false;this.scene.overrideMaterial=this.depthMaterial;renderer.setRenderTarget(this.depthTarget);renderer.render(this.scene,camera);}
    finally{renderer.setRenderTarget(previousTarget);this.scene.overrideMaterial=previousOverride;this.group.visible=visible;}
  }
  clear(){for(const b of this.batches){b.particles.forEach(p=>p.active=false);b.mesh.count=0;}for(const l of this.lights){l.age=Infinity;l.light.intensity=0;}}
  snapshot(){const particles=this.batches.flatMap(b=>b.particles.filter(p=>p.active));return {active:particles.length,capacity:this.batches.length*256,emitted:this.emitted,lights:this.lights.filter(l=>l.light.intensity>0).length,particles:particles.slice(0,100).map(p=>({kind:p.kind,age:p.age,life:p.life,origin:p.origin.toArray(),position:p.position.toArray()}))};}
}
