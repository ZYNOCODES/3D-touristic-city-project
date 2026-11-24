"""The hotel: a slim curved tower with wave-like terraces, lobby, infinity-pool terrace, sea stairs and sea deck.
Outputs public/models/hotel.glb and src/data/generated/hotel.json (rooms, seats, people anchors)."""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402
import furniture as F  # noqa: E402
from mathutils import Vector  # noqa: E402
from mathutils.bvhtree import BVHTree  # noqa: E402

R = random.Random(11)
TY = 10.3                # pool terrace level
CX, CZ, R0 = 0.0, -160.0, 66.0   # facade arc
BAYS, BW = 7, 6.2
DTH = BW / R0
FLOORS, FH = 19, 3.3
LOBBY = 6.2
Y1 = TY + LOBBY          # first room floor
DEPTH = 10.5
TOP = Y1 + FLOORS * FH


def bays_of(f):
    """bays present on room floor f (1-based): the west shoulder steps back like a sail."""
    cut = 0
    for lim in (14, 16, 18, 19):
        if f >= lim:
            cut += 1
    return list(range(cut, BAYS))


def th(b):
    """angle of bay edge b (0..BAYS)"""
    return (b - BAYS / 2) * DTH


def P(theta, r, y):
    return (CX + r * math.sin(theta), y, CZ + r * math.cos(theta))


def edge(theta, f):
    """terrace depth in front of the glass line: travelling wave"""
    s = theta / DTH
    return 2.05 + 1.35 * math.sin(s * 1.12 + f * 0.36) * (0.75 + 0.25 * math.sin(f * 0.5)) + 0.22 * math.sin(s * 2.6 - f * 0.7)


def ring(name, mat, t0, t1, rin, rout, y0, y1, col, n=None, soffit=None, smooth=True, caps=True):
    """curved slab between two radius functions"""
    n = n or max(8, int((t1 - t0) / DTH * 12))
    ts = np.linspace(t0, t1, n + 1)
    v, f, fs = [], [], []
    for t in ts:
        a, b = rin(t), rout(t)
        v += [P(t, a, y0), P(t, b, y0), P(t, b, y1), P(t, a, y1)]
    for i in range(n):
        a, b = i * 4, i * 4 + 4
        f.append((a + 1, b + 1, b + 2, a + 2))           # outer
        f.append((a + 3, a + 2, b + 2, b + 3))           # top
        f.append((a, a + 3, b + 3, b))                   # inner
        fs.append((a, b, b + 1, a + 1))                  # bottom
    if caps:
        f.append((0, 1, 2, 3))
        e = n * 4
        f.append((e + 3, e + 2, e + 1, e))
    o = U.mesh_from(name, mat, v, f + ([] if soffit else fs), col)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    if smooth:
        o.data.shade_auto_smooth(angle=0.6) if hasattr(o.data, "shade_auto_smooth") else None
        for p in o.data.polygons:
            p.use_smooth = True
        o.data.set_sharp_from_angle(angle=0.6)
    if soffit:
        o2 = U.mesh_from(name + "_soffit", soffit, v, fs, col)
        for p in o2.data.polygons:
            if p.normal.z > 0:
                p.flip()
    return o


def wave_ribbon(name, mat, t0, t1, rin, rout, yb, yt, col, n):
    ts = np.linspace(t0, t1, n + 1)
    v, f = [], []
    for t in ts:
        a, b, lo, hi = rin(t), rout(t), yb(t), yt(t)
        m = (lo + hi) / 2
        v += [P(t, a, lo), P(t, b - 0.05, lo), P(t, b + 0.03, m), P(t, b - 0.05, hi), P(t, a, hi)]
    for i in range(n):
        a, b = i * 5, i * 5 + 5
        for k in range(5):
            k2 = (k + 1) % 5
            f.append((a + k, b + k, b + k2, a + k2))
    f += [tuple(range(5)), tuple(reversed(range(n * 5, n * 5 + 5)))]
    o = U.mesh_from(name, mat, v, f, col, smooth=True)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    o.data.set_sharp_from_angle(angle=0.7)
    return o


def ribbon(name, mat, t0, t1, rf, y0, y1, col, n=None, thick=0.0):
    return ring(name, mat, t0, t1, lambda t: rf(t) - thick, rf, y0, y1, col, n)


def obox(name, mat, theta, r0, r1, w, y0, y1, col, off=0.0):
    """box aligned with the facade tangent at angle theta (off = tangential offset)"""
    c, s = math.cos(theta), math.sin(theta)
    v = []
    for y in (y0, y1):
        for r, t in ((r0, off - w / 2), (r1, off - w / 2), (r1, off + w / 2), (r0, off + w / 2)):
            v.append((CX + r * s + t * c, y, CZ + r * c - t * s))
    f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    o = U.mesh_from(name, mat, v, f, col)
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data)
    bm.free()
    return o


def tower(col):
    rooms = []
    for f in range(1, FLOORS + 2):
        y = Y1 + (f - 1) * FH
        below = bays_of(f - 1) if f > 1 else list(range(BAYS))
        t0, t1 = th(below[0]) - 0.012, th(BAYS) + 0.012

        def out(t, f=f):
            # taper the wave to the facade at both ends so the terraces look carved
            k = min(1.0, (t - t0) / (DTH * 0.8), (t1 - t) / (DTH * 0.8))
            k = max(0.0, k)
            return R0 + 0.35 + (edge(t, f) - 0.35) * (1 - (1 - k) ** 2)
        ring(f"slab{f}", "hotel_white", t0, t1, lambda t: R0 - DEPTH, out, y - 0.34, y, col, n=len(below) * 12, soffit=None)
        # sculpted parapet ribbon: swells and thins along the facade, so the bands read as flowing waves
        def crest(t, f=f):
            return max(0.0, math.sin((t / DTH) * 1.12 + f * 0.36 + 0.9)) ** 1.5 * min(1.0, (t - t0) / (DTH * 0.7), (t1 - t) / (DTH * 0.7))
        wave_ribbon(f"ribbon{f}", "hotel_white", t0, t1, lambda t: out(t) - 0.10, lambda t: out(t) + 0.06, lambda t: y - 0.36 - 0.42 * crest(t), lambda t: y + 0.10 + 0.92 * crest(t), col, n=len(below) * 14)
        # recessed timber soffit and a thin shadow gap under every terrace
        ring(f"soffit{f}", "cladding", t0 + 0.01, t1 - 0.01, lambda t: R0 - 0.02, lambda t: out(t) - 0.28, y - 0.365, y - 0.341, col, n=len(below) * 10)
        # downlight strip
        for b in below:
            if f > 1:
                obox("dl", "lamp", (th(b) + th(b + 1)) / 2, R0 + 0.55, R0 + 0.63, 0.08, y - 0.375, y - 0.366, col)
        if f > 1 or True:
            # frameless balustrade following the wave
            gl0, gl1 = t0 + 0.018, t1 - 0.018
            ribbon(f"bal{f}", "glass_rail", gl0, gl1, lambda t: out(t) - 0.09, y, y + 1.06, col, n=len(below) * 10)
            ring(f"cap{f}", "bronze", gl0, gl1, lambda t: out(t) - 0.115, lambda t: out(t) - 0.065, y + 1.06, y + 1.085, col, n=len(below) * 10)
            ring(f"shoe{f}", "bronze", gl0, gl1, lambda t: out(t) - 0.125, lambda t: out(t) - 0.055, y, y + 0.05, col, n=len(below) * 8)
        if f > FLOORS:
            break
        bs = bays_of(f)
        # terrace floor
        ring(f"deck{f}", "deck", t0 + 0.012, t1 - 0.012, lambda t: R0 + 0.02, lambda t: out(t) - 0.16, y, y + 0.02, col, n=len(below) * 8)
        for b in bs:
            tm = (th(b) + th(b + 1)) / 2
            yt = y + FH - 0.34
            # bronze sliding frames (the glass itself is instanced in the web app)
            hw = BW / 2 - 0.16
            for k, off in enumerate((-hw, -hw / 3, hw / 3, hw)):
                obox("mull", "bronze", tm, R0 - 0.05, R0 + 0.03, 0.06, y + 0.02, yt - 0.22, col, off)
            obox("sill", "bronze", tm, R0 - 0.05, R0 + 0.04, 2 * hw, y + 0.02, y + 0.07, col)
            obox("head", "bronze", tm, R0 - 0.05, R0 + 0.03, 2 * hw, yt - 0.28, yt - 0.2, col)
            obox("bulk", "hotel_white", tm, R0 - 0.14, R0, BW - 0.1, yt - 0.2, yt, col)
            rooms.append({"floor": f, "bay": b, "theta": round(tm, 5), "y": round(y + 0.02, 3)})
        for b in bs + [BAYS]:
            t = th(b)
            o = out(t)
            end = b in (bs[0], BAYS)
            obox("party", "hotel_white", t, R0 - (DEPTH if end else 0.2), R0 + 0.14, 0.26, y, y + FH - 0.34, col)
            if not end:
                # slatted timber privacy screen
                L = min(o - R0 - 0.45, 1.7)
                for k in range(int(L / 0.085)):
                    obox("slat", "cladding", t, R0 + 0.18 + k * 0.085, R0 + 0.215 + k * 0.085, 0.05, y + 0.02, y + FH - 0.36, col)
            elif b == BAYS or f >= 14:
                # gable: travertine with a vertical glazed slot
                side = 0.17 if b == BAYS else -0.17
                obox("gable", "travertine", t, R0 - DEPTH, R0 - 5.2, 0.1, y - 0.34, y + FH - 0.34, col, side)
                obox("gable", "travertine", t, R0 - 4.3, R0 + 0.14, 0.1, y - 0.34, y + FH - 0.34, col, side)
                obox("slot", "dark_glass", t, R0 - 5.2, R0 - 4.3, 0.06, y, y + FH - 0.34, col, side)
        # terrace furniture: two chairs and a table on most balconies, planter at wave crests
        for b in bs:
            tm = (th(b) + th(b + 1)) / 2
            d = out(tm) - R0
            if d > 1.55 and R.random() < 0.8:
                for off in (-1.5, -0.45):
                    obox("seat", "cushion", tm, R0 + 0.55, R0 + 1.1, 0.56, y + 0.3, y + 0.42, col, off)
                    obox("back", "cushion", tm, R0 + 0.45, R0 + 0.57, 0.56, y + 0.4, y + 0.82, col, off)
                    obox("fr", "cladding", tm, R0 + 0.5, R0 + 1.12, 0.62, y + 0.2, y + 0.3, col, off)
                obox("tab", "travertine", tm, R0 + 0.7, R0 + 1.1, 0.4, y + 0.02, y + 0.4, col, -0.98)
            if d > 2.2:
                t2 = th(b) + DTH * 0.82
                obox("pl", "travertine", t2, out(t2) - 0.72, out(t2) - 0.24, 1.3, y + 0.02, y + 0.52, col)
                rooms[-1].setdefault("x", 0)
                PLANTERS.append([*(round(q, 2) for q in P(t2, out(t2) - 0.48, y + 0.5)), 0.62])
    # back wall and floors of the corridor zone
    for f in range(1, FLOORS + 1):
        y = Y1 + (f - 1) * FH
        bs = bays_of(f)
        ring(f"back{f}", "hotel_white", th(bs[0]), th(BAYS), lambda t: R0 - DEPTH, lambda t: R0 - DEPTH + 0.3, y - 0.34, y + FH - 0.34, col, n=14)
    roof_top(col)
    return rooms


PLANTERS = []
PEOPLE = {"pool_loungers": [], "deck_loungers": [], "bar": [], "sky": [], "terrace_walk": [], "stairs": [], "balcony": []}


def roof_top(col):
    y = Y1 + FLOORS * FH
    # thin sail roof over the sky bar
    t0, t1 = th(4) + 0.02, th(BAYS) - 0.01
    ring("sailroof", "hotel_white", t0, t1, lambda t: R0 - 8.5, lambda t: R0 + 1.2 + 0.7 * math.sin((t - t0) / DTH * 2.2), y + 3.4, y + 3.62, col, n=40, soffit=None)
    ring("sailsoffit", "cladding", t0 + .01, t1 - .01, lambda t: R0 - 8.3, lambda t: R0 + 0.95 + 0.7 * math.sin((t - t0) / DTH * 2.2), y + 3.375, y + 3.4, col, n=30)
    for k in range(6):
        t = t0 + (t1 - t0) * (k + 0.5) / 6
        for rr in (R0 - 7.6, R0 - 0.6):
            p = P(t, rr, y)
            U.cyl("col", "bronze", p[0], y, p[2], 0.07, 3.4, 14, col=col)
    ring("bar", "travertine", th(5), th(6.6), lambda t: R0 - 6.4, lambda t: R0 - 5.7, y, y + 1.08, col, n=16)
    ring("bartop", "walnut", th(5), th(6.6), lambda t: R0 - 6.5, lambda t: R0 - 5.5, y + 1.08, y + 1.13, col, n=16)
    ring("barback", "cladding", th(4.6), th(6.9), lambda t: R0 - 8.6, lambda t: R0 - 8.4, y, y + 3.4, col, n=20)
    for k in range(5):
        p = P(th(5.15 + k * 0.32), R0 - 5.0, y)
        U.cyl("stool", "walnut", p[0], y + 0.68, p[2], 0.19, 0.06, 18, col=col)
        U.cyl("stl", "bronze", p[0], y, p[2], 0.025, 0.68, 8, col=col)
    for k in range(4):
        t = th(3.7 + k * 0.85)
        obox("sofa", "cushion", t, R0 - 2.6, R0 - 1.8, 2.2, y + 0.18, y + 0.42, col)
        obox("sofab", "cushion", t, R0 - 2.75, R0 - 2.5, 2.2, y + 0.18, y + 0.78, col)
        obox("tbl", "travertine", t, R0 - 1.35, R0 - 0.75, 1.0, y, y + 0.36, col)
        PEOPLE["sky"].append([*(round(q, 2) for q in P(t, R0 - 2.15, y + 0.42)), round(t, 3)])
    # stepped shoulders: roof gardens
    for f, b in ((14, 0), (16, 1), (18, 2), (19, 3)):
        yy = Y1 + (f - 1) * FH
        tm = (th(b) + th(b + 1)) / 2
        obox("garden", "deck", tm, R0 - 8, R0, BW - 0.4, yy, yy + 0.03, col)
        for off in (-2.3, 2.3):
            obox("gpl", "travertine", tm, R0 - 7.5, R0 - 0.6, 0.7, yy, yy + 0.55, col, off)
            for k in range(4):
                c, s = math.cos(tm), math.sin(tm)
                r = R0 - 1.4 - k * 1.8
                PLANTERS.append([round(CX + r * s + off * c, 2), round(yy + 0.52, 2), round(CZ + r * c - off * s, 2), 0.75])
        obox("pergb", "cladding", tm, R0 - 5.6, R0 - 5.4, 4.0, yy + 2.5, yy + 2.62, col)


def lobby(col):
    y = TY
    # monumental canopy slab = first terrace; slanted sculptural columns
    n = 8
    for k in range(n):
        t = th(0.25 + k * (BAYS - 0.5) / (n - 1))
        lean = (-1) ** k * 1.15
        a, b = P(t, R0 + 0.7, y), P(t + lean / R0, R0 + 1.3, y + LOBBY - 0.34)
        vs, fs = [], []
        seg = 18
        for j in range(9):
            q = j / 8
            c = [a[i] + (b[i] - a[i]) * q for i in range(3)]
            rad = 0.30 + 0.34 * (abs(q - 0.35) * 1.4) ** 2 + 0.25 * max(0, q - 0.75) ** 1.4
            for i in range(seg):
                an = i / seg * math.tau
                vs.append((c[0] + math.cos(an) * rad, c[1], c[2] + math.sin(an) * rad))
        for j in range(8):
            for i in range(seg):
                i2 = (i + 1) % seg
                fs.append((j * seg + i, (j + 1) * seg + i, (j + 1) * seg + i2, j * seg + i2))
        U.mesh_from("vcol", "hotel_white", vs, fs, col, smooth=True)
    # tall glazing with bronze fins
    for b in range(BAYS):
        for k in range(4):
            t = th(b) + DTH * k / 4
            obox("fin", "bronze", t, R0 - 2.2, R0 - 1.85, 0.07, y, y + LOBBY - 0.34, col)
    ring("lobglass", "dark_glass", th(0), th(BAYS), lambda t: R0 - 2.12, lambda t: R0 - 2.08, y, y + LOBBY - 0.34, col, n=56)
    ring("lobback", "cladding", th(0), th(BAYS), lambda t: R0 - DEPTH, lambda t: R0 - DEPTH + 0.2, y, y + LOBBY - 0.34, col, n=40)
    ring("lobfloor", "travertine", th(0), th(BAYS), lambda t: R0 - DEPTH, lambda t: R0 - 2.0, y + 0.005, y + 0.02, col, n=40)
    for b in (0, BAYS):
        obox("lobend", "stone_wall", th(b), R0 - DEPTH, R0 + 0.2, 0.5, y - 0.5, y + LOBBY - 0.34, col)
    # entrance portal
    obox("portal", "walnut", 0, R0 - 2.3, R0 - 1.2, 0.25, y, y + 3.6, col, -2.4)
    obox("portal", "walnut", 0, R0 - 2.3, R0 - 1.2, 0.25, y, y + 3.6, col, 2.4)
    obox("portalt", "walnut", 0, R0 - 2.3, R0 - 1.2, 5.05, y + 3.6, y + 3.85, col)


def poly_slab(name, mat, pts, y0, y1, col, side=None):
    n = len(pts)
    v = [(x, y1, z) for x, z in pts] + [(x, y0, z) for x, z in pts]
    top = [tuple(range(n))]
    sides = [(i, (i + 1) % n, (i + 1) % n + n, i + n) for i in range(n)]

    def fix(o):
        bm = bmesh.new()
        bm.from_mesh(o.data)
        bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
        bm.to_mesh(o.data)
        bm.free()
    o = U.mesh_from(name, mat, v, top, col)
    for p in o.data.polygons:
        if p.normal.z < 0:
            p.flip()
    fix(o)
    o2 = U.mesh_from(name + "_side", side or mat, v, sides, col)
    bm = bmesh.new()
    bm.from_mesh(o2.data)
    ar = sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n))
    if ar < 0:
        bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(o2.data)
    bm.free()
    return o


def front_z(x):
    """curved sea edge of the terrace"""
    return -53.6 + 1.3 * math.cos(x / 16.0)


POOL = (-19.0, 13.0, -67.5)   # x0, x1, back z (front = infinity edge)


def in_pool(x, z):
    return POOL[0] < x < POOL[1] and z > POOL[2]


def terrace(col):
    # terrace plate around the pool
    xs = np.linspace(-41, 41, 83)
    front = [(x, front_z(x)) for x in xs]
    pf = [(x, front_z(x)) for x in np.linspace(POOL[0], POOL[1], 33)]
    west = [(x, z) for x, z in front if x < POOL[0] - 0.01] + [(POOL[0], front_z(POOL[0])), (POOL[0], POOL[2])]
    poly_slab("terrW", "terrace", [(-41, -100)] + west + [(POOL[0], -100)], TY - 0.4, TY, col, "stone_wall")
    poly_slab("terrM", "terrace", [(POOL[0], -100), (POOL[0], POOL[2]), (POOL[1], POOL[2]), (POOL[1], -100)], TY - 0.4, TY, col, "stone_wall")
    poly_slab("terrE", "terrace", [(POOL[1], -100), (POOL[1], POOL[2]), (POOL[1], front_z(POOL[1]))] + [(x, z) for x, z in front if x > POOL[1] + 0.01] + [(41, -100)], TY - 0.4, TY, col, "stone_wall")
    # retaining wall down to the natural rock
    v, f = [], []
    for i, x in enumerate(np.linspace(-41, 41, 120)):
        z = front_z(x) - 0.06
        v += [(x, TY - 0.38, z), (x, TY - 2.1, z + 0.12)]
        if i:
            a = (i - 1) * 2
            f.append((a, a + 1, a + 3, a + 2))
    U.mesh_from("retain", "stone_wall", v, f + [tuple(reversed(q)) for q in f], col)
    for sx in (-41, 41):
        U.mesh_from("retain2", "stone_wall", [(sx, TY - 0.38, -100), (sx, TY - 2, -100), (sx, TY - 2.1, front_z(sx) + 0.1), (sx, TY - 0.38, front_z(sx))], [(0, 1, 2, 3), (3, 2, 1, 0)], col)
    # pool: shell, overflow edge and water
    fl = TY - 1.5
    poly_slab("poolfloor", "pooltile", [(POOL[0], POOL[2])] + [(x, z) for x, z in pf] + [(POOL[1], POOL[2])], fl - 0.2, fl, col)
    ring_w = [(POOL[0], POOL[2]), *pf, (POOL[1], POOL[2])]
    for i in range(len(ring_w)):
        a, b = ring_w[i], ring_w[(i + 1) % len(ring_w)]
        inf = i >= 1 and i < len(ring_w) - 2
        top = TY - 0.07 if inf else TY - 0.0
        U.mesh_from("poolwall", "pooltile", [(a[0], fl, a[1]), (b[0], fl, b[1]), (b[0], top, b[1]), (a[0], top, a[1])], [(0, 1, 2, 3), (3, 2, 1, 0)], col)
    # steps + bench inside the pool
    for k in range(4):
        U.box("pstep", "pooltile", POOL[1] - 1.6 + k * 0.4, fl, POOL[2], POOL[1] - 1.2 + k * 0.4, fl + 0.3 * (k + 1), POOL[2] + 4.5, col)
    U.box("bench", "pooltile", POOL[0], fl, POOL[2], POOL[1] - 1.6, TY - 0.5, POOL[2] + 0.5, col)
    # infinity lip and catch basin
    v, f = [], []
    for i, (x, z) in enumerate(pf):
        v += [(x, TY - 0.07, z), (x, TY - 0.10, z + 0.34), (x, TY - 1.5, z + 0.40)]
        if i:
            a = (i - 1) * 3
            f += [(a, a + 1, a + 4, a + 3), (a + 1, a + 2, a + 5, a + 4)]
    U.mesh_from("lip", "pooltile", v, f, col)
    v, f = [], []
    for i, (x, z) in enumerate(pf):
        v += [(x, TY - 0.055, POOL[2]), (x, TY - 0.055, z + 0.02), (x, TY - 0.085, z + 0.36), (x, TY - 1.5, z + 0.43)]
        if i:
            a = (i - 1) * 4
            f += [(a, a + 1, a + 5, a + 4), (a + 1, a + 2, a + 6, a + 5), (a + 2, a + 3, a + 7, a + 6)]
    U.mesh_from("poolwater", "water", v, f, col)
    poly_slab("catch", "travertine", [(POOL[0] - .4, front_z(POOL[0]) + .2)] + [(x, z + 1.15) for x, z in pf] + [(POOL[1] + .4, front_z(POOL[1]) + .2)], TY - 2.0, TY - 1.55, col, "stone_wall")
    # coping
    U.box("cop", "travertine", POOL[0] - 0.5, TY, POOL[2] - 0.5, POOL[1] + 0.5, TY + 0.03, POOL[2], col, bevel=0.01)
    U.box("cop", "travertine", POOL[0] - 0.5, TY, POOL[2], POOL[0], TY + 0.03, front_z(POOL[0]), col, bevel=0.01)
    U.box("cop", "travertine", POOL[1], TY, POOL[2], POOL[1] + 0.5, TY + 0.03, front_z(POOL[1]), col, bevel=0.01)
    # glass balustrade on both sides of the infinity edge (gap for the sea stair at x 24..28)
    for a, b in ((-40.8, POOL[0] - 0.2), (POOL[1] + 0.2, 23.6), (28.4, 40.8)):
        q = np.linspace(a, b, 24)
        v, f = [], []
        for i, x in enumerate(q):
            z = front_z(x) - 0.22
            v += [(x, TY, z), (x, TY + 1.05, z)]
            if i:
                k = (i - 1) * 2
                f.append((k, k + 2, k + 3, k + 1))
        U.mesh_from("tbal", "glass_rail", v, f, col, smooth=True)
        for i in range(len(q) - 1):
            p0, p1 = (q[i], front_z(q[i]) - 0.22), (q[i + 1], front_z(q[i + 1]) - 0.22)
            for yy, hh in ((TY + 1.05, 0.03), (TY, 0.06)):
                U.mesh_from("tcap", "bronze", [(p0[0], yy, p0[1] - .03), (p1[0], yy, p1[1] - .03), (p1[0], yy, p1[1] + .03), (p0[0], yy, p0[1] + .03),
                                               (p0[0], yy + hh, p0[1] - .03), (p1[0], yy + hh, p1[1] - .03), (p1[0], yy + hh, p1[1] + .03), (p0[0], yy + hh, p0[1] + .03)],
                            [(4, 5, 6, 7), (0, 1, 5, 4), (2, 3, 7, 6), (1, 2, 6, 5), (3, 0, 4, 7)], col)
    # loungers + parasols in pairs behind and beside the pool
    def lift(objs, y):
        for o in objs:
            o.location.z += y
    spots = []
    for k in range(6):
        spots.append((POOL[0] + 2.2 + k * 5.2, POOL[2] - 2.6, math.pi))
    for k in range(3):
        spots.append((POOL[0] - 4.2, -66.0 + k * 3.4, math.pi * 0.5 + 1.2))
        spots.append((POOL[1] + 3.8, -66.0 + k * 3.2, -math.pi * 0.5 - 1.2))
    for i, (x, z, rot) in enumerate(spots):
        c, s = math.cos(rot), math.sin(rot)
        for off in (-0.62, 0.62):
            lx, lz = x + off * c, z - off * s
            lift(F.lounger(col, "pool", lx, lz, rot, pad="towel" if (i + (off > 0)) % 3 == 0 else "cushion"), TY)
            PEOPLE["pool_loungers"].append([round(lx, 2), TY, round(lz, 2), round(rot, 3)])
        if i % 2 == 0 or i >= 6:
            lift(F.parasol(col, "pool", x, z + (0.5 if i < 6 else 0), 1.55), TY)
    # day cabanas against the east wall
    for k in range(3):
        x, z = 35.5, -90 + k * 7.5
        for sx in (-1.8, 1.8):
            for sz in (-1.7, 1.7):
                U.box("cab", "cladding", x + sx - 0.06, TY, z + sz - 0.06, x + sx + 0.06, TY + 2.6, z + sz + 0.06, col)
        for j in range(12):
            U.box("cabr", "cladding", x - 1.9 + j * 0.33, TY + 2.6, z - 1.8, x - 1.82 + j * 0.33, TY + 2.72, z + 1.8, col)
        F.soft(U.box("cabbed", "cushion", x - 1.1, TY + 0.3, z - 1.2, x + 1.2, TY + 0.55, z + 1.2, col), 1, 0.05)
        U.box("cabbase", "travertine", x - 1.2, TY, z - 1.3, x + 1.3, TY + 0.3, z + 1.3, col)
        for sz in (-1.7, 1.7):
            U.box("drape", "curtain", x - 1.8, TY + 0.05, z + sz - 0.04, x - 1.2, TY + 2.6, z + sz + 0.04, col)
    # pool bar, west
    U.box("pbar", "travertine", -37, TY, -84, -29, TY + 1.1, -83.2, col, bevel=0.02)
    U.box("pbart", "walnut", -37.2, TY + 1.1, -84.2, -28.8, TY + 1.16, -82.8, col, bevel=0.01)
    U.box("pbarb", "cladding", -37, TY, -88.2, -29, TY + 2.4, -88, col)
    U.box("pbarr", "hotel_white", -38, TY + 3.0, -89, -28, TY + 3.2, -81, col, bevel=0.03)
    for x, z in ((-37.4, -88.4), (-28.6, -88.4), (-37.4, -81.6), (-28.6, -81.6)):
        U.cyl("pbp", "bronze", x, TY, z, 0.07, 3.0, 12, col=col)
    for k in range(5):
        x = -36 + k * 1.6
        U.cyl("st", "walnut", x, TY + 0.7, -82.2, 0.19, 0.06, 18, col=col)
        U.cyl("stl", "bronze", x, TY, -82.2, 0.025, 0.7, 8, col=col)
        PEOPLE["bar"].append([round(x, 2), TY, -81.9, math.pi])
    # planters and palms / pines in stone beds
    for x0, z0, x1, z1 in ((-27, -97, -23, -84), (23, -97, 27, -84), (-40, -78, -37, -60), (37, -66, 40, -59)):
        U.box("bed", "travertine", x0, TY, z0, x1, TY + 0.45, z1, col, bevel=0.02)
        U.box("soil", "soil", x0 + 0.15, TY + 0.44, z0 + 0.15, x1 - 0.15, TY + 0.47, z1 - 0.15, col)
        for _ in range(int((x1 - x0) * (z1 - z0) * 0.8)):
            PLANTERS.append([round(R.uniform(x0 + .5, x1 - .5), 2), TY + 0.45, round(R.uniform(z0 + .5, z1 - .5), 2), round(R.uniform(0.6, 1.1), 2)])
        TREES.append([round((x0 + x1) / 2, 2), TY + 0.45, round((z0 + z1) / 2, 2), round(R.uniform(0.75, 0.95), 2)])
    # bollard lights
    for x in np.linspace(-38, 38, 14):
        z = front_z(x) - 0.75
        if not (POOL[0] - 1 < x < POOL[1] + 1 or 23 < x < 29):
            U.cyl("boll", "bronze", x, TY, z, 0.06, 0.62, 12, col=col)
            U.cyl("bolll", "lamp", x, TY + 0.62, z, 0.055, 0.1, 12, col=col)


TREES = []
DECK_Y = 1.35


def sea_access(col):
    """stone stair from the terrace to a timber deck on the water, with swim ladders"""
    # upper flight going east→ along the retaining wall, landing, lower flight to the deck
    def flight(x0, z0, x1, z1, y0, y1, w):
        n = int(round(abs(y1 - y0) / 0.165))
        dx, dz = (x1 - x0) / n, (z1 - z0) / n
        L = math.hypot(dx, dz)
        px, pz = -dz / L * w / 2, dx / L * w / 2
        for i in range(n):
            y = y0 + (y1 - y0) * (i + 1) / n
            a, b = (x0 + dx * i, z0 + dz * i), (x0 + dx * (i + 1.04), z0 + dz * (i + 1.04))
            v = [(a[0] - px, y, a[1] - pz), (a[0] + px, y, a[1] + pz), (b[0] + px, y, b[1] + pz), (b[0] - px, y, b[1] - pz)]
            v += [(q[0], q[1] - 0.12, q[2]) for q in v]
            o = U.mesh_from("stair", "travertine", v, [(0, 1, 2, 3), (4, 5, 1, 0), (5, 6, 2, 1), (6, 7, 3, 2), (7, 4, 0, 3)], col)
            bm = bmesh.new()
            bm.from_mesh(o.data)
            bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
            bm.to_mesh(o.data)
            bm.free()
        for s in (-1, 1):
            # slim bronze handrail
            q0 = (x0 + s * px, y0 + 0.95, z0 + s * pz)
            q1 = (x1 + s * px, y1 + 0.95, z1 + s * pz)
            tube("rail", "bronze", [q0, q1], 0.022, col)
            for i in range(0, n + 1, 5):
                t = i / n
                q = [q0[k] + (q1[k] - q0[k]) * t for k in range(3)]
                U.cyl("post", "bronze", q[0], q[1] - 0.95, q[2], 0.014, 0.95, 8, col=col)
    flight(26, -54.4, 26, -48.4, TY, 6.1, 2.6)
    U.box("land", "travertine", 24.4, 5.5, -48.5, 28.0, 6.1, -45.6, col, bevel=0.02)
    for px in (24.8, 27.6):
        for pz in (-48.1, -45.95):
            U.cyl("lpost", "pile", px, -6, pz, 0.17, 11.5, 16, col=col)
    for px in (24.75, 27.25):
        tube("string", "bronze", [(px, TY - 0.45, -54.3), (px, 5.75, -48.4)], 0.09, col)
    flight(24.4, -47.7, 17.2, -47.7, 6.1, DECK_Y + 0.02, 2.6)
    for pz in (-48.95, -46.45):
        tube("string", "bronze", [(24.4, 5.75, pz), (17.3, DECK_Y - 0.2, pz)], 0.09, col)
    # deck
    pts = [(-6, -51.0), (17.5, -51.0), (19.5, -46.5), (19.5, -41.8), (15, -39.6), (8, -38.9), (1, -39.4), (-4.5, -41.5), (-7, -45)]
    poly_slab("seadeck", "deck", pts, DECK_Y - 0.16, DECK_Y, col, "cladding")
    for x in np.arange(-5, 19, 3.4):
        for z in (-49.5, -45.2, -41.4):
            if -6 < x < 19:
                U.cyl("pile", "pile", x, -6, z, 0.2, 6 + DECK_Y - 0.15, 14, col=col)
    # swim ladders
    for x, z, rot in ((11.5, -39.15, 0), (3.5, -39.1, 0), (-5.9, -43.2, -0.9)):
        c, s = math.cos(rot), math.sin(rot)
        for off in (-0.24, 0.24):
            p = [(x + off * c, DECK_Y + 0.9, z - 0.35 - off * s * 0), (x + off * c, DECK_Y + 0.95, z + 0.05), (x + off * c, DECK_Y, z + 0.16), (x + off * c, -1.3, z + 0.2)]
            tube("ladder", "metal", p, 0.021, col)
        for k in range(7):
            yy = DECK_Y - 0.25 - k * 0.3
            tube("rung", "metal", [(x - 0.24 * c, yy, z + 0.18), (x + 0.24 * c, yy, z + 0.18)], 0.018, col)
    for k, (x, z, rot) in enumerate(((-2.6, -48.2, 0.15), (-0.9, -48.3, 0.1), (3.4, -48.4, -0.05), (5.1, -48.4, 0.04), (9.2, -48.2, -0.1), (10.9, -48.1, -0.05), (14.6, -48.2, 0.0))):
        for o in F.lounger(col, "deck", x, z, rot + math.pi, pad="towel" if k % 2 else "cushion"):
            o.location.z += DECK_Y
        PEOPLE["deck_loungers"].append([x, DECK_Y, z, round(rot + math.pi, 3)])
        if k % 2 == 0 and k < 6:
            for o in F.parasol(col, "deck", x + 0.85, z + 0.3, 1.5):
                o.location.z += DECK_Y
    # towel stand & a couple of paddle boards leaning against the wall
    U.box("tstand", "cladding", 16.2, DECK_Y, -50.8, 17.2, DECK_Y + 1.1, -50.2, col)
    for k in range(5):
        F.soft(U.box("towels", "towel", 16.3, DECK_Y + 0.15 + k * 0.17, -50.75, 17.1, DECK_Y + 0.29 + k * 0.17, -50.25, col), 1, 0.03)


def tube(name, mat, pts, r, col, seg=8):
    pts = [Vector(q) for q in pts]
    v, f = [], []
    for i, q in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        u = d.cross(Vector((0, 1, 0) if abs(d.y) < 0.9 else (1, 0, 0))).normalized()
        w = d.cross(u)
        for k in range(seg):
            a = k / seg * math.tau
            v.append(tuple(q + (u * math.cos(a) + w * math.sin(a)) * r))
    for i in range(len(pts) - 1):
        for k in range(seg):
            k2 = (k + 1) % seg
            f.append((i * seg + k, i * seg + k2, (i + 1) * seg + k2, (i + 1) * seg + k))
    return U.mesh_from(name, mat, v, f, col, smooth=True)


def ground_bvh():
    d = np.load(C.CACHE / "cove_near.npz")
    v = d["v"]
    vv = [Vector((a, -c, b)) for a, b, c in v]
    return BVHTree.FromPolygons(vv, d["t"].tolist())


def ground(bvh, x, z):
    h = bvh.ray_cast(Vector((x, -z, 120)), Vector((0, 0, -1)))[0]
    return h.z if h else None


def jump_trail(col, bvh):
    """stepping-stone trail with a rope rail from the terrace to the jump rocks"""
    path = [(-41, -70), (-46, -62), (-48, -52), (-47, -42), (-44.5, -33), (-41, -24), (-39, -17.5)]
    prev = None
    side = []
    for a, b in zip(path, path[1:]):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        for i in range(int(L / 0.85)):
            t = i * 0.85 / L
            x, z = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
            y = ground(bvh, x, z)
            if y is None:
                continue
            ang = math.atan2(b[0] - a[0], b[1] - a[1]) + R.uniform(-0.12, 0.12)
            w, d = R.uniform(0.75, 0.95), R.uniform(0.32, 0.4)
            c, s = math.cos(ang), math.sin(ang)
            n = 7
            pts = []
            for k in range(n):
                q = k / n * math.tau
                rx, rz = math.cos(q) * w * R.uniform(0.85, 1.05), math.sin(q) * d * R.uniform(0.85, 1.05)
                pts.append((x + rx * c + rz * s, z - rx * s + rz * c))
            poly_slab("step", "terrace", pts, y - 0.35, y + 0.09, col)
            if i % 3 == 0:
                side.append((x - 1.1 * c, y, z + 1.1 * s))
    last = None
    for p in side:
        g = ground(bvh, p[0], p[2])
        if g is None or abs(g - p[1]) > 1.6:
            last = None
            continue
        U.cyl("rp", "cladding", p[0], g - 0.2, p[2], 0.045, 1.2, 8, col=col)
        top = (p[0], g + 0.92, p[2])
        if last and math.dist(last, top) < 5:
            mid = [(last[k] + top[k]) / 2 for k in range(3)]
            mid[1] -= 0.16
            tube("rope", "rope", [last, tuple((last[k] + mid[k]) / 2 - (0.06 if k == 1 else 0) for k in range(3)), tuple(mid), tuple((top[k] + mid[k]) / 2 - (0.06 if k == 1 else 0) for k in range(3)), top], 0.018, col)
        last = top


def merge_by_material(col):
    groups = {}
    for o in [o for o in col.objects if o.type == "MESH"]:
        groups.setdefault(o.data.materials[0].name if o.data.materials else "x", []).append(o)
    out = []
    for m, objs in groups.items():
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        o = bpy.context.view_layer.objects.active
        o.name = m
        out.append(o)
    return out


def main():
    U.reset_scene()
    for k, c in {"hotel_white": ((0.9, 0.89, 0.86), 0.7, 0), "bronze": ((0.16, 0.11, 0.07), 0.4, 0.8), "dark_glass": ((0.05, 0.07, 0.08), 0.05, 0.2),
                 "glass_rail": ((0.75, 0.85, 0.85), 0.02, 0), "terrace": ((0.8, 0.75, 0.66), 0.7, 0), "towel": ((0.85, 0.6, 0.4), 0.95, 0), "pile": ((0.3, 0.26, 0.2), 0.9, 0), "soil": ((0.12, 0.08, 0.05), 0.95, 0)}.items():
        U.BASE_COLORS.setdefault(k, c)
    col = U.collection("hotel")
    bvh = ground_bvh()
    rooms = tower(col)
    lobby(col)
    terrace(col)
    sea_access(col)
    jump_trail(col, bvh)
    U.apply_all_modifiers(list(col.objects))
    U.cube_project_uvs(list(col.objects))
    objs = merge_by_material(col)
    tot = 0
    for o in objs:
        n = sum(len(p.vertices) - 2 for p in o.data.polygons)
        tot += n
        U.log(o.name, n)
    U.log("hotel triangles", tot)
    out = C.OUT_MODELS / "hotel.glb"
    U.export_glb(out, objs)
    U.register_model("hotel", out)
    for r in rooms:
        r.pop("x", None)
    data = {"rooms": rooms, "R0": R0, "cx": CX, "cz": CZ, "bw": BW, "fh": FH, "bays": BAYS, "floors": FLOORS, "terraceY": TY, "deckY": DECK_Y, "top": TOP,
            "pool": {"x0": POOL[0], "x1": POOL[1], "z0": POOL[2], "z1": -53.2, "y": TY - 0.055}, "planters": PLANTERS, "trees": TREES, "people": PEOPLE}
    p = C.ROOT / "src" / "data" / "generated" / "hotel.json"
    p.write_text(json.dumps(data, separators=(",", ":")))
    U.log("rooms", len(rooms), "planters", len(PLANTERS))


if __name__ == "__main__":
    main()
