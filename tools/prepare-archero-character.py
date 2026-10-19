"""Export Idle / Run and the two ordinary bow attack phases (Blender 5.2).

Run Blender with --background --factory-startup --disable-autoexec --python
tools/prepare-archero-character.py -- --source /path/Archero_Default.blend
The source file is never saved or modified. No downloads are performed.
"""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import sys

import bpy

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = "ed0285b942e3b6145c3ac513cc9b778070127ca5a882b9771005f0813bcde453"
CLIPS = {"Idle", "Run", "AttackPrev", "AttackEnd"}
parser = argparse.ArgumentParser()
parser.add_argument("--source", type=Path, default=ROOT / "analysis/source-assets/archero-default/Archero_Default.blend")
parser.add_argument("--output", type=Path, default=ROOT / "public/models/archero-default.glb")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
source = args.source.resolve()
assert hashlib.sha256(source.read_bytes()).hexdigest() == SOURCE_SHA256, "Unexpected source model; review before exporting."
bpy.ops.wm.open_mainfile(filepath=str(source), use_scripts=False)
scene = bpy.context.scene
rig = bpy.data.objects["Archero_Default"]
meshes = [obj for obj in scene.objects if obj.type == "MESH"]
assert len(meshes) == 5
for action in list(bpy.data.actions):
    if action.name not in CLIPS:
        bpy.data.actions.remove(action)
assert {a.name for a in bpy.data.actions} == CLIPS
rig.animation_data_create()
for track in list(rig.animation_data.nla_tracks):
    rig.animation_data.nla_tracks.remove(track)
scene.render.fps = 60
scene.render.fps_base = 1
report = {"sourceSha256": SOURCE_SHA256, "clips": {}, "meshes": [], "rootMotion": {}}
for action in bpy.data.actions:
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    start, end = map(int, action.frame_range)
    report["clips"][action.name] = {"frames": [start, end], "duration": (end - start) / 60}
    samples = []
    for frame in range(start, end + 1):
        scene.frame_set(frame)
        root = rig.pose.bones["CharacterRoot"]
        samples.append(list((rig.matrix_world @ root.matrix).translation))
    delta = [max(p[i] for p in samples) - min(p[i] for p in samples) for i in range(3)]
    report["rootMotion"][action.name] = {"first": samples[0], "rangeXYZ": delta}
    # Blender XY is the ground plane. Locomotion belongs to the game controller.
    assert max(delta[:2]) < 1e-5, f"Unexpected horizontal root motion in {action.name}"

rig.animation_data.action = bpy.data.actions["Idle"]
rig.animation_data.action_slot = bpy.data.actions["Idle"].slots[0]
scene.frame_set(1)
depsgraph = bpy.context.evaluated_depsgraph_get()
body_points = []
for obj in meshes:
    evaluated = obj.evaluated_get(depsgraph)
    mesh = evaluated.to_mesh()
    points = [evaluated.matrix_world @ vertex.co for vertex in mesh.vertices]
    report["meshes"].append({"name": obj.name, "vertices": len(mesh.vertices), "triangles": sum(len(p.vertices) - 2 for p in mesh.polygons)})
    if obj.name != "Bow_WeaponHand101001":
        body_points.extend(points)
    evaluated.to_mesh_clear()
bottom = min(p.z for p in body_points)
top = max(p.z for p in body_points)
scale = 3.25 / (top - bottom)
report["normalization"] = {"bodyHeight": top - bottom, "footZ": bottom, "scale": scale, "gameHeight": 3.25, "forward": "+Z (glTF)"}

# A static parent normalizes size and foot height without rewriting skin/bone keys.
# Blender -> glTF Y-up preserves the reconstructed character's +Z forward.
wrapper = bpy.data.objects.new("GameCharacter", None)
scene.collection.objects.link(wrapper)
rig.parent = wrapper
wrapper.scale = (scale,) * 3
wrapper.location.z = -bottom * scale
wrapper["source"] = "ArcHeroModel / Archero_Default.blend"
wrapper["bodyHeight"] = 3.25
wrapper["forward"] = "+Z"
bpy.ops.object.select_all(action="DESELECT")
for obj in [wrapper, rig, *meshes]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
args.output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.export_scene.gltf(
    filepath=str(args.output.resolve()), export_format="GLB", use_selection=True,
    export_yup=True, export_animations=True, export_animation_mode="ACTIONS",
    export_anim_single_armature=True, export_frame_range=False, export_frame_step=1,
    export_anim_slide_to_zero=True,
    export_force_sampling=True, export_reset_pose_bones=True, export_skins=True,
    export_def_bones=False, export_materials="EXPORT", export_extras=True,
    export_cameras=False, export_lights=False,
)
data = args.output.read_bytes()
json_size, = struct.unpack_from("<I", data, 12)
gltf = json.loads(data[20:20 + json_size])
assert {a["name"] for a in gltf["animations"]} == CLIPS
for animation in gltf["animations"]:
    times = [gltf["accessors"][sampler["input"]] for sampler in animation["samplers"]]
    assert abs(min(a["min"][0] for a in times)) < 1e-6, "Animation must start at zero."
    duration = max(a["max"][0] for a in times)
    assert abs(duration - report["clips"][animation["name"]]["duration"]) < 1e-6
assert len(gltf["images"]) == 5 and all("bufferView" in image for image in gltf["images"])
report["outputSha256"] = hashlib.sha256(data).hexdigest()
report["outputBytes"] = len(data)
report_path = ROOT / "analysis/character-import/export-report.json"
report_path.parent.mkdir(parents=True, exist_ok=True)
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
print("ARCHERO_EXPORT " + json.dumps(report, ensure_ascii=False))
