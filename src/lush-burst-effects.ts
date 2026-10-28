import * as T from 'three/webgpu';
import {texture,uv,uniform,vec2,vec3,float,normalMap,cubeTexture,positionWorld,cameraPosition} from 'three/tsl';
import {HDRCubeTextureLoader} from 'three/addons/loaders/HDRCubeTextureLoader.js';
import {spring} from './hit-response.ts';
import {BURST_DEFAULTS,type BurstSettings} from './slime-burst-config.ts';
const ROOT=`${import.meta.env.BASE_URL}assets/lush-burst/`;
type Span={offset:number;length:number};
type Source={layer:number;life:number;parameters:Record<string,number>;textures:Record<string,string>;geometry:Record<string,Span>;transforms:Span;inputs:Span;positions?:Span;normals?:Span};
type Asset={objects:Source[];frames:number;fps:number;camera:{quaternion:number[]};textures:Record<string,string>};
const flip=(u:any)=>vec2(u.x,float(1).sub(u.y));
const sample=(t:T.Texture,u:any)=>texture(t,flip(u));
function warp(noise:T.Texture,u:any,time:any,tiles:any,pan:any,amount:any){let sum:any=vec2(0);for(const [x,y,a,b] of [[.1,.1,0,0],[-.1,-.1,.4181,.3548],[-.1,.1,.864861,.148384],[.1,-.1,.651340,.751638]])sum=sum.add(sample(noise,u.mul(tiles).add(time.mul(pan).mul(vec2(x,y))).add(vec2(a,b))).rg);return sum.mul(amount).mul(.25);}
const decode=(rg:any):any=>{const xy=rg.mul(2).sub(1);return vec3(xy,float(1).sub(xy.dot(xy)).max(0).sqrt());};
type Particle={enabled:boolean;index:number;mesh:T.Mesh;source:Source;tr:Float32Array;inputs:Float32Array;pos?:Float32Array;norm?:Float32Array;u:{time:any;x:any;alpha:any;particle:any;opacity:any;team:any}};
type Burst={root:T.Group;age:number;c:BurstSettings;particles:Particle[]};
type Puddle={age:number;c:BurstSettings;x:number;z:number;shape:number;angle:number;size:number;scale:number;settled:boolean;opacity:number};
/** Original Lush baked geometry, recovered material kernels; WebGPU node implementation. */
export class LushBurstEffects{
 private pool:Burst[]=[];private bursts:Burst[]=[];private puddles:Puddle[]=[];private clock=0;private width=16;private length=38;private dirty=false;
 private canvas=document.createElement('canvas');private ctx:CanvasRenderingContext2D;private mask:T.CanvasTexture;private floor:T.Mesh;private floorU:any;private globalC?:BurstSettings;
 private sourceCamera:T.Quaternion;
 private constructor(private scene:T.Scene,private data:Asset,private bytes:ArrayBuffer,private textures:Record<string,T.Texture>,private hdr:T.CubeTexture){
  this.sourceCamera=new T.Quaternion().fromArray(data.camera.quaternion);this.canvas.width=this.canvas.height=1024;this.ctx=this.canvas.getContext('2d')!;this.mask=new T.CanvasTexture(this.canvas);this.mask.colorSpace=T.NoColorSpace;this.mask.generateMipmaps=false;this.mask.minFilter=T.LinearFilter;
  this.floorU={time:uniform(0),color:uniform(new T.Color(1,.87,0)),noiseScale:uniform(13),range:uniform(1),power:uniform(10),innerPower:uniform(2),distortion:uniform(.05),speed:uniform(.3),normal:uniform(1),center:uniform(.03),edge:uniform(.9),reflection:uniform(.1),roughness:uniform(.05)};
  const a=this.floorU,u=uv(),w=warp(textures.T_Lush_Noise_01,u,a.time,vec2(10),a.speed,a.distortion),nu=u.mul(a.noiseScale).add(w),rt=texture(this.mask,u.add(w.div(a.noiseScale.mul(10)))).a,n=sample(textures.T_Lush_Noise_01,nu).r;
  const outer=rt.mul(n.mul(a.range).add(1)).max(0).pow(a.power).min(1),inner=rt.max(0).pow(a.power.mul(a.innerPower)).min(1),edge=outer.sub(inner).max(0),bump=inner.mul(a.center).add(edge).clamp().mul(a.normal),pn=decode(sample(textures.T_Lush_Noise_01_Normal,nu).rg).mul(vec3(bump as any,bump as any,1));
  const v=cameraPosition.sub(positionWorld).normalize(),view=vec3(v.x,v.z.negate(),v.y),ref=pn.mul(pn.dot(view)).mul(2).sub(view);
  const color=a.color.mul(edge.mul(a.edge.sub(1)).add(1)).add(cubeTexture(hdr,ref).rgb.mul(a.reflection).mul(edge).mul(outer)).clamp();
  const mat=new T.MeshPhysicalNodeMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,roughness:.05,specularIntensity:2});mat.colorNode=color;mat.opacityNode=outer;mat.normalNode=normalMap(pn.normalize().mul(.5).add(.5));mat.roughnessNode=a.roughness;
  this.floor=new T.Mesh(new T.PlaneGeometry(1,1),mat);this.floor.name='LushPersistentYellowPaint';this.floor.rotation.x=-Math.PI/2;this.floor.position.y=.035;this.floor.renderOrder=2;this.floor.visible=false;scene.add(this.floor);
 }
 static async load(scene:T.Scene,onProgress:(fraction:number)=>void=()=>{}){const [json,bin]=await Promise.all([fetch(ROOT+'scene.json'),fetch(ROOT+'scene.bin')]);if(!json.ok||!bin.ok)throw Error('Lush 特效动画资源加载失败');const data=await json.json() as Asset,bytes=await bin.arrayBuffer(),loader=new T.TextureLoader();onProgress(.1);const names=[...new Set([...Object.keys(data.textures).filter(n=>n!=='T_Lush_Dummy_Dif'),...[1,2,3].map(i=>`T_VFX_Lush_Splat_0${i}`)])];let complete=0;const textures=Object.fromEntries(await Promise.all(names.map(async n=>{const t=await loader.loadAsync(ROOT+n+'.png');t.colorSpace=T.NoColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.generateMipmaps=false;t.minFilter=T.LinearFilter;onProgress(.1+.65*++complete/names.length);return[n,t] as const})));const hdr=await new HDRCubeTextureLoader().loadAsync(Array.from({length:6},(_,i)=>ROOT+`Side_${i}.hdr`));onProgress(1);return new LushBurstEffects(scene,data,bytes,textures,hdr);}
 private view(s:Span){return new Float32Array(this.bytes,s.offset,s.length);}
 private material(o:Source,c:BurstSettings){const p=o.parameters,u={time:uniform(0),x:uniform(1),alpha:uniform(1),particle:uniform(new T.Vector3(1,1,1)),opacity:uniform(Number((c as any)[`burstLayer${o.layer}Opacity`]))},coord=flip(uv()),team=uniform(new T.Vector3(c.burstColorR,c.burstColorG,c.burstColorB));
  const erode=(mask:any)=>mask.add(u.x).add(p['preview Lerp']).sub(1).div(p['Alpha Erosion Softness']).clamp();
  let mat:T.MeshBasicNodeMaterial|T.MeshPhysicalNodeMaterial;
  if(o.layer===0||o.layer===3){const w=warp(this.textures.T_Lush_Noise_01,coord,u.time,vec2(p['UV Distort U Tile'],p['UV Distort V Tile']),p['UV Distort Pan Speed'],p['UV Distortion Lerp']),duv=coord.mul(vec2(p['UV U Tile'],p['UV V Tile'])).mul(p['UV Tile Mult']).add(w),n=sample(this.textures.T_Lush_Noise_01,duv).r,mask=sample(this.textures.T_VFX_Lush_Gradient_Radial_Soft,coord).r;const coverage=o.layer===0?mask.max(0).pow(p['Opacity Power']).mul(erode(n)):erode(n.mul(mask.max(0).pow(p['Op Mask Power']).min(1).sub(1).mul(p['Op Mask Intensity']).add(1)));
   mat=new T.MeshPhysicalNodeMaterial({side:T.DoubleSide,roughness:p['Paint Roughness'],specularIntensity:p['Paint Specular']*2,transparent:true,depthWrite:false});mat.colorNode=o.layer===0?team.mul(u.particle):team;mat.opacityNode=coverage.greaterThanEqual(.3333).select(u.opacity,float(0));const norm=decode(sample(this.textures.T_Lush_Noise_01_Normal,duv).rg).mul(vec3(p['Paint Normal Intensity'],p['Paint Normal Intensity'],1)).normalize();mat.normalNode=normalMap(norm.mul(.5).add(.5));
  }else{const tex=sample(this.textures[o.textures.Texture],coord);mat=new T.MeshBasicNodeMaterial({transparent:true,depthWrite:false,side:T.DoubleSide});mat.colorNode=team.mul(tex.rgb.max(0).pow(p['Opacity Power'])).mul(u.particle);mat.opacityNode=tex.r.max(0).pow(p['Opacity Power']).mul(u.alpha).mul(erode(sample(this.textures[o.textures['Erosion Texture']],coord).r)).clamp().mul(u.opacity);}
  return {mat,u:{...u,team}};
 }
 private allocate(c:BurstSettings){
  const root=new T.Group();root.name='LushSlimeBurst';root.rotation.x=-Math.PI/2;root.visible=false;this.scene.add(root);
  const particles:Particle[]=[],indices=[0,0,0,0,0,0];
  for(const o of this.data.objects){if(o.layer<0)continue;const geometry=new T.BufferGeometry();for(const [key,n] of [['position',3],['normal',3],['uv',2]] as const){const attribute=new T.BufferAttribute(this.view(o.geometry[key]).slice(),n);if(o.positions&&key!=='uv')attribute.setUsage(T.DynamicDrawUsage);geometry.setAttribute(key,attribute);}
   const {mat,u}=this.material(o,c),mesh=new T.Mesh(geometry,mat);mesh.frustumCulled=false;root.add(mesh);particles.push({enabled:true,index:indices[o.layer]++,mesh,u,source:o,tr:this.view(o.transforms),inputs:this.view(o.inputs),pos:o.positions?this.view(o.positions):undefined,norm:o.normals?this.view(o.normals):undefined});}
  const b={root,age:0,c:{...c},particles};this.pool.push(b);return b;
 }
 emit(center:T.Vector3,feet:T.Vector3,c:BurstSettings,random:()=>number=Math.random){
  const b=this.pool.find(b=>!b.root.visible)??this.allocate(c);b.age=0;b.c={...c};b.root.visible=true;b.root.position.copy(center).add(new T.Vector3(c.burstFxX,c.burstFxY,c.burstFxZ));b.root.scale.setScalar(c.burstFxScale);
  const totals=[13,1,1,5,13,1];for(const p of b.particles){const l=p.source.layer;p.enabled=!!(c as any)[`burstLayer${l}Enabled`]&&p.index<Math.ceil(totals[l]*(c as any)[`burstLayer${l}Count`]);p.mesh.visible=false;p.u.team.value.set(c.burstColorR,c.burstColorG,c.burstColorB);p.u.opacity.value=(c as any)[`burstLayer${l}Opacity`];}
  this.bursts.push(b);if(c.puddleEnabled){const shape=c.puddleShape?Math.round(c.puddleShape)-1:Math.floor(random()*3);this.puddles.push({age:-c.puddleDelay,c:{...c},x:feet.x+c.puddleX,z:feet.z+c.puddleZ,shape,angle:(c.puddleRotation+(random()*2-1)*c.puddleRotationRange)*Math.PI/180,size:c.puddleSize*(1+(random()*2-1)*c.puddleSizeRange),scale:0,settled:false,opacity:1});this.dirty=true;}
 }
 /** Keep the exact meshes/materials that will be reused by gameplay visible for GPU warmup. */
 prepareWarmup(count:number,c:BurstSettings,camera:T.Camera,width:number,length:number){
  const warm={...c,...BURST_DEFAULTS};for(let i=0;i<count;i++)this.emit(new T.Vector3(0,1,0),new T.Vector3(),{...warm,puddleShape:i%3+1},()=>.5);
  this.update(.08,warm,width,length,camera);
 }
 update(dt:number,c:BurstSettings,width:number,length:number,camera:T.Camera){this.clock+=dt;this.globalC=c;const a=this.floorU;a.time.value=this.clock;a.color.value.setRGB(c.puddleColorR,c.puddleColorG,c.puddleColorB);for(const [key,setting] of Object.entries({noiseScale:'puddleNoiseScale',range:'puddleNoiseRange',power:'puddleOuterPower',innerPower:'puddleInnerPower',distortion:'puddleDistortion',speed:'puddleFlowSpeed',normal:'puddleNormal',center:'puddleCenterNormal',edge:'puddleEdgeColor',reflection:'puddleReflection',roughness:'puddleRoughness'}))a[key].value=(c as any)[setting];
  if(width!==this.width||length!==this.length){this.width=width;this.length=length;this.dirty=true;}this.floor.scale.set(width,length,1);
  const inverseRoot=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.PI/2),billboard=inverseRoot.multiply(camera.quaternion),q1=new T.Quaternion(),q2=new T.Quaternion();
  for(const b of this.bursts){b.age+=dt;let visible=0;for(const p of b.particles){const layer=p.source.layer,t=(b.age-b.c.burstFxDelay)*b.c.burstFxSpeed*(b.c as any)[`burstLayer${layer}Speed`];p.mesh.visible=p.enabled&&t>=0&&t<p.source.life;if(!p.mesh.visible)continue;visible++;const frame=Math.min(this.data.frames-1,t*this.data.fps),i=Math.floor(frame),j=Math.min(i+1,this.data.frames-1),mix=frame-i,at=(arr:Float32Array,n:number,k:number)=>T.MathUtils.lerp(arr[i*n+k],arr[j*n+k],mix);
   p.mesh.position.set(at(p.tr,10,0),at(p.tr,10,1),at(p.tr,10,2)-1);q1.fromArray(p.tr,i*10+3);q2.fromArray(p.tr,j*10+3);p.mesh.quaternion.copy(q1.slerp(q2,mix));if(layer!==3)p.mesh.quaternion.premultiply(this.sourceCamera.clone().invert()).premultiply(billboard);const size=(b.c as any)[`burstLayer${layer}Size`];p.mesh.scale.set(at(p.tr,10,7)*size,at(p.tr,10,8)*size,at(p.tr,10,9)*size);
   p.u.time.value=at(p.inputs,8,0);p.u.x.value=at(p.inputs,8,1);p.u.alpha.value=at(p.inputs,8,4);p.u.particle.value.set(at(p.inputs,8,5),at(p.inputs,8,6),at(p.inputs,8,7));
   if(p.pos&&p.norm)for(const [key,arr] of [['position',p.pos],['normal',p.norm]] as const){const attr=p.mesh.geometry.getAttribute(key) as T.BufferAttribute,n=attr.array.length;for(let k=0;k<n;k++)attr.array[k]=at(arr,n,k);attr.needsUpdate=true;}}
   if(!visible&&b.age>=b.c.burstFxDelay+Math.max(0,...b.particles.filter(p=>p.enabled).map(p=>p.source.life/(b.c.burstFxSpeed*(b.c as any)[`burstLayer${p.source.layer}Speed`]))))this.removeBurst(b);
  }
  for(const p of this.puddles){p.age+=dt;if(p.age<0)continue;if(!p.settled){const st=spring(p.c.puddleStart-1,p.c.puddleVelocity,p.age*p.c.puddleSpeed,p.c.puddleFrequency,p.c.puddleDamping);p.settled=Math.abs(st.x)<1e-5&&Math.abs(st.v)<1e-4;p.scale=p.settled?1:Math.max(0,1+st.x);this.dirty=true;}if(p.c.puddleLifetime>0&&p.age>p.c.puddleLifetime){p.opacity=p.c.puddleFade>0?Math.max(0,1-(p.age-p.c.puddleLifetime)/p.c.puddleFade):0;this.dirty=true;}}
  this.puddles=this.puddles.filter(p=>p.opacity>0);if(this.dirty)this.drawPuddles();
 }
 private drawPuddles(){const ctx=this.ctx,n=this.canvas.width;ctx.clearRect(0,0,n,n);for(const p of this.puddles){if(p.age<0||p.scale<1e-6)continue;ctx.save();ctx.translate((p.x/this.width+.5)*n,(p.z/this.length+.5)*n);ctx.scale(n/this.width,n/this.length);ctx.rotate(p.angle);ctx.globalAlpha=p.opacity;const size=p.size*p.scale;ctx.drawImage(this.textures[`T_VFX_Lush_Splat_0${p.shape+1}`].image as CanvasImageSource,-size/2,-size/2,size,size);ctx.restore();}this.mask.needsUpdate=true;this.floor.visible=this.puddles.some(p=>p.age>=0);this.dirty=false;}
 private removeBurst(b:Burst){b.root.visible=false;for(const p of b.particles)p.mesh.visible=false;this.bursts=this.bursts.filter(x=>x!==b);}
 clear(){this.clock=0;for(const b of [...this.bursts])this.removeBurst(b);this.puddles=[];this.ctx.clearRect(0,0,1024,1024);this.mask.needsUpdate=true;this.floor.visible=false;this.dirty=false;}
 snapshot(){return {allocated:this.pool.length,bursts:this.bursts.map(b=>({age:b.age,visible:b.particles.filter(p=>p.mesh.visible).length})),puddles:this.puddles.map(p=>({age:p.age,scale:p.scale,settled:p.settled,shape:p.shape,opacity:p.opacity,x:p.x,z:p.z})),color:this.globalC?[this.globalC.puddleColorR,this.globalC.puddleColorG,this.globalC.puddleColorB]:null};}
}
