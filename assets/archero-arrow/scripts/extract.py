from pathlib import Path
import json, UnityPy, collections, hashlib
from UnityPy.helpers.MeshHelper import MeshHandler
R=Path(__file__).resolve().parents[1]; S=Path('/Applications/弓箭传说.app/Wrapper/ProductName.app/Data'); O=R/'extracted'; O.mkdir(exist_ok=True)
for p in ['raw_objects','textures']: (O/p).mkdir(exist_ok=True)
def write(p,d): (O/p).write_text(json.dumps(d,ensure_ascii=False,indent=2,default=lambda x:list(x) if isinstance(x,bytes) else str(x)))
print('Loading',flush=True); env=UnityPy.load(str(S/'resources.assets')); objs={o.path_id:o for o in env.objects}; cache={}
def tree(i):
 if i not in cache: cache[i]=objs[i].read_typetree()
 return cache[i]
def dump(i):
 d=tree(i);write('raw_objects/%s_%s.json'%(objs[i].type.name,i),d);return d
def pid(p):
 assert p['m_FileID']==0,p
 return p['m_PathID']
# Name search only across GameObjects; no full object export.
roots=[]
for o in env.objects:
 if o.type.name=='GameObject':
  d=o.read_typetree()
  if o.path_id in [28921, 49584]:
   roots.append(o.path_id);cache[o.path_id]=d;print('ROOT',o.path_id,d['m_Name'],flush=True)
meshes={};mats={};clips={};shaders={}
def walk(tid,path,nodes):
 t=dump(tid);g=dump(pid(t['m_GameObject'])); n=dict(id=tid,name=g['m_Name'],path=path,transform=t,components=[]);nodes.append(n)
 for c in g['m_Component']:
  i=pid(c['component']); typ=objs[i].type.name
  if typ=='Transform':continue
  try:d=dump(i)
  except Exception as e: print('ERROR',i,str(e));continue
  n['components'].append(dict(id=i,type=typ,data=d))
  if typ in ['MeshFilter','SkinnedMeshRenderer'] and d['m_Mesh']['m_FileID']==0:
   mi=pid(d['m_Mesh']);mt=dump(mi);h=MeshHandler(objs[mi].read());h.process()
   meshes[mi]=dict(name=mt['m_Name'],vertices=h.m_Vertices,normals=h.m_Normals,uv=h.m_UV0,submeshes=list(h.get_triangles()),bone_indices=h.m_BoneIndices,bone_weights=h.m_BoneWeights,bindposes=mt.get('m_BindPose'),shapes=mt.get('m_Shapes'))
  if typ in ['MeshRenderer','SkinnedMeshRenderer']:
   for ptr in d['m_Materials']:
    mi=pid(ptr);md=dump(mi);textures={}
    for key,val in md['m_SavedProperties']['m_TexEnvs']:
     ti=pid(val['m_Texture'])
     if ti:
      tex=objs[ti].read();fn=f'{tex.m_Name}_{ti}.png';tex.image.save(O/'textures'/fn);textures[key]=dict(file=fn,scale=val['m_Scale'],offset=val['m_Offset'])
    mats[mi]=dict(name=md['m_Name'],textures=textures,properties=md['m_SavedProperties'],shader=md['m_Shader'])
    sp=md['m_Shader']
    if sp['m_FileID']==0 and sp['m_PathID']:
     si=pid(sp);sd=dump(si);shaders[si]=sd.get('m_ParsedForm',{}).get('m_Name');(O/'raw_objects'/f'Shader_{si}.bin').write_bytes(objs[si].get_raw_data())
  if typ=='Animation':
   for ptr in d['m_Animations']:
    if pid(ptr): clips[pid(ptr)]=dump(pid(ptr))
  if typ=='MonoBehaviour':
   sp=d.get('m_Script',{});
   if sp.get('m_FileID')==0 and sp.get('m_PathID'):dump(pid(sp))
 for child in t['m_Children']:
  i=pid(child);name=tree(pid(tree(i)['m_GameObject']))['m_Name'];walk(i,'/'.join(filter(None,[path,name])),nodes)
chars=[]
for i in roots:
 g=dump(i); tid=next(pid(c['component']) for c in g['m_Component'] if objs[pid(c['component'])].type.name=='Transform');ns=[];walk(tid,'',ns);chars.append(dict(name=g['m_Name'],goid=i,nodes=ns))
for fn,d in [('characters.json',chars),('meshes.json',meshes),('materials.json',mats),('clips.json',clips)]:write(fn,d)
report=dict(unitypy=UnityPy.__version__,source=str(S/'resources.assets'),externals=[str(x) for x in next(iter(env.files.values())).externals],shaders=shaders,roots=[(c['name'],c['goid']) for c in chars])
(R/'reports/source.json').write_text(json.dumps(report,indent=2));print('DONE',report,flush=True)
