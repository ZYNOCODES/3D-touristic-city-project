"""Furniture & fixture library (web-space coordinates, metres; y up, +z front).

Every builder returns the list of objects it created and tags them with custom props
used by validate.py:  kind = furniture | decor | fixture | soft,  room = <room id>,
support = <name of the object it rests on> (decor only).
"""
import math
import random

import bmesh
import bpy
from mathutils import Vector

import bl_util as U

R = random.Random(3)


_ASM = [0]


def _tag(objs, kind, room, name=None, support=None):
    _ASM[0] += 1
    for o in objs:
        o["asm"] = _ASM[0]
        o["kind"] = kind
        o["room"] = room
        if name:
            o["item"] = name
        if support:
            o["support"] = support
    return objs


def _collect(fn):
    before = set(bpy.data.objects)
    fn()
    return [o for o in bpy.data.objects if o not in before]


def soft(o, levels=2, bevel=0.05):
    m = o.modifiers.new("bevel", "BEVEL")
    m.width = bevel
    m.segments = 3
    m.limit_method = "ANGLE"
    s = o.modifiers.new("sub", "SUBSURF")
    s.levels = s.render_levels = levels
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def rotate_group(objs, cx, cz, rot):
    """Rotate a set of objects about the vertical axis through (cx, cz) in web space."""
    pivot = U.W(cx, 0, cz)
    for o in objs:
        if o.parent:
            continue
        o.location = pivot + (o.location - pivot)
        o.rotation_euler.z += rot
        d = o.location - pivot
        c, s = math.cos(rot), math.sin(rot)
        o.location = pivot + Vector((d.x * c - d.y * s, d.x * s + d.y * c, d.z))


# ---------------------------------------------------------------------------
def sofa(col, room, x, z, w=3.0, d=1.0, rot=0.0, fabric="fabric", cushion="cushion", legs="dark_metal", return_w=0.0):
    """Low modular sofa: base, back, arms, seat & back cushions, throw pillows; optional chaise."""
    b = U.box

    def build():
        x0, x1 = x - w / 2, x + w / 2
        z0, z1 = z - d / 2, z + d / 2
        soft(b("sofa_base", fabric, x0, 0.12, z0, x1, 0.4, z1, col), 1, 0.03)
        soft(b("sofa_back", fabric, x0, 0.4, z0, x1, 0.82, z0 + 0.22, col), 2, 0.08)
        for ax in (x0, x1 - 0.2):
            soft(b("sofa_arm", fabric, ax, 0.4, z0, ax + 0.2, 0.62, z1, col), 2, 0.07)
        n = max(2, round((w - 0.4) / 0.95))
        cw = (w - 0.4) / n
        for i in range(n):
            cx0 = x0 + 0.2 + i * cw
            soft(b("seat_cushion", cushion, cx0 + 0.01, 0.4, z0 + 0.22, cx0 + cw - 0.01, 0.56, z1 - 0.02, col), 2, 0.07)
            soft(b("back_cushion", cushion, cx0 + 0.01, 0.56, z0 + 0.2, cx0 + cw - 0.01, 0.95, z0 + 0.42, col), 2, 0.09)
        for i in range(3):
            px = x0 + 0.45 + i * (w - 0.9) / 2
            p = soft(b("pillow", ["cushion", "rope", "fabric"][i % 3], px - 0.23, 0.56, z0 + 0.4, px + 0.23, 0.98, z0 + 0.52, col), 2, 0.1)
            p.rotation_euler.x = math.radians(-12)
        if return_w:
            soft(b("chaise", fabric, x1 - 0.95, 0.12, z1, x1, 0.4, z1 + return_w, col), 1, 0.03)
            soft(b("chaise_cushion", cushion, x1 - 0.93, 0.4, z1 - 0.02, x1 - 0.02, 0.56, z1 + return_w - 0.02, col), 2, 0.07)
        for lx in (x0 + 0.08, x1 - 0.08):
            for lz in (z0 + 0.08, z1 - 0.08 + return_w):
                U.cyl("sofa_leg", legs, lx, 0, lz, 0.025, 0.12, 10, col=col)

    objs = _collect(build)
    if rot:
        rotate_group(objs, x, z, rot)
    return _tag(objs, "furniture", room, "sofa")


def coffee_table(col, room, x, z, r=0.55, h=0.36, mat="walnut", organic=True):
    def build():
        t = U.cyl("coffee_top", mat, x, h - 0.08, z, r, 0.08, 48, col=col, bevel=0.015)
        if organic:
            t.scale = (1.0, 0.78, 1.0)
            t.rotation_euler.z = R.uniform(0, math.pi)
        U.cyl("coffee_base", mat, x, 0, z, r * 0.55, h - 0.08, 32, r2=r * 0.5, col=col, bevel=0.01)

    return _tag(_collect(build), "furniture", room, "coffee_table")


def rug(col, room, x0, z0, x1, z1, mat="fabric"):
    o = U.box("rug", mat, x0, 0.0, z0, x1, 0.012, z1, col, bevel=0.004)
    return _tag([o], "soft", room, "rug")


def woven_chair(col, room, x, z, rot=0.0, frame="dark_metal", weave="rope"):
    """Dining chair with slim metal frame and woven rattan seat/back."""
    b = U.box

    def build():
        for lx in (-0.21, 0.21):
            for lz in (-0.2, 0.2):
                U.cyl("chair_leg", frame, x + lx, 0, z + lz, 0.012, 0.45, 8, col=col)
        soft(b("chair_seat", weave, x - 0.24, 0.43, z - 0.23, x + 0.24, 0.48, z + 0.23, col), 1, 0.02)
        for lx in (-0.21, 0.21):
            U.cyl("chair_post", frame, x + lx, 0.45, z + 0.22, 0.012, 0.42, 8, col=col)
        bk = soft(b("chair_back", weave, x - 0.23, 0.6, z + 0.19, x + 0.23, 0.86, z + 0.24, col), 1, 0.02)
        bk.rotation_euler.x = math.radians(-6)

    objs = _collect(build)
    if rot:
        rotate_group(objs, x, z, rot)
    return _tag(objs, "furniture", room, "chair")


def dining_table(col, room, x, z, w=2.4, d=1.0, top="walnut", base="dark_metal", round_=False):
    b = U.box

    def build():
        if round_:
            U.cyl("table_top", top, x, 0.72, z, w / 2, 0.04, 64, col=col, bevel=0.01)
            U.cyl("table_ped", base, x, 0, z, 0.08, 0.72, 24, col=col)
            U.cyl("table_foot", base, x, 0, z, 0.38, 0.03, 32, col=col)
        else:
            b("table_top", top, x - w / 2, 0.72, z - d / 2, x + w / 2, 0.76, z + d / 2, col, bevel=0.008)
            for sx in (-1, 1):
                b("table_leg", base, x + sx * (w / 2 - 0.25) - 0.03, 0, z - d / 2 + 0.1, x + sx * (w / 2 - 0.25) + 0.03, 0.72, z + d / 2 - 0.1, col)

    return _tag(_collect(build), "furniture", room, "dining_table")


def bed(col, room, x, z, w=1.9, l=2.15, rot=0.0, frame="walnut", linen="cushion", throw="rope", drape=True):
    """Bed with upholstered headboard, mattress, pillows and a cloth-simulated duvet."""
    b = U.box

    def build():
        x0, x1 = x - w / 2, x + w / 2
        z0, z1 = z - l / 2, z + l / 2
        b("bed_base", frame, x0 + 0.03, 0.08, z0, x1 - 0.03, 0.36, z1 - 0.08, col, bevel=0.015)
        soft(b("headboard", "fabric", x0 - 0.15, 0.08, z0 - 0.12, x1 + 0.15, 1.25, z0, col), 2, 0.05)
        mat = soft(b("mattress", linen, x0, 0.38, z0 + 0.02, x1, 0.62, z1, col), 1, 0.04)
        for i, px in enumerate((x - w / 4, x + w / 4)):
            soft(b("pillow", linen, px - 0.33, 0.62, z0 + 0.08, px + 0.33, 0.78, z0 + 0.5, col), 2, 0.08)
            soft(b("cushion_deco", throw, px - 0.22, 0.66, z0 + 0.42, px + 0.22, 0.95, z0 + 0.55, col), 2, 0.09)
        if drape:
            duvet(col, x0 - 0.05, x1 + 0.05, z0 + 0.55, z1 + 0.05, 0.66, [mat], linen)
        b("bed_throw", throw, x0 - 0.04, 0.625, z1 - 0.6, x1 + 0.04, 0.64, z1 - 0.15, col)

    objs = _collect(build)
    if rot:
        rotate_group(objs, x, z, rot)
    return _tag(objs, "furniture", room, "bed")


def duvet(col, x0, x1, z0, z1, y, colliders, mat):
    """Drape a duvet with Blender's cloth solver for natural folds over the mattress edges."""
    w, l = (x1 - x0) + 0.5, (z1 - z0) + 0.25
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=48, y_subdivisions=48, size=1, location=U.W((x0 + x1) / 2, y + 0.04, (z0 + z1) / 2 + 0.1))
    d = bpy.context.active_object
    d.name = "duvet"
    d.scale = (w, l, 1)
    bpy.ops.object.transform_apply(scale=True)
    for c in list(d.users_collection):
        c.objects.unlink(d)
    col.objects.link(d)
    d.data.materials.append(U.material(mat))
    for c in colliders:
        c.modifiers.new("collision", "COLLISION")
    cl = d.modifiers.new("cloth", "CLOTH")
    cl.settings.quality = 6
    cl.settings.mass = 0.4
    cl.settings.tension_stiffness = 12
    cl.settings.bending_stiffness = 2.5
    cl.collision_settings.distance_min = 0.006
    sc = bpy.context.scene
    sc.frame_start, sc.frame_end = 1, 32
    for f in range(1, 33):
        sc.frame_set(f)
    bpy.context.view_layer.objects.active = d
    bpy.ops.object.modifier_apply(modifier=cl.name)
    sol = d.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = 0.035
    sub = d.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    for p in d.data.polygons:
        p.use_smooth = True
    for c in colliders:
        for m in [m for m in c.modifiers if m.type == "COLLISION"]:
            c.modifiers.remove(m)
    sc.frame_set(1)
    return d


def nightstand(col, room, x, z, mat="walnut", lamp=True):
    b = U.box

    def build():
        b("nightstand", mat, x - 0.25, 0.0, z - 0.22, x + 0.25, 0.5, z + 0.22, col, bevel=0.006)
        b("ns_drawer_gap", "black", x - 0.24, 0.3, z + 0.22, x + 0.24, 0.305, z + 0.223, col)
        if lamp:
            U.cyl("lamp_base", "travertine", x, 0.5, z, 0.08, 0.28, 24, r2=0.05, col=col)
            U.cyl("lamp_shade", "lamp", x, 0.74, z, 0.17, 0.24, 32, r2=0.14, col=col)

    return _tag(_collect(build), "furniture", room, "nightstand")


def wardrobe(col, room, x0, z0, x1, z1, mat="walnut", front="+z"):
    b = U.box

    def build():
        b("wardrobe", mat, x0, 0.0, z0, x1, 2.6, z1, col, bevel=0.004)
        n = max(2, round(abs(x1 - x0) / 0.6)) if front in ("+z", "-z") else max(2, round(abs(z1 - z0) / 0.6))
        for i in range(1, n):
            if front in ("+z", "-z"):
                gx = x0 + i * (x1 - x0) / n
                zz = z1 if front == "+z" else z0
                b("wr_gap", "black", gx - 0.003, 0.02, zz - 0.002, gx + 0.003, 2.58, zz + 0.002, col)
            else:
                gz = z0 + i * (z1 - z0) / n
                xx = x1 if front == "+x" else x0
                b("wr_gap", "black", xx - 0.002, 0.02, gz - 0.003, xx + 0.002, 2.58, gz + 0.003, col)

    return _tag(_collect(build), "furniture", room, "wardrobe")


def kitchen_run(col, room, x0, x1, z_back, depth=0.62, tall_units=2, carcass="walnut", top="marble", along="x"):
    """Wall run of base cabinets with worktop, hob, sink, tall units (oven + fridge), hood."""
    b = U.box

    def build():
        zf = z_back + depth
        b("base_units", carcass, x0, 0.1, z_back, x1, 0.88, zf, col, bevel=0.003)
        b("plinth", "black", x0, 0.0, z_back, x1, 0.1, zf - 0.06, col)
        b("worktop", top, x0, 0.88, z_back, x1, 0.92, zf + 0.02, col, bevel=0.003)
        b("backsplash", top, x0, 0.92, z_back, x1, 1.55, z_back + 0.02, col)
        n = max(2, round((x1 - x0) / 0.6))
        for i in range(1, n):
            gx = x0 + i * (x1 - x0) / n
            b("door_gap", "black", gx - 0.003, 0.12, zf - 0.002, gx + 0.003, 0.86, zf + 0.002, col)
        b("handle_rail", "brass", x0 + 0.05, 0.84, zf, x1 - 0.05, 0.85, zf + 0.012, col)
        # hob + sink
        hx = x0 + (x1 - x0) * 0.3
        b("hob", "black", hx - 0.4, 0.92, z_back + 0.1, hx + 0.4, 0.925, z_back + 0.55, col)
        b("hood", "dark_metal", hx - 0.45, 1.85, z_back, hx + 0.45, 2.3, z_back + 0.5, col, bevel=0.01)
        sx = x0 + (x1 - x0) * 0.72
        b("sink", "metal", sx - 0.38, 0.75, z_back + 0.12, sx + 0.38, 0.921, z_back + 0.52, col)
        U.cyl("tap", "brass", sx, 0.92, z_back + 0.07, 0.015, 0.32, 12, col=col)
        b("tap_spout", "brass", sx - 0.012, 1.22, z_back + 0.07, sx + 0.012, 1.24, z_back + 0.28, col)
        # upper open shelf
        b("shelf", carcass, sx - 0.9, 1.6, z_back, sx + 0.9, 1.64, z_back + 0.3, col)
        for k in range(5):
            U.cyl(f"jar_{k}", "glass" if k % 2 else "travertine", sx - 0.7 + k * 0.33, 1.64, z_back + 0.15, 0.06, 0.16 + 0.04 * (k % 3), 16, col=col)
        # tall units: oven column + integrated fridge
        tx = x1
        for t in range(tall_units):
            b("tall_unit", carcass, tx, 0.0, z_back, tx + 0.62, 2.35, zf, col, bevel=0.003)
            if t == 0:
                b("oven", "black", tx + 0.04, 0.85, zf, tx + 0.58, 1.45, zf + 0.01, col)
                b("oven_glass", "glass", tx + 0.08, 0.9, zf + 0.01, tx + 0.54, 1.3, zf + 0.012, col)
                b("microwave", "black", tx + 0.04, 1.5, zf, tx + 0.58, 1.88, zf + 0.01, col)
            b("tall_handle", "brass", tx + 0.05, 0.3, zf, tx + 0.07, 2.0, zf + 0.012, col)
            tx += 0.62

    return _tag(_collect(build), "fixture", room, "kitchen")


def island(col, room, x, z, w=2.6, d=1.0, carcass="walnut", top="marble", stools=3, stool_side=-1):
    b = U.box

    def build():
        b("island", carcass, x - w / 2, 0.0, z - d / 2, x + w / 2, 0.9, z + d / 2, col, bevel=0.004)
        oz0, oz1 = (z - d / 2 - 0.25, z + d / 2 + 0.02) if stool_side < 0 else (z - d / 2 - 0.02, z + d / 2 + 0.25)
        b("island_top", top, x - w / 2 - 0.02, 0.9, oz0, x + w / 2 + 0.02, 0.94, oz1, col, bevel=0.004)
        b("waterfall_l", top, x - w / 2 - 0.02, 0.0, oz0, x - w / 2 + 0.02, 0.9, oz1, col)
        b("waterfall_r", top, x + w / 2 - 0.02, 0.0, oz0, x + w / 2 + 0.02, 0.9, oz1, col)
        for i in range(stools):
            sx = x - w / 2 + (i + 0.5) * w / stools
            sz = z + stool_side * (d / 2 + 0.45)
            U.cyl("stool_leg", "dark_metal", sx, 0, sz, 0.02, 0.62, 10, col=col)
            U.cyl("stool_ring", "brass", sx, 0.25, sz, 0.17, 0.015, 24, col=col)
            soft(U.cyl("stool_seat", "fabric", sx, 0.62, sz, 0.2, 0.08, 32, col=col), 1, 0.02)

    return _tag(_collect(build), "fixture", room, "island")


def pendant(col, room, x, z, ceiling_y, drop=0.9, style="rattan"):
    def build():
        U.cyl("pendant_cord", "dark_metal", x, ceiling_y - drop, z, 0.004, drop, 6, col=col)
        if style == "rattan":
            bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.32, location=U.W(x, ceiling_y - drop - 0.18, z))
            o = bpy.context.active_object
            o.name = "pendant_shade"
            o.scale.z = 0.7
            for c in list(o.users_collection):
                c.objects.unlink(o)
            col.objects.link(o)
            o.data.materials.append(U.material("rope"))
            w = o.modifiers.new("weave", "WIREFRAME")
            w.thickness = 0.012
            for p in o.data.polygons:
                p.use_smooth = True
            U.cyl("pendant_bulb", "lamp", x, ceiling_y - drop - 0.28, z, 0.07, 0.12, 16, col=col)
        else:  # brass dome
            U.cyl("pendant_dome", "brass", x, ceiling_y - drop - 0.22, z, 0.24, 0.22, 48, r2=0.03, col=col)
            U.cyl("pendant_diffuser", "lamp", x, ceiling_y - drop - 0.23, z, 0.22, 0.01, 32, col=col)

    return _tag(_collect(build), "decor", room, "pendant")


def fireplace(col, room, x, z, w=2.2, wall_z=None):
    b = U.box

    def build():
        b("fp_mass", "stucco", x - w / 2, 0, z - 0.45, x + w / 2, 1.1, z, col, bevel=0.03)
        b("fp_box", "black", x - 0.7, 0.25, z - 0.02, x + 0.7, 0.8, z + 0.002, col)
        b("fp_fire", "lamp", x - 0.55, 0.28, z - 0.2, x + 0.55, 0.34, z - 0.05, col)
        b("fp_hearth", "travertine", x - w / 2 - 0.2, 0, z, x + w / 2 + 0.2, 0.18, z + 0.5, col, bevel=0.01)
        for k in range(6):  # stacked logs
            U.cyl("log", "walnut", x + w / 2 + 0.05, 0.18 + (k // 3) * 0.12, z + 0.12 + (k % 3) * 0.12, 0.055, 0.55, 12, col=col)

    return _tag(_collect(build), "fixture", room, "fireplace")


def bathroom(col, room, x0, z0, x1, z1, style="stone"):
    """Freestanding tub, double vanity with basins, mirror, walk-in shower glass, WC."""
    b = U.box
    wall = "stone_wall" if style == "stone" else "marble"

    def build():
        b("bath_floor", "travertine" if style == "stone" else "terrazzo", x0, 0.005, z0, x1, 0.015, z1, col)
        tx, tz = x0 + 0.95, (z0 + z1) / 2
        tub = U.cyl("tub", "ceiling", tx, 0.015, tz, 0.55, 0.55, 48, r2=0.6, col=col, bevel=0.03)
        tub.scale = (0.75, 1.4, 1.0)
        b("tub_water", "water", tx - 0.35, 0.5, tz - 0.65, tx + 0.35, 0.505, tz + 0.65, col)
        U.cyl("tub_filler", "brass", tx + 0.55, 0.015, tz + 0.55, 0.02, 0.95, 12, col=col)
        vx = x1 - 0.3
        b("vanity", "walnut", vx - 0.27, 0.35, z0 + 0.3, vx + 0.27, 0.85, z1 - 0.3, col, bevel=0.005)
        b("vanity_top", wall if style != "stone" else "travertine", vx - 0.3, 0.85, z0 + 0.25, vx + 0.3, 0.9, z1 - 0.25, col)
        for zz in (z0 + 0.75, z1 - 0.75):
            U.cyl("basin", "ceiling", vx, 0.9, zz, 0.2, 0.14, 32, r2=0.22, col=col, bevel=0.01)
            U.cyl("bath_tap", "brass", vx + 0.25, 0.9, zz, 0.012, 0.3, 10, col=col)
        b("mirror", "glass", x1 - 0.03, 1.15, z0 + 0.35, x1 - 0.01, 2.05, z1 - 0.35, col)
        b("mirror_frame", "brass", x1 - 0.035, 1.13, z0 + 0.33, x1 - 0.025, 2.07, z1 - 0.33, col)
        b("shower_glass", "glass", x0 + 2.0, 0.02, z0, x0 + 2.01, 2.1, z0 + 1.2, col)
        b("shower_head", "brass", x0 + 2.4, 2.15, z0 + 0.4, x0 + 2.7, 2.17, z0 + 0.7, col)
        b("bath_wall", wall, x0, 0.015, z0 - 0.02, x1, 2.6, z0, col)

    return _tag(_collect(build), "fixture", room, "bathroom")


def lounger(col, room, x, z, rot=0.0, wood="cladding", pad="cushion"):
    """Teak sun lounger with slatted frame, adjustable back and padded mattress."""
    b = U.box

    def build():
        for sx in (-0.33, 0.33):
            b("lg_rail", wood, x + sx - 0.025, 0.18, z - 1.0, x + sx + 0.025, 0.26, z + 1.0, col, bevel=0.005)
        for k in range(14):
            zz = z - 0.95 + k * 0.1
            b("lg_slat", wood, x - 0.33, 0.26, zz, x + 0.33, 0.28, zz + 0.07, col)
        for sx in (-0.3, 0.3):
            for sz in (-0.9, 0.9):
                b("lg_leg", wood, x + sx - 0.03, 0, z + sz - 0.03, x + sx + 0.03, 0.2, z + sz + 0.03, col)
        soft(b("lg_pad", pad, x - 0.32, 0.28, z - 0.98, x + 0.32, 0.36, z + 0.36, col), 1, 0.025)
        # back rest: hinged at (z + 0.36, y 0.30), raised 38 degrees
        an = math.radians(38)
        cs, sn = math.cos(an), math.sin(an)
        for nm, mt, t0, t1 in (("lg_back", pad, 0.0, 0.08), ("lg_backf", wood, -0.03, -0.005)):
            v = []
            for l in (0.0, 0.68):
                for t in (t0, t1):
                    for xx in (-0.32, 0.32):
                        v.append((x + xx, 0.30 + l * sn + t * cs, z + 0.36 + l * cs - t * sn))
            o = U.mesh_from(nm, mt, v, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (2, 3, 7, 6), (0, 4, 5, 1)], col)
            if nm == "lg_back":
                soft(o, 1, 0.025)

    objs = _collect(build)
    if rot:
        rotate_group(objs, x, z, rot)
    return _tag(objs, "furniture", room, "lounger")


def parasol(col, room, x, z, r=1.5):
    def build():
        U.cyl("ps_pole", "cladding", x, 0, z, 0.025, 2.45, 10, col=col)
        U.cyl("ps_base", "travertine", x, 0, z, 0.25, 0.08, 24, col=col)
        bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=r, radius2=0.04, depth=0.42, location=U.W(x, 2.5, z), end_fill_type="NOTHING")
        c = bpy.context.active_object
        c.name = "ps_canopy"
        for cc in list(c.users_collection):
            cc.objects.unlink(c)
        col.objects.link(c)
        c.data.materials.append(U.material("umbrella"))
        s = c.modifiers.new("sol", "SOLIDIFY")
        s.thickness = 0.01

    return _tag(_collect(build), "furniture", room, "parasol")


def books(col, room, x, y, z, n=8, support=None):
    def build():
        xx = x
        for i in range(n):
            t = R.uniform(0.025, 0.05)
            h = R.uniform(0.2, 0.28)
            U.box("book", ["walnut", "fabric", "rope", "black", "travertine"][i % 5], xx, y, z - 0.08, xx + t, y + h, z + 0.08, col)
            xx += t + 0.003

    return _tag(_collect(build), "decor", room, "books", support)
