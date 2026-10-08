"""Render one found-footage shot in Blender from a Wrong Floor scene (.glb from export_floor.py).

A handheld camcorder walks a path of waypoints given in the GAME's coordinates (three.js: y up,
the car at the origin, the floor running away down -z; yaw 0 looks down -z, pitch up is positive),
so a shot can be blocked in the game with ?debug and copied here. The fluorescent tubes become
real lights, the air gets a little haze, and the camera breathes and drifts.

    /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/video/blender_shot.py -- \
        --scene video/scenes/floor7.glb --shot scripts/video/shots/underpass_walk.json --out video/renders/underpass

Shot file:
    {"seconds": 10, "fps": 30, "size": [960, 720], "lens": 18, "handheld": 1.0, "haze": 0.03,
     "path": [[x, y, z, yaw, pitch], ...]}          # evenly spaced in time, eased between
Writes PNG frames to --out (frame_0001.png ...).
"""
import json
import math
import sys
from pathlib import Path

import bpy

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
args = dict(zip(argv[::2], argv[1::2]))
shot = json.loads(Path(args["--shot"]).read_text())
out = Path(args["--out"]); out.mkdir(parents=True, exist_ok=True)
fps, secs = shot.get("fps", 30), shot["seconds"]
W, H = shot.get("size", [960, 720])

# ---- a clean scene with the floor in it ----
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
bpy.ops.import_scene.gltf(filepath=str(Path(args["--scene"]).resolve()))

# glow: the game's unlit bright surfaces (tubes, bulbs, signs, the burst) emit for real
glowing = set()
for mat in bpy.data.materials:
    nt = mat.node_tree
    if not nt:
        continue
    for n in nt.nodes:
        # three's unlit materials import as an Emission node; plain bright ones (no texture) are fixtures
        if n.type == "EMISSION" and not n.inputs["Color"].is_linked:
            c = n.inputs["Color"].default_value
            if 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2] > 0.6:
                n.inputs["Strength"].default_value = shot.get("glow", 6.0)
                glowing.add(mat.name)
# the game's textures are crunchy on purpose: no smoothing
if shot.get("pixel_textures", True):
    for mat in bpy.data.materials:
        for n in (mat.node_tree.nodes if mat.node_tree else []):
            if n.type == "TEX_IMAGE":
                n.interpolation = "Closest"
# the scene's own point lights come in from the glTF far too weak for EEVEE: bring them to taste
for ob in bpy.data.objects:
    if ob.type == "LIGHT":
        ob.data.energy *= shot.get("light_scale", 1500.0)
        ob.data.shadow_soft_size = 0.4
# every small glowing fixture high up (a fluorescent tube, a bulb) gets a real light under it, pointing down
tube_w = shot.get("tube_watts", 60.0)
for ob in list(bpy.data.objects):
    if ob.type != "MESH" or not any(s.material and s.material.name in glowing for s in ob.material_slots):
        continue
    dx, dy, dz = ob.dimensions
    if ob.matrix_world.translation.z < 1.9 or max(dx, dy) > 3.0:
        continue
    ld = bpy.data.lights.new("tube", "AREA"); ld.shape = "RECTANGLE"; ld.size = max(0.1, dx); ld.size_y = max(0.1, dy)
    ld.energy = tube_w; ld.color = shot.get("tube_color", (1.0, 0.95, 0.82))
    lo = bpy.data.objects.new("tube_light", ld); sc.collection.objects.link(lo)
    lo.location = ob.matrix_world.translation - __import__("mathutils").Vector((0, 0, max(dz, 0.03) * 0.6 + 0.01))

# ---- the world: dark, with a little haze in the air ----
world = bpy.data.worlds.new("void"); sc.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (0.004, 0.004, 0.005, 1); bg.inputs[1].default_value = 1
if shot.get("haze", 0.03) > 0:
    vol = world.node_tree.nodes.new("ShaderNodeVolumePrincipled"); vol.inputs["Density"].default_value = shot.get("haze", 0.03)
    world.node_tree.links.new(vol.outputs[0], world.node_tree.nodes["World Output"].inputs["Volume"])

# ---- the camcorder ----
cam_data = bpy.data.cameras.new("camcorder"); cam_data.lens = shot.get("lens", 18); cam_data.sensor_width = 24
cam = bpy.data.objects.new("camcorder", cam_data); sc.collection.objects.link(cam); sc.camera = cam
cam.rotation_mode = "XYZ"


def to_blender(x, y, z, yaw, pitch):
    # three (x, y, z) -> blender (x, -z, y); a camera at rot (90deg + pitch, 0, yaw) looks down three's -z
    return (x, -z, y), (math.pi / 2 + pitch, 0.0, yaw)


path = shot["path"]
N = int(secs * fps)
for i, wp in enumerate(path):
    f = 1 + round(i * (N - 1) / max(1, len(path) - 1))
    loc, rot = to_blender(*wp)
    cam.location = loc; cam.rotation_euler = rot
    cam.keyframe_insert("location", frame=f); cam.keyframe_insert("rotation_euler", frame=f)
for fc in cam.animation_data.action.fcurves if hasattr(cam.animation_data.action, "fcurves") else []:
    for kp in fc.keyframe_points:
        kp.interpolation = "BEZIER"; kp.easing = "AUTO"

# handheld: slow drift on every axis, a footstep bob, and the odd twitch
hh = shot.get("handheld", 1.0)
def noise(fc, scale, strength, phase):
    m = fc.modifiers.new("NOISE"); m.scale = scale; m.strength = strength * hh; m.phase = phase
try:
    fcurves = cam.animation_data.action.fcurves
except AttributeError:   # Blender 4.4+: layered actions
    fcurves = [fc for layer in cam.animation_data.action.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]
for fc in fcurves:
    if fc.data_path == "rotation_euler":
        noise(fc, 38, 0.035, 11 + fc.array_index * 7)       # drift
        noise(fc, 5, 0.006, 3 + fc.array_index)             # tremor
    if fc.data_path == "location" and fc.array_index == 2:
        noise(fc, 9, 0.03, 5)                               # the walk

# ---- render: EEVEE, camcorder resolution, a bit of shutter smear ----
for eng in ("BLENDER_EEVEE_NEXT", "BLENDER_EEVEE"):
    try:
        sc.render.engine = eng; break
    except TypeError:
        continue
ee = sc.eevee
for attr, val in (("use_raytracing", True), ("use_shadows", True), ("taa_render_samples", 16), ("volumetric_tile_size", "8")):
    try:
        setattr(ee, attr, val)
    except (AttributeError, TypeError):
        pass
sc.render.use_motion_blur = True; sc.render.motion_blur_shutter = 0.5
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = W, H, 100
sc.render.fps = fps; sc.frame_start, sc.frame_end = 1, N
sc.view_settings.view_transform = "AgX"
try:
    sc.view_settings.look = "AgX - Medium High Contrast"
except TypeError:
    pass
sc.render.image_settings.file_format = "PNG"
sc.render.filepath = str(out.resolve() / "frame_")
bpy.ops.render.render(animation=True)
print(f"rendered {N} frames to {out}")
