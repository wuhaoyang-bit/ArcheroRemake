import * as T from 'three';
type Face={points:T.Vector3[],cut:number;source?:number};
const EPS=1e-7;
function hull(points:T.Vector3[],normal:T.Vector3){
 const u=new T.Vector3().crossVectors(normal,Math.abs(normal.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0)).normalize(),v=new T.Vector3().crossVectors(normal,u);
 const unique=[...new Map(points.map(p=>[p.toArray().map(x=>x.toFixed(6)).join(','),p])).values()];
 const pp=unique.map(p=>({p,x:p.dot(u),y:p.dot(v)})).sort((a,b)=>a.x-b.x||a.y-b.y);
 const cross=(a:any,b:any,c:any)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
 const lower:any[]=[],upper:any[]=[];
 for(const p of pp){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<1e-10)lower.pop();lower.push(p);}
 for(const p of [...pp].reverse()){while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<1e-10)upper.pop();upper.push(p);}
 return lower.slice(0,-1).concat(upper.slice(0,-1)).map(p=>p.p);
}
function clip(faces:Face[],plane:T.Plane,id:number){
 const result:Face[]=[],edge:T.Vector3[]=[];
 for(const f of faces){const out:T.Vector3[]=[];
  for(let i=0;i<f.points.length;i++){
   const a=f.points[i],b=f.points[(i+1)%f.points.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);
   if(da<=EPS)out.push(a);
   if((da<0&&db>0)||(da>0&&db<0)){const p=a.clone().lerp(b,da/(da-db));out.push(p);edge.push(p);}
   if(Math.abs(da)<EPS)edge.push(a);
  }
  if(out.length>=3)result.push({...f,points:out});
 }
 if(edge.length>=3){const points=hull(edge,plane.normal);if(points.length>=3)result.push({points,cut:id});}
 return result;
}
export function fracture(source:T.BufferGeometry,amount:number){
 const g=source.index?source.toNonIndexed():source.clone(),p=g.getAttribute('position');
 const original:Face[]=[];for(let i=0;i<p.count;i+=3)original.push({points:[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,i+j)),cut:-1,source:i});
 g.computeBoundingBox();const box=g.boundingBox!,center=box.getCenter(new T.Vector3()),sz=box.getSize(new T.Vector3()),extent=Math.max(sz.x,sz.y,sz.z);
 // Unequal, non-grid seed arrangement; fixed for repeatable review.
 let state=74123;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const offsets:T.Vector3[]=[];
 // Off-centre, unequal-density sites. No octants, rows or central cubical core.
 while(offsets.length<20){
  const p=new T.Vector3((random()-.5)*.82,(random()-.5)*.82,(random()-.5)*.82);
  if(offsets.every(q=>q.distanceTo(p)>.14))offsets.push(p);
 }
 const seeds=offsets.map(p=>p.clone().multiply(sz).add(center));
 const weights=seeds.map(()=> (random()-.5)*.016*Math.min(sz.x,sz.y,sz.z)**2);
 const planes:{plane:T.Plane,a:number,b:number}[]=[];
 for(let a=0;a<seeds.length;a++)for(let b=a+1;b<seeds.length;b++)planes.push({a,b,plane:new T.Plane().setFromNormalAndCoplanarPoint(seeds[b].clone().sub(seeds[a]).normalize(),seeds[a].clone().add(seeds[b]).multiplyScalar(.5).addScaledVector(seeds[b].clone().sub(seeds[a]).normalize(),(weights[a]-weights[b])/(2*seeds[a].distanceTo(seeds[b]))))});
 const cells=seeds.map((_,i)=>{let faces=original;planes.forEach(({a,b,plane},id)=>{if(i===a||i===b)faces=clip(faces,i===a?plane:plane.clone().negate(),id);});return faces;});
 // Build each interface only once, then reverse the same triangles for its neighbour.
 const patches=new Map<number,number[]>();let maxDisplacement=0;
 for(const faces of cells)for(const f of faces){if(f.cut<0||patches.has(f.cut))continue;
  const normal=planes[f.cut].plane.normal,loop=hull(f.points,normal),origin=loop.reduce((s,p)=>s.add(p),new T.Vector3()).multiplyScalar(1/loop.length);
  const u=loop[0].clone().sub(origin).normalize(),v=new T.Vector3().crossVectors(normal,u);
  const radius=Math.sqrt(loop.reduce((s,p)=>s+p.distanceToSquared(origin),0)/loop.length);
  // Pin the entire perimeter. Shared positive and negative lobes form complementary gel surfaces.
  const warp=(q:T.Vector3,r:number)=>{
   const local=q.clone().sub(origin),x=local.dot(u)/radius,y=local.dot(v)/radius;
   const d=amount*radius*(1-r*r)**2*(.55+1.1*Math.sin(3.2*x+f.cut*.9)*Math.cos(2.4*y));
   maxDisplacement=Math.max(maxDisplacement,Math.abs(d));return q.clone().addScaledVector(normal,d);
  };
  const rim:T.Vector3[]=[];for(let i=0;i<loop.length;i++){const a=loop[i],b=loop[(i+1)%loop.length],n=Math.max(1,Math.ceil(a.distanceTo(b)/(extent/32)));for(let j=0;j<n;j++)rim.push(a.clone().lerp(b,j/n));}
  const rings=9,verts:T.Vector3[][]=[];
  for(let r=0;r<=rings;r++)verts.push(rim.map(p=>warp(origin.clone().lerp(p,r/rings),r/rings)));
  const tri:number[]=[];const push=(a:T.Vector3,b:T.Vector3,c:T.Vector3)=>tri.push(...a.toArray(),...b.toArray(),...c.toArray());
  for(let j=0;j<rim.length;j++){const k=(j+1)%rim.length;push(verts[0][j],verts[1][j],verts[1][k]);for(let r=1;r<rings;r++){push(verts[r][j],verts[r+1][j],verts[r+1][k]);push(verts[r][j],verts[r+1][k],verts[r][k]);}}
  patches.set(f.cut,tri);
 }
 for(const id of patches.keys()){
  const sides=cells.reduce((sum,faces)=>sum+faces.filter(f=>f.cut===id).length,0);
  if(sides!==2)throw Error(`Unpaired cut interface ${id}: ${sides} sides`);
 }
 const pieces=cells.map((faces,i)=>{
  const outer:number[]=[],inner:number[]=[],outerNormals:number[]=[];
  for(const f of faces){if(f.cut<0){for(let k=1;k<f.points.length-1;k++){
   const tri=original[f.source!/3].points, ns=g.getAttribute('normal');
   for(const q of [f.points[0],f.points[k],f.points[k+1]]){
    outer.push(...q.toArray());const b=new T.Vector3();T.Triangle.getBarycoord(q,tri[0],tri[1],tri[2],b);
    const n=new T.Vector3();for(let j=0;j<3;j++)n.addScaledVector(new T.Vector3().fromBufferAttribute(ns,f.source!+j),b.getComponent(j));outerNormals.push(...n.normalize().toArray());
   }
  }}
   else{const patch=patches.get(f.cut)!;if(planes[f.cut].a===i)inner.push(...patch);else for(let k=0;k<patch.length;k+=9)inner.push(...patch.slice(k,k+3),...patch.slice(k+6,k+9),...patch.slice(k+3,k+6));}}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute([...outer,...inner],3));geo.addGroup(0,outer.length/3,0);geo.addGroup(outer.length/3,inner.length/3,1);geo.computeVertexNormals();
  // Smooth the tessellated gel while preserving separate outer/inner normals at the seam.
  const pos=geo.getAttribute('position'),norm=geo.getAttribute('normal'),sums=new Map<string,T.Vector3>();
  const key=(j:number)=>`${j<outer.length/3?'o':'i'}:${pos.getX(j).toFixed(5)},${pos.getY(j).toFixed(5)},${pos.getZ(j).toFixed(5)}`;
  for(let j=0;j<pos.count;j++){const k=key(j),n=sums.get(k)??new T.Vector3();n.add(new T.Vector3().fromBufferAttribute(norm,j));sums.set(k,n);}
  for(let j=0;j<pos.count;j++){const n=sums.get(key(j))!.clone().normalize();norm.setXYZ(j,n.x,n.y,n.z);}
  for(let j=0;j<outerNormals.length/3;j++)norm.setXYZ(j,outerNormals[j*3],outerNormals[j*3+1],outerNormals[j*3+2]);
  geo.computeBoundingBox();const centroid=geo.boundingBox!.getCenter(new T.Vector3());geo.translate(-centroid.x,-centroid.y,-centroid.z);geo.computeBoundingSphere();
  return {geometry:geo,home:centroid,outerVertices:outer.length/3};
 });
 g.dispose();return {pieces,center,extent,interfaces:patches.size,maxDisplacement};
}
