export type LiquidMark={x:number;z:number;radius:number;opacity:number;color:readonly number[];seed:number};
/** Shared coverage and linear colour field. Overlaps become one continuous surface. */
export class SlimeLiquidField{
 readonly data:Uint8Array;private weights:Float32Array;private colors:Float32Array;
 constructor(readonly nx=384,readonly nz=768,public width=16,public length=38){this.data=new Uint8Array(nx*nz*4);this.weights=new Float32Array(nx*nz);this.colors=new Float32Array(nx*nz*3);}
 rebuild(marks:LiquidMark[]){
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
