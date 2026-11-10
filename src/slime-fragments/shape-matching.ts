// Scheme D: overlapping mass-weighted groups, Neo-Hookean XPBD and affine filtering.
import {Vector3} from 'three';
export type Params={softness:number;volume:number;damping:number;impactDamping:number;settleDamping:number;substeps:number;iterations:number;gravity:number;friction:number;bounce:number;speed:number;stretch:number;spin:number;groupFilter:number};
export const defaults:Params={softness:.008,volume:.000005,damping:1.8,impactDamping:18,settleDamping:5,substeps:8,iterations:1,gravity:20,friction:1,bounce:0,speed:1,stretch:1.2,spin:2,groupFilter:.75};
export type Element={ids:number[];q:Float64Array;rest:Float64Array;volume:number;lambdaD:number;lambdaH:number;weights:number[]};
const determinant=(a:ArrayLike<number>)=>a[0]*(a[4]*a[8]-a[5]*a[7])-a[1]*(a[3]*a[8]-a[5]*a[6])+a[2]*(a[3]*a[7]-a[4]*a[6]);
export type FragmentMeshData={nodes:number[];tets:number[];groups:number[][];home:[number,number,number]};
export class ShapeMatchingBody{
 rest:Float64Array;x:Float64Array;prev:Float64Array;v:Float64Array;inv:Float64Array;mass:Float64Array;tets:Uint32Array;elements:Element[]=[];groups:Element[]=[];edges:{a:number;b:number;length:number;lambda:number}[]=[];home:Vector3;
 private pendingLift=0;
 private impactResponse=0;
 incomingY:Float64Array;touching:Uint8Array;active=false;contact=false;direction=new Vector3();age=0;initSpeed=0;
 constructor(public data:FragmentMeshData){this.rest=new Float64Array(data.nodes);this.x=this.rest.slice();this.prev=this.rest.slice();this.v=new Float64Array(this.x.length);this.inv=new Float64Array(this.x.length/3);this.mass=new Float64Array(this.inv.length);this.incomingY=new Float64Array(this.inv.length);this.touching=new Uint8Array(this.inv.length);this.tets=new Uint32Array(data.tets);this.home=new Vector3(...data.home);const edges=new Set<string>();
 for(let t=0;t<this.tets.length;t+=4){const ids=Array.from(this.tets.slice(t,t+4));const e=this.makeElement(ids);this.elements.push(e);for(const id of ids)this.mass[id]+=e.volume/4;for(let a=0;a<4;a++)for(let b=a+1;b<4;b++){const i=Math.min(ids[a],ids[b]),j=Math.max(ids[a],ids[b]),key=i+','+j;if(!edges.has(key)){edges.add(key);let l=0;for(let k=0;k<3;k++)l+=(this.rest[i*3+k]-this.rest[j*3+k])**2;this.edges.push({a:i,b:j,length:Math.sqrt(l),lambda:0});}}}
 for(let i=0;i<this.inv.length;i++)this.inv[i]=1/Math.max(this.mass[i],.001);
 const total=this.elements.reduce((s,e)=>s+e.volume,0);this.groups=data.groups.map((ids:number[])=>this.makeElement(ids,total/data.groups.length));
 }
 makeElement(ids:number[],groupVolume?:number,reuse?:Element):Element{
  const n=ids.length,e=reuse??{ids,rest:new Float64Array(n*3),q:new Float64Array(n*3),weights:new Array<number>(n),volume:0,lambdaD:0,lambdaH:0};
  const {rest,q,weights}=e,r=this.rest;let sum=0,cx=0,cy=0,cz=0;
  for(let i=0;i<n;i++){weights[i]=groupVolume==null?1:this.mass[ids[i]];sum+=weights[i];}
  for(let i=0;i<n;i++){weights[i]/=sum;const j=ids[i]*3;cx+=r[j]*weights[i];cy+=r[j+1]*weights[i];cz+=r[j+2]*weights[i];}
  let xx=0,xy=0,xz=0,yy=0,yz=0,zz=0;
  for(let i=0;i<n;i++){const j=ids[i]*3,k=i*3,x=r[j]-cx,y=r[j+1]-cy,z=r[j+2]-cz,w=weights[i];rest[k]=x;rest[k+1]=y;rest[k+2]=z;
   xx+=w*x*x;xy+=w*x*y;xz+=w*x*z;yy+=w*y*y;yz+=w*y*z;zz+=w*z*z;
  }
  const a=yy*zz-yz*yz,b=xz*yz-xy*zz,c=xy*yz-xz*yy,d=xx*zz-xz*xz,f=xy*xz-xx*yz,g=xx*yy-xy*xy,det=xx*a+xy*b+xz*c,invDet=det===0?0:1/det;
  for(let i=0;i<n;i++){const j=i*3,x=rest[j],y=rest[j+1],z=rest[j+2],w=weights[i];q[j]=(a*invDet*x+b*invDet*y+c*invDet*z)*w;q[j+1]=(b*invDet*x+d*invDet*y+f*invDet*z)*w;q[j+2]=(c*invDet*x+f*invDet*y+g*invDet*z)*w;}
  let volume=groupVolume??0;
  if(groupVolume==null){const o=ids[0]*3,a=ids[1]*3,b=ids[2]*3,c=ids[3]*3,ax=r[a]-r[o],ay=r[a+1]-r[o+1],az=r[a+2]-r[o+2],bx=r[b]-r[o],by=r[b+1]-r[o+1],bz=r[b+2]-r[o+2],cx=r[c]-r[o],cy=r[c+1]-r[o+1],cz=r[c+2]-r[o+2];volume=Math.abs(ax*(by*cz-bz*cy)+ay*(bz*cx-bx*cz)+az*(bx*cy-by*cx))/6;}
  e.volume=Math.max(1e-8,volume);e.lambdaD=e.lambdaH=0;return e;
 }
 /** Refit existing constraints to a new death pose; topology and allocations stay pooled. */
 setRestPose(nodes:Float32Array,home:Vector3){
  this.home.copy(home);for(let i=0;i<nodes.length;i+=3){this.rest[i]=nodes[i]-home.x;this.rest[i+1]=nodes[i+1]-home.y;this.rest[i+2]=nodes[i+2]-home.z;}
  this.mass.fill(0);let volume=0;
  for(const e of this.elements){this.makeElement(e.ids,undefined,e);volume+=e.volume;for(const id of e.ids)this.mass[id]+=e.volume/4;}
  for(let i=0;i<this.inv.length;i++)this.inv[i]=1/Math.max(this.mass[i],.001);
  for(const e of this.groups)this.makeElement(e.ids,volume/this.groups.length,e);
  for(const e of this.edges){const a=e.a*3,b=e.b*3;let squared=0;for(let k=0;k<3;k++)squared+=(this.rest[a+k]-this.rest[b+k])**2;e.length=Math.sqrt(squared);}
 }
 spawn(offset:Vector3,center:Vector3,speed:number,p:Params){this.active=true;this.contact=false;this.impactResponse=0;this.age=0;this.initSpeed=speed*p.speed;const origin=this.home.clone().add(offset);this.direction.copy(origin).sub(center).normalize();const omega=new Vector3(.6,1,.4).multiplyScalar(p.spin);for(let i=0;i<this.inv.length;i++){const local=new Vector3().fromArray(this.rest,i*3);const spin=new Vector3().crossVectors(omega,local);for(let k=0;k<3;k++){this.x[i*3+k]=local.getComponent(k)+origin.getComponent(k);this.v[i*3+k]=this.direction.getComponent(k)*this.initSpeed+local.getComponent(k)*p.stretch+spin.getComponent(k);}}this.prev.set(this.x);let bottom=Infinity;for(let i=1;i<this.x.length;i+=3)bottom=Math.min(bottom,this.x[i]);this.pendingLift=Math.max(0,.025-bottom);}
 // Reuse scratch storage and expand the 3x3 operations: this is the hottest
 // loop (three deformation gradients per group per solver iteration).
 private cm=new Float64Array(3);
 F(e:Element,out:Float64Array){
  const {ids,weights,q}=e,x=this.x;let cx=0,cy=0,cz=0;
  for(let i=0;i<ids.length;i++){const k=ids[i]*3,w=weights[i];cx+=x[k]*w;cy+=x[k+1]*w;cz+=x[k+2]*w;}
  let a=0,b=0,c=0,d=0,f=0,g=0,h=0,j=0,k=0;
  for(let i=0;i<ids.length;i++){const n=ids[i]*3,t=i*3,px=x[n]-cx,py=x[n+1]-cy,pz=x[n+2]-cz,qx=q[t],qy=q[t+1],qz=q[t+2];
   a+=px*qx;b+=px*qy;c+=px*qz;d+=py*qx;f+=py*qy;g+=py*qz;h+=pz*qx;j+=pz*qy;k+=pz*qz;
  }
  out[0]=a;out[1]=b;out[2]=c;out[3]=d;out[4]=f;out[5]=g;out[6]=h;out[7]=j;out[8]=k;
  this.cm[0]=cx;this.cm[1]=cy;this.cm[2]=cz;return this.cm;
 }
 private f=new Float64Array(9);private cf=new Float64Array(9);private grad=new Float64Array(96);
 material(e:Element,h:number,p:Params,hydro:boolean){const f=this.f,cf=this.cf;this.F(e,f);let C:number,alpha:number;
 if(hydro){cf[0]=f[4]*f[8]-f[5]*f[7];cf[1]=f[5]*f[6]-f[3]*f[8];cf[2]=f[3]*f[7]-f[4]*f[6];cf[3]=f[2]*f[7]-f[1]*f[8];cf[4]=f[0]*f[8]-f[2]*f[6];cf[5]=f[1]*f[6]-f[0]*f[7];cf[6]=f[1]*f[5]-f[2]*f[4];cf[7]=f[2]*f[3]-f[0]*f[5];cf[8]=f[0]*f[4]-f[1]*f[3];C=determinant(f)-1-p.volume/p.softness;alpha=p.volume/e.volume/(h*h);}
 else{let sum=0;for(let j=0;j<9;j++)sum+=f[j]*f[j];C=Math.sqrt(sum);if(C<1e-10)return;for(let j=0;j<9;j++)cf[j]=f[j]/C;alpha=p.softness/e.volume/(h*h);}
 const {ids,q}=e,grad=this.grad,inv=this.inv,x=this.x;let den=alpha;
 for(let i=0;i<ids.length;i++){const j=i*3,qx=q[j],qy=q[j+1],qz=q[j+2],gx=cf[0]*qx+cf[1]*qy+cf[2]*qz,gy=cf[3]*qx+cf[4]*qy+cf[5]*qz,gz=cf[6]*qx+cf[7]*qy+cf[8]*qz;
  grad[j]=gx;grad[j+1]=gy;grad[j+2]=gz;den+=inv[ids[i]]*(gx*gx+gy*gy+gz*gz);
 }
 const old=hydro?e.lambdaH:e.lambdaD,dl=(-C-alpha*old)/Math.max(den,1e-12);if(hydro)e.lambdaH+=dl;else e.lambdaD+=dl;
 for(let i=0;i<ids.length;i++){const j=i*3,k=ids[i]*3,w=inv[ids[i]]*dl;x[k]+=w*grad[j];x[k+1]+=w*grad[j+1];x[k+2]+=w*grad[j+2];}
 }
 step(dt:number,p:Params,curveAcceleration:number){if(!this.active||dt<=0)return;
 // The live walking/bending body may begin partially below the floor. Resolve that
 // initial overlap once as a translation, before velocity reconstruction. Treating
 // this pre-existing penetration as travel/h would create an artificial launch.
 if(this.pendingLift>0){for(let i=1;i<this.x.length;i+=3)this.x[i]+=this.pendingLift;this.prev.set(this.x);this.pendingLift=0;this.contact=true;}
 const h=dt/p.substeps;
 for(let s=0;s<p.substeps;s++){
 this.prev.set(this.x);this.touching.fill(0);for(let i=0;i<this.inv.length;i++)for(let k=0;k<3;k++){const id=i*3+k;this.v[id]+=((k===1?-p.gravity:0)+(this.contact?0:this.direction.getComponent(k)*curveAcceleration*p.speed))*h;this.x[id]+=this.v[id]*h;}
 for(let i=0;i<this.inv.length;i++)this.incomingY[i]=this.v[i*3+1];
 this.projectGround(p.friction>=1);
 for(const e of this.groups)e.lambdaH=e.lambdaD=0;
 for(let it=0;it<p.iterations;it++){
 for(const e of this.groups){
  this.material(e,h,p,false);this.material(e,h,p,true);
  if(p.groupFilter!==0){const cm=this.F(e,this.f),f=this.f,x=this.x,r=e.rest,blend=p.groupFilter;
   for(let i=0;i<e.ids.length;i++){const j=i*3,k=e.ids[i]*3,rx=r[j],ry=r[j+1],rz=r[j+2];
    x[k]+=(cm[0]+f[0]*rx+f[1]*ry+f[2]*rz-x[k])*blend;
    x[k+1]+=(cm[1]+f[3]*rx+f[4]*ry+f[5]*rz-x[k+1])*blend;
    x[k+2]+=(cm[2]+f[6]*rx+f[7]*ry+f[8]*rz-x[k+2])*blend;
   }
  }
 }

 this.projectGround(p.friction>=1);
 }
 let mass=0;const cmv=[0,0,0];for(let i=0;i<this.inv.length;i++){mass+=this.mass[i];for(let k=0;k<3;k++){const id=i*3+k;this.v[id]=(this.x[id]-this.prev[id])/h;cmv[k]+=this.mass[i]*this.v[id];}}
 for(let k=0;k<3;k++)cmv[k]/=mass;
 // Dissipate impact energy without braking the incoming fall. Fast downward
 // contacts start a short material-loss response; resting support damps residual
 // internal wobble. Exponential rates remain independent of frame/substep count.
 this.impactResponse=Math.max(0,this.impactResponse-h/.3);
 let supported=false;
 for(let i=0;i<this.inv.length;i++)if(this.touching[i]){
  if(this.x[i*3+1]<=.025001)supported=true;
  this.impactResponse=Math.max(this.impactResponse,Math.min(1,Math.max(0,(-this.incomingY[i]-.5)/4)));
 }
 const impactLoss=p.impactDamping*this.impactResponse;
 const damping=Math.exp(-(p.damping+impactLoss+(supported?p.settleDamping:0))*h);
 // Only the outgoing centre-of-mass motion loses bounce energy. Keep downward
 // motion so the upper mass can compress and bulge the lower part on impact.
 const outgoingY=cmv[1]>0?cmv[1]*Math.exp(-impactLoss*h):cmv[1];
 // Contact positions participate in reconstruction, so lower nodes stop while the
 // upper mass continues compressing the material. At full grip tangential contact
 // velocity stays zero; lower settings retain the Coulomb impulse limit.
 for(let i=0;i<this.inv.length;i++){
  for(let k=0;k<3;k++)this.v[i*3+k]=cmv[k]+(this.v[i*3+k]-cmv[k])*damping;
  this.v[i*3+1]+=outgoingY-cmv[1];
  if(this.touching[i]){const y=i*3+1,incoming=this.incomingY[i];
   if(this.x[y]<=.025001)this.v[y]=Math.max(this.v[y],incoming<-.5?-incoming*p.bounce:0);
   const impulse=Math.max(0,this.v[y]-incoming),tangent=Math.hypot(this.v[y-1],this.v[y+1]);
   const keep=p.friction>=1?0:Math.max(0,1-p.friction*impulse/Math.max(tangent,1e-12));this.v[y-1]*=keep;this.v[y+1]*=keep;
  }
 }
 }
 this.age+=dt;
 }
 projectGround(noSlip=false){
  for(let i=0;i<this.inv.length;i++){const j=i*3;
   if(this.x[j+1]<=.025){
    this.x[j+1]=.025;this.touching[i]=1;this.contact=true;
    // Infinite static grip at the contact point. Project tangential positions
    // before velocity reconstruction so existing drift cannot survive as motion.
    // Y is unilateral: upward motion still releases contact and permits bouncing.
    if(noSlip){this.x[j]=this.prev[j];this.x[j+2]=this.prev[j+2];}
   }
  }
 }
 strain(){let sum=0;for(const e of this.edges){let squared=0;for(let k=0;k<3;k++)squared+=(this.x[e.a*3+k]-this.x[e.b*3+k])**2;sum+=(Math.sqrt(squared)/e.length-1)**2;}return Math.sqrt(sum/this.edges.length);}
 snapshot(){let volume=0,minJ=Infinity;for(const e of this.elements){this.F(e,this.f);const j=determinant(this.f);volume+=j*e.volume;minJ=Math.min(minJ,j);}return {strain:this.strain(),volumeRatio:volume/this.elements.reduce((s,e)=>s+e.volume,0),minJ,finite:this.x.every(Number.isFinite),centroid:[0,1,2].map(k=>this.x.filter((_,i)=>i%3===k).reduce((s,x)=>s+x,0)/this.inv.length),contact:this.contact};}
}
