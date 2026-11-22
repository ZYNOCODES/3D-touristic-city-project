"""Vellmare Residences — contemporary Mediterranean apartment building.

→ public/models/residence.glb          architecture + forecourt landscaping
→ src/data/generated/residence.json    apartment cell volumes used by the web app
                                       (selection, availability overlay, X-ray cutaway,
                                       apartment interior placement)

Composition (web space: x along the facade, +z towards the sea, y up; origin = building
datum at ground-floor level, centre of the lobby):

* two residential wings (4 apartments per floor × 6 floors each) with alternating
  cantilevered terraces: thick white slab edges, timber soffits, frameless glass
  balustrades, planters with cascading greenery and travertine blade walls between units;
* recessed floor-to-ceiling sliding glazing in slim dark-aluminium frames, sheer curtains;
* top floors stepping back into roof gardens and a rooftop infinity pool;
* a double-height glass lobby under a cantilevered entrance canopy, framed by a
  travertine core tower wrapped in vertical timber fins;
* stone-clad base with amenity glazing, a landscaped forecourt with drop-off loop,
  reflecting pools, sculpture, benches, bollards and lamp posts, boundary walls and
  the ramp to the underground car park.
"""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402

FH = 3.4               # floor-to-floor
FLOORS = 7             # ground + 6 residential
BAYS = 4               # apartments per wing per floor
GLASS_BACK = 3.3       # glass line set back behind the base slab edge (terrace depth)
UNIT_DEPTH = 12.0      # apartment depth behind the glass line
WINGS = [
    # "heights" = number of residential floors per bay (outer bays lower → stepped skyline)
    {"name": "west", "x0": -64.0, "x1": -11.0, "edge": 11.0, "back": -13.0, "heights": [4, 5, 6, 6]},
    {"name": "east", "x0": 11.0, "x1": 64.0, "edge": 13.0, "back": -11.0, "heights": [6, 6, 5, 3]},
]
CORE = {"x0": -11.0, "x1": 11.0, "front": 4.5, "back": -14.0}
OUT_JSON = C.ROOT / "src" / "data" / "generated" / "residence.json"

R = random.Random(42)


def setback(f):
    """Upper floors step back to form roof gardens."""
    return 0.0 if f <= 4 else (2.8 if f == 5 else 5.6)


def bay_x(w, i):
    W = WINGS[w]
    bw = (W["x1"] - W["x0"]) / BAYS
    return W["x0"] + i * bw, W["x0"] + (i + 1) * bw


# ---------------------------------------------------------------------------
# foliage helpers (single merged mesh of small leaf quads)
# ---------------------------------------------------------------------------
class Foliage:
    def __init__(self):
        self.bm = bmesh.new()

    def leaf(self, p, size):
        a = R.uniform(0, math.tau)
        b = R.uniform(-0.9, 0.9)
        u = Vector((math.cos(a), math.sin(a) * math.cos(b), math.sin(b))) * size
        v = Vector((-math.sin(a), math.cos(a), R.uniform(-0.4, 0.4))).normalized() * size * 0.55
        c = U.W(*p)
        vs = [self.bm.verts.new(c + d) for d in (-u - v, u - v, u + v, -u + v)]
        self.bm.faces.new(vs)

    def bush(self, cx, cy, cz, rx, ry, rz, n, size=0.12):
        for _ in range(n):
            while True:
                d = Vector((R.uniform(-1, 1), R.uniform(-1, 1), R.uniform(-1, 1)))
                if d.length <= 1:
                    break
            self.leaf((cx + d.x * rx, cy + abs(d.y) * ry, cz + d.z * rz), size * R.uniform(0.7, 1.3))

    def vine(self, x, y, z, length, size=0.055):
        """Trailing strand (ivy / jasmine) hanging from (x, y, z): small paired leaves on a
        drifting stem, denser near the planter and thinning towards the tip."""
        steps = int(length / 0.045)
        px, pz = x, z
        for k in range(steps):
            py = y - k * 0.045
            px += R.uniform(-0.012, 0.012)
            pz += R.uniform(-0.003, 0.012)
            t = k / max(steps, 1)
            for _ in range(2 if t < 0.6 else 1):
                if R.random() < 0.9 - 0.3 * t:
                    self.leaf((px + R.uniform(-0.03, 0.03), py, pz + R.uniform(-0.02, 0.03)), size * R.uniform(0.7, 1.15) * (1.0 - 0.35 * t))

    def to_object(self, name, col):
        me = bpy.data.meshes.new(name)
        self.bm.to_mesh(me)
        self.bm.free()
        o = bpy.data.objects.new(name, me)
        col.objects.link(o)
        o.data.materials.append(U.material("foliage"))
        return o


# ---------------------------------------------------------------------------
def glazing(col, x0, x1, y0, y1, z, tag, curtains=True, panel=2.25):
    """Floor-to-ceiling sliding glazing with frames, a dark interior and sheer curtains."""
    b = U.box
    b(f"glass_{tag}", "glass", x0, y0 + 0.05, z - 0.04, x1, y1 - 0.05, z + 0.0, col)
    b(f"head_{tag}", "dark_metal", x0, y1 - 0.12, z - 0.12, x1, y1, z + 0.06, col)
    b(f"sill_{tag}", "dark_metal", x0, y0, z - 0.12, x1, y0 + 0.06, z + 0.06, col)
    n = max(1, round((x1 - x0) / panel))
    for k in range(n + 1):
        x = x0 + k * (x1 - x0) / n
        b(f"mull_{tag}_{k}", "dark_metal", x - 0.035, y0, z - 0.12, x + 0.035, y1, z + 0.06, col)
    # interior read-through: deep floor + dark back plane (glows warm at night)
    b(f"inner_{tag}", "glow", x0 + 0.1, y0 + 0.02, z - 7.0, x1 - 0.1, y1 - 0.02, z - 6.95, col)
    b(f"ceil_{tag}", "ceiling", x0, y1 - 0.02, z - 7.0, x1, y1, z - 0.05, col)
    if curtains:
        cw = (x1 - x0)
        for k in range(R.randint(1, 3)):
            cx = x0 + R.uniform(0.05, 0.75) * cw
            w = R.uniform(0.9, 2.4)
            # pleated sheer curtain: zig-zag strip
            verts, faces = [], []
            pleats = int(w / 0.09)
            for p in range(pleats + 1):
                xx = min(x1 - 0.1, cx + p * 0.09)
                zz = z - 0.35 - (0.05 if p % 2 else 0.0)
                verts += [(xx, y0 + 0.03, zz), (xx, y1 - 0.15, zz)]
                if p < pleats:
                    a = p * 2
                    faces.append((a, a + 2, a + 3, a + 1))
            U.mesh_from(f"curtain_{tag}_{k}", "curtain", verts, faces, col)


def wing(col, fol, w):
    W = WINGS[w]
    b = U.box
    cells = []
    for f in range(FLOORS + 1):
        y0 = f * FH
        sb = setback(f)
        edge = W["edge"] - sb
        glass_z = W["edge"] - GLASS_BACK - setback(f)
        # ---- floor slab, per bay with alternating cantilevers -----------------------
        for i in range(BAYS):
            bx0, bx1 = bay_x(w, i)
            hmax = W["heights"][i]
            if f > hmax + 1:
                continue
            if f == hmax + 1:
                roof_bay(col, fol, W, i, f, bx0, bx1)
                continue
            cant = 2.2 if (i + f) % 2 == 0 and f > 0 else 0.0
            e = edge + cant
            t = f"{W['name']}_{f}_{i}"
            b(f"slab_{t}", "concrete", bx0, y0, W["back"], bx1, y0 + 0.32, e - 0.5, col)
            # white stone fascia with upstand (reads as a thick, crisp slab edge)
            b(f"fascia_{t}", "stucco", bx0 - 0.02, y0 - 0.38, e - 0.5, bx1 + 0.02, y0 + 0.52, e, col, bevel=0.025)
            if f > 0:
                # timber soffit under the terrace
                b(f"soffit_{t}", "cladding", bx0 + 0.25, y0 - 0.395, glass_z - 0.2, bx1 - 0.25, y0 - 0.38, e - 0.55, col)
                # downlights in the soffit
                for k in range(3):
                    U.cyl(f"dl_{t}_{k}", "lamp", bx0 + (k + 1) * (bx1 - bx0) / 4, y0 - 0.41, e - 1.6, 0.06, 0.02, 10, col=col)
            if f >= 1:
                # terrace decking
                b(f"deck_{t}", "deck", bx0 + 0.25, y0 + 0.32, glass_z, bx1 - 0.25, y0 + 0.36, e - 0.55, col)
                # frameless glass balustrade + slim rail
                b(f"bal_{t}", "glass", bx0 + 0.3, y0 + 0.48, e - 0.12, bx1 - 0.3, y0 + 1.5, e - 0.1, col)
                b(f"rail_{t}", "dark_metal", bx0 + 0.3, y0 + 1.48, e - 0.14, bx1 - 0.3, y0 + 1.53, e - 0.08, col)
                # planter with shrubs and cascading greenery on alternate bays
                if (i + f) % 2 == 1 or cant > 0:
                    px0, px1 = (bx0 + 0.4, bx0 + 0.4 + (bx1 - bx0) * 0.45) if (i % 2) else (bx1 - 0.4 - (bx1 - bx0) * 0.45, bx1 - 0.4)
                    b(f"planter_{t}", "stucco", px0, y0 + 0.36, e - 1.05, px1, y0 + 0.95, e - 0.55, col, bevel=0.02)
                    fol.bush((px0 + px1) / 2, y0 + 0.95, e - 0.8, (px1 - px0) / 2, 0.55, 0.28, int((px1 - px0) * 260), 0.06)
                    for k in range(int((px1 - px0) * 6)):
                        fol.vine(R.uniform(px0, px1), y0 + 0.9, e + 0.04, R.uniform(0.6, 2.8 if f > 1 else 1.4))
                # outdoor furniture hint: a pair of loungers / table on some terraces
                if (i * 7 + f * 3) % 5 == 0:
                    cx = (bx0 + bx1) / 2 + R.uniform(-2, 2)
                    b(f"tt_{t}", "dark_metal", cx - 0.5, y0 + 0.36, glass_z + 1.2, cx + 0.5, y0 + 1.08, glass_z + 2.0, col)
                    b(f"tt_top_{t}", "travertine", cx - 0.55, y0 + 1.08, glass_z + 1.15, cx + 0.55, y0 + 1.12, glass_z + 2.05, col)
            # ---- glazing (recessed) & party walls --------------------------------------
            if f >= 1:
                glazing(col, bx0 + 0.35, bx1 - 0.35, y0 + 0.36, y0 + FH - 0.25, glass_z, t)
                cells.append({
                    "floor": f, "bay": w * BAYS + i,
                    "min": [round(bx0 + 0.35, 3), round(y0 + 0.36, 3), round(glass_z - UNIT_DEPTH, 3)],
                    "max": [round(bx1 - 0.35, 3), round(y0 + FH - 0.05, 3), round(glass_z, 3)],
                    "glassZ": round(glass_z, 3), "edgeZ": round(e, 3),
                })
        # travertine blade walls between the apartments (full height of the floor)
        if f >= 1:
            for i in range(BAYS + 1):
                if f > max(W["heights"][max(0, i - 1)], W["heights"][min(BAYS - 1, i)]):
                    continue
                x = W["x0"] + i * (W["x1"] - W["x0"]) / BAYS
                bev = 0.015
                reach = edge + (1.5 if ((i + f) % 2 == 0 or (i - 1 + f) % 2 == 0) else 0.0) - 0.55
                b(f"blade_{W['name']}_{f}_{i}", "travertine", x - 0.22, y0 + 0.32, glass_z - 0.4, x + 0.22, y0 + FH - 0.22, reach, col, bevel=bev)
        # ---- back facade with punched windows --------------------------------------------
        for i in range(BAYS):
            if f <= W["heights"][i]:
                bx0, bx1 = bay_x(w, i)
                b(f"back_{W['name']}_{f}_{i}", "stucco", bx0, y0, W["back"] - 0.3, bx1, y0 + FH, W["back"], col)
        if f >= 1:
            for k in range(int((W["x1"] - W["x0"]) / 4.4)):
                x = W["x0"] + 1.6 + k * 4.4
                if f > W["heights"][min(BAYS - 1, int((x - W["x0"]) / ((W["x1"] - W["x0"]) / BAYS)))]:
                    continue
                b(f"bwin_{W['name']}_{f}_{k}", "glass", x, y0 + 0.9, W["back"] - 0.32, x + 1.5, y0 + 2.7, W["back"] - 0.29, col)
                b(f"bwinf_{W['name']}_{f}_{k}", "dark_metal", x - 0.05, y0 + 0.85, W["back"] - 0.36, x + 1.55, y0 + 0.9, W["back"] - 0.25, col)
        # ---- gable ends clad in travertine with slot windows ---------------------------------
        for side, x in (("l", W["x0"]), ("r", W["x1"])):
            if (side == "r" and w == 0) or (side == "l" and w == 1):
                continue  # these ends meet the core
            if f > W["heights"][0 if side == "l" else BAYS - 1]:
                continue
            sx = x - 0.45 if side == "l" else x
            b(f"gable_{W['name']}_{f}", "travertine", sx, y0, W["back"] - 0.3, sx + 0.45, y0 + FH, glass_z - 0.3 if f else edge - 2, col, bevel=0.02)
            if f >= 1:
                for k in range(3):
                    z = W["back"] + 3 + k * 4.5
                    if z < glass_z - 1:
                        b(f"slot_{W['name']}_{f}_{k}", "glass", sx - 0.01, y0 + 0.6, z, sx + 0.46, y0 + 3.0, z + 0.6, col)
    # ---- ground floor: stone base, recessed amenity glazing behind pilotis --------------------
    gz = WINGS[w]["edge"] - GLASS_BACK - 1.2
    b(f"base_plinth_{W['name']}", "stone_wall", W["x0"] - 0.45, -2.5, W["back"] - 0.3, W["x1"] + 0.45, 0.05, W["edge"] + 1.6, col, bevel=0.02)
    glazing(col, W["x0"] + 0.6, W["x1"] - 0.6, 0.05, FH - 0.32, gz, f"gf_{W['name']}", curtains=False, panel=2.6)
    for k in range(9):
        x = W["x0"] + 0.8 + k * (W["x1"] - W["x0"] - 1.6) / 8
        U.cyl(f"piloti_{W['name']}_{k}", "stucco", x, 0.05, W["edge"] - 0.9, 0.22, FH - 0.3, 20, col=col)
    return cells


def roof_bay(col, fol, W, i, f, bx0, bx1):
    """Roof garden on top of a bay: deck, glass parapet, planters, pergola or pool."""
    b = U.box
    top = f * FH
    redge = W["edge"] - setback(f - 1) + (2.2 if (i + f - 1) % 2 == 0 else 0.0)
    t = f"{W['name']}_{i}"
    b(f"roof_{t}", "concrete", bx0, top, W["back"] - 0.3, bx1, top + 0.35, redge - 0.5, col)
    b(f"roof_fascia_{t}", "stucco", bx0 - 0.02, top - 0.38, redge - 0.5, bx1 + 0.02, top + 0.52, redge, col, bevel=0.025)
    b(f"roof_deck_{t}", "deck", bx0 + 0.4, top + 0.35, W["back"] + 0.5, bx1 - 0.4, top + 0.4, redge - 1.0, col)
    b(f"roof_glass_{t}", "glass", bx0 + 0.3, top + 0.52, redge - 0.12, bx1 - 0.3, top + 1.55, redge - 0.1, col)
    b(f"roof_rail_{t}", "dark_metal", bx0 + 0.3, top + 1.53, redge - 0.14, bx1 - 0.3, top + 1.58, redge - 0.08, col)
    # planters along the back with olive-like shrubs
    b(f"roof_planter_{t}", "stucco", bx0 + 0.6, top + 0.35, W["back"] + 0.4, bx1 - 0.6, top + 1.0, W["back"] + 1.6, col, bevel=0.02)
    for k in range(4):
        fol.bush(bx0 + 1.5 + k * (bx1 - bx0 - 3) / 3, top + 1.0, W["back"] + 1.0, 1.1, 1.0, 0.6, 240, 0.11)
    if (i + len(t)) % 2 == 0:
        b(f"roofpool_{t}", "pooltile", bx0 + 1.5, top + 0.35, W["back"] + 3, bx1 - 1.5, top + 1.2, W["back"] + 8, col)
        U.mesh_from(f"roofpool_water_{t}", "water", [(bx0 + 1.7, top + 1.1, W["back"] + 3.2), (bx1 - 1.7, top + 1.1, W["back"] + 3.2), (bx1 - 1.7, top + 1.1, W["back"] + 7.8), (bx0 + 1.7, top + 1.1, W["back"] + 7.8)], [(3, 2, 1, 0)], col)
    else:
        for k in range(int((bx1 - bx0 - 2) / 1.8) + 1):
            x = bx0 + 1 + k * 1.8
            b(f"perg_{t}_{k}", "cladding", x, top + 3.1, W["back"] + 2, x + 0.14, top + 3.35, W["back"] + 9.5, col)
        for zz in (W["back"] + 2, W["back"] + 9.4):
            b(f"perg_rail_{t}_{zz:.0f}", "cladding", bx0 + 0.8, top + 2.85, zz, bx1 - 0.8, top + 3.1, zz + 0.2, col)
            for x in (bx0 + 0.9, bx1 - 0.9):
                U.cyl(f"perg_post_{t}_{zz:.0f}_{x:.0f}", "dark_metal", x, top + 0.4, zz + 0.1, 0.07, 2.5, 10, col=col)
        for k in range(2):
            b(f"roof_sofa_{t}_{k}", "cushion", bx0 + 2 + k * 4, top + 0.4, W["back"] + 5, bx0 + 4.8 + k * 4, top + 0.85, W["back"] + 6, col, bevel=0.06)


def core(col, fol):
    b = U.box
    K = CORE
    top = FLOORS * FH
    # double-height glass lobby
    glazing(col, K["x0"] + 1.2, K["x1"] - 1.2, 0.05, 2 * FH - 0.3, K["front"], "lobby", curtains=False, panel=2.4)
    b("lobby_floor", "travertine", K["x0"], 0, K["back"], K["x1"], 0.06, K["front"] + 2, col)
    b("lobby_mezz", "concrete", K["x0"], 2 * FH - 0.3, K["back"], K["x1"], 2 * FH, K["front"] - 0.3, col)
    # reception desk + feature stone wall visible through the glass
    b("lobby_wall", "stone_wall", K["x0"] + 2, 0.06, K["back"] + 3, K["x1"] - 2, 2 * FH - 0.4, K["back"] + 3.4, col)
    b("desk", "travertine", -2.4, 0.06, K["back"] + 6, 2.4, 1.1, K["back"] + 7, col, bevel=0.03)
    # cantilevered entrance canopy with timber soffit
    b("canopy", "stucco", -9.5, 2 * FH - 1.6, K["front"] - 0.5, 9.5, 2 * FH - 1.1, K["front"] + 10.5, col, bevel=0.03)
    b("canopy_soffit", "cladding", -9.3, 2 * FH - 1.62, K["front"], 9.3, 2 * FH - 1.6, K["front"] + 10.3, col)
    for k in range(5):
        U.cyl(f"canopy_dl_{k}", "lamp", -7.2 + k * 3.6, 2 * FH - 1.65, K["front"] + 6, 0.08, 0.02, 12, col=col)
    for x in (-8.5, 8.5):
        U.cyl(f"canopy_col_{x:.0f}", "dark_metal", x, 0.06, K["front"] + 9.5, 0.11, 2 * FH - 1.65, 16, col=col)
    # signage band
    b("sign", "brass", -4.2, 2 * FH - 1.1, K["front"] + 10.52, 4.2, 2 * FH - 0.8, K["front"] + 10.56, col)
    # tower above the lobby: travertine frame wrapped in vertical timber fins
    b("tower_l", "travertine", K["x0"], 2 * FH, K["back"], K["x0"] + 1.4, top + 4.5, K["front"] - 0.3, col, bevel=0.03)
    b("tower_r", "travertine", K["x1"] - 1.4, 2 * FH, K["back"], K["x1"], top + 4.5, K["front"] - 0.3, col, bevel=0.03)
    b("tower_glass", "glass", K["x0"] + 1.4, 2 * FH, K["front"] - 1.4, K["x1"] - 1.4, top + 4.0, K["front"] - 1.35, col)
    b("tower_inner", "glow", K["x0"] + 1.6, 2 * FH, K["front"] - 5, K["x1"] - 1.6, top + 4.0, K["front"] - 4.95, col)
    n = 34
    for k in range(n):
        x = K["x0"] + 1.6 + k * (K["x1"] - K["x0"] - 3.2) / (n - 1)
        b(f"fin_{k}", "cladding", x - 0.06, 2 * FH, K["front"] - 1.0, x + 0.06, top + 3.8, K["front"] - 0.55, col)
    for f in range(2, FLOORS + 1):
        b(f"tower_slab_{f}", "stucco", K["x0"] + 1.4, f * FH - 0.2, K["front"] - 1.3, K["x1"] - 1.4, f * FH + 0.15, K["front"] - 0.3, col)
    b("tower_cap", "stucco", K["x0"] - 0.3, top + 4.5, K["back"] - 0.3, K["x1"] + 0.3, top + 5.1, K["front"], col, bevel=0.03)
    b("tower_back", "stucco", K["x0"], 0, K["back"] - 0.3, K["x1"], top + 4.5, K["back"], col)
    fol.bush(0, top + 5.1, K["back"] + 8, 8, 0.8, 4, 600, 0.12)


def forecourt(col, fol):
    """Entrance landscape in front of the building (local z from ~+13 to +50)."""
    b = U.box
    # paving + stone edging
    b("plaza", "paving", -78, -0.2, 14.6, 78, 0.04, 52, col)
    b("plaza_entry", "travertine", -12, -0.2, 4.5, 12, 0.06, 16, col)
    # drop-off loop around a planted island with a sculpture
    ring = []
    faces = []
    n = 48
    for k in range(n + 1):
        a = k / n * math.tau
        for r in (6.5, 12.0):
            ring.append((math.cos(a) * r * 1.6, 0.07, 31 + math.sin(a) * r))
        if k < n:
            a0 = k * 2
            faces.append((a0, a0 + 2, a0 + 3, a0 + 1))
    U.mesh_from("dropoff", "asphalt", ring, faces, col)
    U.cyl("island_wall", "travertine", 0, 0.0, 31, 6.4, 0.55, 64, col=col)
    for o in [o for o in col.objects if o.name == "island_wall"]:
        o.scale = (1.6, 1.0, 1.0)
    U.cyl("island_soil", "lawn", 0, 0.5, 31, 6.1, 0.08, 64, col=col)
    for o in [o for o in col.objects if o.name == "island_soil"]:
        o.scale = (1.6, 1.0, 1.0)
    # abstract sculpture (polished stainless loops)
    for k in range(3):
        bpy.ops.mesh.primitive_torus_add(major_radius=1.1 - k * 0.15, minor_radius=0.09, major_segments=48, minor_segments=12,
                                         location=U.W(0, 2.2 + k * 0.5, 31), rotation=(math.radians(60 + k * 25), 0, math.radians(k * 50)))
        t = bpy.context.active_object
        t.name = f"sculpture_{k}"
        for c in list(t.users_collection):
            c.objects.unlink(t)
        col.objects.link(t)
        t.data.materials.append(U.material("metal"))
        for p in t.data.polygons:
            p.use_smooth = True
    U.cyl("sculpture_base", "travertine", 0, 0.55, 31, 0.6, 0.6, 24, col=col)
    # reflecting pools flanking the entrance (raised basins)
    for s in (-1, 1):
        x0, x1 = (s * 14, s * 46) if s > 0 else (s * 46, s * 14)
        b(f"pool_floor_{s}", "pooltile", x0, -0.2, 15.5, x1, 0.08, 23.5, col)
        for nm, a in (("n", (x0, 15.5, x1, 15.9)), ("s", (x0, 23.1, x1, 23.5)), ("w", (x0, 15.5, x0 + 0.4, 23.5)), ("e", (x1 - 0.4, 15.5, x1, 23.5))):
            b(f"pool_rim_{s}_{nm}", "travertine", a[0], -0.2, a[1], a[2], 0.5, a[3], col, bevel=0.02)
        U.mesh_from(f"pool_water_{s}", "water", [(x0 + 0.4, 0.44, 15.9), (x1 - 0.4, 0.44, 15.9), (x1 - 0.4, 0.44, 23.1), (x0 + 0.4, 0.44, 23.1)], [(3, 2, 1, 0)], col)
        for k in range(5):  # stepping stones / water jets plinths
            x = (x0 + x1) / 2 + (k - 2) * 5.2
            b(f"pool_plinth_{s}_{k}", "stone_wall", x - 0.5, 0.5, 18.9, x + 0.5, 0.62, 20.1, col)
        # planter beds behind the pools with lawn + shrubs
        b(f"bed_{s}", "travertine", x0, 0, 24.5, x1, 0.45, 27.5, col, bevel=0.02)
        b(f"bed_soil_{s}", "lawn", x0 + 0.2, 0.45, 24.7, x1 - 0.2, 0.47, 27.3, col)
        for k in range(int(abs(x1 - x0) / 2.2)):
            fol.bush(min(x0, x1) + 1 + k * 2.2 + R.uniform(-0.4, 0.4), 0.47, 26, 0.9, 0.7, 0.8, 140, 0.09)
        # benches
        for k in range(3):
            x = (x0 + x1) / 2 + (k - 1) * 9
            b(f"bench_{s}_{k}", "cladding", x - 1.0, 0.42, 13.6, x + 1.0, 0.5, 14.3, col, bevel=0.01)
            b(f"bench_base_{s}_{k}", "travertine", x - 0.85, 0.04, 13.7, x + 0.85, 0.42, 14.2, col)
    # bollard lights along the entrance walk + lamp posts along the plaza
    for k in range(10):
        for x in (-11, 11):
            z = 6 + k * 1.9
            if z > 15:
                continue
            U.cyl(f"bollard_{x}_{k}", "dark_metal", x, 0.06, z, 0.09, 0.8, 12, col=col)
            U.cyl(f"bollard_l_{x}_{k}", "lamp", x, 0.7, z, 0.092, 0.08, 12, col=col)
    for k in range(9):
        x = -72 + k * 18
        U.cyl(f"lamppost_{k}", "dark_metal", x, 0.04, 50, 0.08, 5.5, 12, r2=0.06, col=col)
        b(f"lamphead_{k}", "lamp", x - 0.25, 5.4, 49.85, x + 0.25, 5.6, 50.15, col)
    # boundary walls (dry-stacked stone) with gate piers
    for s in (-1, 1):
        b(f"bwall_side_{s}", "stone_wall", s * 78 - 0.4, -0.5, -14, s * 78 + 0.4, 1.4, 52, col, bevel=0.02)
        b(f"bwall_front_{s}", "stone_wall", s * 18 if s > 0 else -78, -0.5, 51.6, 78 if s > 0 else -18, 1.2, 52.4, col, bevel=0.02)
        b(f"gate_pier_{s}", "travertine", s * 18 - 0.6, -0.2, 51.4, s * 18 + 0.6, 2.4, 52.6, col, bevel=0.03)
        U.cyl(f"gate_light_{s}", "lamp", s * 18, 2.4, 52, 0.25, 0.3, 16, col=col)
    # garage ramp (west), descending under the building with retaining walls
    rx0, rx1 = -74.0, -66.5
    steps = 12
    for k in range(steps):
        z0 = 44 - k * 2.4
        b(f"ramp_{k}", "asphalt", rx0, -0.2 - k * 0.32 - 0.25, z0 - 2.4, rx1, -0.2 - k * 0.32, z0, col)
    b("ramp_wall_l", "stone_wall", rx0 - 0.4, -4.6, 14.5, rx0, 0.9, 44, col)
    b("ramp_wall_r", "stone_wall", rx1, -4.6, 14.5, rx1 + 0.4, 0.9, 44, col)
    b("garage_mouth", "black", rx0, -4.2, 14.4, rx1, -0.4, 14.6, col)
    b("garage_lintel", "travertine", rx0 - 0.4, -0.4, 14.3, rx1 + 0.4, 0.3, 15.0, col)


def build(col):
    """Build the whole residence (wings, core, forecourt, greenery) into col; returns apartment cells."""
    fol = Foliage()
    cells = []
    for w in range(len(WINGS)):
        cells += wing(col, fol, w)
    for W in WINGS:  # keep FLOORS consistent with the tallest bay
        assert max(W["heights"]) <= FLOORS - 1
    core(col, fol)
    forecourt(col, fol)
    fol.to_object("greenery", col)
    return cells


def main():
    U.reset_scene()
    col = U.collection("residence")
    cells = build(col)
    U.apply_all_modifiers()
    U.cube_project_uvs([o for o in col.objects if o.type == "MESH" and o.name != "greenery"])
    out = C.OUT_MODELS / "residence.glb"
    U.export_glb(out)
    U.register_model("residence", out)
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({
        "floorHeight": FH, "floors": FLOORS, "baysPerWing": BAYS, "unitDepth": UNIT_DEPTH,
        "wings": WINGS, "core": CORE, "cells": sorted(cells, key=lambda c: (c["floor"], c["bay"])),
        "rampHole": {"x0": -74.0, "x1": -66.5, "z0": 14.5, "z1": 44.0},
        # planting positions for the web vegetation system (olives, palms, cypresses)
        "trees": [{"x": x, "z": z, "kind": k} for x, z, k in (
            [(sx * xx, 28.5, "olive") for sx in (-1, 1) for xx in (20, 33, 46)] +
            [(sx * xx, 47.5, "cypress") for sx in (-1, 1) for xx in range(24, 78, 6)] +
            [(sx * 12.5, 18.0, "palm") for sx in (-1, 1)] + [(sx * 60, 30, "palm") for sx in (-1, 1)] +
            [(sx * 70, 20, "olive") for sx in (-1, 1)]
        )],
    }, indent=1))
    U.log(f"residence: {len(cells)} apartment cells → {OUT_JSON.relative_to(C.ROOT)}")


if __name__ == "__main__":
    main()
