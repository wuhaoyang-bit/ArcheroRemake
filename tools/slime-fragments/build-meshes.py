from pathlib import Path
import json,sys,numpy as np,trimesh
from scipy.spatial import cKDTree,Delaunay,ConvexHull
ROOT=Path(sys.argv[1]);OUTPUT=Path(sys.argv[2]);OUTPUT.mkdir(parents=True,exist_ok=True)
meta=json.loads((ROOT/'meta.json').read_text()); report=[]
for i,part in enumerate(meta['parts']):
 p=np.fromfile(ROOT/f'{i}-positions.bin',dtype=np.float32).reshape(-1,3)
 n=np.fromfile(ROOT/f'{i}-normals.bin',dtype=np.float32).reshape(-1,3)
 # Preserve the accepted render mesh exactly, welding identical position/normal pairs only.
 _,first,inv=np.unique(np.round(np.hstack([p,n]),5),axis=0,return_index=True,return_inverse=True)
 rp=p[first];rn=n[first]
 mesh=trimesh.Trimesh(vertices=p,faces=np.arange(len(p)).reshape(-1,3),process=True)
 # A well-spaced convex simulation cage; the accepted curved render surface is unchanged.
 vertices=np.unique(np.round(p,5),axis=0);chosen=[int(np.argmax(vertices[:,1]))];dist=np.full(len(vertices),np.inf)
 for _ in range(41):
  dist=np.minimum(dist,np.linalg.norm(vertices-vertices[chosen[-1]],axis=1));chosen.append(int(np.argmax(dist)))
 boundary=vertices[chosen];hull=ConvexHull(boundary);lo=boundary.min(axis=0);hi=boundary.max(axis=0)
 grid=np.stack(np.meshgrid(*[np.linspace(lo[k],hi[k],5)[1:-1] for k in range(3)],indexing='ij'),axis=-1).reshape(-1,3)
 inside=np.all(grid@hull.equations[:,:3].T+hull.equations[:,3]<-.08,axis=1)
 x=np.vstack([boundary,grid[inside]]);ids=Delaunay(x).simplices.astype(np.uint32)
 vol0=np.abs(np.linalg.det(np.stack([x[ids[:,1]]-x[ids[:,0]],x[ids[:,2]]-x[ids[:,0]],x[ids[:,3]]-x[ids[:,0]]],axis=2)))/6
 longest=np.max([np.linalg.norm(x[ids[:,a]]-x[ids[:,b]],axis=1) for a in range(4) for b in range(a)],axis=0)
 ids=ids[(vol0>1e-7)&(vol0/longest**3>.006)]
 used=np.unique(ids);remap=np.full(len(x),-1);remap[used]=np.arange(len(used));x=x[used];ids=remap[ids].astype(np.uint32)

 a=x[ids[:,1]]-x[ids[:,0]];b=x[ids[:,2]]-x[ids[:,0]];c=x[ids[:,3]]-x[ids[:,0]]
 vol=np.einsum('ij,ij->i',a,np.cross(b,c))/6
 flip=vol<0;ids[flip,1],ids[flip,2]=ids[flip,2].copy(),ids[flip,1].copy()
 mat=np.stack([x[ids[:,1]]-x[ids[:,0]],x[ids[:,2]]-x[ids[:,0]],x[ids[:,3]]-x[ids[:,0]]],axis=2)
 inverse=np.linalg.inv(mat);centers=x[ids].mean(axis=1)
 _,candidates=cKDTree(centers).query(rp,k=min(48,len(ids)))
 dif=rp[:,None,:]-x[ids[candidates,0]]
 bary=np.einsum('nkij,nkj->nki',inverse[candidates],dif)
 weights=np.concatenate([1-bary.sum(axis=2,keepdims=True),bary],axis=2)
 score=np.maximum(-weights,0).sum(axis=2)
 best=score.argmin(axis=1);chosen=candidates[np.arange(len(rp)),best];w=weights[np.arange(len(rp)),best]
 reconstruction=(x[ids[chosen]]*w[:,:,None]).sum(axis=1)
 # Group neighbourhoods for physically based shape matching (paper eq 13, 17, 18, 15).
 groups=[]
 for tid in range(0,len(ids),6):
  nearest=cKDTree(x).query(centers[tid],k=min(10,len(x)))[1]
  if len(nearest)>=5:groups.append(nearest.tolist())
 covered=set(sum(groups,[]))
 for node in range(len(x)):
  if node not in covered:
   nearest=cKDTree(x).query(x[node],k=min(12,len(x)))[1].tolist();groups.append(nearest);covered.update(nearest)
 data={'nodes':x.reshape(-1).tolist(),'tets':ids.reshape(-1).tolist(),'groups':groups,'home':part['home'],'surfaceGroups':part['groups']}
 (OUTPUT/f'{i}-sim.json').write_text(json.dumps(data,separators=(',',':')))
 for name,arr,dtype in [('skin-pos',rp,np.float32),('skin-normal',rn,np.float32),('skin-index',inv,np.uint32),('bind-ids',ids[chosen],np.uint32),('bind-weights',w,np.float32)]:np.asarray(arr,dtype=dtype).tofile(OUTPUT/f'{i}-{name}.bin')
 item={'piece':i,'nodes':len(x),'tets':len(ids),'groups':len(groups),'skinVertices':len(rp),'minTetVolume':float(abs(vol).min()),'extrapolatedFraction':float((score[np.arange(len(rp)),best]>1e-5).mean()),'maxNegativeWeight':float(max(0,-w.min())),'restError':float(np.max(np.linalg.norm(reconstruction-rp,axis=1))),'simulationVolume':float(abs(vol).sum()),'sourceVolume':float(mesh.volume)}
 report.append(item);print(item,flush=True)
(OUTPUT/'mesh-report.json').write_text(json.dumps(report,indent=2))

# A runtime manifest keeps the loader, tests and profiling tools independent of count.
(OUTPUT/'reference-body.json').write_bytes((ROOT/'reference-body.json').read_bytes())
manifest={'version':2,'count':len(meta['parts']),'seed':meta['seed'],'interfaces':meta['interfaces'],'referenceVolume':meta['referenceVolume'],'totalPieceVolume':sum(p['volume'] for p in meta['parts']),'totalTriangles':sum(p['triangles'] for p in meta['parts']),'totalNodes':sum(p['nodes'] for p in report),'totalTets':sum(p['tets'] for p in report),'pieces':[{'volume':p['volume'],'triangles':p['triangles']} for p in meta['parts']]}
(OUTPUT/'manifest.json').write_text(json.dumps(manifest,indent=2))
