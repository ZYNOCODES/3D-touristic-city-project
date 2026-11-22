"""Assemble the complete masterplan in Blender → assets/masterplan.blend + public/renders/aerial.jpg

Terrain and coastline come from blender/heightfield.py (identical to the web
terrain), villas are collection instances of the villa prototype placed from
layout.json, plus the residence block, amenities, road/path ribbons, an ocean
plane and a scattered rainforest (particle instancing, kept off pads & paths).
Useful as a presentation source file and for offline hero renders.

    blender -b --python blender/build_masterplan.py -- [--samples 64] [--no-render]
"""
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402

U.MATERIAL_MODE = "render"
import amenities  # noqa: E402
import config as C  # noqa: E402
import heightfield as HF  # noqa: E402
import residence  # noqa: E402
import villa  # noqa: E402

SIZE = 1400
STEP = 5.0
CENTER = (0.0, -60.0)
VILLA_SCALE = {"ocean": 1.12, "ridge": 1.0, "canopy": 0.9}


def terrain(L):
    n = int(SIZE / STEP)
    bm = bmesh.new()
    verts = []
    clear_layer = bm.verts.layers.deform.verify()
    for j in range(n + 1):
        row = []
        for i in range(n + 1):
            x = CENTER[0] - SIZE / 2 + i * STEP
            z = CENTER[1] - SIZE / 2 + j * STEP
            v = bm.verts.new(U.W(x, HF.height(x, z), z))
            row.append(v)
        verts.append(row)
    for j in range(n):
        for i in range(n):
            bm.faces.new((verts[j][i], verts[j][i + 1], verts[j + 1][i + 1], verts[j + 1][i]))
    me = bpy.data.meshes.new("terrain")
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new("terrain", me)
    bpy.context.scene.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    # forest density vertex group: 0 on pads / paths / beach, 1 in the jungle
    vg = obj.vertex_groups.new(name="forest")
    pads = L["pads"]
    segs = []
    for path in L["paths"]:
        pts = path["points"]
        for k in range(len(pts) - 1):
            segs.append((pts[k], pts[k + 1], path["width"] / 2 + 3))
    for v in me.vertices:
        x, z = v.co.x, -v.co.y
        w = 1.0
        if HF.shore_z(x) - z < 30:
            w = 0.0
        else:
            for p in pads:
                if abs(x - p["x"]) < p["rx"] + 10 and abs(z - p["z"]) < p["rz"] + 10:
                    w = 0.0
                    break
            if w:
                for (a, b, r) in segs:
                    ax, az = a
                    bx, bz = b
                    dx, dz = bx - ax, bz - az
                    t = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / max(dx * dx + dz * dz, 1e-6)))
                    if math.hypot(x - (ax + dx * t), z - (az + dz * t)) < r:
                        w = 0.0
                        break
        vg.add([v.index], w, "REPLACE")
    m = bpy.data.materials.new("terrain")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(geo.outputs["Position"], sep.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")  # height → sand / forest floor
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.55, 0.47, 0.33, 1)
    ramp.color_ramp.elements[1].position = 0.04
    ramp.color_ramp.elements[1].color = (0.07, 0.11, 0.04, 1)
    mapr = nt.nodes.new("ShaderNodeMapRange")
    mapr.inputs["From Min"].default_value = 0
    mapr.inputs["From Max"].default_value = 80
    nt.links.new(sep.outputs["Z"], mapr.inputs["Value"])
    nt.links.new(mapr.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.95
    me.materials.append(m)
    return obj


def ocean():
    bpy.ops.mesh.primitive_plane_add(size=12000, location=(0, -2000, 0))
    o = bpy.context.active_object
    o.name = "ocean"
    m = bpy.data.materials.new("ocean")
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.01, 0.12, 0.16, 1)
    b.inputs["Roughness"].default_value = 0.06
    o.data.materials.append(m)


def tree_proto():
    col = U.collection("tree_proto")
    bpy.ops.mesh.primitive_cylinder_add(vertices=6, radius=0.3, depth=6, location=(0, 0, 3))
    trunk = bpy.context.active_object
    trunk.data.materials.append(U.material("walnut"))
    parts = [trunk]
    leaf = bpy.data.materials.new("leaf")
    leaf.use_nodes = True
    lb = leaf.node_tree.nodes["Principled BSDF"]
    lb.inputs["Base Color"].default_value = (0.04, 0.12, 0.03, 1)
    lb.inputs["Roughness"].default_value = 0.8
    lb.inputs["Subsurface Weight"].default_value = 0.1
    for k, (x, y, z, r) in enumerate(((0, 0, 7.5, 3.2), (2.2, 0.6, 6.6, 2.4), (-2.0, -0.8, 6.8, 2.5), (0.4, 2.1, 6.4, 2.2), (-0.6, -2.2, 6.5, 2.3))):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=r, location=(x, y, z))
        s = bpy.context.active_object
        s.scale.z = 0.72
        s.data.materials.append(leaf)
        tex = bpy.data.textures.new(f"leafnoise_{k}", "VORONOI")
        tex.noise_scale = 0.6
        d = s.modifiers.new("d", "DISPLACE")
        d.texture = tex
        d.strength = 0.6
        parts.append(s)
    for p in parts:
        for c in list(p.users_collection):
            c.objects.unlink(p)
        col.objects.link(p)
    bpy.context.view_layer.objects.active = parts[0]
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    tree = bpy.context.active_object
    tree.name = "tree"
    col.hide_render = False
    return col, tree


def scatter_forest(terrain_obj, tree):
    ps = terrain_obj.modifiers.new("forest", "PARTICLE_SYSTEM").particle_system
    st = ps.settings
    st.type = "HAIR"
    st.use_advanced_hair = True
    st.count = 26000
    st.hair_length = 1.0
    st.render_type = "OBJECT"
    st.instance_object = tree
    st.particle_size = 1.0
    st.size_random = 0.45
    st.use_rotations = True
    st.rotation_mode = "OB_Z"
    st.phase_factor_random = 2.0
    st.distribution = "RAND"
    ps.vertex_group_density = "forest"
    tree.hide_render = True
    tree.hide_viewport = True


def place_from(proto_col, name, loc, rot, scale=1.0):
    inst = bpy.data.objects.new(name, None)
    inst.instance_type = "COLLECTION"
    inst.instance_collection = proto_col
    bpy.context.scene.collection.objects.link(inst)
    inst.location = loc
    inst.rotation_euler = (0, 0, rot)
    inst.scale = (scale, scale, scale)
    return inst


def main():
    args = U.script_args()
    samples = int(args[args.index("--samples") + 1]) if "--samples" in args else 64
    L = U.layout()
    scene = U.reset_scene()
    U.log("terrain…")
    t = terrain(L)
    ocean()
    # prototypes live in excluded collections and are instanced
    vcol = U.collection("villa_proto")
    villa.build(vcol)
    rcol = U.collection("residence_proto")
    residence.build(rcol)
    for c in (vcol, rcol):
        bpy.context.view_layer.layer_collection.children[c.name].exclude = True
    for i, v in enumerate(L["villas"]):
        place_from(vcol, v["id"], U.W(v["x"], HF.pad_height(i), v["z"]), v["rot"], VILLA_SCALE[v["type"]])
    R = L["residence"]
    place_from(rcol, "residence", U.W(R["x"], HF.pad_height(len(L["pads"]) - 1), R["z"]), 0)
    A = L["amenities"]
    for name, fn in (("pool", amenities.pool), ("lounge", amenities.lounge), ("court", amenities.court), ("playground", amenities.playground), ("beachclub", amenities.beachclub), ("garden", amenities.garden)):
        col = U.collection(f"am_{name}")
        fn(A, col)
        bpy.context.view_layer.layer_collection.children[col.name].exclude = True
        key = {"beachclub": "beachClub"}.get(name, name)
        x, z = A[key]["x"], A[key]["z"]
        place_from(col, name, U.W(x, HF.height(x, z), z), 0)
    # roads & paths as ribbons
    for k, p in enumerate(L["paths"]):
        pts = p["points"]
        verts, faces = [], []
        for i, (x, z) in enumerate(pts):
            nx, nz = 0.0, 0.0
            if i < len(pts) - 1:
                nx, nz = pts[i + 1][0] - x, pts[i + 1][1] - z
            else:
                nx, nz = x - pts[i - 1][0], z - pts[i - 1][1]
            ln = math.hypot(nx, nz) or 1
            ox, oz = -nz / ln * p["width"] / 2, nx / ln * p["width"] / 2
            for s in (-1, 1):
                px, pz = x + ox * s, z + oz * s
                verts.append((px, HF.height(px, pz) + 0.15, pz))
            if i < len(pts) - 1:
                a = i * 2
                faces.append((a, a + 1, a + 3, a + 2))
        U.mesh_from(f"path_{k}", "paving" if p["kind"] == "path" else "concrete", verts, faces)
    pcol, tree = tree_proto()
    scatter_forest(t, tree)
    # camera matching the web "masterplan" shot + golden hour sun
    cam = bpy.data.cameras.new("aerial")
    cam.lens = 32
    cam.clip_end = 20000
    co = bpy.data.objects.new("aerial", cam)
    scene.collection.objects.link(co)
    target = U.W(0, HF.height(0, -110) + 20, -110)
    az, el, dist = math.radians(-8), math.radians(21), 720
    co.location = target + U.W(math.sin(az) * math.cos(el) * dist, math.sin(el) * dist, math.cos(az) * math.cos(el) * dist)
    co.rotation_euler = (target - co.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = co
    sun = bpy.data.lights.new("sun", "SUN")
    sun.energy = 3.5
    sun.color = (1.0, 0.72, 0.5)
    so = bpy.data.objects.new("sun", sun)
    scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(80), 0, math.radians(160))
    world = bpy.data.worlds.new("w")
    scene.world = world
    world.use_nodes = True
    hd = (U.manifest().get("hdri") or {}).get("golden")
    if hd and (C.ROOT / hd["cachePath"]).exists():
        env = world.node_tree.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(str(C.ROOT / hd["cachePath"]))
        world.node_tree.links.new(env.outputs["Color"], world.node_tree.nodes["Background"].inputs["Color"])
    blend = C.ASSETS / "masterplan.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend))
    U.log("saved", blend.relative_to(C.ROOT))
    if "--no-render" not in args:
        scene.render.engine = "CYCLES"
        scene.cycles.samples = samples
        scene.cycles.use_denoising = True
        try:
            prefs = bpy.context.preferences.addons["cycles"].preferences
            prefs.compute_device_type = "OPTIX"
            prefs.get_devices()
            for d in prefs.devices:
                d.use = d.type == "OPTIX"
            scene.cycles.device = "GPU"
        except Exception:
            pass
        scene.render.resolution_x, scene.render.resolution_y = 1920, 1080
        scene.view_settings.view_transform = "AgX"
        scene.render.image_settings.file_format = "JPEG"
        scene.render.filepath = str(C.OUT_RENDERS / "aerial.jpg")
        bpy.ops.render.render(write_still=True)
        U.log("rendered renders/aerial.jpg")


if __name__ == "__main__":
    main()
