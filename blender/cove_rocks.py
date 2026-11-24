"""Photogrammetry rock kit (Poly Haven scans, decimated) and its placement on the calanque walls.
Outputs public/models/rocks.glb and src/data/generated/rocks.json."""
import json
import math
import random
import sys
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402

KIT = {  # id: (target triangles, texture size, kind)
    "namaqualand_cliff_02": (7000, 1024, "cliff"),
    "namaqualand_cliff_01": (6000, 1024, "cliff"),
    "rock_face_01": (5000, 1024, "cliff"),
    "rock_face_02": (5000, 1024, "cliff"),
    "namaqualand_boulder_03": (2600, 512, "boulder"),
    "namaqualand_boulder_04": (2600, 512, "boulder"),
}


def import_scan(pid, tris):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(C.CACHE / "cove_models" / pid / f"{pid}.gltf"))
    new = [o for o in bpy.data.objects if o not in before]
    ms = [o for o in new if o.type == "MESH"]
    # keep the largest mesh only (LODs / pieces)
    ms.sort(key=lambda o: -len(o.data.polygons))
    ob = ms[0]
    ob.data.transform(ob.matrix_world)
    ob.parent = None
    ob.matrix_world = Matrix.Identity(4)
    for o in new:
        if o is not ob:
            bpy.data.objects.remove(o)
    n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if n > tris:
        m = ob.modifiers.new("d", "DECIMATE")
        m.ratio = tris / n
        U.apply_all_modifiers([ob])
    a = np.array([v.co for v in ob.data.vertices])
    lo, hi = a.min(0), a.max(0)
    ob.data.transform(Matrix.Translation(-Vector((lo + hi) / 2)))
    nn = np.array([p.normal * p.area for p in ob.data.polygons]).sum(0)
    ob.name = pid
    U.log(pid, "tris", n, "->", len(ob.data.polygons), "size", np.round(hi - lo, 1), "front", np.round(nn / np.linalg.norm(nn), 2))
    return ob, hi - lo, nn / np.linalg.norm(nn)


def main():
    U.reset_scene()
    info = {}
    objs = []
    for pid, (t, sz, kind) in KIT.items():
        ob, size, front = import_scan(pid, t)
        # textures: only diffuse + normal, capped
        for mat in ob.data.materials:
            for nd in list(mat.node_tree.nodes):
                if nd.type == "TEX_IMAGE" and nd.image:
                    if "arm" in nd.image.name.lower() or "rough" in nd.image.name.lower() or "metal" in nd.image.name.lower():
                        mat.node_tree.nodes.remove(nd)
                        continue
                    if max(nd.image.size) > sz:
                        nd.image.scale(sz, sz)
        info[pid] = (size, front, kind)
        objs.append(ob)
    d = np.load(C.CACHE / "cove_near.npz")
    v, t = d["v"], d["t"]
    bvh = BVHTree.FromPolygons([Vector(p) for p in v.tolist()], t.tolist())  # web axes
    tri = v[t]
    nrm = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    area = np.linalg.norm(nrm, axis=1)
    nrm /= area[:, None] + 1e-9
    cen = tri.mean(1)
    R = random.Random(5)
    out = []

    def smooth_normal(p, r):
        w = np.linalg.norm(cen - p, axis=1) < r
        n = (nrm[w] * area[w][:, None]).sum(0)
        return n / (np.linalg.norm(n) + 1e-9)

    def pick(mask, count, mind, taken):
        idx = np.nonzero(mask)[0]
        pr = area[idx] / area[idx].sum()
        rng = np.random.default_rng(len(idx))
        res = []
        for i in rng.choice(idx, min(len(idx), count * 40), p=pr, replace=False):
            p = cen[i]
            if all(np.linalg.norm(p - q) > mind for q in taken):
                taken.append(p)
                res.append(p)
                if len(res) >= count:
                    break
        return res

    x, y, z = cen.T
    steep = np.abs(nrm[:, 1]) < 0.45
    taken = []
    deck = (x > -10) & (x < 32) & (z < -36)     # keep the stair / deck volume clear
    ladder = (np.abs(x - 26) < 6) & (z < -44)
    zones = [
        # mask, count, spacing, scale range
        (steep & (x < -26) & (x > -62) & (z > -48) & (z < 62) & (y > 1) & (y < 16), 22, 5.5, (0.55, 0.95)),
        (steep & (x > 36) & (z > -50) & (z < 80) & (y > 2) & (y < 58), 34, 8.0, (1.0, 1.9)),
        (steep & (np.abs(x) < 46) & (z < -40) & (y > 1) & (y < 8) & ~ladder, 14, 5.0, (0.45, 0.75)),
        (steep & (x < -48) & (z > 50) & (z < 130) & (y > 1.5), 10, 8.0, (0.8, 1.3)),
    ]
    cliffs = [k for k in KIT if KIT[k][2] == "cliff"]
    for mask, count, mind, sc in zones:
        for p in pick(mask, count, mind, taken):
            n = smooth_normal(p, 4.0)
            pid = R.choices(cliffs, weights=[3, 2, 1.2, 1.2])[0]
            size, front, _ = info[pid]
            s = R.uniform(*sc) * (0.62 if pid == "namaqualand_cliff_02" else 1.0)
            yaw = math.atan2(n[0], n[2])
            q = p - n * (size[1] * 0.5 * s * 0.62)
            # front of the kit pieces: web +z after conversion (Blender -y)
            fy = math.atan2(front[0], -front[1])
            out.append([pid, *(round(float(a), 2) for a in q), round(yaw - fy + R.uniform(-0.12, 0.12), 3), round(R.uniform(-0.08, 0.08), 3), round(s, 3)])
    # boulders: at the cliff foot, on ledges and on the shallow bed
    boul = [k for k in KIT if KIT[k][2] == "boulder"]
    flat = nrm[:, 1] > 0.6
    foot = flat & (y < -0.4) & (y > -4.5) & (np.abs(x) < 60) & (z < 75) & (z > -56)
    tops = flat & (y > 3) & (y < 30) & ((x < -30) | (x > 48)) & (z > -50) & (z < 95) & ~((x > -56) & (x < -33) & (z > -60) & (z < 24))
    shore = flat & (y > -0.6) & (y < 2.5) & (np.abs(x) < 70)
    tk = []
    for mask, count, mind, sc in ((foot, 46, 3.2, (0.7, 1.9)), (tops, 34, 4.0, (0.4, 1.3)), (shore, 20, 3.0, (0.7, 1.5))):
        if not mask.any():
            continue
        for p in pick(mask & ~deck, count, mind, tk):
            pid = R.choice(boul)
            s = R.uniform(*sc)
            out.append([pid, round(float(p[0]), 2), round(float(p[1]) + info[pid][0][2] * s * 0.18, 2), round(float(p[2]), 2), round(R.uniform(0, 6.28), 3), round(R.uniform(-0.25, 0.25), 3), round(s, 3)])
    path = C.OUT_MODELS / "rocks.glb"
    U.export_glb(path, objs)
    (C.ROOT / "src" / "data" / "generated" / "rocks.json").write_text(json.dumps(out, separators=(",", ":"), default=float))
    U.log("placed", len(out))


if __name__ == "__main__":
    main()
