import {readFileSync,writeFileSync} from 'node:fs';
import {Vector3} from 'three';
import {ShapeMatchingBody,defaults} from '../../src/slime-fragments/shape-matching.ts';
const pieceCount=JSON.parse(readFileSync('public/assets/slime-fragments/manifest.json','utf8')).count;
const results=[];
for(const heavy of [false,true])for(let piece=0;piece<pieceCount;piece++){
 const data=JSON.parse(readFileSync(`public/assets/slime-fragments/${piece}-sim.json`,'utf8')),body=new ShapeMatchingBody(data);
 const p={...defaults,gravity:30,spin:0,stretch:0,...(heavy?{}:{volume:.00001,impactDamping:0,settleDamping:0,bounce:.02})};
 let localBottom=Infinity;for(let i=1;i<data.nodes.length;i+=3)localBottom=Math.min(localBottom,data.nodes[i]);
 body.spawn(new Vector3(0,3-data.home[1]-localBottom,0),new Vector3(),0,p);
 let peakStrain=0,clearance=0,airTime=0,firstContact=-1,minVolume=1,maxUp=0,lateEnergy=0;
 for(let frame=0;frame<300;frame++){
  body.step(1/60,p,0);
  if(body.contact){if(firstContact<0)firstContact=frame/60;const s=body.snapshot();peakStrain=Math.max(peakStrain,s.strain);minVolume=Math.min(minVolume,s.volumeRatio);let bottom=Infinity,vy=0;for(let j=1;j<body.x.length;j+=3){bottom=Math.min(bottom,body.x[j]);vy+=body.v[j];}clearance=Math.max(clearance,bottom-.025);if(bottom>.035)airTime+=1/60;maxUp=Math.max(maxUp,vy/body.inv.length);}
  if(frame>180)lateEnergy+=body.v.reduce((sum,v)=>sum+v*v,0)/body.v.length;
 }
 results.push({heavy,piece,peakStrain,clearance,airTime,firstContact,minVolume,maxUp,lateEnergy,endVolume:body.snapshot().volumeRatio});
}
console.log(JSON.stringify(results,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(results,null,2));
