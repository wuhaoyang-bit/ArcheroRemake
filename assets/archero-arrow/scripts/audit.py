import UnityPy,json,re
from pathlib import Path
D=Path('/Applications/弓箭传说.app/Wrapper/ProductName.app/Data'); e=UnityPy.load(str(D/'resources.assets')); obs={o.path_id:o for o in e.objects}
def t(i):return obs[i].read_typetree()
def go(i):return t(i)['m_Name']
for o in e.objects:
 if o.type.name=='MeshFilter':
  d=o.read_typetree();m=d['m_Mesh'];
  if m['m_FileID']==0 and m['m_PathID'] in [6752,6833,6841,6846,6847]:
   g=t(d['m_GameObject']['m_PathID']);tr=next(t(c['component']['m_PathID']) for c in g['m_Component'] if obs[c['component']['m_PathID']].type.name=='Transform'); chain=[g['m_Name']];par=tr['m_Father']['m_PathID']
   while par:
    tr=t(par);chain.append(go(tr['m_GameObject']['m_PathID']));par=tr['m_Father']['m_PathID']
   print('MESH USER',m['m_PathID'],g['m_Name'],d['m_GameObject']['m_PathID'],'/'.join(reversed(chain)))
for fname in ['globalgamemanagers','globalgamemanagers.assets']:
 env=UnityPy.load(str(D/fname))
 for o in env.objects:
  if o.type.name=='ResourceManager':
   for k,v in o.read_typetree()['m_Container']:
    if re.search(r'arrow|bullet1001',k,re.I):print('RESOURCE',k,v)
  if o.path_id==8981 and o.type.name=='MonoScript':print('SCRIPT',o.read_typetree())
print('BULLET SCRIPT RAW',obs[494990].get_raw_data().hex())
