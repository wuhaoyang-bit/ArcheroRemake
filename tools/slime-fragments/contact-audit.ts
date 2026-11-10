import {readFileSync,writeFileSync} from 'node:fs';
import {Vector3} from 'three';
import {ShapeMatchingBody,defaults} from '../../src/slime-fragments/shape-matching.ts';
import {slimeFlight} from '../../src/slime-flight-motion.ts';
const c=JSON.parse(readFileSync('public/params.json','utf8')).settings;
const ref=JSON.parse(readFileSync('public/assets/slime-fragments/reference-body.json','utf8'));
const center=new Vector3();for(let i=0;i<ref.positions.length;i+=3)center.add(new Vector3().fromArray(ref.positions,i));center.multiplyScalar(3/ref.positions.length).add(new Vector3(0,3,0));
const pieceCount=JSON.parse(readFileSync('public/assets/slime-fragments/manifest.json','utf8')).count;
const results=[];
for(const friction of [.45,1]){
 let minJ=Infinity,peakStrain=0,contacts=0,nonFinite=0;
 for(let piece=0;piece<pieceCount;piece++){
  const data=JSON.parse(readFileSync(`public/assets/slime-fragments/${piece}-sim.json`,'utf8'));
  const body=new ShapeMatchingBody(data),p={...defaults,gravity:30,spin:1.5,speed:.7,friction};
  body.spawn(new Vector3(0,3,0),center,slimeFlight(0,c).speed,p);
  for(let step=0;step<300;step++){
   body.step(1/60,p,(slimeFlight((step+1)/60,c).speed-slimeFlight(step/60,c).speed)*60);
   const s=body.snapshot();minJ=Math.min(minJ,s.minJ);peakStrain=Math.max(peakStrain,s.strain);if(s.contact)contacts++;if(!s.finite)nonFinite++;
  }
 }
 results.push({friction,minJ,peakStrain,contacts,nonFinite});
}
console.log(JSON.stringify(results,null,2));if(process.argv[2])writeFileSync(process.argv[2],JSON.stringify(results,null,2));
