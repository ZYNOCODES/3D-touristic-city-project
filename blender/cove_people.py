"""Samples the real terrain for the jump ledges: approach path, edge, landing point and spectator spots."""
import json
import math
import sys
from pathlib import Path
import numpy as np
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U
import config as C
import cove_shape as S
d = np.load(C.CACHE / "cove_near.npz")
bvh = BVHTree.FromPolygons([Vector(p) for p in d["v"].tolist()], d["t"].tolist())


def g(x, z):
    p = bvh.ray_cast(Vector((x, 200, z)), Vector((0, -1, 0)))[0]
    return p.y if p else -20


out = []
dirs = [(1.0, 0.18), (0.97, 0.3), (0.9, 0.45)]
for (cx, cz, r, h), (dx, dz) in zip(S.DISCS, dirs):
    L = math.hypot(dx, dz)
    dx, dz = dx / L, dz / L
    best = None
    for off in np.arange(-2.5, 2.6, 0.5):  # slide along the ledge to find the cleanest drop
        ox, oz = cx - dz * off, cz + dx * off
        e = None
        for t in np.arange(0, r + 6, 0.15):
            if g(ox + dx * t, oz + dz * t) < h - 1.6:
                e = t - 0.25
                break
        if e is None:
            continue
        # how much rock sticks out below the edge (clearance 2.2..4.5 m ahead must be water)
        c = max(g(ox + dx * (e + k), oz + dz * (e + k)) for k in np.arange(1.6, 5.5, 0.3))
        ey = g(ox + dx * e, oz + dz * e)
        score = c + abs(ey - h) * 2
        if best is None or score < best[0]:
            best = (score, ox, oz, e, c, ey)
    score, ox, oz, e, c, ey = best
    path = []
    for t in np.arange(-r - 1.0, e + 0.01, 0.4):
        x, z = ox + dx * t, oz + dz * t
        path.append([round(x, 2), round(g(x, z), 2), round(z, 2)])
    land = [ox + dx * (e + 3.6), oz + dz * (e + 3.6)]
    spect = []
    for a in (-2.2, -3.4, 2.4, 3.5):
        x, z = ox - dz * a + dx * (e - 1.4), oz + dx * a + dz * (e - 1.4)
        y = g(x, z)
        if abs(y - h) < 1.3 and abs(g(x + 0.3, z) - y) < 0.25 and abs(g(x, z + 0.3) - y) < 0.25:
            spect.append([round(x, 2), round(y, 2), round(z, 2), round(math.atan2(dx, dz), 2)])
    U.log("ledge", h, "edge y", round(ey, 2), "clear below", round(c, 2), "depth", round(g(*land), 2), "path", len(path), "spect", len(spect))
    out.append({"h": h, "path": path, "dir": [round(dx, 3), round(dz, 3)], "edge": path[-1], "land": [round(land[0], 2), round(land[1], 2)], "depth": round(g(*land), 2), "spect": spect})
(C.ROOT / "src" / "data" / "generated" / "jump.json").write_text(json.dumps(out, separators=(",", ":"), default=float))
