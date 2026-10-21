"""Build a portable rig from extracted Unity data. Run with Blender --background."""
from pathlib import Path
import bpy
from mathutils import Matrix, Vector, Quaternion
import json, math, bisect, sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'extracted'
MODEL = ROOT / 'Model'
MODEL.mkdir(exist_ok=True)
REPORT = ROOT / 'reports'
C = Matrix(((-1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
CI = C.inverted()
FPS = 60
CORE = ['Idle', 'Run', 'Hitted', 'Dead']

def read(name):
    return json.loads((DATA / name).read_text())

def vec(d):
    return Vector((d['x'], d['y'], d['z']))

def quat(d):
    return Quaternion((d['w'], d['x'], d['y'], d['z']))

def trs(t):
    return Matrix.LocRotScale(vec(t['m_LocalPosition']), quat(t['m_LocalRotation']), vec(t['m_LocalScale']))

def bmat(d):
    return Matrix([[d['e%d%d' % (r,c)] for c in range(4)] for r in range(4)])

characters = read('characters.json')
model_id = sys.argv[sys.argv.index('--monster')+1] if '--monster' in sys.argv else '3043_01'
char = next(c for c in characters if c['name']==model_id)
meshes = read('meshes.json')
materials = read('materials.json')
nodes = char['nodes']
node_by_id = {n['id']:n for n in nodes}
world = {}
for n in nodes:
    par = n['transform']['m_Father']['m_PathID']
    world[n['id']] = world.get(par, Matrix.Identity(4)) @ trs(n['transform'])

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)
scene = bpy.context.scene
scene.render.fps = FPS
scene.unit_settings.system = 'METRIC'

rigdata = bpy.data.armatures.new('Monster_'+model_id+'_Skeleton')
rig = bpy.data.objects.new('Monster_'+model_id, rigdata)
scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
rig.show_in_front = True
rigdata.display_type = 'STICK'

# Use mesh inverse bind matrices as the bind pose, rather than the prefab's idle pose.
bindworld = {i: m.copy() for i,m in world.items()}
bind_seen = {}
bind_errors = []
render_nodes = []
for n in nodes:
    for co in n['components']:
        if co['type'] != 'SkinnedMeshRenderer':
            continue
        d = co['data']; render_nodes.append((n,d))
        m = meshes[str(d['m_Mesh']['m_PathID'])]
        for b,p in zip(d['m_Bones'], m['bindposes']):
            bid = b['m_PathID']
            bw = world[n['id']] @ bmat(p).inverted()
            if bid in bind_seen:
                err = max(abs(bw[r][c]-bind_seen[bid][r][c]) for r in range(4) for c in range(4))
                bind_errors.append(err)
            else:
                bind_seen[bid] = bw
                bindworld[bid] = bw

# Attachment transforms follow the corrected parent bind pose.
for n in nodes:
    if n['id'] not in bind_seen:
        par = n['transform']['m_Father']['m_PathID']
        bindworld[n['id']] = bindworld.get(par, Matrix.Identity(4)) @ trs(n['transform'])

bone_nodes = nodes
bone_ids = {n['id'] for n in bone_nodes}
bone_names = {}
bpy.ops.object.mode_set(mode='EDIT')
for n in bone_nodes:
    bone = rigdata.edit_bones.new(n['name'] if n['path']!='rotate/juese' else 'CharacterRoot')
    bone_names[n['id']] = bone.name
    mat = C @ bindworld[n['id']] @ CI
    bone.head = mat.translation
    bone.tail = mat.translation + mat.to_3x3() @ Vector((0,0.07,0))
    bone.matrix = mat
    bone.length = 0.07
    par = n['transform']['m_Father']['m_PathID']
    if par in bone_names:
        bone.parent = rigdata.edit_bones[bone_names[par]]
    bone.use_deform = n['id'] in bind_seen
bpy.ops.object.mode_set(mode='OBJECT')
for pb in rig.pose.bones:
    pb.rotation_mode = 'QUATERNION'

blmats = {}
def get_mat(mid):
    mid = str(mid)
    if mid in blmats:
        return blmats[mid]
    d = materials[mid]
    mat = bpy.data.materials.new(d['name'])
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = 0.8
    bsdf.inputs['Specular IOR Level'].default_value = 0.15
    tex = d['textures'].get('_MainTex')
    if tex:
        im = bpy.data.images.load(str(DATA/'textures'/tex['file']), check_existing=True)
        im.pack()
        it = mat.node_tree.nodes.new('ShaderNodeTexImage'); it.image = im
        mat.node_tree.links.new(it.outputs['Color'],bsdf.inputs['Base Color'])
        # Mobile character textures are opaque, including RGB atlas padding.
    blmats[mid] = mat
    return mat

mesh_objects = []
def make_mesh(n, d, is_skinned=True, meshid=None):
    mid = meshid or d['m_Mesh']['m_PathID']
    m = meshes[str(mid)]
    transform = C @ world[n['id']]
    verts = [transform @ Vector(v[:3]) for v in m['vertices']]
    faces = [tuple(reversed(tri)) for sub in m['submeshes'] for tri in sub]
    md = bpy.data.meshes.new(m['name'])
    md.from_pydata(verts, [], faces); md.update()
    ob = bpy.data.objects.new(n['name'], md)
    scene.collection.objects.link(ob)
    ob.parent = rig
    if m['uv']:
        uv = md.uv_layers.new(name='UVMap')
        for loop in md.loops:
            uv.data[loop.index].uv = m['uv'][loop.vertex_index][:2]
    for mat in d['m_Materials']:
        md.materials.append(get_mat(mat['m_PathID']))
    pi = 0
    for mi,sub in enumerate(m['submeshes']):
        for _ in sub:
            md.polygons[pi].material_index = min(mi,len(md.materials)-1)
            md.polygons[pi].use_smooth = True
            pi += 1
    if m['normals']:
        nm = transform.to_3x3().inverted().transposed()
        normals = [(nm @ Vector(v[:3])).normalized() for v in m['normals']]
        md.normals_split_custom_set_from_vertices(normals)
    if is_skinned:
        groups = [ob.vertex_groups.new(name=bone_names[b['m_PathID']]) for b in d['m_Bones']]
        for vi,(indices,weights) in enumerate(zip(m['bone_indices'],m['bone_weights'])):
            total = sum(weights)
            for bi,w in zip(indices,weights):
                if w > 0:
                    groups[bi].add([vi],w/total,'REPLACE')
        mod = ob.modifiers.new('Original skin weights','ARMATURE'); mod.object=rig
    mesh_objects.append(ob)
    return ob

for n,d in render_nodes:
    make_mesh(n,d)
# Preserve rigid accessories as a rigid skin on their actual transform bone.
for n in nodes:
    mf=next((co['data'] for co in n['components'] if co['type']=='MeshFilter'),None)
    mr=next((co['data'] for co in n['components'] if co['type']=='MeshRenderer'),None)
    if mf and mr and mf['m_Mesh']['m_PathID']:
        ob=make_mesh(n,mr,False,mf['m_Mesh']['m_PathID'])
        vg=ob.vertex_groups.new(name=bone_names[n['id']]);vg.add(list(range(len(ob.data.vertices))),1,'REPLACE')
        mod=ob.modifiers.new('Original rigid attachment','ARMATURE');mod.object=rig

def unpack_ints(p):
    value=int.from_bytes(bytes(p['m_Data']),'little'); width=p['m_BitSize']
    mask=(1<<width)-1
    return [(value>>(i*width))&mask for i in range(p['m_NumItems'])]

def unpack_floats(p):
    width=p['m_BitSize']
    if not width:return [p['m_Start']]*p['m_NumItems']
    return [p['m_Start']+x*p['m_Range']/((1<<width)-1) for x in unpack_ints(p)]

def unpack_quats(p):
    data=int.from_bytes(bytes(p['m_Data']),'little'); at=0; result=[]
    for _ in range(p['m_NumItems']):
        flags=(data>>at)&7;at+=3;omit=flags&3;q=[0.0]*4
        for j in range(4):
            if j==omit:continue
            width=9 if j==(omit+1)%4 else 10
            q[j]=((data>>at)&((1<<width)-1))*2/((1<<width)-1)-1;at+=width
        q[omit]=math.sqrt(max(0,1-sum(x*x for x in q)))*(-1 if flags&4 else 1)
        result.append(q)
    return result

def curve_data(clip):
    tracks={}
    for field,channel in [('m_PositionCurves','p'),('m_RotationCurves','q'),('m_ScaleCurves','s')]:
        for curve in clip[field]:
            keys=curve['curve']['m_Curve']
            if not keys:continue
            axes='xyzw' if channel=='q' else 'xyz'
            tracks.setdefault(curve['path'],{})[channel]=[
                (k['time'],[k['value'][x] for x in axes],
                 [k['inSlope'][x] for x in axes],[k['outSlope'][x] for x in axes]) for k in keys]
    for curve in clip['m_CompressedRotationCurves']:
        deltas=unpack_ints(curve['m_Times']); values=unpack_quats(curve['m_Values']); slopes=unpack_floats(curve['m_Slopes'])
        ticks=0;keys=[]
        for i,(dt,q) in enumerate(zip(deltas,values)):
            ticks+=dt;tangent=slopes[i*4:i*4+4]
            keys.append((ticks*0.01,q,tangent,tangent))
        tracks.setdefault(curve['m_Path'],{})['q']=keys
    return tracks

def sample(keys,t):
    if t<=keys[0][0]:return keys[0][1]
    if t>=keys[-1][0]:return keys[-1][1]
    i=bisect.bisect_right([k[0] for k in keys],t)-1
    a,b=keys[i:i+2];dt=b[0]-a[0];u=(t-a[0])/dt
    h00=2*u**3-3*u*u+1;h10=u**3-2*u*u+u;h01=-2*u**3+3*u*u;h11=u**3-u*u
    return [h00*v+h10*dt*s0+h01*w+h11*dt*s1 if math.isfinite(s0) and math.isfinite(s1) else v
            for v,w,s0,s1 in zip(a[1],b[1],a[3],b[2])]

animation_node=next(n for n in nodes if any(c['type']=='Animation' for c in n['components']))
prefix=animation_node['path']
def clip_path(n):
    if n['path']==prefix:return ''
    if n['path'].startswith(prefix+'/'):return n['path'][len(prefix)+1:]
    return None
relative={clip_path(n):n for n in bone_nodes if clip_path(n) is not None}
all_clips=read('clips.json')
refs=next(c['data']['m_Animations'] for c in animation_node['components'] if c['type']=='Animation')
clips={all_clips[str(p['m_PathID'])]['m_Name']:all_clips[str(p['m_PathID'])] for p in refs}
clip_report=[]
bind_bl={n['id']:rigdata.bones[bone_names[n['id']]].matrix_local.copy() for n in bone_nodes}
inv_rest_local={}
for n in bone_nodes:
    par=n['transform']['m_Father']['m_PathID']
    restlocal=bind_bl[par].inverted() @ bind_bl[n['id']] if par in bind_bl else bind_bl[n['id']]
    inv_rest_local[n['id']]=restlocal.inverted()

order=[n for n in CORE if n in clips]+sorted(set(clips)-set(CORE))
if '--core-only' in sys.argv:order=CORE
for name in order:
    clip=clips[name];tracks=curve_data(clip)
    duration=max(k[-1][0] for tr in tracks.values() for k in tr.values())
    end=round(duration*FPS)+1
    action=bpy.data.actions.new(name);action.use_fake_user=True
    action['source_clip']=name;action['source_sample_rate']=clip['m_SampleRate'];action['duration_seconds']=duration
    slot=action.slots.new('OBJECT',rig.name)
    layer=action.layers.new(name);strip=layer.strips.new(type='KEYFRAME');bag=strip.channelbag(slot,ensure=True)
    missing=sorted(set(tracks)-set(relative))
    channels={n['id']:[[] for _ in range(10)] for n in bone_nodes}
    previous={}
    for frame in range(1,end+1):
        t=min((frame-1)/FPS,duration)
        animated_world = {}
        desired_world = {}
        for n in bone_nodes:
            tr=tracks.get(clip_path(n),{})
            base=n['transform']
            p=sample(tr['p'],t) if 'p' in tr else list(vec(base['m_LocalPosition']))
            q=sample(tr['q'],t) if 'q' in tr else [base['m_LocalRotation'][a] for a in 'xyzw']
            s=sample(tr['s'],t) if 's' in tr else list(vec(base['m_LocalScale']))
            qm=Quaternion((q[3],q[0],q[1],q[2])).normalized()
            local=C @ Matrix.LocRotScale(Vector(p),qm,Vector(s)) @ CI
            par = n['transform']['m_Father']['m_PathID']
            animated_world[n['id']] = animated_world.get(par, Matrix.Identity(4)) @ local
            # Edit bones cannot retain Unity inverse-bind scale (2.54 for this rig).
            # Preserve the complete skin matrix, including that scale, in the pose.
            desired_world[n['id']] = animated_world[n['id']] @ (C @ bindworld[n['id']] @ CI).inverted() @ bind_bl[n['id']]
            desired_local = desired_world.get(par, Matrix.Identity(4)).inverted() @ desired_world[n['id']]
            basis=inv_rest_local[n['id']] @ desired_local
            loc,rot,scale=basis.decompose()
            if n['id'] in previous and rot.dot(previous[n['id']])<0:rot.negate()
            previous[n['id']]=rot.copy()
            for ch,value in zip(channels[n['id']],list(loc)+list(rot)+list(scale)):
                ch.extend((frame,value))
    for n in bone_nodes:
        escaped=bone_names[n['id']].replace('\\','\\\\').replace('"','\\"')
        for index,values in enumerate(channels[n['id']]):
            prop,axis=('location',index) if index<3 else (('rotation_quaternion',index-3) if index<7 else ('scale',index-7))
            fc=bag.fcurves.new('pose.bones["%s"].%s'%(escaped,prop),index=axis)
            fc.keyframe_points.add(end);fc.keyframe_points.foreach_set('co',values)
            for kp in fc.keyframe_points:kp.interpolation='LINEAR'
    clip_report.append({'name':name,'seconds':duration,'frames':end,'source_fps':clip['m_SampleRate'],'unbound_paths':missing})
    print('ACTION',name,end,'frames','unbound',len(missing),flush=True)

rig.animation_data_create();rig.animation_data.action=bpy.data.actions['Idle']
rig.animation_data.action_slot=bpy.data.actions['Idle'].slots[0]
scene.frame_start=1;scene.frame_end=61;scene.frame_set(1)
bpy.context.view_layer.update()
stats={'vertices':sum(len(o.data.vertices) for o in mesh_objects),'triangles':sum(len(o.data.polygons) for o in mesh_objects),
       'bones':len(rigdata.bones),'deform_bones':len(bind_seen),'max_bindpose_disagreement':max(bind_errors,default=0),'animations':clip_report}
(REPORT/('export_'+model_id+'.json')).write_text(json.dumps(stats,indent=2))

# A compact neutral stage is kept only in the .blend preview scene.
scene.world.color=(0.2,0.2,0.2)
bounds=[o.matrix_world @ Vector(c) for o in mesh_objects for c in o.bound_box]
lo=Vector(tuple(min(v[i] for v in bounds) for i in range(3)))
hi=Vector(tuple(max(v[i] for v in bounds) for i in range(3)))
center=(lo+hi)*0.5;height=hi.z-lo.z
print('BOUNDS',tuple(lo),tuple(hi),flush=True)
camd=bpy.data.cameras.new('PreviewCamera');cam=bpy.data.objects.new('PreviewCamera',camd);scene.collection.objects.link(cam)
cam.location=center+Vector((height*1.5,-height*2.7,height*0.9))
cam.rotation_euler=(center-cam.location).to_track_quat('-Z','Y').to_euler();camd.type='ORTHO';camd.ortho_scale=height*1.6;scene.camera=cam
for name,pos,power,size in [('Key',(3,-4,6),500,5),('Fill',(-4,-2,3),300,4),('Rim',(2,4,5),500,3)]:
    ld=bpy.data.lights.new(name,'AREA');ld.energy=power;ld.shape='DISK';ld.size=size
    ob=bpy.data.objects.new(name,ld);scene.collection.objects.link(ob);ob.location=center+Vector(pos)
    ob.rotation_euler=(center-ob.location).to_track_quat('-Z','Y').to_euler()
scene.render.engine='CYCLES';scene.cycles.device='CPU';scene.cycles.samples=24
scene.render.resolution_x=800;scene.render.resolution_y=800;scene.render.resolution_percentage=100
scene.view_settings.view_transform='Standard'
scene.render.image_settings.file_format='PNG';scene.render.filepath=str(ROOT/'previews'/('Monster_'+model_id+'.png'))

bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for ob in mesh_objects:ob.select_set(True)
bpy.context.view_layer.objects.active=rig
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_distance=height*2.5
        area.spaces.active.region_3d.view_location=center
        area.spaces.active.shading.type='MATERIAL'
bpy.ops.wm.save_as_mainfile(filepath=str(MODEL/('Monster_'+model_id+'.blend')))
print('BLEND SAVED',flush=True)
if '--preview-only' not in sys.argv:
    bpy.ops.export_scene.fbx(filepath=str(MODEL/('Monster_'+model_id+'.fbx')),use_selection=True,object_types={'MESH','ARMATURE'},
        add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=True,bake_anim_use_nla_strips=False,
        bake_anim_simplify_factor=0.0,path_mode='COPY',embed_textures=True,axis_forward='-Z',axis_up='Y')
    print('FBX SAVED',flush=True)
bpy.ops.export_scene.gltf(filepath=str(MODEL/('Monster_'+model_id+'.glb')),export_format='GLB',use_selection=True,export_animations=True,export_animation_mode='ACTIONS',export_frame_range=False)
bpy.ops.render.render(write_still=True)
print('COMPLETE',flush=True)
