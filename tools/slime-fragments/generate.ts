import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import * as T from 'three';
import {fracture} from './fracture.ts';
const output=process.argv[2];if(!output)throw Error('Pass a staging output directory');mkdirSync(output,{recursive:true});
const reference=JSON.parse(readFileSync('public/assets/slime-fragments/reference-body.json','utf8'));
const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(reference.positions,3));g.setIndex(reference.indices);g.computeVertexNormals();
let referenceVolume=0;const rv=[new T.Vector3(),new T.Vector3(),new T.Vector3()];for(let i=0;i<reference.indices.length;i+=3){for(let k=0;k<3;k++)rv[k].fromArray(reference.positions,reference.indices[i+k]*3);referenceVolume+=rv[0].dot(rv[1].cross(rv[2]))/6;}
writeFileSync(`${output}/reference-body.json`,JSON.stringify(reference));
const result=fracture(g,.2),parts=[];
for(const [i,part] of result.pieces.entries()){
 const geometry=part.geometry;
 for(const [name,attribute] of [['positions','position'],['normals','normal']] as const){const a=geometry.attributes[attribute].array;writeFileSync(`${output}/${i}-${name}.bin`,Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
 let volume=0;const p=geometry.attributes.position,v=[new T.Vector3(),new T.Vector3(),new T.Vector3()];for(let j=0;j<p.count;j+=3){for(let k=0;k<3;k++)v[k].fromBufferAttribute(p,j+k);volume+=v[0].dot(v[1].cross(v[2]))/6;}
 parts.push({home:part.home.toArray(),groups:geometry.groups,volume,triangles:p.count/3});
}
const meta={referenceVolume,count:parts.length,seed:74123,interfaces:result.interfaces,maxDisplacement:result.maxDisplacement,parts};writeFileSync(`${output}/meta.json`,JSON.stringify(meta,null,2));console.log(meta.parts.map((p,i)=>({piece:i,volume:p.volume,triangles:p.triangles})));console.log('total triangles',parts.reduce((s,p)=>s+p.triangles,0));
