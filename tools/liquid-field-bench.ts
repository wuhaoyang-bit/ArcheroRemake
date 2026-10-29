import {performance} from 'node:perf_hooks';
import {SlimeLiquidField,type LiquidMark} from '../src/slime-liquid-field.ts';
const Field=process.argv[2]?(await import(process.argv[2])).SlimeLiquidField:SlimeLiquidField;
const frames=Math.max(10,Number(process.env.BENCH_FRAMES)||100);
console.log(process.argv[2]??'current');
const marks:LiquidMark[]=Array.from({length:640},(_,i)=>({x:Math.sin(i*.13)*6,z:Math.cos(i*.07)*15,radius:.38,opacity:1,color:[1,.4,.02],seed:i*2.399963}));
for(const mode of ['moving','fading','wide'] as const){
 const f=new Field();const input=marks.map(m=>({...m,radius:mode==='wide'?1:m.radius}));f.rebuild(input);const samples:number[]=[];
 for(let frame=0;frame<frames;frame++){
  if(mode==='fading')for(const m of input)m.opacity-=.002;
  else{input.shift();input.push({...marks[frame],x:Math.sin(frame*.13)*6+.01});}
  const t=performance.now();f.rebuild(input);samples.push(performance.now()-t);
 }
 samples.sort((a,b)=>a-b);console.log(mode,JSON.stringify({medianMs:samples[Math.floor(frames*.5)],p95Ms:samples[Math.floor(frames*.95)]}));
}
