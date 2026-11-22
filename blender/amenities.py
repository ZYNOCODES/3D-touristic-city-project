"""Amenity structures → public/models/amenities.glb, props → public/models/props.glb

Each amenity is parented to an empty named exactly like the web app expects
(pool, lounge, court, playground, beachclub, garden; lounger, umbrella, lamp,
bench) and modelled around its local origin (y = 0 at pad level). Dimensions
come from layout.json so the Blender and procedural versions line up.
"""
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402


def group(name, col):
    e = bpy.data.objects.new(name, None)
    col.objects.link(e)
    return e


def parent_all(root, objs):
    for o in objs:
        o.parent = root


def collect(fn):
    before = set(bpy.data.objects)
    fn()
    return [o for o in bpy.data.objects if o not in before]


def pool(A, col):
    p = A["pool"]
    w, l, dw, dl = p["w"], p["l"], p["deckW"], p["deckL"]
    b = U.box
    b("pool_deck_n", "stone", -dw / 2, -4, -dl / 2, dw / 2, 0.12, -l / 2 - 0.6, col, bevel=0.02)
    b("pool_deck_s", "stone", -dw / 2, -4, l / 2 + 0.6, dw / 2, 0.12, dl / 2, col, bevel=0.02)
    b("pool_deck_w", "stone", -dw / 2, -4, -l / 2 - 0.6, -w / 2 - 0.6, 0.12, l / 2 + 0.6, col)
    b("pool_deck_e", "stone", w / 2 + 0.6, -4, -l / 2 - 0.6, dw / 2, 0.12, l / 2 + 0.6, col)
    for name, a in (("n", (-w / 2 - 0.6, -l / 2 - 0.6, w / 2 + 0.6, -l / 2)), ("s", (-w / 2 - 0.6, l / 2, w / 2 + 0.6, l / 2 + 0.6)),
                    ("w", (-w / 2 - 0.6, -l / 2, -w / 2, l / 2)), ("e", (w / 2, -l / 2, w / 2 + 0.6, l / 2))):
        b(f"coping_{name}", "marble", a[0], 0.0, a[1], a[2], 0.16, a[3], col, bevel=0.03)
    b("basin_floor", "pooltile", -w / 2, -1.8, -l / 2, w / 2, -1.6, l / 2, col)
    b("basin_n", "pooltile", -w / 2, -1.8, -l / 2, w / 2, 0, -l / 2 + 0.15, col)
    b("basin_s", "pooltile", -w / 2, -1.8, l / 2 - 0.15, w / 2, 0, l / 2, col)
    b("basin_w", "pooltile", -w / 2, -1.8, -l / 2, -w / 2 + 0.15, 0, l / 2, col)
    b("basin_e", "pooltile", w / 2 - 0.15, -1.8, -l / 2, w / 2, 0, l / 2, col)
    b("ledge", "pooltile", -w / 2, -1.8, -l / 2, -w / 2 + 6, -0.5, l / 2, col)
    for k in range(4):  # entry steps
        b(f"step_{k}", "pooltile", w / 2 - 3 - k * 0.0, -0.25 - k * 0.3, -l / 2 + 0.15 + k * 0.4, w / 2 - 0.15, -0.2 - k * 0.3, -l / 2 + 0.55 + k * 0.4, col)
    U.mesh_from("pool_water", "water", [(-w / 2, -0.1, -l / 2), (w / 2, -0.1, -l / 2), (w / 2, -0.1, l / 2), (-w / 2, -0.1, l / 2)], [(3, 2, 1, 0)], col)
    # pool bar pavilion
    bx = -dw / 2 + 5
    b("bar_roof", "wood", bx - 4, 3.1, -6, bx + 4, 3.35, 6, col, bevel=0.02)
    b("bar_roof_cap", "plaster", bx - 4.2, 3.35, -6.2, bx + 4.2, 3.6, 6.2, col, bevel=0.03)
    for k, (cx, cz) in enumerate(((-3.6, -5.6), (3.6, -5.6), (-3.6, 5.6), (3.6, 5.6))):
        U.cyl(f"bar_col_{k}", "wood", bx + cx, 0.12, cz, 0.16, 3.0, 16, col=col)
    b("bar_counter", "walnut", bx - 1.2, 0.12, -3.5, bx + 0.6, 1.1, 3.5, col, bevel=0.02)
    b("bar_top", "marble", bx - 1.35, 1.1, -3.6, bx + 0.75, 1.18, 3.6, col, bevel=0.01)
    for k in range(5):
        U.cyl(f"bar_stool_{k}", "frame", bx + 1.2, 0.12, -2.8 + k * 1.4, 0.03, 0.75, 8, col=col)
        U.cyl(f"bar_seat_{k}", "wood", bx + 1.2, 0.87, -2.8 + k * 1.4, 0.22, 0.06, 18, col=col)
    # underwater light strip
    b("pool_light", "lamp", -w / 2 + 6.5, -0.6, -l / 2 + 0.16, w / 2 - 0.5, -0.55, -l / 2 + 0.18, col)


def lounge(A, col):
    p = A["lounge"]
    w, l = p["w"], p["l"]
    b = U.box
    b("lounge_deck", "deck", -w / 2, -3, -l / 2, w / 2, 0.15, l / 2, col, bevel=0.02)
    b("lounge_ceiling", "wood", -8, 3.2, -5.5, 8, 3.5, 5.5, col)
    b("lounge_roof", "roof", -8.3, 3.5, -5.8, 8.3, 3.7, 5.8, col, bevel=0.03)
    for i, cx in enumerate((-7.6, 0, 7.6)):
        for j, cz in enumerate((-5, 5)):
            U.cyl(f"lounge_col_{i}{j}", "wood", cx, 0.15, cz, 0.18, 3.05, 16, col=col)
    for k, (cx, cz, rot) in enumerate(((0, -3.2, 0), (0, 3.2, math.pi), (-4.5, 0, math.pi / 2))):
        objs = collect(lambda: (
            b(f"sofa_base_{k}", "wood", -2.4, 0.15, -0.5, 2.4, 0.45, 0.5, col, bevel=0.03),
            b(f"sofa_seat_{k}", "cushion", -2.3, 0.45, -0.45, 2.3, 0.65, 0.45, col, bevel=0.06),
            b(f"sofa_back_{k}", "cushion", -2.3, 0.45, -0.5, 2.3, 1.05, -0.25, col, bevel=0.06),
        ))
        e = bpy.data.objects.new(f"sofa_{k}", None)
        col.objects.link(e)
        for o in objs:
            o.parent = e
        e.location = U.W(cx, 0, cz)
        e.rotation_euler = (0, 0, rot)
    U.cyl("firepit", "stone", 0, 0.15, 0, 1.0, 0.45, 24, col=col, bevel=0.02)
    U.cyl("fire", "lamp", 0, 0.6, 0, 0.6, 0.06, 18, col=col)
    b("bbq_counter", "walnut", 4.5, 0.15, -2.5, 6.8, 1.05, 2.5, col, bevel=0.02)
    b("bbq_top", "marble", 4.4, 1.05, -2.6, 6.9, 1.12, 2.6, col, bevel=0.01)


def court(A, col):
    p = A["court"]
    w, l = p["w"], p["l"]
    b = U.box
    b("court_base", "concrete", -w / 2 - 3, -3, -l / 2 - 3, w / 2 + 3, 0.02, l / 2 + 3, col)
    for s in (-1, 1):
        x = s * (w / 2 + 1.0)
        U.cyl(f"hoop_pole_{s}", "metal", x, 0, 0, 0.1, 3.2, 12, col=col)
        b(f"hoop_arm_{s}", "metal", min(x - s * 0.1, x - s * 1.1), 2.9, -0.05, max(x - s * 0.1, x - s * 1.1), 3.0, 0.05, col)
        b(f"backboard_{s}", "glass", x - s * 1.1 - 0.03, 2.9, -0.9, x - s * 1.1 + 0.03, 3.95, 0.9, col)
        b(f"backboard_frame_{s}", "frame", x - s * 1.1 - 0.035, 2.9, -0.9, x - s * 1.1 + 0.035, 2.95, 0.9, col)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.23, minor_radius=0.018, location=U.W(x - s * 1.4, 3.05, 0))
        rim = bpy.context.active_object
        rim.name = f"rim_{s}"
        for c in list(rim.users_collection):
            c.objects.unlink(rim)
        col.objects.link(rim)
        rim.data.materials.append(U.material("plastic_red"))
    x = -w / 2 - 2.5
    k = 0
    while x <= w / 2 + 2.5:
        for zz in (-l / 2 - 2.5, l / 2 + 2.5):
            U.cyl(f"fence_post_{k}_{zz:.0f}", "frame", x, 0, zz, 0.04, 3.4, 8, col=col)
        x += 3.1
        k += 1
    b("fence_rail_n", "frame", -w / 2 - 2.5, 3.35, -l / 2 - 2.55, w / 2 + 2.5, 3.42, -l / 2 - 2.45, col)
    b("fence_rail_s", "frame", -w / 2 - 2.5, 3.35, l / 2 + 2.45, w / 2 + 2.5, 3.42, l / 2 + 2.55, col)
    for k, (sx, sz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        U.cyl(f"floodpole_{k}", "frame", sx * (w / 2 + 2.6), 0, sz * (l / 2 + 2.6), 0.09, 8, 12, col=col)
        b(f"flood_{k}", "lamp", sx * (w / 2 + 2.6) - 0.5, 7.8, sz * (l / 2 + 2.6) - 0.2, sx * (w / 2 + 2.6) + 0.5, 8.1, sz * (l / 2 + 2.6) + 0.2, col)


def playground(A, col):
    b = U.box
    tx, tz = -3.2, -1.5
    for k, (cx, cz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        b(f"tower_post_{k}", "wood", tx + cx - 0.08, 0, tz + cz - 0.08, tx + cx + 0.08, 3.2, tz + cz + 0.08, col, bevel=0.02)
    b("tower_deck", "wood", tx - 1.1, 1.9, tz - 1.1, tx + 1.1, 2.05, tz + 1.1, col)
    U.hip_roof("tower_roof", "plastic_red", tx - 1.35, tz - 1.35, tx + 1.35, tz + 1.35, 3.25, 1.0, col, thickness=0.06)
    b("tower_panel", "plastic_yellow", tx - 1.05, 2.05, tz - 1.05, tx + 1.05, 2.8, tz - 0.98, col, bevel=0.02)
    for k in range(6):  # ladder rungs
        b(f"rung_{k}", "metal", tx - 0.4, 0.3 + k * 0.3, tz - 1.35, tx + 0.4, 0.34 + k * 0.3, tz - 1.31, col)
    # wavy slide (curved strip)
    verts, faces = [], []
    n = 14
    for i in range(n + 1):
        t = i / n
        z = tz + 0.45 + t * 4.4
        y = 2.0 - t * 1.75 + math.sin(t * math.pi * 2) * 0.08
        for x in (tx - 0.42, tx + 0.42):
            verts.append((x, y, z))
        if i < n:
            a = i * 2
            faces.append((a, a + 1, a + 3, a + 2))
    slide = U.mesh_from("slide", "plastic_red", verts, faces, col, smooth=True)
    sol = slide.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = 0.05
    for s in (-1, 1):
        rv = [(tx + s * 0.44, v[1] + 0.25, v[2]) for v in verts[::2]]
        rv2 = [(tx + s * 0.44, v[1], v[2]) for v in verts[::2]]
        allv = rv + rv2
        fc = [(i, i + 1, n + 1 + i + 1, n + 1 + i) for i in range(n)]
        side = U.mesh_from(f"slide_side_{s}", "plastic_red", allv, fc, col)
        side.modifiers.new("solid", "SOLIDIFY").thickness = 0.04
    ux, uz = 1.5, 3.5
    for k, (cx, cz) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
        b(f"tower2_post_{k}", "wood", ux + cx * 0.8 - 0.07, 0, uz + cz * 0.8 - 0.07, ux + cx * 0.8 + 0.07, 2.7, uz + cz * 0.8 + 0.07, col, bevel=0.02)
    b("tower2_deck", "wood", ux - 0.9, 1.4, uz - 0.9, ux + 0.9, 1.52, uz + 0.9, col)
    U.hip_roof("tower2_roof", "plastic_yellow", ux - 1.1, uz - 1.1, ux + 1.1, uz + 1.1, 2.75, 0.8, col, thickness=0.06)
    b("climb_wall", "plastic_teal", ux - 0.9, 0, uz + 0.9, ux + 0.9, 1.4, uz + 1.0, col, bevel=0.02)
    for k in range(7):
        U.cyl(f"hold_{k}", ["plastic_red", "plastic_yellow"][k % 2], ux - 0.6 + (k % 3) * 0.6, 0.2 + k * 0.17, uz + 1.0, 0.05, 0.06, 8, col=col)
    b("bridge", "wood", tx + 1.0, 1.9, tz + 0.3, ux - 0.8, 2.0, tz + 1.0, col)
    sx, sz = 6, -4
    for s in (-1, 1):
        for d in (-1, 1):
            bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.06, depth=2.75, location=U.W(sx + s * 2.1, 1.3, sz + d * 0.42))
            leg = bpy.context.active_object
            leg.rotation_euler = (math.radians(-d * 18.3), 0, 0)
            leg.name = f"swing_leg_{s}{d}"
            for c in list(leg.users_collection):
                c.objects.unlink(leg)
            col.objects.link(leg)
            leg.data.materials.append(U.material("metal"))
    bpy.ops.mesh.primitive_cylinder_add(vertices=10, radius=0.06, depth=4.3, location=U.W(sx, 2.45, sz), rotation=(0, math.radians(90), 0))
    beam = bpy.context.active_object
    beam.name = "swing_beam"
    for c in list(beam.users_collection):
        c.objects.unlink(beam)
    col.objects.link(beam)
    beam.data.materials.append(U.material("metal"))
    for k, (x, z, m) in enumerate(((4, 5, "plastic_teal"), (6.5, 3, "plastic_yellow"))):
        U.cyl(f"spring_{k}", "metal", x, 0, z, 0.06, 0.4, 8, col=col)
        b(f"rider_{k}", m, x - 0.45, 0.4, z - 0.15, x + 0.45, 0.75, z + 0.15, col, bevel=0.08)


def beachclub(A, col):
    p = A["beachClub"]
    w, l = p["w"], p["l"]
    b = U.box
    b("bc_deck", "deck", -w / 2, -2, -l / 2, w / 2 - 22, 0.6, l / 2, col, bevel=0.02)
    x = -w / 2 + 0.5
    k = 0
    while x < w / 2 - 22:
        for zz in (-l / 2 + 0.4, l / 2 - 0.4):
            U.cyl(f"bc_pile_{k}_{zz:.0f}", "wood", x, -2, zz, 0.15, 2.4, 10, col=col)
        x += 3
        k += 1
    b("bc_bar", "wood", -w / 2 + 3, 0.6, -2, -w / 2 + 9, 1.7, 2, col, bevel=0.03)
    b("bc_bar_top", "marble", -w / 2 + 2.8, 1.7, -2.2, -w / 2 + 9.2, 1.8, 2.2, col)
    U.hip_roof("bc_thatch", "rope", -w / 2 + 1, -l / 2 + 1, w / 2 - 23, l / 2 - 1, 3.6, 2.2, col, thickness=0.35)
    for k, (cx, cz) in enumerate(((-w / 2 + 1.5, -l / 2 + 1.5), (w / 2 - 23.5, -l / 2 + 1.5), (-w / 2 + 1.5, l / 2 - 1.5), (w / 2 - 23.5, l / 2 - 1.5))):
        U.cyl(f"bc_post_{k}", "wood", cx, 0.6, cz, 0.15, 3.0, 12, col=col)


def garden(A, col):
    r = A["garden"]["r"]
    bpy.ops.mesh.primitive_circle_add(vertices=64, radius=r - 1.5, fill_type="NGON", location=U.W(0, 0.08, 0))
    ring = bpy.context.active_object
    ring.name = "garden_path"
    for c in list(ring.users_collection):
        c.objects.unlink(ring)
    col.objects.link(ring)
    ring.data.materials.append(U.material("paving"))
    U.cyl("fountain_basin", "stone", 0, 0, 0, 3.2, 0.55, 48, col=col, bevel=0.03)
    U.cyl("fountain_column", "stone", 0, 0.55, 0, 0.5, 1.2, 24, col=col, bevel=0.03)
    bpy.ops.mesh.primitive_circle_add(vertices=48, radius=2.9, fill_type="NGON", location=U.W(0, 0.5, 0))
    w = bpy.context.active_object
    w.name = "fountain_water"
    for c in list(w.users_collection):
        c.objects.unlink(w)
    col.objects.link(w)
    w.data.materials.append(U.material("water"))


def props(col):
    b = U.box
    out = {}
    import furniture as F  # detailed teak lounger (slats, rails, adjustable back, padded mattress)
    out["lounger"] = F.lounger(col, "pool", 0.0, 0.0)
    out["umbrella"] = F.parasol(col, "pool", 0.0, 0.0, r=1.6)
    out["lamp"] = collect(lambda: (
        U.cyl("lamp_pole", "frame", 0, 0, 0, 0.07, 4.2, 10, r2=0.05, col=col),
        b("lamp_arm", "frame", -0.08, 4.1, -0.08, 0.08, 4.2, 0.7, col),
        b("lamp_head", "lamp", -0.12, 3.98, 0.45, 0.12, 4.1, 0.78, col),
    ))
    out["bench"] = collect(lambda: (
        b("bench_seat", "wood", -0.9, 0.42, -0.22, 0.9, 0.48, 0.22, col, bevel=0.01),
        b("bench_back", "wood", -0.9, 0.48, 0.18, 0.9, 0.9, 0.24, col, bevel=0.01),
        b("bench_leg_l", "stone", -0.8, 0, -0.2, -0.65, 0.42, 0.2, col, bevel=0.01),
        b("bench_leg_r", "stone", 0.65, 0, -0.2, 0.8, 0.42, 0.2, col, bevel=0.01),
    ))
    return out


def main():
    A = U.layout()["amenities"]
    # ---- structures ----
    U.reset_scene()
    col = U.collection("amenities")
    for name, fn in (("pool", pool), ("lounge", lounge), ("court", court), ("playground", playground), ("beachclub", beachclub), ("garden", garden)):
        root = group(name, col)
        objs = collect(lambda: fn(A, col))
        for o in objs:
            if o.parent is None and o is not root:
                o.parent = root
    U.apply_all_modifiers()
    U.cube_project_uvs()
    out = C.OUT_MODELS / "amenities.glb"
    U.export_glb(out)
    U.register_model("amenities", out)
    # ---- props ----
    U.reset_scene()
    col = U.collection("props")
    for name, objs in props(col).items():
        root = group(name, col)
        for o in objs:
            if o.parent is None:
                o.parent = root
    U.apply_all_modifiers()
    U.cube_project_uvs()
    out = C.OUT_MODELS / "props.glb"
    U.export_glb(out)
    U.register_model("props", out)


if __name__ == "__main__":
    main()
