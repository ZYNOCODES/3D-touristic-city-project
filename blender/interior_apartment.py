"""Residence apartment interior — contemporary luxury flat in the terraced building.

→ public/models/apartment_interior.glb + public/models/apartment_interior.json

Sized from the real apartment cell (src/data/generated/residence.json): local origin at
the centre of the glass line, floor at y = 0, interior towards −z, terrace towards +z.
In the web app the building is cut open around the cell and this model fills it.

Different from the villa in every respect: plan (front bedroom behind a framed glass
partition, open living/dining to the sea, kitchen + island behind, marble bathroom,
walk-in wardrobe, entry hall), materials (herringbone oak, white stucco, marble feature
wall, walnut + marble kitchen, brass), lighting (linear ceiling slots, brass domes) and
furniture (Wayfair velvet sofa & silk pouf, leather lounge chair, round dining table).
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402
import furniture as F  # noqa: E402
import validate  # noqa: E402
from interior_villa import import_khronos, ph  # noqa: E402

SPEC = json.loads((C.ROOT / "src" / "data" / "generated" / "residence.json").read_text())
cell = SPEC["cells"][0]
W = cell["max"][0] - cell["min"][0]
D = cell["max"][2] - cell["min"][2]
H = round(cell["max"][1] - cell["min"][1] - 0.05, 3)
X0, X1 = -W / 2, W / 2
Z0 = -D
TERR = 3.15


def shell(col):
    b = U.box
    b("floor", "parquet", X0, -0.02, Z0, X1, 0.0, 0.0, col)
    b("slab_under", "concrete", X0, -0.4, Z0, X1, -0.02, TERR, col)
    b("ceiling", "stucco", X0, H, Z0, X1, H + 0.04, 0.0, col)
    # linear light slots in the ceiling
    for zz in (-1.2, -4.6, -8.6):
        b(f"slot_{zz}", "lamp", X0 + 0.8, H - 0.01, zz - 0.04, X1 - 0.8, H, zz + 0.04, col)
    b("wall_l", "marble_tiles" if False else "marble", X0 - 0.2, 0, Z0, X0, H, 0.0, col)
    b("wall_r", "stucco", X1, 0, Z0, X1 + 0.2, H, 0.0, col)
    b("wall_back", "stucco", X0, 0, Z0 - 0.2, X1, H, Z0, col)
    b("skirting", "stucco", X0, 0, Z0 + 0.0, X1, 0.08, Z0 + 0.015, col)
    # full-width glazing with slim frames + sheer curtains on a ceiling track
    b("glazing", "glass", X0, 0.02, -0.04, X1, H - 0.02, 0.0, col)
    n = round(W / 2.1)
    for k in range(n + 1):
        x = X0 + k * W / n
        b(f"mull_{k}", "dark_metal", x - 0.03, 0, -0.1, x + 0.03, H, 0.04, col)
    b("head", "dark_metal", X0, H - 0.08, -0.1, X1, H, 0.04, col)
    b("curtain_track", "dark_metal", X0 + 0.1, H - 0.05, -0.35, X1 - 0.1, H - 0.02, -0.3, col)
    for k, (cx, w) in enumerate(((X0 + 0.2, 1.3), (X1 - 1.6, 1.4))):
        verts, faces = [], []
        pleats = int(w / 0.08)
        for p in range(pleats + 1):
            xx = cx + p * 0.08
            zz = -0.33 - (0.05 if p % 2 else 0.0)
            verts += [(xx, 0.02, zz), (xx, H - 0.06, zz)]
            if p < pleats:
                faces.append((p * 2, p * 2 + 2, p * 2 + 3, p * 2 + 1))
        F._tag([U.mesh_from(f"curtain_{k}", "curtain", verts, faces, col)], "soft", "living", "curtain")
    # terrace: deck, soffit above (the building's own balustrade stays in place)
    b("terrace_deck", "deck", X0 + 0.2, 0.0, 0.05, X1 - 0.2, 0.04, TERR, col)
    b("terrace_soffit", "cladding", X0, H + 0.04, 0.0, X1, H + 0.06, TERR, col)
    # bedroom: framed glass partition + headboard wall
    bx = 2.3
    b("bed_partition", "stucco", bx, 0, -5.6, X1, H, -5.45, col)
    b("headboard_panel", "cladding", bx + 0.6, 0, -5.45, X1 - 0.4, 2.4, -5.4, col)
    b("glass_partition", "glass", bx - 0.03, 0.02, -5.45, bx + 0.03, H - 0.02, -1.4, col)
    for zz in (-5.45, -4.1, -2.75, -1.4):
        b(f"gp_frame_{zz}", "dark_metal", bx - 0.035, 0, zz - 0.02, bx + 0.035, H, zz + 0.02, col)
    b("gp_head", "dark_metal", bx - 0.035, 2.3, -5.45, bx + 0.035, 2.34, -1.4, col)
    # back zone walls: kitchen | hall | bath / wardrobe
    b("bath_wall_front", "stucco", bx, 0, -8.15, X1, H, -8.0, col)
    b("bath_wall_side", "stucco", bx, 0, Z0, bx + 0.15, H, -8.0, col)
    b("wardrobe_side", "stucco", bx, 0, -8.0, bx + 0.1, H, -6.6, col)
    b("front_door", "walnut", -0.6, 0, Z0 + 0.0, 0.6, 2.4, Z0 + 0.06, col)
    b("door_handle", "brass", 0.45, 1.0, Z0 + 0.06, 0.48, 1.25, Z0 + 0.1, col)


def furnish(col):
    # ---- living facing the sea --------------------------------------------------------------
    F.rug(col, "living", -1.6, -5.2, 2.0, -1.0, mat="fabric")
    import_khronos("GlamVelvetSofa", col, "living", 0.2, 0.0, -4.4, rot=0.0, width=2.6)
    ph("modern_coffee_table_02", col, "living", 0.2, 0.0, -2.75, kind="furniture")
    ph("modern_arm_chair_01", col, "living", -1.15, 0.0, -1.55, rot=math.radians(-120), kind="furniture")
    import_khronos("SpecularSilkPouf", col, "living", 1.65, 0.0, -1.7, width=0.55)
    import_khronos("GlassVaseFlowers", col, "living", 0.25, 0.4, -2.75, width=0.3, kind="decor", support="modern_coffee_table_02")
    F.books(col, "living", -0.3, 0.4, -2.85, n=4, support="modern_coffee_table_02")
    import_khronos("DiffuseTransmissionPlant", col, "living", 2.0, 0.0, -0.7, width=0.7)
    # ---- dining ----------------------------------------------------------------------------------
    F.dining_table(col, "dining", -4.1, -2.6, w=1.4, d=1.4, top="marble", base="brass", round_=True)
    for i in range(4):
        a = i / 4 * math.tau + math.pi / 4
        ph("dining_chair_02", col, "dining", -4.1 + math.sin(a) * 0.9, 0.0, -2.6 + math.cos(a) * 0.9, rot=a + math.pi, kind="furniture", decimate=0.5)
    F.pendant(col, "dining", -4.1, -2.6, H, drop=1.1, style="brass")
    ph("brass_vase_01", col, "dining", -4.1, 0.76, -2.6, scale=0.6, support="table_top")
    # ---- kitchen with island -----------------------------------------------------------------------
    F.kitchen_run(col, "kitchen", X0 + 0.1, -3.2, Z0, tall_units=2, carcass="walnut", top="marble")
    F.island(col, "kitchen", -3.9, -8.3, w=2.4, d=0.95, carcass="walnut", top="marble", stools=3, stool_side=1)
    for xx in (-4.6, -3.2):
        F.pendant(col, "kitchen", xx, -8.3, H, drop=1.0, style="brass")
    ph("wicker_basket_02", col, "kitchen", -4.4, 0.94, -8.45, scale=0.7, support="island_top")
    # ---- entry hall --------------------------------------------------------------------------------
    F._tag([U.box("hall_console", "walnut", -1.2, 0.0, Z0 + 0.05, 1.2, 0.8, Z0 + 0.45, col, bevel=0.005)], "furniture", "hall", "console")
    ph("ceramic_vase_03", col, "hall", 0.8, 0.8, Z0 + 0.25, support="hall_console")
    F._tag([U.box("hall_art", "travertine", -1.0, 1.25, Z0 + 0.0, 1.0, 2.25, Z0 + 0.04, col)], "decor", "hall", "art")
    # ---- bedroom (front right, behind the glass partition) ---------------------------------------------
    F.bed(col, "bedroom", 4.35, -4.3, w=1.9, l=2.1, frame="walnut", linen="cushion", throw="fabric")
    for xx in (3.05, 5.65):
        F.nightstand(col, "bedroom", xx, -5.1, mat="walnut")
    F.rug(col, "bedroom", 2.7, -4.8, 6.0, -1.8, mat="rope")
    F.pendant(col, "bedroom", 4.35, -3.2, H, drop=0.8, style="brass")
    # ---- walk-in wardrobe + bathroom ---------------------------------------------------------------------
    F.wardrobe(col, "wardrobe", bx_ := 2.45, -7.95, X1 - 0.05, -7.4, mat="walnut", front="+z")
    F.bathroom(col, "bath", 2.45, Z0 + 0.05, X1 - 0.05, -8.2, style="marble")
    # ---- balcony ------------------------------------------------------------------------------------------
    ph("outdoor_table_chair_set_01", col, "balcony", -3.6, 0.04, 1.6, rot=math.radians(90), kind="furniture")
    F.lounger(col, "balcony", 2.6, 1.55, rot=math.pi / 2)
    ph("potted_plant_02", col, "balcony", X0 + 0.7, 0.04, 2.6, scale=1.3)
    ph("potted_plant_02", col, "balcony", X1 - 0.7, 0.04, 2.6, scale=1.2)


HOTSPOTS = [
    {"id": "living", "label": "Living Room", "pos": [-2.2, 1.55, -6.2], "look": [1.5, 0.6, 3.0]},
    {"id": "dining", "label": "Dining & Kitchen", "pos": [1.2, 1.55, -1.4], "look": [-5.0, 0.9, -9.5]},
    {"id": "bedroom", "label": "Bedroom", "pos": [1.5, 1.55, -0.9], "look": [4.4, 0.7, -5.2]},
    {"id": "bath", "label": "Bathroom", "pos": [3.2, 1.55, -8.6], "look": [5.8, 1.1, -11.6]},
    {"id": "balcony", "label": "Balcony", "pos": [-0.6, 1.6, 1.6], "look": [0.0, -8.0, 40.0]},
]
LIGHTS = [
    {"pos": [-4.1, H - 1.3, -2.6], "color": "#ffd9aa", "power": 30, "distance": 7},
    {"pos": [-3.9, H - 1.2, -8.3], "color": "#ffe3c0", "power": 30, "distance": 7},
    {"pos": [0.2, H - 0.3, -3.0], "color": "#fff0dc", "power": 40, "distance": 9},
    {"pos": [4.35, H - 1.0, -3.2], "color": "#ffcf96", "power": 25, "distance": 6},
    {"pos": [4.3, H - 0.4, -10.0], "color": "#fff4e6", "power": 25, "distance": 6},
    {"pos": [0.0, H - 0.4, -10.5], "color": "#ffe0b8", "power": 18, "distance": 6},
]


def main():
    U.reset_scene()
    col = U.collection("apartment_interior")
    shell(col)
    furnish(col)
    report = validate.run(col, rooms={
        "living": ((-2.2, -5.6), (2.25, -0.35)), "dining": ((X0 + 0.05, -5.8), (-2.2, -0.35)),
        "kitchen": ((X0 + 0.05, Z0 + 0.02), (-1.3, -6.0)), "hall": ((-1.3, Z0 + 0.02), (2.3, -6.0)),
        "bedroom": ((2.35, -5.4), (X1 - 0.02, -0.35)), "wardrobe": ((2.4, -8.0), (X1, -6.6)),
        "bath": ((2.4, Z0), (X1, -8.15)), "balcony": ((X0 + 0.2, 0.05), (X1 - 0.2, TERR)),
    }, name="apartment_interior")
    U.apply_all_modifiers()
    lib = set(U.BASE_COLORS) | {"marble", "marble_tiles"}
    U.cube_project_uvs([o for o in col.objects if o.type == "MESH" and o.active_material and o.active_material.name in lib])
    out = C.OUT_MODELS / "apartment_interior.glb"
    U.export_glb(out, images="WEBP")
    U.register_model("apartment_interior", out)
    (C.OUT_MODELS / "apartment_interior.json").write_text(json.dumps({
        "hotspots": HOTSPOTS, "lights": LIGHTS, "size": [W, H, D], "terrace": TERR, "validation": report,
    }, indent=1))


if __name__ == "__main__":
    main()
