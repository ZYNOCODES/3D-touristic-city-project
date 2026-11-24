"""Hotel room interior with Cycles-baked day and night lightmaps.

Local frame: origin on the glass line at floor level, interior towards -z (web), terrace and sea towards +z.
Outputs public/models/room.glb (UV0 textures, UV1 lightmap), room_day.webp / room_night.webp, room.json,
and public/renders/room_*.jpg (Cycles stills for the gallery).
"""
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402
import furniture as F  # noqa: E402
from interior_villa import import_khronos, ph  # noqa: E402

W, H, D = 5.9, 2.86, 8.4
X0, X1, Z0 = -W / 2, W / 2, -D
LM = 2048


def slat_wall(col, x0, x1, z, y0, y1, mat="wood"):
    U.box("slatback", "black", x0, y0, z - 0.012, x1, y1, z, col)
    n = int((x1 - x0) / 0.045)
    for k in range(n):
        x = x0 + k * 0.045
        U.box("slat", mat, x, y0, z, x + 0.028, y1, z + 0.03, col)


def shell(col):
    b = U.box
    b("floor", "parquet", X0, -0.02, Z0, X1, 0.0, 0.0, col)
    b("ceiling", "ceiling", X0, H, Z0, X1, H + 0.04, 0.02, col)
    # dropped perimeter with cove light over the bed zone
    b("cove", "ceiling", X0, H - 0.16, -5.45, X0 + 0.45, H, 0.0, col)
    b("covelight", "lamp", X0 + 0.45, H - 0.06, -5.4, X0 + 0.47, H - 0.03, -0.2, col)
    b("wall_l", "stucco", X0 - 0.06, 0, Z0, X0, H, 0.0, col)
    b("wall_r", "stucco", X1, 0, Z0, X1 + 0.06, H, 0.0, col)
    b("wall_back", "stucco", X0, 0, Z0 - 0.06, X1, H, Z0, col)
    for x in (X0, X1 - 0.012):
        b("skirt", "stucco", x, 0, -5.4, x + 0.012, 0.07, 0.0, col)
    # sliding doors: two leaves parked on the right, one fixed
    for x, z in ((X1 - 0.95, -0.06), (X1 - 1.0, -0.12)):
        b("leaf_f", "dark_metal", x - 0.95, 0.0, z - 0.02, x - 0.91, H - 0.12, z + 0.02, col)
        b("leaf_f", "dark_metal", x + 0.89, 0.0, z - 0.02, x + 0.93, H - 0.12, z + 0.02, col)
        b("leaf_g", "glass", x - 0.91, 0.03, z - 0.006, x + 0.89, H - 0.14, z + 0.006, col)
        b("leaf_t", "dark_metal", x - 0.95, H - 0.16, z - 0.02, x + 0.93, H - 0.1, z + 0.02, col)
        b("leaf_b", "dark_metal", x - 0.95, 0.0, z - 0.02, x + 0.93, 0.04, z + 0.02, col)
    b("track", "dark_metal", X0, 0.0, -0.16, X1, 0.012, 0.0, col)
    b("head", "dark_metal", X0, H - 0.1, -0.16, X1, H, 0.0, col)
    # linen curtains gathered at both sides
    for cx, w, dirn in ((X0 + 0.06, 0.72, 1), (X1 - 0.62, 0.56, 1)):
        verts, faces = [], []
        n = 60
        for p in range(n + 1):
            t = p / n
            xx = cx + w * t
            zz = -0.30 + 0.055 * math.sin(t * w * 2 * math.pi / 0.105) + 0.012 * math.sin(t * 31)
            for k in range(7):
                q = k / 6
                verts.append((xx + 0.02 * math.sin(q * 3 + t * 9) * (1 - q), 0.015 + q * (H - 0.13), zz * (1 + 0.04 * math.sin(q * 5 + t * 14))))
        for p in range(n):
            for k in range(6):
                a = p * 7 + k
                faces.append((a, a + 7, a + 8, a + 1))
        U.mesh_from("curtain", "curtain", verts, faces, col, smooth=True)
    # bed wall = partition to the bathroom (z -5.45), open walkway on the right
    b("part", "stucco", X0, 0, -5.6, 1.35, 2.2, -5.45, col)
    b("partg", "glass", X0, 2.2, -5.53, 1.35, H, -5.515, col)
    slat_wall(col, X0 + 0.02, 1.33, -5.45, 0.0, 2.2)
    b("partend", "wood", 1.33, 0, -5.62, 1.38, 2.2, -5.40, col)
    b("parttop", "wood", X0, 2.2, -5.62, 1.38, 2.225, -5.40, col)
    # bathroom: stone floor, marble feature wall, glazed shower
    b("bfloor", "travertine", X0, 0.0, Z0, 1.35, 0.012, -5.6, col)
    b("bmarble", "travertine", X0, 0.012, Z0, 1.35, H, Z0 + 0.03, col)
    b("bglass", "glass", 1.35, 0.02, -8.35, 1.362, 2.3, -6.75, col)
    b("bglass_f", "dark_metal", 1.34, 2.3, -8.4, 1.372, 2.33, -5.6, col)
    # entrance door + closet on the right
    b("door", "walnut", 1.62, 0, Z0 + 0.0, 2.58, 2.2, Z0 + 0.05, col)
    b("doorf", "dark_metal", 1.56, 0, Z0, 1.62, 2.26, Z0 + 0.06, col)
    b("doorf", "dark_metal", 2.58, 0, Z0, 2.64, 2.26, Z0 + 0.06, col)
    b("handle", "brass", 1.7, 1.02, Z0 + 0.05, 1.83, 1.04, Z0 + 0.1, col)
    # recessed downlights
    for x, z in ((-1.9, -1.2), (0.6, -1.2), (2.2, -2.4), (2.2, -4.6), (2.2, -6.8), (-1.8, -6.4), (0.2, -7.4)):
        U.cyl("dl", "lamp", x, H - 0.006, z, 0.045, 0.006, 20, col=col)


def furnish(col):
    b = U.box
    # ---- bed facing the sea ----------------------------------------------------------------
    F.bed(col, "bed", -0.9, -4.25, w=1.95, l=2.1, frame="walnut", linen="cushion", throw="throw")
    for o in [o for o in col.objects if o.name.startswith("bed_throw")]:
        bpy.data.objects.remove(o)
    # second pair of pillows and a folded blanket over the foot end
    for px in (-1.4, -0.4):
        p = F.soft(b("pillow", "cushion", px - 0.34, 0.74, -5.2, px + 0.34, 0.92, -4.78, col), 2, 0.08)
    for x in (-2.35, 0.55):
        b("ns", "walnut", x - 0.28, 0.3, -5.33, x + 0.28, 0.48, -4.85, col, bevel=0.008)
        U.cyl("lamp_base", "travertine", x, 0.48, -5.1, 0.07, 0.2, 24, r2=0.05, col=col)
        U.cyl("lamp_shade", "lamp", x, 0.68, -5.1, 0.15, 0.2, 32, r2=0.12, col=col)
    F.books(col, "bed", 0.42, 0.48, -4.95, n=3)
    # bench at the foot
    F.soft(b("bench", "fabric", -1.75, 0.3, -2.95, -0.05, 0.46, -2.5, col), 2, 0.04)
    for x in (-1.6, -0.2):
        for z in (-2.88, -2.57):
            U.cyl("bleg", "brass", x, 0, z, 0.014, 0.3, 10, col=col)
    b("rug", "rug", -2.75, 0.0, -4.6, 1.0, 0.014, -1.5, col, bevel=0.006)
    # ---- lounge by the window --------------------------------------------------------------
    ph("modern_arm_chair_01", col, "lounge", 1.75, 0.0, -1.35, rot=math.radians(-150), kind="furniture", decimate=0.35)
    F.soft(U.cyl("pouf", "fabric", 0.78, 0.0, -0.95, 0.27, 0.38, 40, col=col), 1, 0.05)
    U.cyl("stable", "travertine", 2.45, 0, -0.62, 0.21, 0.44, 40, col=col, bevel=0.01)
    ph("ceramic_vase_03", col, "lounge", 2.45, 0.44, -0.62, scale=0.55, support="stable")
    # floor lamp
    U.cyl("fl_b", "dark_metal", 2.62, 0, -1.75, 0.14, 0.02, 24, col=col)
    U.cyl("fl_p", "dark_metal", 2.62, 0.02, -1.75, 0.011, 1.5, 10, col=col)
    U.cyl("fl_s", "lamp", 2.62, 1.42, -1.75, 0.18, 0.28, 32, r2=0.14, col=col)
    # ---- long desk / TV console on the right wall ---------------------------------------------
    b("console", "walnut", X1 - 0.46, 0.42, -5.2, X1, 0.72, -2.35, col, bevel=0.006)
    for k in range(1, 4):
        b("cgap", "black", X1 - 0.463, 0.44, -5.2 + k * 0.712 - 0.003, X1 - 0.459, 0.70, -5.2 + k * 0.712 + 0.003, col)
    b("ctop", "marble", X1 - 0.48, 0.72, -5.22, X1, 0.745, -2.33, col, bevel=0.003)
    b("tv", "black", X1 - 0.05, 1.0, -4.75, X1 - 0.012, 1.78, -3.4, col, bevel=0.006)
    ph("brass_vase_01", col, "console", X1 - 0.24, 0.745, -2.65, scale=0.6, support="ctop")
    F.books(col, "console", X1 - 0.35, 0.745, -5.0, n=4)
    U.cyl("bowl", "ceramic", X1 - 0.24, 0.745, -3.2, 0.06, 0.06, 32, r2=0.15, col=col, bevel=0.005)
    b("minibar", "black", X1 - 0.455, 0.0, -5.15, X1 - 0.05, 0.41, -4.5, col)
    # round mirror over the console
    m = U.cyl("mirrorf", "brass", 0, 0, 0, 0.42, 0.02, 64, col=col)
    m.rotation_euler = (0, math.pi / 2, 0)
    m.location = U.W(X1 - 0.012, 1.45, -2.75)
    m = U.cyl("mirror", "mirror", 0, 0, 0, 0.40, 0.024, 64, col=col)
    m.rotation_euler = (0, math.pi / 2, 0)
    m.location = U.W(X1 - 0.014, 1.45, -2.75)
    # ---- art ---------------------------------------------------------------------------------
    for z, w in ((-4.25, 0.62), (-3.4, 0.62)):
        b("frame", "dark_metal", X0, 1.15, z - w / 2, X0 + 0.02, 2.0, z + w / 2, col)
        b("art", "art", X0 + 0.018, 1.19, z - w / 2 + 0.04, X0 + 0.024, 1.96, z + w / 2 - 0.04, col)
    # plant by the glass
    ph("pachira_aquatica_01", col, "lounge", -2.45, 0.0, -0.85, scale=0.95, kind="decor", decimate=0.14)
    # ---- closet --------------------------------------------------------------------------------
    b("closet", "walnut", X1 - 0.6, 0.0, -8.3, X1, 2.5, -5.75, col, bevel=0.004)
    for k in range(1, 4):
        b("clgap", "black", X1 - 0.603, 0.02, -8.3 + k * 0.637 - 0.003, X1 - 0.599, 2.48, -8.3 + k * 0.637 + 0.003, col)
    # ---- bathroom --------------------------------------------------------------------------------
    tx, tz = -1.75, -7.55
    tub = U.cyl("tub", "ceramic", tx, 0.012, tz, 0.5, 0.56, 56, r2=0.56, col=col, bevel=0.03)
    tub.scale = (1.45, 0.72, 1.0)
    inner = U.cyl("tubin", "ceramic", tx, 0.50, tz, 0.47, 0.07, 56, r2=0.5, col=col)
    inner.scale = (1.45, 0.70, 1.0)
    w = U.cyl("tubw", "bathwater", tx, 0.566, tz, 0.485, 0.006, 56, col=col)
    w.scale = (1.45, 0.69, 1.0)
    U.cyl("tubf", "brass", tx + 0.9, 0.012, tz + 0.25, 0.018, 0.95, 12, col=col)
    b("tubsp", "brass", tx + 0.6, 0.93, tz + 0.235, tx + 0.9, 0.955, tz + 0.265, col)
    b("vanity", "walnut", X0 + 0.15, 0.4, -6.15, 1.0, 0.8, -5.62, col, bevel=0.006)
    b("vtop", "marble", X0 + 0.12, 0.8, -6.18, 1.03, 0.83, -5.61, col, bevel=0.003)
    for x in (-1.9, -0.1):
        U.cyl("basin", "ceramic", x, 0.83, -5.9, 0.17, 0.13, 40, r2=0.21, col=col, bevel=0.01)
        U.cyl("tap", "brass", x, 0.83, -5.67, 0.012, 0.27, 10, col=col)
        b("taps", "brass", x - 0.01, 1.08, -5.80, x + 0.01, 1.10, -5.66, col)
    b("bmir", "mirror", X0 + 0.3, 1.1, -5.622, 0.85, 1.95, -5.612, col)
    for x in (-2.55, 0.95):
        U.cyl("sconce", "lamp", x, 1.3, -5.67, 0.045, 0.45, 20, col=col)
    for k in range(3):
        F.soft(b("towel", "cushion", X0 + 0.3, 0.1 + k * 0.1, -6.05, X0 + 0.75, 0.18 + k * 0.1, -5.75, col), 1, 0.025)
    U.cyl("shr", "brass", 0.7, 2.28, -7.9, 0.14, 0.015, 36, col=col)
    U.cyl("shp", "brass", 0.7, 2.29, -7.9, 0.012, H - 2.29, 10, col=col)
    # ---- terrace (inside the model so the furniture is present from within) -------------------


HOTSPOTS = [
    {"id": "room", "label": "Room", "pos": [1.9, 1.55, -5.1], "look": [-0.9, 1.25, 2.0]},
    {"id": "bed", "label": "Bed", "pos": [0.95, 1.5, -1.0], "look": [-1.3, 0.75, -5.2]},
    {"id": "window", "label": "Sea view", "pos": [-0.4, 1.55, -1.5], "look": [0.0, 0.2, 14.0]},
    {"id": "bath", "label": "Bathroom", "pos": [1.0, 1.55, -6.25], "look": [-2.0, 0.85, -8.1]},
    {"id": "terrace", "label": "Terrace", "pos": [0.35, 1.6, 0.95], "look": [-4.0, -7.0, 30.0]},
]


def world_sky(strength):
    w = bpy.data.worlds.new("w")
    bpy.context.scene.world = w
    w.use_nodes = True
    nt = w.node_tree
    env = nt.nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(str(C.CACHE / "hdri" / "kloofendal_43d_clear_puresky_2k.hdr")) if (C.CACHE / "hdri" / "kloofendal_43d_clear_puresky_2k.hdr").exists() else bpy.data.images.load(str(C.CACHE / "hdri" / "kloofendal_43d_clear_puresky_1k.hdr"))
    mp = nt.nodes.new("ShaderNodeMapping")
    tc = nt.nodes.new("ShaderNodeTexCoord")
    mp.inputs["Rotation"].default_value = (0, 0, math.radians(60))
    nt.links.new(tc.outputs["Generated"], mp.inputs[0])
    nt.links.new(mp.outputs[0], env.inputs[0])
    nt.links.new(env.outputs[0], nt.nodes["Background"].inputs[0])
    nt.nodes["Background"].inputs[1].default_value = strength
    return w


def gpu():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "OPTIX"
        pr.get_devices()
        for d in pr.devices:
            d.use = d.type == "OPTIX"
        sc.cycles.device = "GPU"
    except Exception as e:  # noqa: BLE001
        U.log("gpu", e)
    sc.cycles.sample_clamp_indirect = 6
    sc.cycles.max_bounces = 10
    sc.cycles.diffuse_bounces = 8


def surroundings():
    """what the room sees: terrace slab, slab above, sea and white parapet (bounce light)"""
    c = U.collection("bounce")
    U.box("bt", "deck", X0, -0.03, 0.0, X1, 0.0, 2.6, c)
    U.box("ba", "hotel_white", X0, H + 0.06, 0.0, X1, H + 0.4, 2.8, c)
    U.box("bl", "hotel_white", X0 - 0.2, 0, 0.0, X0 - 0.06, H, 1.7, c)
    U.box("br", "hotel_white", X1 + 0.06, 0, 0.0, X1 + 0.2, H, 1.7, c)
    U.box("sea", "seab", -300, -40.1, 20, 300, -40, 600, c)
    return c


def set_lamp(strength, color=(1.0, 0.66, 0.36)):
    m = U.material("lamp")
    bs = m.node_tree.nodes.get("Principled BSDF")
    if bs:
        bs.inputs["Emission Color"].default_value = (*color, 1)
        bs.inputs["Emission Strength"].default_value = strength


def join_all(col):
    objs = [o for o in col.objects if o.type == "MESH"]
    for o in objs:
        if o.data.users > 1:
            o.data = o.data.copy()
        if not o.data.uv_layers:
            o.data.uv_layers.new(name="UVMap")
        while len(o.data.uv_layers) > 1:
            o.data.uv_layers.remove(o.data.uv_layers[-1])
        o.data.uv_layers[0].name = "UVMap"
        for ca in list(o.data.color_attributes):
            o.data.color_attributes.remove(ca)
        o.parent = None if o.parent is None else o.parent
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        mw = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = mw
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "room"
    return ob


def lightmap_uv(ob):
    lm = ob.data.uv_layers.new(name="lm")
    ob.data.uv_layers.active = lm
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.0015, area_weight=0.0, correct_aspect=False, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")


GUIDE = {}


def raw_bake(ob, kind):
    sc = bpy.context.scene
    sc.cycles.samples = 1
    img = bpy.data.images.new("g_" + kind, LM, LM, float_buffer=True)
    img.colorspace_settings.name = "Non-Color"
    for m in ob.data.materials:
        nt = m.node_tree
        n = nt.nodes.get("LMTARGET") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "LMTARGET"
        n.image = img
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    sc.render.bake.margin = 3
    sc.render.bake.normal_space = "OBJECT"
    bpy.ops.object.bake(type=kind)
    a = np.empty(LM * LM * 4, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(LM, LM, 4)[..., :3].copy()


def atrous(a, pos, nor, iters=5):
    """edge-avoiding a-trous wavelet filter guided by surface position and normal"""
    k = [1 / 16, 1 / 4, 3 / 8, 1 / 4, 1 / 16]
    out = a
    for it in range(iters):
        st = 2 ** it
        acc = np.zeros_like(out)
        wt = np.zeros(out.shape[:2] + (1,), np.float32)
        lum = out.mean(-1, keepdims=True)
        for i in range(5):
            for j in range(5):
                dy, dx = (i - 2) * st, (j - 2) * st
                sh = lambda q: np.roll(np.roll(q, dy, 0), dx, 1)
                p2 = ((sh(pos) - pos) ** 2).sum(-1, keepdims=True)
                n2 = (sh(nor) * nor).sum(-1, keepdims=True)
                so = sh(out)
                dl = np.abs(so.mean(-1, keepdims=True) - lum) / (0.12 + lum)
                w = k[i] * k[j] * np.exp(-p2 / (0.012 * st) ** 2 / 6) * np.clip(n2, 0, 1) ** 24 * np.exp(-dl / (0.9 * 0.75 ** it))
                acc += so * w
                wt += w
        out = np.where(wt > 1e-6, acc / np.maximum(wt, 1e-6), out)
    return out


def bake(ob, name, samples):
    if not GUIDE:
        GUIDE["p"] = raw_bake(ob, "POSITION")
        n = raw_bake(ob, "NORMAL") * 2 - 1
        GUIDE["n"] = n / (np.linalg.norm(n, axis=-1, keepdims=True) + 1e-6)
    sc = bpy.context.scene
    sc.cycles.samples = samples
    img = bpy.data.images.new("lm_" + name, LM, LM, float_buffer=True)
    for m in ob.data.materials:
        nt = m.node_tree
        n = nt.nodes.get("LMTARGET") or nt.nodes.new("ShaderNodeTexImage")
        n.name = "LMTARGET"
        n.image = img
        for x in nt.nodes:
            x.select = False
        n.select = True
        nt.nodes.active = n
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    sc.render.bake.use_pass_color = False
    sc.render.bake.use_pass_direct = True
    sc.render.bake.use_pass_indirect = True
    sc.render.bake.margin = 6
    bpy.ops.object.bake(type="DIFFUSE")
    a = np.empty(LM * LM * 4, np.float32)
    img.pixels.foreach_get(a)
    a = a.reshape(LM, LM, 4)[..., :3]
    U.log("bake", name, "mean", float(a[a > 0.001].mean()) if (a > 0.001).any() else 0, "p99", float(np.percentile(a, 99)))
    # OIDN-free clean up: clamp outliers against the 3x3 median
    st = np.stack([np.roll(np.roll(a, i, 0), j, 1) for i in (-1, 0, 1) for j in (-1, 0, 1)])
    med = np.median(st, 0)
    lum = a.mean(-1, keepdims=True)
    ml = med.mean(-1, keepdims=True)
    a = np.where((lum > ml * 1.35 + 0.02) | (lum < ml * 0.7 - 0.02), med, a)
    return atrous(a, GUIDE["p"], GUIDE["n"])


def save_lm(a, name, scale):
    enc = np.sqrt(np.clip(a / scale, 0, 1))
    px = np.ones((LM, LM, 4), np.float32)
    px[..., :3] = enc
    im = bpy.data.images.new("o" + name, LM, LM)
    im.colorspace_settings.name = "Non-Color"
    im.pixels.foreach_set(px.ravel())
    sc = bpy.context.scene
    sc.view_settings.view_transform = "Raw"
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.quality = 90
    im.scale(1024, 1024) if False else None
    p = C.OUT_MODELS / f"room_{name}.webp"
    sc.view_settings.exposure = 0
    im.save_render(str(p), scene=sc)
    U.log(p.name, p.stat().st_size // 1024, "KB")


def render_mats():
    U.BASE_COLORS.update({
        "throw": ((0.50, 0.33, 0.22), 0.95, 0.0), "rug": ((0.66, 0.60, 0.52), 1.0, 0.0), "ceramic": ((0.9, 0.89, 0.87), 0.15, 0.0), "mirror": ((0.9, 0.9, 0.9), 0.02, 1.0),
        "art": ((0.2, 0.42, 0.5), 0.6, 0.0), "bathwater": ((0.65, 0.82, 0.84), 0.02, 0.0), "hotel_white": ((0.85, 0.83, 0.8), 0.8, 0.0), "seab": ((0.03, 0.22, 0.28), 0.4, 0.0),
    })


def main():
    U.reset_scene()
    render_mats()
    U.MATERIAL_MODE = "render"
    col = U.collection("room")
    shell(col)
    furnish(col)
    U.apply_all_modifiers([o for o in bpy.data.objects if o.type == "MESH"])
    for o in [o for o in bpy.data.objects if o.type == "MESH" and o.name not in col.objects]:
        col.objects.link(o)
    lib = [o for o in col.objects if o.type == "MESH" and o.active_material and o.active_material.name in U.BASE_COLORS]
    U.cube_project_uvs(lib)
    for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
        for ch in o.children:
            mw = ch.matrix_world.copy()
            ch.parent = None
            ch.matrix_world = mw
    ob = join_all(col)
    tr = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    U.log("room triangles", tr, "materials", [m.name for m in ob.data.materials])
    surroundings()
    gpu()
    lightmap_uv(ob)
    sc = bpy.context.scene
    # day
    w = world_sky(2.4)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 6.0
    sun.data.color = (1.0, 0.93, 0.82)
    sun.data.angle = 0.012
    sc.collection.objects.link(sun)
    d = Vector((-math.sin(math.radians(-38)) * math.cos(math.radians(34)), math.cos(math.radians(38)) * math.cos(math.radians(34)), -math.sin(math.radians(34))))
    sun.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    set_lamp(5.0)
    day = bake(ob, "day", 900)
    save_lm(day, "day", 6.0)
    # gallery stills (day)
    if "--stills" in U.script_args():
        stills("day")
    # night
    sun.data.energy = 0.0
    w.node_tree.nodes["Background"].inputs[1].default_value = 0.006
    set_lamp(26.0)
    night = bake(ob, "night", 900)
    save_lm(night, "night", 6.0)
    for m in ob.data.materials:
        n = m.node_tree.nodes.get("LMTARGET")
        if n:
            m.node_tree.nodes.remove(n)
    # export: library materials become plain (re-shaded on the web), scanned models keep their textures
    for m in ob.data.materials:
        if m.name in U.BASE_COLORS:
            nt = m.node_tree
            for n in list(nt.nodes):
                if n.type == "TEX_IMAGE":
                    nt.nodes.remove(n)
    out = C.OUT_MODELS / "room.glb"
    U.export_glb(out, [ob], max_tex=512)
    (C.OUT_MODELS / "room.json").write_text(json.dumps({"hotspots": HOTSPOTS, "scale": 6.0, "size": [W, H, D]}))


def stills(tag):
    sc = bpy.context.scene
    sc.view_settings.view_transform = "AgX"
    sc.render.image_settings.file_format = "JPEG"
    sc.render.image_settings.quality = 88
    sc.render.resolution_x, sc.render.resolution_y = 1600, 1000
    sc.cycles.samples = 192
    sc.cycles.use_denoising = True
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 20
    for n, p, l in (("bed", (2.2, 1.45, -1.0), (-1.3, 0.8, -4.9)), ("view", (1.9, 1.5, -5.1), (-0.9, 1.1, 1.0)), ("bath", (1.1, 1.5, -5.9), (-2.0, 0.8, -8.1))):
        cam.location = U.W(*p)
        cam.rotation_euler = (U.W(*l) - U.W(*p)).to_track_quat("-Z", "Y").to_euler()
        sc.view_settings.exposure = 0.75 if n != "bath" else 1.3
        sc.render.filepath = str(C.OUT_RENDERS / f"room_{n}.jpg")
        bpy.ops.render.render(write_still=True)
    sc.view_settings.exposure = 0


if __name__ == "__main__":
    main()
