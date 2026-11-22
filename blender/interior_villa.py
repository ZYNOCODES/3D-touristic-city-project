"""Villa interior — contemporary Mediterranean private residence.

→ public/models/villa_interior.glb + public/models/villa_interior.json (hotspots, lights)

Built *inside the actual villa shell* (villa.build) so the interior matches the exterior
the visitor just flew past: ground floor 18 × 9 m open plan behind the sea-facing glazing,
upper-floor master suite, covered terrace, deck and private pool.

Design: rustic stone feature walls, lime stucco, terracotta floor, exposed timber beams,
a stone fireplace, slim steel-framed glazing, oak + travertine kitchen, woven dining
chairs, low linen sofa, Wayfair fabric armchairs, floating oak stair, cloth-draped bed.
"""
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402
import furniture as F  # noqa: E402
import villa  # noqa: E402
import validate  # noqa: E402

GF_Y = 0.02          # finished floor
CEIL = 3.38
UF_Y = 3.77


def import_khronos(name, col, room, x, y, z, rot=0.0, width=None, kind="furniture", support=None):
    rel = (U.manifest().get("khronos") or {}).get(name)
    if not rel:
        return []
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(C.ROOT / rel["path"]))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        col.objects.link(o)
    bpy.context.view_layer.update()
    meshes = [o for o in new if o.type == "MESH"]
    from build_vegetation import bbox  # noqa: E402  (shared helper)
    mn, mx = bbox(meshes)
    s = (width / max(mx.x - mn.x, mx.y - mn.y)) if width else 1.0
    for r in roots:
        r.scale = (r.scale.x * s, r.scale.y * s, r.scale.z * s)
    bpy.context.view_layer.update()
    mn, mx = bbox(meshes)
    off = U.W(x, y, z) - Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for r in roots:
        r.location += off
    F.rotate_group(roots, x, z, rot)
    return F._tag(new, kind, room, name, support)


def ph(pid, col, room, x, y, z, rot=0.0, scale=1.0, kind="decor", support=None, decimate=None):
    objs = U.import_polyhaven(pid, (x, y, z), rot, scale, col=col, decimate=decimate)
    allo = []
    for r in objs:
        allo += [r] + list(r.children_recursive)
    return F._tag(allo, kind, room, pid, support)


from mathutils import Vector  # noqa: E402


def shell(col):
    villa.build(col)
    for o in list(col.objects):
        if o.name.startswith(("gf_glow", "uf_glow", "lounger", "lg_", "ps_")):
            bpy.data.objects.remove(o)
    b = U.box
    # ---- ground floor finishes -------------------------------------------------------------
    b("floor_terracotta", "terracotta", -8.98, 0.0, -5.58, 8.58, GF_Y, 2.86, col)
    b("wall_back_finish", "stucco", -5.5, GF_Y, -5.6, 8.58, CEIL, -5.58, col)
    b("wall_left_stone", "stone_wall", -8.98, GF_Y, -5.58, -8.94, CEIL, 2.86, col)
    b("wall_right_stone", "stone_wall", 8.54, GF_Y, -5.58, 8.58, CEIL, 2.86, col)
    b("kitchen_back", "stucco", -8.98, GF_Y, -5.6, -5.5, CEIL, -5.58, col)
    # ceiling with exposed timber beams (stair void left open)
    b("ceiling_main", "stucco", -8.98, CEIL, -5.58, 0.2, CEIL + 0.02, 2.86, col)
    b("ceiling_main2", "stucco", 4.6, CEIL, -5.58, 8.58, CEIL + 0.02, 2.86, col)
    b("ceiling_mid", "stucco", 0.2, CEIL, -3.9, 4.6, CEIL + 0.02, 2.86, col)
    x = -8.5
    k = 0
    while x < 8.4:
        b(f"beam_{k}", "cladding", x - 0.09, CEIL - 0.24, -5.58, x + 0.09, CEIL, 2.86, col, bevel=0.01)
        x += 1.25
        k += 1
    # steel-framed glazing in front of the existing glass: transom + mullions
    b("steel_transom", "dark_metal", -5.4, 2.55, 2.84, 8.5, 2.6, 2.88, col)
    for k2, xx in enumerate((-5.4, -2.0, 1.4, 4.9, 8.45)):
        b(f"steel_mull_{k2}", "dark_metal", xx - 0.03, GF_Y, 2.84, xx + 0.03, CEIL, 2.88, col)
    # ---- floating oak stair to the upper floor ------------------------------------------------
    for i in range(18):
        y = GF_Y + (i + 1) * (UF_Y - GF_Y) / 18
        xx = 0.4 + i * 0.235
        b(f"tread_{i}", "cladding", xx, y - 0.07, -5.56, xx + 0.3, y, -4.5, col, bevel=0.008)
    b("stair_glass", "glass", 0.4, GF_Y + 0.2, -4.49, 4.65, UF_Y + 1.0, -4.47, col)
    # ---- upper floor finishes -----------------------------------------------------------------
    # upper floor with the stair void (x 0.2–4.75, z −5.48…−4.35) left open
    b("uf_floor_a", "parquet", -6.98, UF_Y - 0.02, -5.48, 0.2, UF_Y, 2.36, col)
    b("uf_floor_b", "parquet", 4.75, UF_Y - 0.02, -5.48, 10.08, UF_Y, 2.36, col)
    b("uf_floor_c", "parquet", 0.2, UF_Y - 0.02, -4.35, 4.75, UF_Y, 2.36, col)
    b("uf_void_rail", "glass", 0.2, UF_Y, -4.37, 4.75, UF_Y + 1.05, -4.35, col)
    b("uf_void_cap", "dark_metal", 0.2, UF_Y + 1.03, -4.39, 4.75, UF_Y + 1.07, -4.33, col)
    b("uf_ceiling", "stucco", -6.98, 6.78, -5.48, 10.08, 6.8, 2.36, col)
    b("uf_back", "stucco", -6.98, UF_Y, -5.1, 10.08, 6.78, -5.08, col)
    b("uf_bath_wall", "stucco", -3.05, UF_Y, -5.08, -2.95, 6.78, -0.4, col)
    b("uf_headboard_wall", "cladding", 5.6, UF_Y, -5.08, 9.9, 6.0, -5.04, col)
    for k3 in range(22):
        xx = 5.65 + k3 * 0.19
        b(f"uf_slat_{k3}", "cladding", xx, UF_Y, -5.04, xx + 0.08, 6.0, -5.0, col)


def furnish(col):
    rooms = {}
    # ---- kitchen (left wing) --------------------------------------------------------------------
    F.kitchen_run(col, "kitchen", -8.7, -6.0, -5.56, tall_units=2, carcass="cladding", top="travertine")
    F.island(col, "kitchen", -6.6, -1.5, w=2.5, d=0.95, carcass="cladding", top="travertine", stools=3)
    ph("ceramic_vase_01", col, "kitchen", -7.3, 0.94, -1.5, support="island_top")
    ph("wicker_basket_02", col, "kitchen", -6.0, 0.94, -1.4, scale=0.8, support="island_top")
    for xx in (-7.3, -5.9):
        F.pendant(col, "kitchen", xx, -1.5, CEIL, drop=1.15, style="brass")
    # ---- dining ----------------------------------------------------------------------------------
    F.dining_table(col, "dining", -2.0, -1.0, w=2.6, d=1.0, top="cladding")
    for i in range(3):
        cx = -2.85 + i * 0.85
        F.woven_chair(col, "dining", cx, -1.85, rot=0)
        F.woven_chair(col, "dining", cx, -0.15, rot=math.pi)
    for xx in (-2.7, -1.3):
        F.pendant(col, "dining", xx, -1.0, CEIL, drop=1.3, style="rattan")
    ph("ceramic_vase_03", col, "dining", -2.0, 0.76, -1.0, support="table_top")
    # ---- living around the fireplace ----------------------------------------------------------------
    F.fireplace(col, "living", 8.54, -1.2, w=2.4)
    F.rotate_group([o for o in col.objects if o.get("item") == "fireplace"], 8.54, -1.2, -math.pi / 2)
    F.rug(col, "living", 2.6, -3.3, 7.2, 1.6, mat="rope")
    # large abstract canvas above the console and a potted olive by the glazing
    F._tag([U.box("canvas", "travertine", 5.4, 1.2, -5.57, 7.4, 2.6, -5.52, col), U.box("canvas_ground", "curtain", 5.55, 1.35, -5.52, 7.25, 2.45, -5.516, col), U.box("canvas_block_a", "rope", 5.75, 1.55, -5.516, 6.55, 2.25, -5.512, col), U.box("canvas_block_b", "cladding", 6.35, 1.45, -5.512, 7.05, 1.95, -5.508, col), U.box("canvas_line", "dark_metal", 5.7, 2.05, -5.508, 7.1, 2.07, -5.505, col)], "decor", "living", "art")
    F._tag([U.cyl("olive_pot", "terracotta", 1.3, 0.02, -3.8, 0.45, 0.6, 32, r2=0.38, col=col, bevel=0.02)], "furniture", "living", "planter")
    ph("potted_plant_04", col, "living", 1.3, 0.62, -3.8, scale=4.0, support="olive_pot")
    # side tables + floor lamp
    F._tag([U.cyl("side_table", "travertine", 3.4, 0.0, 1.35, 0.25, 0.5, 32, col=col, bevel=0.01)], "furniture", "living", "side_table")
    F._tag([U.cyl("floor_lamp_base", "brass", 3.4, 0.0, -3.05, 0.16, 0.02, 24, col=col), U.cyl("floor_lamp_pole", "brass", 3.4, 0.02, -3.05, 0.015, 1.45, 10, col=col), U.cyl("floor_lamp_shade", "lamp", 3.4, 1.45, -3.05, 0.25, 0.3, 32, r2=0.2, col=col)], "furniture", "living", "floor_lamp")
    F.sofa(col, "living", 3.4, -0.9, w=3.4, d=1.0, rot=math.pi / 2, return_w=0.0)
    import_khronos("SheenChair", col, "living", 6.6, GF_Y, 1.4, rot=math.radians(200), width=0.85)
    import_khronos("SheenChair", col, "living", 6.6, GF_Y, -3.2, rot=math.radians(-20), width=0.85)
    F.coffee_table(col, "living", 5.3, -0.9, r=0.6, mat="cladding")
    ph("brass_vase_01", col, "living", 5.2, 0.36, -0.8, scale=0.7, support="coffee_top")
    F.books(col, "living", 5.45, 0.36, -1.1, n=5, support="coffee_top")
    ph("potted_plant_02", col, "living", 8.0, GF_Y, 2.3, scale=1.4)
    ph("potted_plant_01", col, "living", 1.2, GF_Y, 2.3, scale=1.1, decimate=0.35)
    # low oak console under the stair with books and a framed print
    F._tag([U.box("console", "cladding", 5.0, 0.0, -5.5, 7.6, 0.55, -5.05, col, bevel=0.005)], "furniture", "living", "console")
    F.books(col, "living", 5.3, 0.55, -5.28, n=9, support="console")
    ph("standing_picture_frame_01", col, "living", 6.8, 0.55, -5.3, scale=1.3, support="console")
    ph("ceramic_vase_01", col, "living", 7.3, 0.55, -5.28, scale=0.9, support="console")
    # ---- upper floor: master suite -----------------------------------------------------------------
    up = UF_Y
    for o in F.bed(col, "bedroom", 7.75, -3.95, w=2.0, l=2.2, frame="cladding", linen="cushion", throw="rope"):
        o.location.z += up
    for xx in (6.3, 9.2):
        for o in F.nightstand(col, "bedroom", xx, -4.75, mat="cladding"):
            o.location.z += up
    for o in F.rug(col, "bedroom", 5.6, -3.4, 9.9, 0.4, mat="rope"):
        o.location.z += up
    for o in F.pendant(col, "bedroom", 7.75, -2.4, 6.78 - up, drop=0.9, style="rattan"):
        o.location.z += up
    import_khronos("SpecularSilkPouf", col, "bedroom", 7.75, up, -1.95, width=0.6)
    import_khronos("SheenChair", col, "bedroom", 2.4, up, 0.9, rot=math.radians(150), width=0.85)
    ph("potted_plant_01", col, "bedroom", 1.2, up, 1.9, scale=1.2, decimate=0.35)
    for o in F.wardrobe(col, "bedroom", -2.85, -5.0, -0.1, -4.4, mat="cladding", front="+z"):
        o.location.z += up
    for o in F.bathroom(col, "bath", -6.9, -5.0, -3.1, -0.5, style="stone"):
        o.location.z += up
    # ---- terrace & pool -------------------------------------------------------------------------------
    F.sofa(col, "terrace", -5.2, 4.1, w=3.0, d=0.95, fabric="travertine", cushion="cushion", legs="cladding")
    F.coffee_table(col, "terrace", -5.2, 5.6, r=0.55, mat="travertine", organic=False)
    F.dining_table(col, "terrace", -0.4, 8.7, w=2.2, d=0.95, top="cladding", base="cladding")
    for i in range(3):
        F.woven_chair(col, "terrace", -1.15 + i * 0.75, 7.9, rot=0)
        F.woven_chair(col, "terrace", -1.15 + i * 0.75, 9.5, rot=math.pi)
    F.parasol(col, "terrace", -0.4, 8.7, r=1.7)
    for xx in (3.2, 5.0):
        F.lounger(col, "pool", xx, 4.25 if False else 4.3, rot=0)
    ph("potted_plant_02", col, "terrace", -8.3, 0.08, 3.6, scale=1.5)


HOTSPOTS = [
    {"id": "living", "label": "Living Room", "pos": [1.6, 1.62, 1.9], "look": [8.5, 1.0, -1.2]},
    {"id": "dining", "label": "Dining & Kitchen", "pos": [1.0, 1.62, 1.8], "look": [-7.0, 1.0, -3.0]},
    {"id": "stair", "label": "Stair & Gallery", "pos": [-0.6, 1.62, -1.5], "look": [4.2, 3.4, -5.0]},
    {"id": "terrace", "label": "Pool Terrace", "pos": [-1.0, 1.65, 4.4], "look": [7.0, 0.0, 16.0]},
    {"id": "bedroom", "label": "Master Suite", "pos": [3.2, UF_Y + 1.6, 1.6], "look": [8.2, UF_Y + 0.8, -4.4]},
]
LIGHTS = [
    {"pos": [-2.7, CEIL - 1.5, -1.0], "color": "#ffc98a", "power": 35, "distance": 8},
    {"pos": [-1.3, CEIL - 1.5, -1.0], "color": "#ffc98a", "power": 35, "distance": 8},
    {"pos": [-6.6, CEIL - 1.4, -1.5], "color": "#ffd7a8", "power": 30, "distance": 7},
    {"pos": [8.0, 0.5, -1.2], "color": "#ff9a4a", "power": 25, "distance": 6},
    {"pos": [5.0, CEIL - 0.4, -1.0], "color": "#ffd7a8", "power": 45, "distance": 10},
    {"pos": [3.9, UF_Y + 2.0, -2.4], "color": "#ffcf96", "power": 35, "distance": 9},
    {"pos": [-5.0, UF_Y + 2.4, -2.8], "color": "#ffe0b8", "power": 25, "distance": 6},
    {"pos": [-2.0, 2.9, 6.0], "color": "#ffbf7a", "power": 30, "distance": 10},
]


def main():
    U.reset_scene()
    col = U.collection("villa_interior")
    shell(col)
    furnish(col)
    report = validate.run(col, rooms={
        "kitchen": ((-8.95, -5.57), (-4.2, 2.8)), "dining": ((-4.2, -5.57), (0.4, 2.8)),
        "living": ((0.4, -5.57), (8.55, 2.8)), "terrace": ((-9.0, 2.9), (1.2, 11.0)), "pool": ((1.2, 2.9), (12.0, 11.0)),
        "bedroom": ((-3.0, -5.1), (10.05, 2.35)), "bath": ((-6.95, -5.1), (-3.0, 2.35)),
    }, name="villa_interior")
    U.apply_all_modifiers()
    lib = set(U.BASE_COLORS)
    U.cube_project_uvs([o for o in col.objects if o.type == "MESH" and o.active_material and o.active_material.name in lib])
    out = C.OUT_MODELS / "villa_interior.glb"
    U.export_glb(out, images="WEBP")
    U.register_model("villa_interior", out)
    (C.OUT_MODELS / "villa_interior.json").write_text(json.dumps({
        "hotspots": HOTSPOTS, "lights": LIGHTS, "hole": [-12.6, 12.6, -9.6, 11.6], "validation": report,
    }, indent=1))


if __name__ == "__main__":
    main()
