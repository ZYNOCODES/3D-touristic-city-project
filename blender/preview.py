"""Visual QA: render a GLB (or a whole builder script's scene) from several cameras.

    blender -b --python blender/preview.py -- public/models/residence.glb out_dir \
        "front:0,25,140:0,12,0:35" "close:-30,8,30:-30,8,0:28"

Camera spec: name:eye_x,eye_y,eye_z:target_x,target_y,target_z:lens  (web coordinates)
Uses EEVEE with the golden/day HDRI + matching sun for quick, lit, textured previews.
"""
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402

U.MATERIAL_MODE = "render"
import config as C  # noqa: E402


def retexture():
    """Swap the plain exported materials for full PBR render materials by name."""
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for slot in o.material_slots:
            m = slot.material
            if not m:
                continue
            base = m.name.split(".")[0]
            if base in U.BASE_COLORS:
                fresh = bpy.data.materials.get(base + "__r")
                if not fresh:
                    old = bpy.data.materials.get(base)
                    if old:
                        old.name = base + "__old"
                    fresh = U.material(base)
                    fresh.name = base + "__r"
                slot.material = fresh


def main():
    a = U.script_args()
    src, out = Path(a[0]), Path(a[1])
    out = out if out.is_absolute() else C.ROOT / out
    out.mkdir(parents=True, exist_ok=True)
    scene = U.reset_scene()
    bpy.ops.import_scene.gltf(filepath=str(src if src.is_absolute() else C.ROOT / src))
    retexture()
    U.cube_project_uvs([o for o in scene.objects if o.type == "MESH" and not o.data.uv_layers])
    scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 1400, 800
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    try:
        scene.eevee.use_raytracing = True
        scene.eevee.use_shadows = True
    except Exception:
        pass
    key = "day"
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    entry = (U.manifest().get("hdri") or {}).get(key)
    if entry:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(C.ROOT / entry["cachePath"]))
        nt.links.new(env.outputs["Color"], nt.nodes["Background"].inputs["Color"])
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 4.5
    sun.angle = math.radians(1.0)
    so = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(50), 0, math.radians(200))
    # ground plane
    bpy.ops.mesh.primitive_plane_add(size=2000, location=(0, 0, -0.25))
    g = bpy.context.active_object
    g.data.materials.append(U.material("lawn"))
    for spec in a[2:]:
        name, eye, tgt, lens = spec.split(":")
        e = [float(v) for v in eye.split(",")]
        t = [float(v) for v in tgt.split(",")]
        cam = bpy.data.cameras.new(name)
        cam.lens = float(lens)
        cam.clip_end = 5000
        co = bpy.data.objects.new(name, cam)
        scene.collection.objects.link(co)
        co.location = U.W(*e)
        co.rotation_euler = (U.W(*t) - co.location).to_track_quat("-Z", "Y").to_euler()
        scene.camera = co
        scene.render.filepath = str(out / f"{name}.png")
        bpy.ops.render.render(write_still=True)
        U.log("preview", out / f"{name}.png")


if __name__ == "__main__":
    main()
