import test from 'node:test';
import assert from 'node:assert/strict';
import {SlimeLiquidField,type LiquidMark} from '../src/slime-liquid-field.ts';

// Independent point evaluator for the original additive liquid field (Float32 accumulation).
function reference(marks:LiquidMark[],nx:number,nz:number,width:number,length:number){
 const data=new Uint8Array(nx*nz*4),sum=new Float32Array(4);
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  sum.fill(0);
  for(const m of marks){if(m.radius<=0||m.opacity<=0)continue;
   const dx=((x+.5)/nx-.5)*width-m.x,dz=((z+.5)/nz-.5)*length-m.z;
   const angle=Math.atan2(dz,dx),edge=1+.1*Math.sin(angle*3+m.seed)+.065*Math.sin(angle*5-m.seed*2),q=Math.hypot(dx,dz)/(m.radius*edge);
   if(q>=1.25)continue;const w=Math.pow(Math.max(0,1-q*q/1.5625),2)*m.opacity;
   sum[0]+=w;for(let j=0;j<3;j++)sum[j+1]+=w*m.color[j];
  }
  if(sum[0]){const k=(z*nx+x)*4;for(let j=0;j<3;j++)data[k+j]=Math.round(Math.min(1,sum[j+1]/sum[0])*255);data[k+3]=Math.round(Math.min(1,sum[0])*255);}
 }
 return data;
}
test('cached dirty tiles match original field through growth, fade, colour, removal, duplicates and resize',()=>{
 const f=new SlimeLiquidField(65,97,16,38),marks:LiquidMark[]=[];
 const check=()=>{f.rebuild(marks);assert.deepEqual(f.data,reference(marks,f.nx,f.nz,f.width,f.length));};
 for(let i=0;i<24;i++){marks.push({x:Math.sin(i)*5,z:Math.cos(i)*12,radius:.8+i*.03,opacity:1,color:[1,i/24,.1],seed:i});check();}
 assert.equal(f.rebuild(marks),false);
 marks[0].color=[.1,.5,1];check();marks[1].radius=2;check();
 marks.push({...marks[2]});check();marks.splice(2,1);check();
 for(const m of marks)m.opacity=.37;check();
 marks.splice(0,8);check();f.width=12;f.length=24;check();
 marks.push({x:1e4,z:1e4,radius:.3,opacity:1,color:[1,0,0],seed:1});check();
 marks.length=0;check();assert.ok(f.data.every(v=>v===0));assert.equal(f.rebuild([]),false);
});

test('oversized kernels use bounded-memory fallback and clear correctly afterwards',()=>{
 const f=new SlimeLiquidField(512,512),m:LiquidMark={x:0,z:0,radius:100,opacity:1,color:[1,0,0],seed:0};
 f.rebuild(Array.from({length:17},()=>m));
 for(let k=0;k<f.data.length;k+=4){assert.equal(f.data[k],255);assert.equal(f.data[k+1],0);assert.equal(f.data[k+2],0);assert.equal(f.data[k+3],255);}
 f.rebuild([]);assert.ok(f.data.every(v=>v===0));
});
