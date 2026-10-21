import bpy,json
from pathlib import Path
from mathutils import Matrix,Vector,Quaternion
R=Path('/Users/racio/Desktop/ArcheroSpiderExtract')
bpy.ops.wm.open_mainfile(filepath=str(R/'Model/Monster_3043_01.blend'))
s=(R/'scripts/build_spider.py').read_text()
exec(s[s.index('def unpack_ints'):s.index('animation_node=')])
import math,bisect
c=json.loads((R/'extracted/characters.json').read_text())[0]; ns=c['nodes'];ms=json.loads((R/'extracted/meshes.json').read_text()); clips=json.loads((R/'extracted/clips.json').read_text())
print('SCALES',[(n['name'],n['transform']['m_LocalScale']) for n in ns if any(abs(n['transform']['m_LocalScale'][a]-1)>.001 for a in 'xyz')])
rig=next(o for o in bpy.data.objects if o.type=='ARMATURE');ob=next(o for o in bpy.data.objects if o.type=='MESH');C=Matrix(((-1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)))
for name, time in [(n,t) for n in ['Idle','Run','Hitted','Dead'] for t in [0, 0.1, 0.3]]:
 tr=curve_data(next(v for v in clips.values() if v['m_Name']==name));world={}
 for n in ns:
  d=n['transform'];t=tr.get(n['path'].removeprefix('rotate/Creatures_Tarantula_001/'),{});p=sample(t['p'],time) if 'p' in t else [d['m_LocalPosition'][a] for a in 'xyz'];q=sample(t['q'],time) if 'q' in t else [d['m_LocalRotation'][a] for a in 'xyzw'];sc=sample(t['s'],time) if 's' in t else [d['m_LocalScale'][a] for a in 'xyz'];world[n['id']]=world.get(d['m_Father']['m_PathID'],Matrix.Identity(4))@Matrix.LocRotScale(Vector(p),Quaternion((q[3],*q[:3])).normalized(),Vector(sc))
 n=next(n for n in ns if any(c['type']=='SkinnedMeshRenderer' for c in n['components']));d=next(c['data'] for c in n['components'] if c['type']=='SkinnedMeshRenderer');m=ms[str(d['m_Mesh']['m_PathID'])];bm=[world[b['m_PathID']]@Matrix([[p['e%d%d'%(r,c)] for c in range(4)] for r in range(4)]) for b,p in zip(d['m_Bones'],m['bindposes'])]
 vs=[]
 for v,inds,ws in zip(m['vertices'],m['bone_indices'],m['bone_weights']):
  v=Vector(v[:3]);vs.append(C@sum((bm[i]@v*w for i,w in zip(inds,ws)),Vector((0,0,0))))
 rig.animation_data.action=bpy.data.actions[name];rig.animation_data.action_slot=bpy.data.actions[name].slots[0];bpy.context.scene.frame_set(round(time*60)+1);bpy.context.view_layer.update();ev=ob.evaluated_get(bpy.context.evaluated_depsgraph_get());actual=[v.co for v in ev.data.vertices];errs=[(a-b).length for a,b in zip(vs,actual)]
 assert max(errs)<0.00001, (name,time,max(errs))
 print('AUDIT',name,time,'maxerror',max(errs),'rawbounds',[(min(v[i] for v in vs),max(v[i] for v in vs)) for i in range(3)],'blenderbounds',[(min(v[i] for v in actual),max(v[i] for v in actual)) for i in range(3)])