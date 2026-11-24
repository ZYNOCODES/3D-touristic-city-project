"""Calanque terrain: voxel-remeshed cliffs with fractured limestone displacement, AO baked to vertex colours.
Outputs public/models/cove_terrain.glb, public/models/cove_seabed.png (depth map) and assets/cache/cove_*.npz
(the surface used to place plants, rocks and people)."""
import json
import sys
import time
from pathlib import Path

import bmesh
import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402
import cove_shape as S  # noqa: E402

X0, X1, Z0, Z1 = -118, 112, -150, 150
TRIS = 340_000


def grid_mesh(x0, x1, z0, z1, step, solid_bottom=None, drop=None):
    xs, zs = np.arange(x0, x1 + 1e-6, step), np.arange(z0, z1 + 1e-6, step)
    X, Z = np.meshgrid(xs, zs)
    H, _ = S.height(X, Z)
    if drop is not None:
        H = H - drop(X, Z)
    n, m = X.shape
    v = np.stack([X.ravel(), H.ravel(), Z.ravel()], -1)
    idx = np.arange(n * m).reshape(n, m)
    f = np.stack([idx[:-1, :-1], idx[1:, :-1], idx[1:, 1:], idx[:-1, 1:]], -1).reshape(-1, 4)
    if solid_bottom is not None:
        vb = v.copy()
        vb[:, 1] = solid_bottom
        k = len(v)
        fb = f[:, ::-1] + k
        loop = np.concatenate([idx[0, :], idx[1:, -1], idx[-1, -2::-1], idx[-2:0:-1, 0]])
        nx = np.roll(loop, -1)
        side = np.stack([loop, nx, nx + k, loop + k], -1)
        v, f = np.vstack([v, vb]), np.vstack([f, fb, side])
    return v, f


def to_mesh(name, v, f):
    me = bpy.data.meshes.new(name)
    vv = np.stack([v[:, 0], -v[:, 2], v[:, 1]], -1)
    me.from_pydata(vv.tolist(), [], f.tolist())
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def co(me):
    a = np.empty(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", a)
    a = a.reshape(-1, 3).astype(float)
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], -1)


def nrm(me):
    a = np.empty(len(me.vertices) * 3, np.float32)
    me.vertex_normals.foreach_get("vector", a)
    a = a.reshape(-1, 3).astype(float)
    return np.stack([a[:, 0], a[:, 2], -a[:, 1]], -1)


def set_co(me, p):
    a = np.stack([p[:, 0], -p[:, 2], p[:, 1]], -1).astype(np.float32)
    me.vertices.foreach_set("co", a.ravel())
    me.update()


def apply_mods(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
    old = ob.data
    ob.modifiers.clear()
    ob.data = me
    bpy.data.meshes.remove(old)


def load_disp(name):
    im = bpy.data.images.load(str(C.CACHE / "cove_tex" / name / "disp.jpg"))
    im.scale(1024, 1024)
    a = np.array(im.pixels[:], np.float32).reshape(1024, 1024, -1)[..., 0]
    return (a - a.mean()) / (a.std() + 1e-6)


def samp(img, u, v):
    n = img.shape[0]
    u, v = (u % 1) * n, (v % 1) * n
    i, j = u.astype(int) % n, v.astype(int) % n
    fu, fv = u - np.floor(u), v - np.floor(v)

    def g(a, b):
        return img[b % n, a % n]
    return (g(i, j) * (1 - fu) + g(i + 1, j) * fu) * (1 - fv) + (g(i, j + 1) * (1 - fu) + g(i + 1, j + 1) * fu) * fv


def displace(p, n, disp):
    x, y, z = p.T
    steep = 1 - np.clip(n[:, 1], 0, 1)
    under = S.sstep(0.5, -1.5, y)
    plat = S.sstep(50, 44, np.abs(x)) * S.sstep(-50, -56, z) * S.sstep(7, 8.4, y)
    calm = 1 - plat
    wall = S.sstep(0.18, 0.5, steep)
    # warped tall joint blocks (calanque limestone breaks along near-vertical joints)
    wx = x + 2.2 * S.fbm(x / 9, y / 9, z / 9, 3, 101)
    wz = z + 2.2 * S.fbm(x / 9, y / 9, z / 9, 3, 102)
    wy = y + 1.6 * S.fbm(x / 8, y / 8, z / 8, 3, 103)
    d = np.zeros_like(x)
    for size, sy, amp, crack, w, sd, tilt in ((13, 30, 2.6, 0.5, 0.035, 1, 0.34), (5.2, 10, 1.25, 0.32, 0.045, 2, 0.36), (2.1, 3.2, 0.5, 0.16, 0.06, 3, 0.32)):
        f1, f2, rid = S.worley(wx / size, wy / sy, wz / size, sd * 17)
        # a different slope per block gives flat, angular faces meeting in hard edges
        sx = (rid * 7.13 % 1 - 0.5) * 2 * tilt
        sz = (rid * 13.7 % 1 - 0.5) * 2 * tilt
        syy = (rid * 29.3 % 1 - 0.5) * 2 * tilt
        plane = (S._frac_local(wx / size) * sx + S._frac_local(wz / size) * sz + S._frac_local(wy / sy) * syy) * size * 0.5
        d += wall * (amp * (rid - 0.5) + plane - crack * np.exp(-(f2 - f1) / w))
    # sub-horizontal ledges
    lay = wy / 5.2 + 0.35 * S.fbm(x / 24, y / 24, z / 24, 2, 104)
    fr = lay - np.floor(lay)
    d += wall * 0.75 * (S.sstep(0.0, 0.12, fr) * (1 - fr) - 0.35)
    d += (0.25 + 0.75 * wall) * (0.45 * S.fbm(x / 6, y / 6, z / 6, 4, 105) - 0.5 * np.abs(S.fbm(x / 2.6, y / 3.4, z / 2.6, 4, 107)) + 0.2 * S.fbm(x / 0.9, y / 0.9, z / 0.9, 3, 106))
    # photographic relief (same tiling as the shader: 9 m)
    an = np.abs(n) ** 4
    an /= an.sum(1, keepdims=True) + 1e-9
    T = 1 / 9.0
    d += wall * 0.3 * (an[:, 0] * samp(disp, z * T, y * T) + an[:, 2] * samp(disp, x * T, y * T))
    # walkable / inhabited rock keeps its sculpted form: finer relief only
    soft = np.maximum(S.sstep(-24, -30, x) * S.sstep(-52, -44, z) * S.sstep(46, 34, z) * S.sstep(-66, -58, x), S.sstep(52, 44, np.abs(x)) * S.sstep(-40, -46, z))
    d *= 1 - 0.58 * soft
    d *= calm * (1 - 0.65 * under)
    # sea notch: waves undercut the cliff foot
    d -= calm * wall * (0.9 - 0.5 * soft) * np.exp(-((y - 0.5) / 0.8) ** 2)
    nn = n.copy()
    nn[:, 1] *= 0.55
    return p + nn * d[:, None]


def bake_ao(objs):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    try:
        pr = bpy.context.preferences.addons["cycles"].preferences
        pr.compute_device_type = "OPTIX"
        pr.get_devices()
        for dv in pr.devices:
            dv.use = True
        sc.cycles.device = "GPU"
    except Exception as e:  # noqa: BLE001
        U.log("gpu", e)
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.light_settings.distance = 14
    sc.render.bake.target = "VERTEX_COLORS"
    for o in objs:
        o.data.polygons.foreach_set("use_smooth", np.ones(len(o.data.polygons), bool))
        mat = bpy.data.materials.new(o.name)
        mat.use_nodes = True
        o.data.materials.clear()
        o.data.materials.append(mat)
        ca = o.data.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
        o.data.color_attributes.active_color = ca
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.bake(type="AO")
        U.log("AO mean", o.name, float(vcol(o.data).mean()))


def vcol(me):
    a = np.empty(len(me.vertices) * 4, np.float32)
    me.color_attributes["Color"].data.foreach_get("color", a)
    return a.reshape(-1, 4)[:, 0]


def tris(me):
    me.calc_loop_triangles()
    t = np.empty(len(me.loop_triangles) * 3, np.int32)
    me.loop_triangles.foreach_get("vertices", t)
    return t.reshape(-1, 3)


def main():
    t0 = time.time()
    U.reset_scene()
    v, f = grid_mesh(X0, X1, Z0, Z1, 1.0, solid_bottom=-40)
    ob = to_mesh("cove_rock", v, f)
    m = ob.modifiers.new("r", "REMESH")
    m.mode = "VOXEL"
    m.voxel_size = 0.5
    apply_mods(ob)
    me = ob.data
    U.log("remeshed", len(me.vertices), f"{time.time() - t0:.0f}s")
    set_co(me, displace(co(me), nrm(me), load_disp("cliff_a")))
    # drop the bottom and the skirt
    bm = bmesh.new()
    bm.from_mesh(me)
    kill = []
    for fa in bm.faces:
        c = fa.calc_center_median()
        if c.z < -33 or c.x < X0 + 1.6 or c.x > X1 - 1.6 or -c.y < Z0 + 1.6 or -c.y > Z1 - 1.6:
            kill.append(fa)
    bmesh.ops.delete(bm, geom=kill, context="FACES")
    bm.to_mesh(me)
    bm.free()
    n0 = sum(len(q.vertices) - 2 for q in me.polygons)
    dm = ob.modifiers.new("d", "DECIMATE")  # flat sand collapses first, crags keep their detail
    dm.ratio = min(1, TRIS / n0)
    apply_mods(ob)
    U.log("decimated", n0, "to", len(ob.data.polygons), f"{time.time() - t0:.0f}s")

    # far land / sea floor, coarser, tucked under the detailed block
    def inset(X, Z):
        a = (X > X0 + 3) & (X < X1 - 3) & (Z > Z0 + 3) & (Z < Z1 - 3)
        b = (X > X0 + 12) & (X < X1 - 12) & (Z > Z0 + 12) & (Z < Z1 - 12)
        return 6.0 * a + 400.0 * b
    v2, f2 = grid_mesh(-430, 430, -420, 290, 5.0, drop=inset)
    keep = ~(v2[f2][:, :, 1] < -120).any(1)
    far = to_mesh("cove_far", v2, f2[keep])
    d2 = far.data
    bm = bmesh.new()
    bm.from_mesh(d2)
    bmesh.ops.delete(bm, geom=[vv for vv in bm.verts if not vv.link_faces], context="VERTS")
    bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if e.calc_face_angle(0) > 0.22], cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(d2)
    bm.free()
    q, qn = co(d2), nrm(d2)
    st = S.sstep(0.12, 0.45, 1 - qn[:, 1])
    ff1, ff2, rr = S.worley(q[:, 0] / 14, q[:, 1] / 22, q[:, 2] / 14, 7)
    q = q + qn * (st * (5 * (rr - 0.5) - 2.5 * np.exp(-(ff2 - ff1) / 0.1) + 1.4 * S.fbm(q[:, 0] / 9, q[:, 1] / 9, q[:, 2] / 9, 3, 9)))[:, None]
    set_co(d2, q)

    bake_ao((ob, far))
    for o, nme in ((ob, "near"), (far, "far")):
        np.savez(C.CACHE / f"cove_{nme}.npz", v=co(o.data), t=tris(o.data), ao=vcol(o.data))
    U.log("ao done", f"{time.time() - t0:.0f}s")

    # depth map for the water shader: 8-bit, 0..40 m
    from mathutils import Vector
    from mathutils.bvhtree import BVHTree
    R = 384
    bx0, bx1, bz0, bz1 = -300, 300, -120, 290
    dg = bpy.context.evaluated_depsgraph_get()
    bvh, bvf = BVHTree.FromObject(ob, dg), BVHTree.FromObject(far, dg)
    px = np.zeros((R, R, 4), np.float32)
    px[..., 3] = 1
    down = Vector((0, 0, -1))
    for j in range(R):
        z = bz0 + (j + 0.5) / R * (bz1 - bz0)
        for i in range(R):
            x = bx0 + (i + 0.5) / R * (bx1 - bx0)
            h = bvh.ray_cast(Vector((x, -z, 200)), down)[0] or bvf.ray_cast(Vector((x, -z, 300)), down)[0]
            y = h.z if h else -25
            px[j, i, :3] = np.clip((-y + 4) / 44, 0, 1)
    img = bpy.data.images.new("seabed", R, R)
    img.colorspace_settings.name = "Non-Color"
    img.pixels = px.ravel().tolist()
    img.filepath_raw = str(C.OUT_MODELS / "cove_seabed.png")
    img.file_format = "PNG"
    img.save()
    (C.OUT_MODELS / "cove_seabed.json").write_text(json.dumps({"x0": bx0, "x1": bx1, "z0": bz0, "z1": bz1, "range": 44, "bias": 4}))

    out = C.OUT_MODELS / "cove_terrain.glb"
    bpy.ops.object.select_all(action="DESELECT")
    for o in (ob, far):
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
                              export_draco_position_quantization=15, export_draco_normal_quantization=9, export_draco_color_quantization=8,
                              export_texcoords=False, export_vertex_color="ACTIVE", export_active_vertex_color_when_no_material=True)
    U.log("cove_terrain.glb", out.stat().st_size // 1024, "KB", len(ob.data.polygons), len(far.data.polygons), f"{time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
