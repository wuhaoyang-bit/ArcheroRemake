export type LiquidMark={x:number;z:number;radius:number;opacity:number;color:readonly number[];seed:number};
type Stamp={x0:number;x1:number;z0:number;z1:number;weights:Float64Array};
type Entry={stamp:Stamp;opacity:number;color:readonly number[];signature:string};
const TILE=16;
/** Cached stamp kernels and dirty tiles retain the same additive coverage/linear colour field. */
export class SlimeLiquidField{
 readonly data:Uint8Array;private weights:Float32Array;private colors:Float32Array;
 private stamps=new Map<string,Stamp>();private previous:Entry[]=[];private dimensions='';
 private tilesX:number;private tilesZ:number;private bins:Entry[][];private dirty:Uint8Array;
 constructor(readonly nx=384,readonly nz=768,public width=16,public length=38){this.data=new Uint8Array(nx*nz*4);this.weights=new Float32Array(nx*nz);this.colors=new Float32Array(nx*nz*3);this.tilesX=Math.ceil(nx/TILE);this.tilesZ=Math.ceil(nz/TILE);this.bins=Array.from({length:this.tilesX*this.tilesZ},()=>[]);this.dirty=new Uint8Array(this.bins.length);}
 private stamp(m:LiquidMark):Stamp{
  const extent=m.radius*1.4;
  const x0=Math.max(0,Math.floor((m.x-extent)/this.width*this.nx+this.nx/2)),x1=Math.min(this.nx-1,Math.ceil((m.x+extent)/this.width*this.nx+this.nx/2));
  const z0=Math.max(0,Math.floor((m.z-extent)/this.length*this.nz+this.nz/2)),z1=Math.min(this.nz-1,Math.ceil((m.z+extent)/this.length*this.nz+this.nz/2));
  const stride=Math.max(0,x1-x0+1),weights=new Float64Array(stride*Math.max(0,z1-z0+1));
  for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
   const dx=((x+.5)/this.nx-.5)*this.width-m.x,dz=((z+.5)/this.nz-.5)*this.length-m.z;
   const angle=Math.atan2(dz,dx),edge=1+.1*Math.sin(angle*3+m.seed)+.065*Math.sin(angle*5-m.seed*2);
   const q=Math.hypot(dx,dz)/(m.radius*edge);if(q>=1.25)continue;
   weights[(z-z0)*stride+x-x0]=Math.pow(Math.max(0,1-q*q/1.5625),2);
  }
  return {x0,x1,z0,z1,weights};
 }
 rebuild(marks:LiquidMark[]){
  // Bound kernel memory even with very large live puddle/body scales. Oversized scenes
  // use the original streaming rasterizer instead of retaining hundreds of full-room kernels.
  let bytes=0;
  for(const m of marks){if(m.radius<=0||m.opacity<=0)continue;const extent=m.radius*1.4;
   const sx=Math.max(0,Math.min(this.nx-1,Math.ceil((m.x+extent)/this.width*this.nx+this.nx/2))-Math.max(0,Math.floor((m.x-extent)/this.width*this.nx+this.nx/2))+1);
   const sz=Math.max(0,Math.min(this.nz-1,Math.ceil((m.z+extent)/this.length*this.nz+this.nz/2))-Math.max(0,Math.floor((m.z-extent)/this.length*this.nz+this.nz/2))+1);
   bytes+=sx*sz*8;
  }
  if(bytes>32*1024*1024){this.stamps.clear();this.previous=[];for(const bin of this.bins)bin.length=0;this.dimensions='';this.rebuildFull(marks);return true;}
  const dimensions=[this.width,this.length].join('/'),resized=dimensions!==this.dimensions;
  if(resized){this.dimensions=dimensions;this.stamps.clear();this.previous=[];}
  const nextCache=new Map<string,Stamp>(),entries:Entry[]=[],bins=this.bins,dirty=this.dirty;
  for(const bin of bins)bin.length=0;dirty.fill(0);
  if(resized)dirty.fill(1);
  const visit=(s:Stamp,fn:(tile:number)=>void)=>{for(let z=Math.floor(s.z0/TILE);z<=Math.floor(s.z1/TILE);z++)for(let x=Math.floor(s.x0/TILE);x<=Math.floor(s.x1/TILE);x++)fn(z*this.tilesX+x);};
  const previous=new Map<string,number>();for(const e of this.previous)previous.set(e.signature,(previous.get(e.signature)??0)+1);
  for(const m of marks){
   if(m.radius<=0||m.opacity<=0)continue;
   const key=[m.x,m.z,m.radius,m.seed].join('/');
   const stamp=nextCache.get(key)??this.stamps.get(key)??this.stamp(m);nextCache.set(key,stamp);
   const signature=[key,m.opacity,...m.color].join('/'),e={stamp,opacity:m.opacity,color:m.color,signature};entries.push(e);
   visit(stamp,t=>bins[t].push(e));
   const count=previous.get(signature)??0;if(count)previous.set(signature,count-1);else visit(stamp,t=>dirty[t]=1);
  }
  for(const e of this.previous){const count=previous.get(e.signature)??0;if(count){visit(e.stamp,t=>dirty[t]=1);previous.set(e.signature,count-1);}}
  this.stamps=nextCache;this.previous=entries;
  let changed=false;
  for(let tile=0;tile<dirty.length;tile++){
   if(!dirty[tile])continue;changed=true;
   const x0=tile%this.tilesX*TILE,z0=Math.floor(tile/this.tilesX)*TILE,x1=Math.min(this.nx,x0+TILE),z1=Math.min(this.nz,z0+TILE);
   for(let z=z0;z<z1;z++){const start=z*this.nx+x0,end=z*this.nx+x1;this.weights.fill(0,start,end);this.colors.fill(0,start*3,end*3);this.data.fill(0,start*4,end*4);}
   for(const e of bins[tile]){
    const s=e.stamp,stride=s.x1-s.x0+1;
    for(let z=Math.max(z0,s.z0);z<Math.min(z1,s.z1+1);z++)for(let x=Math.max(x0,s.x0);x<Math.min(x1,s.x1+1);x++){
     const w=s.weights[(z-s.z0)*stride+x-s.x0]*e.opacity;if(!w)continue;const k=z*this.nx+x;
     this.weights[k]+=w;this.colors[k*3]+=w*e.color[0];this.colors[k*3+1]+=w*e.color[1];this.colors[k*3+2]+=w*e.color[2];
    }
   }
   for(let z=z0;z<z1;z++)for(let x=x0;x<x1;x++){const k=z*this.nx+x,w=this.weights[k];if(!w)continue;for(let j=0;j<3;j++)this.data[k*4+j]=Math.round(Math.min(1,this.colors[k*3+j]/w)*255);this.data[k*4+3]=Math.round(Math.min(1,w)*255);}
  }
  return changed;
 }
 private rebuildFull(marks:LiquidMark[]){
  this.weights.fill(0);this.colors.fill(0);this.data.fill(0);
  for(const m of marks){if(m.radius<=0||m.opacity<=0)continue;
   const r=m.radius,extent=r*1.4;
   const x0=Math.max(0,Math.floor((m.x-extent)/this.width*this.nx+this.nx/2)),x1=Math.min(this.nx-1,Math.ceil((m.x+extent)/this.width*this.nx+this.nx/2));
   const z0=Math.max(0,Math.floor((m.z-extent)/this.length*this.nz+this.nz/2)),z1=Math.min(this.nz-1,Math.ceil((m.z+extent)/this.length*this.nz+this.nz/2));
   for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
    const dx=((x+.5)/this.nx-.5)*this.width-m.x,dz=((z+.5)/this.nz-.5)*this.length-m.z;
    const angle=Math.atan2(dz,dx),edge=1+.1*Math.sin(angle*3+m.seed)+.065*Math.sin(angle*5-m.seed*2);
    const q=Math.hypot(dx,dz)/(r*edge);if(q>=1.25)continue;
    const w=Math.pow(Math.max(0,1-q*q/1.5625),2)*m.opacity,k=z*this.nx+x;
    this.weights[k]+=w;for(let j=0;j<3;j++)this.colors[k*3+j]+=w*m.color[j];
   }
  }
  for(let k=0;k<this.weights.length;k++){const w=this.weights[k];if(!w)continue;for(let j=0;j<3;j++)this.data[k*4+j]=Math.round(Math.min(1,this.colors[k*3+j]/w)*255);this.data[k*4+3]=Math.round(Math.min(1,w)*255);}
 }
 sample(x:number,z:number){const ix=Math.floor((x/this.width+.5)*this.nx),iz=Math.floor((z/this.length+.5)*this.nz);if(ix<0||ix>=this.nx||iz<0||iz>=this.nz)return 0;return this.data[(iz*this.nx+ix)*4+3]/255;}
 color(x:number,z:number){const ix=Math.max(0,Math.min(this.nx-1,Math.floor((x/this.width+.5)*this.nx))),iz=Math.max(0,Math.min(this.nz-1,Math.floor((z/this.length+.5)*this.nz)));return Array.from(this.data.slice((iz*this.nx+ix)*4,(iz*this.nx+ix)*4+3),v=>v/255);}
}
