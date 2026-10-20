from pathlib import Path
import bpy,json,math
from mathutils import Matrix,Vector,Quaternion
R=Path(__file__).resolve().parents[1];D=R/'extracted'
read=lambda n:json.loads((D/n).read_text())
chars=read('characters.json');meshes=read('meshes.json');mats=read('materials.json');clips=read('clips.json')
C=Matrix(((-1,0,0,0),(0,0,-1,0),(0,1,0,0),(0,0,0,1)));CI=C.inverted()
def trs(t):return Matrix.LocRotScale(Vector([t['m_LocalPosition'][a] for a in 'xyz']),Quaternion([t['m_LocalRotation'][a] for a in 'wxyz']),Vector([t['m_LocalScale'][a] for a in 'xyz']))
def material(mid):
 d=mats[str(mid)];m=bpy.data.materials.new(d['name']);m.use_nodes=True
 ns=m.node_tree.nodes;ns.clear();out=ns.new('ShaderNodeOutputMaterial');em=ns.new('ShaderNodeEmission');tex=ns.new('ShaderNodeTexImage');tex.image=bpy.data.images.load(str(D/'textures'/d['textures']['_MainTex']['file']));tex.image.pack();m.node_tree.links.new(tex.outputs['Color'],em.inputs['Color']);m.node_tree.links.new(em.outputs[0],out.inputs[0]);return m
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
scene=bpy.context.scene;scene.render.fps=60;scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.resolution_x=700;scene.render.resolution_y=500;scene.render.resolution_percentage=100;scene.world.color=(0.15,0.15,0.15);scene.view_settings.view_transform='Standard'
camd=bpy.data.cameras.new('Camera');cam=bpy.data.objects.new('Camera',camd);scene.collection.objects.link(cam);scene.camera=cam;camd.type='ORTHO'
allobs={};targets={}
for c in chars:
 obs={}
 for n in c['nodes']:
  mf=next((x['data'] for x in n['components'] if x['type']=='MeshFilter'),None)
  if mf and mf['m_Mesh']['m_FileID']==0:
   md=meshes[str(mf['m_Mesh']['m_PathID'])];me=bpy.data.meshes.new(md['name']);me.from_pydata([C.to_3x3()@Vector(v[:3]) for v in md['vertices']],[],[tuple(reversed(f)) for sub in md['submeshes'] for f in sub]);me.update();uv=me.uv_layers.new()
   for l in me.loops:uv.data[l.index].uv=md['uv'][l.vertex_index][:2]
   mr=next(x['data'] for x in n['components'] if x['type']=='MeshRenderer')
   for p in mr['m_Materials']:me.materials.append(material(p['m_PathID']))
   ob=bpy.data.objects.new(c['name']+'_arrow',me);targets[c['name']]=ob
  else:ob=bpy.data.objects.new(c['name']+'_'+(n['path'] or 'root'),None)
  scene.collection.objects.link(ob);obs[n['id']]=ob;ob.parent=obs.get(n['transform']['m_Father']['m_PathID']);ob.matrix_local=C@trs(n['transform'])@CI;ob['unity_path_id']=n['id'];ob['unity_path']=n['path'];ob['source']='resources.assets'
 allobs[c['name']]=list(obs.values())

obs=allobs['1001_01']
bpy.ops.object.select_all(action='DESELECT')
for ob in obs: ob.select_set(True)
bpy.context.view_layer.objects.active=targets['1001_01']
bpy.ops.export_scene.gltf(filepath=str(R/'models/Arrow_1001_01.glb'),export_format='GLB',use_selection=True,export_animations=False)
bpy.ops.wm.save_as_mainfile(filepath=str(R/'models/Arrow_1001_01.blend'))
ob=targets['1001_01'];bpy.context.view_layer.update();pts=[ob.matrix_world@Vector(v) for v in ob.bound_box];center=sum(pts,Vector())/8;size=max(max(v[i] for v in pts)-min(v[i] for v in pts) for i in range(3))
for label,direction in [('top',(0,0,1)),('side',(1,0,0)),('oblique',(1,-1,1))]:
 cam.location=center+Vector(direction).normalized()*size*3;cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camd.ortho_scale=size*1.4;scene.render.filepath=str(R/'previews'/f'{label}.png');bpy.ops.render.render(write_still=True)
