import * as T from 'three/webgpu';
/** Diagnostic overlays only: never used as collision targets. */
export class HitDebug {
 enabled=false;pauseOnHit=true;paused=false;speed=1;stepRequested=false;
 readonly group=new T.Group();
 private proxyMaterial=new T.MeshBasicMaterial({color:0x38d6ff,wireframe:true,transparent:true,opacity:.35,depthTest:false,depthWrite:false});
 private ghostMaterial=new T.MeshBasicMaterial({color:0xffc43c,transparent:true,opacity:.85,depthTest:false,depthWrite:false});
 private beforeMaterial=new T.MeshBasicMaterial({color:0x6699ff,transparent:true,opacity:.45,depthTest:false,depthWrite:false});
 private proxies:{source:T.Mesh;overlay:T.Mesh}[]=[];
 private targets:T.Object3D[]=[];
 private tracePoints:T.Vector3[]=[];
 private traceGeometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(256*3),3));
 private trace=new T.LineSegments(this.traceGeometry,new T.LineBasicMaterial({color:0xffd84d,depthTest:false,depthWrite:false}));
 private contact=new T.Mesh(new T.SphereGeometry(.09,12,8),new T.MeshBasicMaterial({color:0xff3045,depthTest:false,depthWrite:false}));
 private tips=new T.Group();private tipGeometry=new T.SphereGeometry(.055,8,6);private tipMaterial=new T.MeshBasicMaterial({color:0x00ff9c,depthTest:false,depthWrite:false});
 private ghosts=new T.Group();
 last:null|{id:string;point:number[];from:number[];to:number[];tipBefore:number[];gap:number;travel:number;kind:string}=null;
 constructor(scene:T.Scene){this.group.name='Hit diagnostics';this.traceGeometry.setDrawRange(0,0);this.group.visible=false;this.group.renderOrder=1000;this.contact.visible=false;this.group.add(this.trace,this.contact,this.tips,this.ghosts);scene.add(this.group);}
 setTargets(targets:T.Object3D[]){this.targets=targets;for(const p of this.proxies)this.group.remove(p.overlay);this.proxies=[];
  for(const target of targets)target.traverse(o=>{if(o instanceof T.Mesh){const overlay=new T.Mesh(o.geometry,this.proxyMaterial);overlay.matrixAutoUpdate=false;overlay.frustumCulled=false;overlay.renderOrder=1000;this.group.add(overlay);this.proxies.push({source:o,overlay});}});
 }
 sweep(from:T.Vector3,to:T.Vector3){if(!this.enabled)return;this.tracePoints.push(from.clone(),to.clone());if(this.tracePoints.length>256)this.tracePoints.splice(0,2);}
 capture(object:T.Object3D,direction:T.Vector3,tip:number,from:T.Vector3,travel:number,point:T.Vector3,id:string,kind:string){
  if(!this.enabled)return;
  const before=object.position.clone().addScaledVector(direction,tip);
  this.last={id,point:point.toArray(),from:from.toArray(),to:from.clone().addScaledVector(direction,travel).toArray(),tipBefore:before.toArray(),gap:before.distanceTo(point),travel,kind};
  this.contact.position.copy(point);this.contact.visible=true;this.ghosts.clear();
  for(const [material,pos] of [[this.beforeMaterial,object.position],[this.ghostMaterial,point.clone().addScaledVector(direction,-tip)]] as const){
   const ghost=object.clone(true);ghost.visible=true;ghost.position.copy(pos);ghost.traverse(o=>{if(o instanceof T.Mesh){o.material=material;o.castShadow=false;o.receiveShadow=false;o.renderOrder=1001;}});this.ghosts.add(ghost);
  }
  if(this.pauseOnHit)this.paused=true;
 }
 clear(){this.last=null;this.paused=false;this.stepRequested=false;this.tracePoints=[];this.contact.visible=false;this.ghosts.clear();}
 update(tips:number[][]){
  this.group.visible=this.enabled;if(!this.enabled)return;
  for(const p of this.proxies){p.source.updateWorldMatrix(true,false);p.overlay.matrix.copy(p.source.matrixWorld);}
  const positions=this.traceGeometry.attributes.position;this.tracePoints.forEach((p,i)=>positions.setXYZ(i,p.x,p.y,p.z));positions.needsUpdate=true;this.traceGeometry.setDrawRange(0,this.tracePoints.length);this.trace.frustumCulled=false;
  while(this.tips.children.length<tips.length)this.tips.add(new T.Mesh(this.tipGeometry,this.tipMaterial));
  this.tips.children.forEach((o,i)=>{o.visible=i<tips.length;if(o.visible)o.position.fromArray(tips[i]);});
  this.group.traverse(o=>{o.renderOrder=1000;});
 }
 snapshot(){return {enabled:this.enabled,paused:this.paused,pauseOnHit:this.pauseOnHit,speed:this.speed,last:this.last,proxyMeshes:this.proxies.length,targets:this.targets.length};}
}
