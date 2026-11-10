import {readFileSync,writeFileSync} from 'node:fs';
import * as T from 'three/webgpu';
import {ShapeMatchingBody,defaults} from '../../src/slime-fragments/shape-matching.ts';
import {Skin,SkinBuffers} from '../../src/slime-fragments/skin.ts';
const root='public/assets/slime-fragments/';
const bytes=(name:string)=>{const b=readFileSync(root+name);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
const pieceCount=JSON.parse(readFileSync(root+'manifest.json','utf8')).count;
const skins=Array.from({length:pieceCount*3},(_,n)=>{const i=n%pieceCount,data=JSON.parse(readFileSync(root+i+'-sim.json','utf8')),body=new ShapeMatchingBody(data);body.spawn(new T.Vector3(0,3,0),new T.Vector3(),8,defaults);return new Skin(body,new Float32Array(bytes(i+'-skin-pos.bin')),new Float32Array(bytes(i+'-skin-normal.bin')),new Uint32Array(bytes(i+'-skin-index.bin')),new Uint32Array(bytes(i+'-bind-ids.bin')),new Float32Array(bytes(i+'-bind-weights.bin')),new T.MeshPhysicalNodeMaterial(),process.argv.includes('--gpu')?new SkinBuffers(body.x.length/3,body.elements.length,new T.MeshPhysicalNodeMaterial()):undefined);});
const solve:number[]=[],skin:number[]=[];
for(let frame=0;frame<240;frame++){let start=performance.now();for(const s of skins)s.body.step(1/60,defaults,0);const a=performance.now()-start;start=performance.now();for(const s of skins)s.update();const b=performance.now()-start;if(frame>=30){solve.push(a);skin.push(b);}}
const stats=(a:number[])=>{a.sort((a,b)=>a-b);return {median:a[Math.floor(a.length/2)],p95:a[Math.floor(a.length*.95)]};};
const report={groups:3,frames:210,solveMs:stats(solve),skinMs:stats(skin),state:skins.slice(0,pieceCount).map(s=>({x:Array.from(s.body.x),v:Array.from(s.body.v)}))};
console.log(JSON.stringify({...report,state:undefined},null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(report));
