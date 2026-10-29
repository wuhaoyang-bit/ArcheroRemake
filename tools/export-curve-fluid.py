"""Blender --background --factory-startup CurveFluid.blend --python tools/export-curve-fluid.py
Derives three ground meshes from FuLi's evaluated Curve Fluid v0.0.2 geometry.
"""
import bpy, numpy as np, json
from pathlib import Path
from mathutils import Vector
from mathutils.bvhtree import BVHTree

out=Path(__file__).resolve().parents[1]/'public/assets/curve-fluid'
out.mkdir(parents=True,exist_ok=True)
source=bpy.data.objects['CurveFluid']
if source.mode!='OBJECT':bpy.ops.object.mode_set(mode='OBJECT')
mesh=bpy.data.meshes.new_from_object(source.evaluated_get(bpy.context.evaluated_depsgraph_get()))
adj=[[] for _ in mesh.vertices]
for e in mesh.edges:
 a,b=e.vertices;adj[a].append(b);adj[b].append(a)
seen=set();parts=[]
for i in range(len(adj)):
 if i in seen:continue
 stack=[i];seen.add(i);ids=[]
 while stack:
  a=stack.pop();ids.append(a)
  for b in adj[a]:
   if b not in seen:seen.add(b);stack.append(b)
 parts.append(sorted(ids))
parts.sort(key=lambda p:-len(p))
bpy.ops.object.select_all(action='DESELECT')
stats=[]
for variant,part_index in enumerate([2,3,4]):
 ids=parts[part_index];lookup={v:i for i,v in enumerate(ids)}
 p=np.array([mesh.vertices[i].co[:] for i in ids]);p-=p.mean(axis=0)
 _,_,basis=np.linalg.svd(p,full_matrices=False)
 if np.linalg.det(basis)<0:basis[2]*=-1
 p=p@basis.T;p[:,:2]-=(p[:,:2].min(axis=0)+p[:,:2].max(axis=0))/2
 p[:,:2]/=max(np.ptp(p[:,:2],axis=0))
 # Preserve the source's curved upper surface, compress its height for a ground puddle.
 p[:,2]=(p[:,2]-p[:,2].min())/np.ptp(p[:,2])*.045
 faces=[[lookup[i]for i in f.vertices]for f in mesh.polygons if f.vertices[0]in lookup]
 # Remove the local underside height, not just the global minimum: tips must
 # touch the floor instead of retaining the source liquid sheet's airborne bend.
 surface=BVHTree.FromPolygons([Vector(v)for v in p.tolist()],faces)
 heights=[]
 for x,y,z in p:
  hit=surface.ray_cast(Vector((x,y,-1)),Vector((0,0,1)))[0]
  heights.append(max(0,z-hit.z) if hit is not None else 0)
 p[:,2]=np.array(heights)/max(max(heights),1e-6)*.035
 m=bpy.data.meshes.new(f'CurveFluidGround{variant+1}');m.from_pydata(p.tolist(),[],faces);m.update()
 o=bpy.data.objects.new(m.name,m);bpy.context.collection.objects.link(o)
 bpy.context.view_layer.objects.active=o;o.select_set(True)
 dec=o.modifiers.new('Game mesh reduction','DECIMATE');dec.ratio=.55;bpy.ops.object.modifier_apply(modifier=dec.name)
 for f in o.data.polygons:f.use_smooth=True
 o.shape_key_add(name='Basis');gather=o.shape_key_add(name='Gathered')
 for v in gather.data:
  x,y,z=v.co;angle=np.arctan2(y,x);r=np.hypot(x,y)
  factor=.60+.13*np.sin(angle*3+variant)+.12*(1-min(1,r*2))
  v.co=(x*factor,y*factor,z*(1.7+.3*np.cos(angle*2)))
 mat=bpy.data.materials.new(f'CurveFluid{variant+1}');mat.use_nodes=True
 bsdf=mat.node_tree.nodes.get('Principled BSDF');bsdf.inputs['Base Color'].default_value=(1,.87,0,1);bsdf.inputs['Roughness'].default_value=.08;bsdf.inputs['IOR'].default_value=1.45
 o.data.materials.append(mat)
 o['source']='Curve Fluid v0.0.2 / FuLi / CC BY 4.0';o['modifications']='Separated, oriented, flattened, simplified; Gathered morph added.'
 bpy.ops.export_scene.gltf(filepath=str(out/f'puddle-{variant+1}.glb'),export_format='GLB',use_selection=True,export_yup=True,export_animations=False,export_morph=True)
 o.data.calc_loop_triangles();stats.append({'variant':variant+1,'sourceComponent':part_index,'vertices':len(o.data.vertices),'triangles':len(o.data.loop_triangles)})
 o.select_set(False)
(out/'manifest.json').write_text(json.dumps({'source':'CurveFluid.blend','author':'FuLi','version':'0.0.2','license':'CC-BY-4.0','variants':stats},indent=2))
print(stats)
