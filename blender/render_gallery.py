"""Photoreal Cycles stills for the property sheet gallery → public/renders/*.jpg

Builds the interior (with full PBR materials from the Poly Haven textures), a
simple exterior context (ocean, distant jungle hills), lights it with the
golden-hour / day HDRIs plus a matching sun, and renders the hotspot views.

    blender -b --python blender/render_gallery.py -- [--samples 96] [--res 1600x1000] [--only living,terrace]
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
import interior  # noqa: E402
import villa  # noqa: E402

# (name, hdri, camera pos (web), look-at (web), lens mm)
SHOTS = [
    ("living", "golden", (-1.0, 1.45, 3.4), (-8.2, 0.9, -2.2), 20),
    ("terrace", "golden", (-6.5, 1.55, 6.0), (6.0, 0.0, 14.5), 18),
    ("kitchen", "day", (6.8, 1.5, 3.2), (2.4, 1.0, -4.8), 20),
    ("bedroom", "day", (-9.8, 1.5, 3.2), (-13.2, 0.7, -5.2), 20),
]
EXTERIOR = ("exterior", "golden", (22, 3.2, 30), (0, 3.4, 0), 26)


def parse():
    a = U.script_args()
    opts = {"samples": 96, "res": (1600, 1000), "only": None}
    for i, v in enumerate(a):
        if v == "--samples":
            opts["samples"] = int(a[i + 1])
        if v == "--res":
            w, h = a[i + 1].split("x")
            opts["res"] = (int(w), int(h))
        if v == "--only":
            opts["only"] = set(a[i + 1].split(","))
    return opts


def setup_render(scene, samples, res):
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
            prefs.get_devices()
            if any(d.type == backend for d in prefs.devices):
                for d in prefs.devices:
                    d.use = d.type == backend
                scene.cycles.device = "GPU"
                U.log("Cycles device:", backend)
                break
        except Exception:
            continue
    scene.cycles.samples = samples
    scene.cycles.use_denoising = True
    scene.cycles.max_bounces = 8
    scene.cycles.caustics_reflective = False
    scene.cycles.caustics_refractive = False
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = 88
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.view_settings.exposure = 0.9


def world_hdri(scene, key, rotation):
    world = bpy.data.worlds.new("world") if not scene.world else scene.world
    scene.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    entry = (U.manifest().get("hdri") or {}).get(key)
    if entry and (C.ROOT / entry["cachePath"]).exists():
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(C.ROOT / entry["cachePath"]), check_existing=True)
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Rotation"].default_value = (0, 0, rotation)
        coord = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(coord.outputs["Generated"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], env.inputs["Vector"])
        nt.links.new(env.outputs["Color"], bg.inputs["Color"])
        bg.inputs["Strength"].default_value = 1.0 if key != "night" else 3.0
    else:
        sky = nt.nodes.new("ShaderNodeTexSky")
        nt.links.new(sky.outputs["Color"], bg.inputs["Color"])
    nt.links.new(bg.outputs["Background"], out.inputs["Surface"])
    return entry


def sun_from_hdri(entry, key):
    """Sun lamp aligned with the HDRI's detected sun (web convention → Blender)."""
    s = entry.get("sun") if entry else None
    az, el = (s["azimuth"], s["elevation"]) if s else (0.6, 0.5)
    # web equirect u-angle: direction = (cos az, ?, sin az) in (x, z); Blender: x, -z
    d = Vector((math.cos(az) * math.cos(el), -math.sin(az) * math.cos(el), math.sin(el)))
    lamp = bpy.data.lights.new("sun", "SUN")
    lamp.energy = 4.0 if key == "day" else 3.0
    lamp.angle = math.radians(0.6)
    lamp.color = (1.0, 0.96, 0.9) if key == "day" else (1.0, 0.7, 0.45)
    obj = bpy.data.objects.new("sun", lamp)
    bpy.context.scene.collection.objects.link(obj)
    obj.rotation_euler = d.to_track_quat("Z", "Y").to_euler()
    return obj


def context_landscape(col):
    """Ocean far below and jungle hills so the glazing frames a real view."""
    bpy.ops.mesh.primitive_plane_add(size=6000, location=(0, -1500, -38))
    sea = bpy.context.active_object
    sea.name = "ocean"
    m = bpy.data.materials.new("ocean")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.02, 0.12, 0.18, 1)
    b.inputs["Roughness"].default_value = 0.08
    wave = m.node_tree.nodes.new("ShaderNodeTexWave")
    wave.inputs["Scale"].default_value = 0.02
    bump = m.node_tree.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.08
    m.node_tree.links.new(wave.outputs["Fac"], bump.inputs["Height"])
    m.node_tree.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    sea.data.materials.append(m)
    # rolling jungle on both sides of the view
    for k, (x, y) in enumerate(((-420, -260), (380, -320), (0, 420))):
        bpy.ops.mesh.primitive_grid_add(x_subdivisions=120, y_subdivisions=120, size=700, location=(x, y, -45))
        hill = bpy.context.active_object
        hill.name = f"hill_{k}"
        tex = bpy.data.textures.new(f"hill_noise_{k}", "CLOUDS")
        tex.noise_scale = 140
        tex.noise_depth = 4
        disp = hill.modifiers.new("disp", "DISPLACE")
        disp.texture = tex
        disp.strength = 110
        disp.mid_level = 0.3
        hm = bpy.data.materials.new(f"jungle_{k}")
        hm.use_nodes = True
        hb = hm.node_tree.nodes["Principled BSDF"]
        noise = hm.node_tree.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 60
        ramp = hm.node_tree.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].color = (0.02, 0.06, 0.02, 1)
        ramp.color_ramp.elements[1].color = (0.12, 0.22, 0.06, 1)
        hm.node_tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
        hm.node_tree.links.new(ramp.outputs["Color"], hb.inputs["Base Color"])
        hb.inputs["Roughness"].default_value = 0.9
        hill.data.materials.append(hm)
        for p in hill.data.polygons:
            p.use_smooth = True


def interior_lights(col):
    import json  # noqa: F401
    pts = [((2.0, 2.3, 1.2), 60), ((3.0, 2.3, 1.2), 60), ((4.0, 2.3, 1.2), 60), ((-5.5, 3.1, 0.5), 120), ((-12.5, 3.0, -2.5), 90), ((8.5, 6.2, -0.5), 150)]
    for i, (p, w) in enumerate(pts):
        lamp = bpy.data.lights.new(f"pt_{i}", "POINT")
        lamp.energy = w
        lamp.color = (1.0, 0.78, 0.55)
        lamp.shadow_soft_size = 0.2
        o = bpy.data.objects.new(f"pt_{i}", lamp)
        col.objects.link(o)
        o.location = U.W(*p)
    # soft fill from the glazing (stands in for sky bounce through the glass)
    area = bpy.data.lights.new("window_fill", "AREA")
    area.energy = 6000
    area.size = 26
    area.size_y = 3.2
    area.shape = "RECTANGLE"
    area.color = (0.95, 0.97, 1.0)
    o = bpy.data.objects.new("window_fill", area)
    col.objects.link(o)
    o.location = U.W(-2.5, 1.7, 4.6)
    o.rotation_euler = (math.radians(-90), 0, 0)


def camera(name, pos, look, lens):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.clip_start = 0.05
    cam.clip_end = 8000
    o = bpy.data.objects.new(name, cam)
    bpy.context.scene.collection.objects.link(o)
    o.location = U.W(*pos)
    d = U.W(*look) - o.location
    o.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    return o


def main():
    opts = parse()
    C.OUT_RENDERS.mkdir(parents=True, exist_ok=True)
    scene = U.reset_scene()
    setup_render(scene, opts["samples"], opts["res"])
    col = U.collection("interior")
    interior.build(col, render=True)
    U.cube_project_uvs([o for o in scene.objects if o.type == "MESH" and o.active_material and o.active_material.name in U.BASE_COLORS])
    context_landscape(col)
    interior_lights(col)
    shots = SHOTS if not opts["only"] else [s for s in SHOTS if s[0] in opts["only"]]
    for name, key, pos, look, lens in shots:
        for o in [o for o in scene.objects if o.name.startswith("sun")]:
            bpy.data.objects.remove(o)
        entry = world_hdri(scene, key, 0.0)
        sun_from_hdri(entry, key)
        scene.camera = camera(f"cam_{name}", pos, look, lens)
        scene.render.filepath = str(C.OUT_RENDERS / f"{name}.jpg")
        U.log("rendering", name)
        bpy.ops.render.render(write_still=True)
    # villa exterior on its podium
    if not opts["only"] or "exterior" in opts["only"]:
        for o in list(scene.objects):
            bpy.data.objects.remove(o)
        vcol = U.collection("villa_render")
        villa.build(vcol)
        context_landscape(vcol)
        bpy.ops.mesh.primitive_plane_add(size=160, location=(0, 0, -0.32))
        lawn = bpy.context.active_object
        lm = bpy.data.materials.new("lawn")
        lm.use_nodes = True
        lb = lm.node_tree.nodes["Principled BSDF"]
        lb.inputs["Roughness"].default_value = 1.0
        ln = lm.node_tree.nodes.new("ShaderNodeTexNoise")
        ln.inputs["Scale"].default_value = 40
        ln.inputs["Detail"].default_value = 8
        lr = lm.node_tree.nodes.new("ShaderNodeValToRGB")
        lr.color_ramp.elements[0].color = (0.025, 0.06, 0.015, 1)
        lr.color_ramp.elements[1].color = (0.09, 0.17, 0.035, 1)
        lm.node_tree.links.new(ln.outputs["Fac"], lr.inputs["Fac"])
        lm.node_tree.links.new(lr.outputs["Color"], lb.inputs["Base Color"])
        lbump = lm.node_tree.nodes.new("ShaderNodeBump")
        lbump.inputs["Strength"].default_value = 0.4
        lm.node_tree.links.new(ln.outputs["Fac"], lbump.inputs["Height"])
        lm.node_tree.links.new(lbump.outputs["Normal"], lb.inputs["Normal"])
        lawn.data.materials.append(lm)
        U.cube_project_uvs([o for o in scene.objects if o.type == "MESH" and o.active_material and o.active_material.name in U.BASE_COLORS])
        name, key, pos, look, lens = EXTERIOR
        entry = world_hdri(scene, key, 0.0)
        sun_from_hdri(entry, key)
        scene.camera = camera("cam_exterior", pos, look, lens)
        scene.render.filepath = str(C.OUT_RENDERS / "exterior.jpg")
        U.log("rendering exterior")
        bpy.ops.render.render(write_still=True)
    U.log("gallery done →", C.OUT_RENDERS.relative_to(C.ROOT))


if __name__ == "__main__":
    main()
