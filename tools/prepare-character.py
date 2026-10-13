"""Keep the original rig/mesh and only Idle + Run; compact referenced GLB buffers.
Source model is CC0. The full source download remains in ignored analysis/.
"""
from pathlib import Path
import json,struct,hashlib
from urllib.request import urlopen
ROOT=Path(__file__).resolve().parents[1]
src=ROOT/'analysis/source-assets/Rogue_Hooded.glb'
src.parent.mkdir(parents=True,exist_ok=True)
old=ROOT/'public/models/rogue-source.glb'
if old.exists():old.replace(src)
if not src.exists():
 url='https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/Rogue_Hooded.glb'
 with urlopen(url,timeout=60) as response:data=response.read()
 if hashlib.sha256(data).hexdigest()!='93e6e25213009952276d9cf34f5d96a243767334c66f280db0433ddfabb91545':
  raise RuntimeError('Upstream source changed; review it before regenerating the bundled model.')
 src.write_bytes(data)
b=src.read_bytes();length=struct.unpack_from('<I',b,12)[0];g=json.loads(b[20:20+length]);start=20+length;binary=b[start+8:]
g['animations']=[a for a in g['animations'] if a['name'] in ['Idle','Running_A']]
for a in g['animations']:
 if a['name']=='Running_A':a['name']='Run'
needed=set()
for mesh in g['meshes']:
 for p in mesh['primitives']:
  needed.update(p['attributes'].values())
  if 'indices' in p:needed.add(p['indices'])
  for target in p.get('targets',[]):needed.update(target.values())
for s in g.get('skins',[]):
 if 'inverseBindMatrices' in s:needed.add(s['inverseBindMatrices'])
for a in g['animations']:
 for s in a['samplers']:needed.update([s['input'],s['output']])
amap={old:new for new,old in enumerate(sorted(needed))};accessors=[g['accessors'][i] for i in sorted(needed)]
for mesh in g['meshes']:
 for p in mesh['primitives']:
  p['attributes']={k:amap[v] for k,v in p['attributes'].items()}
  if 'indices' in p:p['indices']=amap[p['indices']]
  for target in p.get('targets',[]):
   for k,v in target.items():target[k]=amap[v]
for s in g.get('skins',[]):
 if 'inverseBindMatrices' in s:s['inverseBindMatrices']=amap[s['inverseBindMatrices']]
for a in g['animations']:
 for s in a['samplers']:
  s['input']=amap[s['input']];s['output']=amap[s['output']]
views=set()
for a in accessors:
 if 'bufferView' in a:views.add(a['bufferView'])
 for k in ['indices','values']:
  if k in a.get('sparse',{}):views.add(a['sparse'][k]['bufferView'])
for im in g.get('images',[]):
 if 'bufferView'in im:views.add(im['bufferView'])
vmap={old:new for new,old in enumerate(sorted(views))};newbin=bytearray();newviews=[]
for i in sorted(views):
 v=dict(g['bufferViews'][i]);offset=v.get('byteOffset',0);newbin.extend(b'\0'*((-len(newbin))%4));v['byteOffset']=len(newbin);v['buffer']=0;newbin.extend(binary[offset:offset+v['byteLength']]);newviews.append(v)
for a in accessors:
 if 'bufferView' in a:a['bufferView']=vmap[a['bufferView']]
 for k in ['indices','values']:
  if k in a.get('sparse',{}):a['sparse'][k]['bufferView']=vmap[a['sparse'][k]['bufferView']]
for im in g.get('images',[]):
 if 'bufferView'in im:im['bufferView']=vmap[im['bufferView']]
g['accessors']=accessors;g['bufferViews']=newviews;g['buffers']=[{'byteLength':len(newbin)}]
j=json.dumps(g,separators=(',',':')).encode();j+=b' '*((-len(j))%4);newbin.extend(b'\0'*((-len(newbin))%4))
out=struct.pack('<III',0x46546c67,2,12+8+len(j)+8+len(newbin))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(newbin),0x004e4942)+newbin
(ROOT/'public/models/rogue.glb').write_bytes(out)
print('GLB',len(b),'->',len(out),'bytes; clips:',[a['name'] for a in g['animations']]);print('Source SHA256',hashlib.sha256(b).hexdigest());print('Output SHA256',hashlib.sha256(out).hexdigest())
