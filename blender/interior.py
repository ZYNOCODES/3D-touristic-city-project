"""Villa interior + pool terrace → public/models/interior.glb

Follows the layout in src/scene/interior/interiorSpec.ts (hotspots and lights are
defined there): open-plan living / dining / kitchen, double-height stair lounge
with cantilevered oak treads and a slatted feature wall, master bedroom, glass
facade, covered terrace and infinity pool. Soft furniture is built with bevels +
subdivision; chairs, plants, vases, lamps are CC0 Poly Haven models when the
fetcher downloaded them (otherwise simple procedural stand-ins are used).

`build(col, render=False)` is reused by render_gallery.py.
"""
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402


def soft(obj, levels=2, bevel=0.06):
    m = obj.modifiers.new("bevel", "BEVEL")
    m.width = bevel
    m.segments = 3
    s = obj.modifiers.new("subsurf", "SUBSURF")
    s.levels = levels
    s.render_levels = levels
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def shell(col):
    b = U.box
    b("podium", "stone", -17, -7, -7, 12, -0.3, 13, col)
    b("floor", "floor", -16.5, -0.3, -6.3, 11.5, 0, 4.0, col)
    b("terrace_cov", "stone", -16.5, -0.3, 4.0, 11.5, 0, 7.8, col)
    b("terrace_w", "stone", -16.5, -0.3, 7.8, -4.2, 0, 12.6, col)
    b("terrace_e", "stone", 9.2, -0.3, 7.8, 11.5, 0, 12.6, col)
    # infinity pool
    b("pool_floor", "pooltile", -4.2, -1.4, 7.8, 9.2, -1.25, 12.4, col)
    b("pool_wall_n", "pooltile", -4.2, -1.4, 7.8, 9.2, 0, 8.0, col)
    b("pool_wall_w", "pooltile", -4.2, -1.4, 7.8, -4.0, 0, 12.4, col)
    b("pool_wall_e", "pooltile", 9.0, -1.4, 7.8, 9.2, 0, 12.4, col)
    b("pool_weir", "pooltile", -4.2, -1.6, 12.4, 9.2, -0.12, 12.6, col)
    U.mesh_from("pool_water", "water", [(-4.0, -0.08, 8.0), (9.0, -0.08, 8.0), (9.0, -0.08, 12.55), (-4.0, -0.08, 12.55)], [(3, 2, 1, 0)], col)
    # walls & ceilings
    b("wall_back", "plaster", -16.5, 0, -6.3, 6, 3.4, -6.0, col)
    b("wall_back_tall", "plaster", 6, 0, -6.3, 11.5, 6.8, -6.0, col)
    b("wall_w", "plaster", -16.8, 0, -6.3, -16.5, 3.4, 4.0, col)
    b("wall_e", "plaster", 11.5, 0, -6.3, 11.8, 6.8, 4.0, col)
    b("partition_a", "plaster", -9.4, 0, -6.0, -9.1, 3.4, -4.3, col)
    b("partition_b", "plaster", -9.4, 0, -2.7, -9.1, 3.4, 2.4, col)
    b("partition_head", "plaster", -9.4, 2.4, -4.3, -9.1, 3.4, -2.7, col)
    b("ceiling", "ceiling", -16.5, 3.4, -6.3, 6, 3.6, 4.0, col)
    b("ceiling_tall", "ceiling", 6, 6.8, -6.3, 11.5, 7.0, 4.0, col)
    b("bulkhead", "plaster", 6, 3.4, 3.4, 11.5, 6.8, 4.0, col)
    b("cove", "lamp", -16.4, 3.32, -5.9, 5.9, 3.36, -5.8, col)
    # recessed downlights
    for i, (x, z) in enumerate(((-6, 0.5), (-3, 0.5), (0, 0.5), (3, -1), (5, -1), (-12.5, -1), (-14, 1.5), (-11, 1.5))):
        U.cyl(f"downlight_{i}", "lamp", x, 3.385, z, 0.07, 0.015, 16, col=col)
    # glazing
    b("glazing", "glass", -16.5, 0.02, 3.92, 11.5, 3.38, 3.98, col)
    b("glaze_head", "frame", -16.5, 3.3, 3.88, 11.5, 3.42, 4.02, col)
    b("glaze_sill", "frame", -16.5, 0, 3.88, 11.5, 0.03, 4.02, col)
    x = -16.5
    k = 0
    while x <= 11.55:
        b(f"mullion_{k}", "frame", x - 0.03, 0, 3.88, x + 0.03, 3.4, 4.02, col)
        x += 2.8
        k += 1
    # covered terrace
    b("terrace_soffit", "wood", -16.5, 3.4, 4.0, 11.5, 3.55, 7.8, col)
    b("terrace_roof", "plaster", -16.6, 3.55, 4.0, 11.6, 3.9, 7.9, col)
    for k, x in enumerate((-16.2, -8, 0.5, 11.2)):
        U.cyl(f"terrace_col_{k}", "wood", x, 0, 7.5, 0.16, 3.4, 20, col=col)
    b("balustrade_s", "glass", -16.5, 0, 12.5, -4.2, 1.05, 12.56, col)
    b("balustrade_w", "glass", -16.56, 0, 4.0, -16.5, 1.05, 12.6, col)
    b("balustrade_e", "glass", 11.5, 0, 4.0, 11.56, 1.05, 12.6, col)


def stair(col):
    b = U.box
    b("feature_wall", "walnut", 11.2, 0, -6.0, 11.5, 6.8, 3.4, col)
    z = -5.95
    k = 0
    while z < 3.35:
        b(f"slat_{k}", "wood", 11.05, 0, z, 11.2, 6.8, z + 0.08, col, bevel=0.01)
        z += 0.16
        k += 1
    for i in range(18):
        y = (i + 1) * 0.19
        zz = 1.5 - i * 0.27
        b(f"tread_{i}", "wood", 9.9, y - 0.08, zz - 0.3, 11.05, y, zz, col, bevel=0.012)
        # hidden LED under each tread
        b(f"tread_led_{i}", "lamp", 9.95, y - 0.085, zz - 0.29, 11.0, y - 0.08, zz - 0.26, col)
    b("mezz_slab", "concrete", 6, 3.2, -6.0, 11.05, 3.4, -3.45, col)
    b("mezz_floor", "wood", 6, 3.4, -6.0, 11.05, 3.42, -3.45, col)
    b("mezz_glass", "glass", 6, 3.42, -3.5, 9.85, 4.45, -3.44, col)
    b("stair_glass", "glass", 9.85, 0.2, -3.45, 9.9, 4.45, 1.5, col)
    b("pebbles", "stone", 8.2, 0, -2.6, 11.0, 0.08, 0.8, col)
    U.cyl("stair_planter", "plaster", 8.9, 0.08, -1.2, 0.45, 0.55, 32, r2=0.38, col=col, bevel=0.02)


def living(col, rnd):
    b = U.box
    b("rug_living", "fabric", -7.8, 0.0, -1.8, -1.4, 0.015, 3.0, col)
    # sectional sofa — soft, subdivided cushions
    soft(b("sofa_base_a", "fabric", -4.4, 0, -1.9, -3.4, 0.42, 2.4, col), 1, 0.04)
    soft(b("sofa_back_a", "fabric", -3.75, 0.42, -1.9, -3.35, 0.9, 2.4, col), 2, 0.12)
    soft(b("sofa_base_b", "fabric", -7.6, 0, -2.0, -3.4, 0.42, -1.0, col), 1, 0.04)
    soft(b("sofa_back_b", "fabric", -7.6, 0.42, -2.0, -3.4, 0.9, -1.75, col), 2, 0.12)
    for i in range(3):
        soft(b(f"seat_a_{i}", "cushion", -4.35, 0.42, -1.85 + i * 1.4, -3.75, 0.6, -0.5 + i * 1.4, col), 2, 0.1)
    for i in range(3):
        soft(b(f"seat_b_{i}", "cushion", -7.55 + i * 1.3, 0.42, -1.95, -6.3 + i * 1.3, 0.6, -1.1, col), 2, 0.1)
    for i in range(4):
        soft(b(f"pillow_{i}", "cushion", -4.0, 0.6, -0.6 + i * 0.75, -3.78, 0.98, -0.12 + i * 0.75, col), 2, 0.1)
    # sculpted wood coffee tables (irregular slabs)
    for k, (x, z, r, h) in enumerate(((-6.0, 0.6, 0.85, 0.36), (-6.9, 1.3, 0.55, 0.3))):
        t = U.cyl(f"coffee_{k}", "walnut", x, 0, z, r, h, 40, col=col)
        disp = t.modifiers.new("organic", "SIMPLE_DEFORM")
        disp.deform_method = "TAPER"
        disp.factor = 0.08
        soft(t, 1, 0.03)
    # media wall
    b("media_back", "walnut", -9.1, 0, -2.6, -8.75, 3.4, 2.4, col)
    z = -2.55
    k = 0
    while z < 2.35:
        b(f"media_slat_{k}", "wood", -8.75, 0, z, -8.68, 3.4, z + 0.06, col)
        z += 0.12
        k += 1
    b("tv", "black", -8.67, 1.05, -1.25, -8.62, 2.2, 0.85, col)
    b("media_console", "walnut", -8.68, 0, -2.4, -8.0, 0.45, 2.2, col, bevel=0.01)
    # lounge chairs by the glass (Poly Haven) or procedural
    for k, zc in enumerate((2.9, 1.5)):
        if not U.import_polyhaven("mid_century_lounge_chair", (-7.6, 0, zc), math.radians(135 - k * 45), col=col):
            soft(b(f"lchair_{k}", "cushion", -8.0, 0, zc - 0.4, -7.2, 0.5, zc + 0.4, col), 1, 0.08)
    U.import_polyhaven("side_table_01", (-8.2, 0, 0.0), 0, col=col)
    U.import_polyhaven("ceramic_vase_01", (-8.3, 0.45, 1.8), 0, col=col)
    U.import_polyhaven("potted_plant_02", (-1.9, 0, -1.9), rnd.uniform(0, 6), 1.3, col=col)
    U.import_polyhaven("wicker_basket_01", (-5.2, 0, -2.3), 0.4, col=col)
    U.import_polyhaven("ceramic_vase_03", (-6.0, 0.36, 0.7), 0, col=col)


def dining_kitchen(col, rnd):
    b = U.box
    b("dining_top", "walnut", 1.0, 0.72, 0.5, 5.0, 0.78, 1.9, col, bevel=0.01)
    b("dining_leg_a", "walnut", 1.4, 0, 1.0, 1.6, 0.72, 1.4, col)
    b("dining_leg_b", "walnut", 4.4, 0, 1.0, 4.6, 0.72, 1.4, col)
    for i in range(4):
        for s in (-1, 1):
            x = 1.5 + i * 1.0
            zc = 1.2 + s * 1.0
            if not U.import_polyhaven("dining_chair_02", (x, 0, zc), math.pi if s > 0 else 0, col=col, decimate=0.5):
                b(f"chair_{i}_{s}", "wood", x - 0.22, 0, zc - 0.22, x + 0.22, 0.46, zc + 0.22, col, bevel=0.02)
                b(f"chair_back_{i}_{s}", "wood", x - 0.22, 0.46, zc + s * 0.18, x + 0.22, 0.95, zc + s * 0.22, col)
    for k, x in enumerate((2.0, 3.0, 4.0)):
        if not U.import_polyhaven("modern_ceiling_lamp_01", (x, 3.4 - 1.17, 1.2), 0, col=col):
            U.cyl(f"pendant_cord_{k}", "frame", x, 2.35, 1.2, 0.006, 1.05, 6, col=col)
            U.cyl(f"pendant_{k}", "rope", x, 2.05, 1.2, 0.28, 0.32, 24, r2=0.08, col=col)
        U.cyl(f"pendant_glow_{k}", "lamp", x, 2.04, 1.2, 0.2, 0.02, 20, col=col)
    U.import_polyhaven("ceramic_vase_03", (3.0, 0.78, 1.2), 0, col=col)
    b("island", "marble", 0.6, 0, -3.6, 5.4, 0.92, -2.5, col, bevel=0.01)
    b("island_top", "marble", 0.5, 0.92, -3.65, 5.5, 0.97, -2.45, col, bevel=0.005)
    for i in range(3):
        x = 1.6 + i * 1.4
        U.cyl(f"stool_leg_{i}", "frame", x, 0, -2.0, 0.025, 0.7, 10, col=col)
        U.cyl(f"stool_seat_{i}", "wood", x, 0.7, -2.0, 0.21, 0.06, 24, col=col, bevel=0.01)
    b("tall_units", "walnut", -0.2, 0, -6.0, 6.0, 2.9, -5.35, col, bevel=0.005)
    for i in range(10):
        x = -0.2 + i * 0.62
        b(f"unit_gap_{i}", "black", x, 0.02, -5.351, x + 0.006, 2.88, -5.345, col)
    b("backsplash", "marble", 1.2, 0.92, -5.36, 4.8, 2.0, -5.3, col)
    b("oven", "black", 4.95, 0.9, -5.36, 5.75, 1.6, -5.31, col)
    b("oven2", "black", 4.95, 1.65, -5.36, 5.75, 2.2, -5.31, col)
    U.import_polyhaven("potted_plant_04", (5.6, 0.97, -3.2), 0.3, col=col)


def bedroom(col, rnd):
    b = U.box
    b("rug_bed", "fabric", -15.4, 0, -5.2, -10.2, 0.015, -0.6, col)
    b("headboard", "walnut", -14.6, 0, -6.0, -10.6, 1.4, -5.8, col, bevel=0.01)
    b("bed_frame", "wood", -13.7, 0, -5.8, -11.5, 0.32, -3.4, col, bevel=0.02)
    soft(b("mattress", "cushion", -13.65, 0.32, -5.75, -11.55, 0.6, -3.45, col), 2, 0.08)
    soft(b("throw", "fabric", -13.7, 0.58, -4.6, -11.5, 0.66, -3.4, col), 2, 0.03)
    soft(b("pillow_l", "cushion", -13.4, 0.6, -5.7, -12.7, 0.8, -5.25, col), 2, 0.09)
    soft(b("pillow_r", "cushion", -12.5, 0.6, -5.7, -11.8, 0.8, -5.25, col), 2, 0.09)
    for k, x in enumerate((-14.3, -10.95)):
        b(f"nightstand_{k}", "walnut", x - 0.3, 0, -5.8, x + 0.3, 0.5, -5.3, col, bevel=0.01)
        U.cyl(f"bedlamp_{k}", "lamp", x, 0.5, -5.55, 0.12, 0.35, 16, r2=0.08, col=col)
    b("bed_bench", "wood", -13.4, 0, -3.1, -11.8, 0.45, -2.7, col, bevel=0.02)
    b("wardrobe", "walnut", -16.5, 0, -5.8, -15.9, 2.9, -1.0, col, bevel=0.005)
    if not U.import_polyhaven("mid_century_lounge_chair", (-14.8, 0, 2.6), math.radians(135), col=col):
        soft(b("bed_chair", "fabric", -15.2, 0, 2.2, -14.4, 0.42, 3.0, col), 1, 0.06)
    U.import_polyhaven("potted_plant_04", (-10.95, 0.5, -5.45), 0.2, 1.2, col=col)
    U.import_polyhaven("potted_plant_02", (-9.9, 0, -5.4), 2.0, 1.4, col=col)
    U.import_polyhaven("potted_plant_01", (-16.0, 0, 3.4), 0, 1.2, col=col, decimate=0.35)


def terrace(col, rnd):
    b = U.box
    for k, x in enumerate((-9.5, -7.8)):
        b(f"lounger_{k}", "wood", x - 0.36, 0, 8.6, x + 0.36, 0.3, 10.6, col, bevel=0.02)
        soft(b(f"lounger_mat_{k}", "cushion", x - 0.33, 0.3, 8.7, x + 0.33, 0.4, 10.1, col), 1, 0.04)
    soft(b("out_sofa", "fabric", -14.5, 0, 4.8, -10.5, 0.4, 5.7, col), 1, 0.05)
    soft(b("out_sofa_seat", "cushion", -14.45, 0.4, 4.85, -10.55, 0.55, 5.65, col), 2, 0.08)
    soft(b("out_sofa_back", "fabric", -14.5, 0.4, 4.8, -10.5, 0.85, 5.05, col), 2, 0.08)
    U.cyl("out_table", "stone", -12.5, 0, 6.6, 0.6, 0.35, 32, col=col, bevel=0.02)
    U.import_polyhaven("potted_plant_01", (-15.7, 0, 11.7), 0.5, 1.6, col=col, decimate=0.35)
    U.import_polyhaven("potted_plant_01", (10.7, 0, 11.6), 2.1, 1.5, col=col, decimate=0.35)
    U.import_polyhaven("potted_plant_02", (8.9, 0.55, -1.2), 1.0, 1.8, col=col)
    U.import_polyhaven("calathea_orbifolia_01", (9.6, 0.08, -0.4), 1.6, 0.8, col=col)


def build(col, render=False):
    rnd = U.rng(11)
    shell(col)
    stair(col)
    living(col, rnd)
    dining_kitchen(col, rnd)
    bedroom(col, rnd)
    terrace(col, rnd)


def main():
    U.reset_scene()
    col = U.collection("interior")
    build(col)
    U.apply_all_modifiers()
    # library-material meshes get metre-scale box UVs; imported Poly Haven meshes keep theirs
    lib = set(U.BASE_COLORS)
    U.cube_project_uvs([o for o in bpy.context.scene.objects if o.type == "MESH" and o.active_material and o.active_material.name in lib])
    out = C.OUT_MODELS / "interior.glb"
    U.export_glb(out, images="WEBP")
    U.register_model("interior", out)


if __name__ == "__main__":
    main()
