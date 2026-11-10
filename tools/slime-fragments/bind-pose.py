"""Bind the accepted fragments to the live slime's triangular surface via star tetrahedra.
Run with numpy/scipy. This only generates pose-transfer weights, not new cuts.
"""
from pathlib import Path
import json,sys
import numpy as np
from scipy.spatial import cKDTree
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path(__file__).resolve().parents[2]/'public/assets/slime-fragments'
r=json.loads((root/'reference-body.json').read_text());v=np.array(r['positions']).reshape(-1,3);tri=np.array(r['indices']).reshape(-1,3);center=v.mean(axis=0)
m=np.transpose(v[tri]-center,(0,2,1));inv=np.linalg.inv(m);dirs=v[tri].mean(axis=1)-center;dirs/=np.linalg.norm(dirs,axis=1)[:,None];tree=cKDTree(dirs)
report=[]
for path in sorted(root.glob('*-sim.json'),key=lambda p:int(p.name.split('-')[0])):
 i=int(path.name.split('-')[0])
 d=json.loads((root/f'{i}-sim.json').read_text());home=np.array(d['home'])
 for kind,points in [('surface',np.fromfile(root/f'{i}-skin-pos.bin',dtype=np.float32).reshape(-1,3)+home),('nodes',np.array(d['nodes']).reshape(-1,3)+home)]:
  delta=points-center;direction=delta/np.maximum(np.linalg.norm(delta,axis=1)[:,None],1e-15)
  candidates=tree.query(direction,k=48)[1];weights=np.einsum('nkij,nj->nki',inv[candidates],delta)
  # Slightly exterior cage points use the best affine extension; render rest positions remain exact.
  score=np.maximum(-weights,0).sum(axis=2)+np.maximum(weights.sum(axis=2)-1,0)
  best=score.argmin(axis=1);tid=candidates[np.arange(len(points)),best];w=weights[np.arange(len(points)),best]
  np.asarray(tid,dtype=np.uint16).tofile(root/f'{i}-{kind}-pose-ids.bin');np.asarray(w,dtype=np.float32).tofile(root/f'{i}-{kind}-pose-weights.bin')
  rebuilt=center+np.einsum('nij,nj->ni',m[tid],w)
  report.append({'piece':i,'kind':kind,'maxRestError':float(np.linalg.norm(rebuilt-points,axis=1).max()),'maxExteriorWeight':float(score[np.arange(len(points)),best].max())})
(root/'pose-report.json').write_text(json.dumps(report,indent=2));print('max reconstruction error',max(r['maxRestError'] for r in report))
