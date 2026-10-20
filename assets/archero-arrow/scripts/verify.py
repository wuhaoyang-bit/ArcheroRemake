import bpy,json
from pathlib import Path
R=Path(__file__).resolve().parents[1]
bpy.ops.wm.open_mainfile(filepath=str(R/'models/Arrow_1001_01.blend'))
assert any(o.type=='MESH' for o in bpy.data.objects)
assert all(i.packed_file for i in bpy.data.images if i.source=='FILE')
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(R/'models/Arrow_1001_01.glb'))
meshes=[o for o in bpy.data.objects if o.type=='MESH'];assert len(meshes)==1
ob=meshes[0];assert len(ob.data.vertices)>0;assert len(ob.data.polygons)==70
images=[node.image for mat in ob.data.materials for node in mat.node_tree.nodes if node.type=='TEX_IMAGE' and node.image];assert images;assert all(len(i.pixels)>0 and i.size[0]>0 for i in images)
result=dict(blend_open=True,glb_import=True,vertices=len(ob.data.vertices),triangles=len(ob.data.polygons),images=[dict(name=i.name,size=list(i.size)) for i in images],animations=len(bpy.data.actions))
(R/'reports/validation.json').write_text(json.dumps(result,indent=2));print(result)
