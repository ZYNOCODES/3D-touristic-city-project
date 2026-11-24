"""Aleppo pines, mastic and rosemary for the calanque.
Foliage clumps are rendered from modelled needles / leaves into an atlas, then assembled into light card trees for
close views; the same trees are baked to 24-view impostors for the hills. Also writes the planting plan (ray-cast on
the real terrain surface). Outputs textures/cove/clumps.webp, models/cove_plants.glb, models/vegetation/aleppo_*.webp,
models/vegetation/cove.json and src/data/generated/plants.json."""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import build_vegetation as V  # noqa: E402
import config as C  # noqa: E402
import cove_shape as S  # noqa: E402
import cove_textures as T  # noqa: E402

TMP = C.CACHE / "cove_tmp"
TMP.mkdir(parents=True, exist_ok=True)
ATLAS = TMP / "clumps.png"
N = 512


def leaf_mat(name, c0, c1, trans=0.35):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    mix = nt.nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = trans
    d = nt.nodes.new("ShaderNodeBsdfDiffuse")
    t = nt.nodes.new("ShaderNodeBsdfTranslucent")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*c0, 1)
    ramp.color_ramp.elements[1].color = (*c1, 1)
    oi = nt.nodes.new("ShaderNodeAttribute")
    oi.attribute_name = "rnd"
    nt.links.new(oi.outputs["Fac"], ramp.inputs[0])
    nt.links.new(ramp.outputs[0], d.inputs[0])
    nt.links.new(ramp.outputs[0], t.inputs[0])
    nt.links.new(d.outputs[0], mix.inputs[1])
    nt.links.new(t.outputs[0], mix.inputs[2])
    nt.links.new(mix.outputs[0], out.inputs[0])
    return m


class Blades:
    def __init__(self):
        self.v, self.f, self.r = [], [], []

    def blade(self, p, d, L, w, rnd, bend=0.0, seg=2, shape="needle"):
        d = d.normalized()
        s = d.cross(Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(-1, 1)))).normalized()
        up = s.cross(d)
        base = len(self.v)
        for i in range(seg + 1):
            t = i / seg
            k = (1 - t * 0.75) if shape == "needle" else math.sin(math.pi * (0.12 + 0.86 * t)) ** 0.8
            c = p + d * (L * t) - up * (bend * L * t * t)
            self.v += [c - s * (w * k), c + s * (w * k)]
            self.r += [rnd, rnd]
        for i in range(seg):
            a = base + i * 2
            self.f.append((a, a + 1, a + 3, a + 2))

    def stick(self, a, b, r):
        d = (b - a).normalized()
        s = d.orthogonal().normalized()
        for q in (s, d.cross(s)):
            base = len(self.v)
            self.v += [a - q * r, a + q * r, b + q * r * 0.6, b - q * r * 0.6]
            self.r += [2.0] * 4
            self.f.append((base, base + 1, base + 2, base + 3))

    def obj(self, name, leaf, wood):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(q) for q in self.v], [], self.f)
        at = me.attributes.new("rnd", "FLOAT", "POINT")
        at.data.foreach_set("value", np.clip(np.array(self.r, np.float32), 0, 1))
        me.materials.append(leaf)
        me.materials.append(wood)
        for p in me.polygons:
            if self.r[p.vertices[0]] > 1.5:
                p.material_index = 1
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def rv(s=1.0):
    return Vector((random.gauss(0, 1), random.gauss(0, 1), random.gauss(0, 1))).normalized() * s


def pine_clump(seed):
    """branch tip of Pinus halepensis: many short shoots with soft, light-green paired needles"""
    random.seed(seed)
    B = Blades()
    for _ in range(95):
        # shoots fan outwards/upwards from the clump base, filling a flattened dome
        a = random.uniform(0, math.tau)
        el = random.uniform(-0.25, 1.15)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el) * 0.75)).normalized()
        L = random.uniform(0.34, 0.56)
        p0 = Vector((0, 0, -0.1)) + d * random.uniform(0.0, 0.12)
        p1 = p0 + d * L
        B.stick(Vector((0, 0, -0.12)), p1, 0.006)
        tone = random.random()
        for k in range(150):
            t = 0.25 + 0.75 * (k / 150) ** 0.8
            q = p0.lerp(p1, t)
            nd = (d * random.uniform(0.35, 1.1) + rv(0.85)).normalized()
            B.blade(q, nd, random.uniform(0.06, 0.11), 0.0028, min(1, tone * 0.6 + random.random() * 0.4 + 0.1 * t), bend=random.uniform(0, 0.2))
    return B


def broad_clump(seed, n_sh=66, leaf=0.055, lw=0.018):
    random.seed(seed)
    B = Blades()
    for _ in range(n_sh):
        a = random.uniform(0, math.tau)
        el = random.uniform(-0.15, 1.3)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el) * 0.85)).normalized()
        L = random.uniform(0.3, 0.58)
        p0 = Vector((0, 0, -0.18))
        p1 = p0 + d * L
        B.stick(p0, p1, 0.006)
        tone = random.random()
        for k in range(46):
            t = 0.2 + 0.8 * k / 46
            q = p0.lerp(p1, t)
            nd = (d * 0.5 + rv(1.0)).normalized()
            B.blade(q, nd, leaf * random.uniform(0.7, 1.2), lw, min(1, tone * 0.5 + random.random() * 0.5), seg=3, shape="leaf")
    return B


def rosemary(seed):
    random.seed(seed)
    B = Blades()
    for _ in range(120):
        a = random.uniform(0, math.tau)
        el = random.uniform(0.55, 1.5)
        d = Vector((math.cos(a) * math.cos(el), math.sin(a) * math.cos(el), math.sin(el))).normalized()
        L = random.uniform(0.35, 0.72)
        p0 = Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, -0.42))
        p1 = p0 + d * L
        B.stick(p0, p1, 0.004)
        for k in range(70):
            t = 0.15 + 0.85 * k / 70
            B.blade(p0.lerp(p1, t), (d * 0.9 + rv(0.7)).normalized(), random.uniform(0.022, 0.04), 0.0036, random.random())
    return B


def render_clumps():
    U.reset_scene()
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 48
    sc.cycles.use_denoising = False
    sc.render.film_transparent = True
    sc.view_settings.view_transform = "Standard"
    sc.render.resolution_x = sc.render.resolution_y = N
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    w = bpy.data.worlds.new("w")
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (1, 1, 1, 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    sun = bpy.data.objects.new("s", bpy.data.lights.new("s", "SUN"))
    sun.data.energy = 1.1
    sun.data.angle = 0.5
    sun.rotation_euler = (0.5, 0.2, 0)
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new("c", bpy.data.cameras.new("c"))
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = 1.12
    cam.location = (0, -4, 0.12)
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    wood = leaf_mat("wood", (0.16, 0.11, 0.07), (0.2, 0.15, 0.1), 0.0)
    pine = leaf_mat("pine", (0.10, 0.19, 0.035), (0.34, 0.46, 0.09), 0.45)
    mast = leaf_mat("mast", (0.06, 0.12, 0.03), (0.2, 0.3, 0.08), 0.35)
    rosm = leaf_mat("rosm", (0.13, 0.19, 0.1), (0.3, 0.36, 0.22), 0.3)
    out = np.zeros((N * 2, N * 2, 4), np.float32)
    for i, (B, m) in enumerate(((pine_clump(1), pine), (pine_clump(7), pine), (broad_clump(3), mast), (rosemary(5), rosm))):
        o = B.obj("clump", m, wood)
        p = TMP / f"clump{i}.png"
        sc.render.filepath = str(p)
        bpy.ops.render.render(write_still=True)
        im = bpy.data.images.load(str(p))
        a = np.empty(N * N * 4, np.float32)
        im.pixels.foreach_get(a)
        a = a.reshape(N, N, 4)
        # bleed colour under the alpha so mip-maps stay green at the edges
        al = a[..., 3:4]
        col = a[..., :3] * 1.0
        mean = (col * al).sum((0, 1)) / al.sum()
        acc, wt = col * al, al.copy()
        for _ in range(24):
            acc = (acc + np.roll(acc, 1, 0) + np.roll(acc, -1, 0) + np.roll(acc, 1, 1) + np.roll(acc, -1, 1)) / 5
            wt = (wt + np.roll(wt, 1, 0) + np.roll(wt, -1, 0) + np.roll(wt, 1, 1) + np.roll(wt, -1, 1)) / 5
        fill = np.where(wt > 1e-4, acc / np.maximum(wt, 1e-4), mean)
        a[..., :3] = np.where(al > 0.5, col, fill)
        r, c = i // 2, i % 2
        out[r * N:(r + 1) * N, c * N:(c + 1) * N] = a
        bpy.data.objects.remove(o)
        U.log("clump", i, "cover", float((al > 0.5).mean()))
    img = bpy.data.images.new("clumps", N * 2, N * 2, alpha=True)
    img.pixels.foreach_set(out.ravel())
    img.filepath_raw = str(ATLAS)
    img.file_format = "PNG"
    img.save()
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGBA"
    sc.render.image_settings.quality = 88
    img.save_render(str(C.OUT_TEXTURES / "cove" / "clumps.webp"), scene=sc)


class Tree:
    """trunk tubes + foliage cards; cards get outward 'puffy' normals"""

    def __init__(self):
        self.bm_v, self.bm_f, self.uv = [], [], []
        self.cv, self.cf, self.cuv, self.cn = [], [], [], []

    def tube(self, pts, radii, seg=7):
        base = len(self.bm_v)
        for i, q in enumerate(pts):
            d = (pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]).normalized()
            u = d.cross(Vector((0.3, 1, 0.2))).normalized()
            w = d.cross(u)
            for k in range(seg + 1):
                a = k / seg * math.tau
                self.bm_v.append(q + (u * math.cos(a) + w * math.sin(a)) * radii[i])
                self.uv.append((k / seg, i * 0.5))
        for i in range(len(pts) - 1):
            for k in range(seg):
                a = base + i * (seg + 1) + k
                self.bm_f.append((a, a + 1, a + seg + 2, a + seg + 1))

    def card(self, c, size, cell, center, up=Vector((0, 0, 1)), n=2, tilt=0.35):
        u0, v0 = (cell % 2) * 0.5, (cell // 2) * 0.5
        a0 = random.uniform(0, math.pi)
        for k in range(n):
            a = a0 + k * math.pi / n + random.uniform(-0.2, 0.2)
            rt = Vector((math.cos(a), math.sin(a), random.uniform(-tilt, tilt))).normalized()
            upv = (up + rv(tilt)).normalized()
            upv = (upv - rt * upv.dot(rt)).normalized()
            base = len(self.cv)
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                p = c + rt * (sx * size / 2) + upv * (sy * size / 2)
                self.cv.append(p)
                self.cuv.append((u0 + 0.5 * (sx * 0.5 + 0.5), v0 + 0.5 * (sy * 0.5 + 0.5)))
                nn = (p - center).normalized() * 0.8 + Vector((0, 0, 0.45))
                self.cn.append(nn.normalized())
            self.cf.append((base, base + 1, base + 2, base + 3))

    def build(self, name, bark, leaf):
        v = self.bm_v + self.cv
        k = len(self.bm_v)
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(q) for q in v], [], self.bm_f + [tuple(i + k for i in f) for f in self.cf])
        uv = me.uv_layers.new(name="UVMap")
        alluv = self.uv + self.cuv
        for lp in me.loops:
            uv.data[lp.index].uv = alluv[lp.vertex_index]
        me.materials.append(bark)
        me.materials.append(leaf)
        nb = len(self.bm_f)
        for p in me.polygons:
            p.use_smooth = True
            p.material_index = 0 if p.index < nb else 1
        me.update()
        nrm = [tuple(n.normal) for n in me.vertices]
        for i, n in enumerate(self.cn):
            nrm[k + i] = tuple(n)
        me.normals_split_custom_set_from_vertices(nrm)
        o = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(o)
        return o


def make_aleppo(seed, h=8.0, lean=0.25, spread=3.4, clumps=78):
    random.seed(seed)
    t = Tree()
    ldir = random.uniform(0, math.tau)
    L = Vector((math.cos(ldir), math.sin(ldir), 0))
    trunk = []
    for i in range(9):
        k = i / 8
        trunk.append(Vector((0, 0, -0.5)) + L * (lean * h * k ** 1.5) + Vector((math.sin(k * 5 + seed) * 0.16, math.cos(k * 4 + seed) * 0.16, k * h * 0.74)))
    r0 = 0.022 * h + 0.06
    t.tube(trunk, [r0 * (1 - 0.6 * i / 8) * (1.35 if i == 0 else 1) for i in range(9)], 9)
    crown = trunk[-1] + Vector((0, 0, h * 0.05))
    tips = []
    nb = 11
    for b in range(nb):
        k = 0.42 + 0.58 * b / (nb - 1)
        q = trunk[min(8, int(k * 8))].copy()
        a = b * 2.4 + random.uniform(-0.4, 0.4)
        reach = spread * (1.0 - 0.45 * max(0, k - 0.6) / 0.4) * random.uniform(0.75, 1.1) * (0.75 if k < 0.55 else 1)
        rise = h * random.uniform(0.06, 0.2) + (k - 0.5) * h * 0.22
        pts = [q]
        for j in range(1, 6):
            s = j / 5
            pts.append(q + Vector((math.cos(a + 0.3 * s) * reach * s, math.sin(a + 0.3 * s) * reach * s, rise * s ** 1.4 + random.uniform(-0.08, 0.08))))
        br = r0 * 0.36 * (1.15 - 0.5 * k)
        t.tube(pts, [br * (1 - 0.75 * j / 5) for j in range(6)], 6)
        for j in range(2, 6):
            tips.append((pts[j], 0.6 + 0.4 * j / 5))
            for _ in range(2):
                o = pts[j] + Vector((random.uniform(-1, 1), random.uniform(-1, 1), random.uniform(0.1, 0.8))) * 0.75
                t.tube([pts[j], o], [br * 0.3, 0.012], 4)
                tips.append((o, 1.0))
    random.shuffle(tips)
    for i, (p, w) in enumerate(tips[:clumps]):
        s = random.uniform(1.15, 1.75) * (h / 8) ** 0.5
        t.card(p + Vector((0, 0, 0.16)), s, i % 2, crown - Vector((0, 0, h * 0.2)), n=3, tilt=0.5)
    return t


def make_shrub(seed, r, cell, n=15, flat=0.75):
    random.seed(seed)
    t = Tree()
    for i in range(n):
        d = rv()
        d.z = abs(d.z) * flat
        p = d * r * random.uniform(0.25, 0.75) + Vector((0, 0, r * 0.25))
        t.card(p, r * random.uniform(0.95, 1.35), cell, Vector((0, 0, r * 0.1)), n=2, tilt=0.35)
    return t


def mats():
    bark = bpy.data.materials.new("pine_bark")
    bark.use_nodes = True
    bark.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.155, 0.12, 1)
    bark.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.95
    leaf = bpy.data.materials.new("clumps")
    leaf.use_nodes = True
    nt = leaf.node_tree
    im = nt.nodes.new("ShaderNodeTexImage")
    im.image = bpy.data.images.load(str(ATLAS))
    bs = nt.nodes["Principled BSDF"]
    bs.inputs["Roughness"].default_value = 0.9
    nt.links.new(im.outputs["Color"], bs.inputs["Base Color"])
    gt = nt.nodes.new("ShaderNodeMath")
    gt.operation = "GREATER_THAN"
    gt.inputs[1].default_value = 0.45
    nt.links.new(im.outputs["Alpha"], gt.inputs[0])
    nt.links.new(gt.outputs[0], bs.inputs["Alpha"])
    return bark, leaf


def plants():
    U.reset_scene()
    bark, leaf = mats()
    specs = {"aleppo_a": make_aleppo(3, 9.0, 0.22, 3.6, 84), "aleppo_b": make_aleppo(8, 7.0, 0.42, 3.4, 72), "aleppo_c": make_aleppo(21, 5.2, 0.62, 3.0, 60),
             "mastic_a": make_shrub(2, 0.85, 2), "mastic_b": make_shrub(9, 1.2, 2, 18), "rosemary": make_shrub(4, 0.6, 3, 11, 0.5)}
    objs = {}
    for k, t in specs.items():
        objs[k] = t.build(k, bark, leaf)
        U.log(k, sum(len(p.vertices) - 2 for p in objs[k].data.polygons))
    # export geometry only (the web app owns the atlas material)
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs.values():
        o.select_set(True)
    for m in (leaf,):
        for nd in list(m.node_tree.nodes):
            if nd.type == "TEX_IMAGE":
                img = nd.image
                m.node_tree.nodes.remove(nd)
    out = C.OUT_MODELS / "cove_plants.glb"
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_yup=True, export_apply=True,
                              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6, export_draco_normal_quantization=10)
    U.log("cove_plants.glb", out.stat().st_size // 1024, "KB")
    # impostors for the hills
    meta = {}
    V.setup_render(256)
    for k in ("aleppo_a", "aleppo_b", "mastic_b"):
        for o in objs.values():
            o.hide_render = True
        o = objs[k]
        o.hide_render = False
        bs = leaf.node_tree.nodes["Principled BSDF"]
        if not any(nd.type == "TEX_IMAGE" for nd in leaf.node_tree.nodes):
            im = leaf.node_tree.nodes.new("ShaderNodeTexImage")
            im.image = bpy.data.images.load(str(ATLAS))
            leaf.node_tree.links.new(im.outputs["Color"], bs.inputs["Base Color"])
            gt = [n for n in leaf.node_tree.nodes if n.type == "MATH"][0]
            leaf.node_tree.links.new(im.outputs["Alpha"], gt.inputs[0])
        meta[k] = V.bake(k, [o], 256, 1.0)
    (C.OUT_MODELS / "vegetation" / "cove.json").write_text(json.dumps(meta, indent=1))
    U.log("impostors", list(meta))


def planting():
    H = json.loads((C.ROOT / "src" / "data" / "generated" / "hotel.json").read_text())

    def load(n):
        d = np.load(C.CACHE / f"cove_{n}.npz")
        return BVHTree.FromPolygons([Vector(p) for p in d["v"].tolist()], d["t"].tolist())
    near, far = load("near"), load("far")

    def hit(x, z):
        for b in (near, far):
            p, n, *_ = b.ray_cast(Vector((x, 400, z)), Vector((0, -1, 0)))
            if p:
                return p, (n if n.y > 0 else -n)
        return None
    R = random.Random(17)
    out = {k: [] for k in ("aleppo_a", "aleppo_b", "aleppo_c", "mastic_a", "mastic_b", "rosemary", "far_a", "far_b", "far_s")}
    path = [(-41, -70), (-46, -62), (-48, -52), (-47, -42), (-44.5, -33), (-41, -24), (-39, -17.5)]
    views = [((-60, 66), (6, 4), 9.0)]

    def seg_d(x, z, a, b):
        ax, az = a
        bx, bz = b
        t = max(0, min(1, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / ((bx - ax) ** 2 + (bz - az) ** 2)))
        return math.hypot(x - ax - t * (bx - ax), z - az - t * (bz - az))

    def blocked(x, z, r):
        if abs(x) < 43 + r and -112 - r < z < -52.4:
            return True
        if abs(x) < 43 and z < -44 and (r > 1 or 22 < x < 31 or -23 < x < 17):
            return True
        if abs(x) < 28 and -150 < z < -95:
            return True
        if any(seg_d(x, z, a, b) < 1.4 + r for a, b in zip(path, path[1:])):
            return True
        for cx, cz, rr, _ in S.DISCS:
            if math.hypot(x - cx, z - cz) < rr + 1.5 + r:
                return True
        for a, b, w in views:
            # keep the look-out window open, but let pines frame both sides
            ux, uz = b[0] - a[0], b[1] - a[1]
            L = math.hypot(ux, uz)
            f = ((x - a[0]) * ux + (z - a[1]) * uz) / L
            s = abs((x - a[0]) * uz - (z - a[1]) * ux) / L
            if -6 < f < 60 and s < 3.2 + max(0, f) * 0.24 + r:
                return True
        return False
    taken = {}

    def free(x, z, r):
        kx, kz = int(x // 4), int(z // 4)
        for i in range(-2, 3):
            for j in range(-2, 3):
                for (px, pz, pr) in taken.get((kx + i, kz + j), ()):
                    if math.hypot(px - x, pz - z) < (pr + r):
                        return False
        taken.setdefault((kx, kz), []).append((x, z, r))
        return True
    # hero pines that frame the key views: (x, z, species, scale, yaw)
    for x, z, sp, s, yaw in ((-66.5, 60.5, "aleppo_b", 1.15, 0.4), (-55.0, 72.5, "aleppo_a", 1.0, 2.1), (-61, 52, "aleppo_c", 1.1, 1.2), (-50, 62, "aleppo_c", 0.9, 4.0),
                             (-44, -24, "aleppo_c", 0.95, 5.2), (-50, -4, "aleppo_b", 1.0, 1.0), (-52, 12, "aleppo_a", 0.9, 3.3), (-46, -66, "aleppo_b", 0.9, 2.7), (46, -64, "aleppo_b", 1.0, 0.6), (48, -52, "aleppo_c", 1.0, 3.9)):
        h = hit(x, z)
        if h and free(x, z, 1.5):
            out[sp].append([round(x, 2), round(h[0].y - 0.15, 2), round(z, 2), round(s, 2), yaw])
    # near vegetation
    for _ in range(26000):
        x, z = R.uniform(-112, 106), R.uniform(-145, 140)
        h = hit(x, z)
        if not h or h[0].y < 3.2:
            continue
        p, n = h
        dens = S.vnoise(np.array(x / 16.0), np.array(0.0), np.array(z / 16.0), 77)
        dens = float(dens)
        flat = n.y
        if flat > 0.62 and p.y > 6 and R.random() < 0.16 + 0.2 * dens and not blocked(x, z, 1.8):
            edge = min(hh[0].y if (hh := hit(x + dx, z + dz)) else 0 for dx, dz in ((4, 0), (-4, 0), (0, 4), (0, -4))) < p.y - 4
            sp = "aleppo_c" if edge else R.choices(["aleppo_a", "aleppo_b", "aleppo_c"], [4, 3, 1])[0]
            s = R.uniform(0.7, 1.15)
            if free(x, z, 1.9 * s):
                out[sp].append([round(x, 2), round(p.y - 0.12, 2), round(z, 2), round(s, 2), round(R.uniform(0, 6.28), 2)])
        elif flat > 0.42 and R.random() < 0.42 + 0.35 * dens and not blocked(x, z, 0.3):
            sp = R.choices(["mastic_a", "mastic_b", "rosemary"], [4, 3, 4])[0]
            s = R.uniform(0.6, 1.25)
            if free(x, z, 0.55 * s):
                out[sp].append([round(x, 2), round(p.y - 0.1, 2), round(z, 2), round(s, 2), round(R.uniform(0, 6.28), 2)])
    # tufts growing out of the cliff faces
    d = np.load(C.CACHE / "cove_near.npz")
    v, t = d["v"], d["t"]
    tri = v[t]
    nr = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    ar = np.linalg.norm(nr, axis=1)
    nr /= ar[:, None] + 1e-9
    cen = tri.mean(1)
    led = np.nonzero((nr[:, 1] > 0.32) & (nr[:, 1] < 0.85) & (cen[:, 1] > 6) & ((cen[:, 0] > 40) | (cen[:, 0] < -44)))[0]
    rng = np.random.default_rng(4)
    for i in rng.choice(led, min(1100, len(led)), replace=False):
        x, y, z = cen[i]
        if blocked(x, z, 0.2):
            continue
        sp = R.choices(["mastic_a", "rosemary", "aleppo_c"], [6, 5, 0.8])[0]
        s = R.uniform(0.45, 0.95) if sp != "aleppo_c" else R.uniform(0.3, 0.5)
        if free(x, z, 0.5 * s):
            out[sp].append([round(float(x), 2), round(float(y) - 0.1, 2), round(float(z), 2), round(s, 2), round(R.uniform(0, 6.28), 2)])
    # hills
    for _ in range(26000):
        x, z = R.uniform(-420, 420), R.uniform(-410, 160)
        if -112 < x < 106 and z > -145:
            continue
        h = hit(x, z)
        if not h or h[0].y < 5 or h[1].y < 0.6:
            continue
        dens = float(S.vnoise(np.array(x / 34.0), np.array(0.0), np.array(z / 34.0), 78))
        if abs(x) < 30 and z > -158:
            continue
        if R.random() < 0.34 + 0.42 * dens and free(x, z, 1.9):
            k = R.choice(["far_a", "far_b"])
            out[k].append([round(x, 1), round(h[0].y - 0.3, 1), round(z, 1), round(R.uniform(0.75, 1.2), 2), round(R.uniform(0, 6.28), 2)])
        elif R.random() < 0.6 and free(x, z, 1.0):
            out["far_s"].append([round(x, 1), round(h[0].y - 0.2, 1), round(z, 1), round(R.uniform(0.9, 1.9), 2), round(R.uniform(0, 6.28), 2)])
    for x, y, z, s in H["trees"]:
        out["aleppo_b"].append([x, y, z, s, round(R.uniform(0, 6.28), 2)])
    for x, y, z, s in H["planters"]:
        out[R.choice(["rosemary", "mastic_a", "rosemary"])].append([x, round(y - 0.05, 2), z, round(s * R.uniform(0.6, 0.85), 2), round(R.uniform(0, 6.28), 2)])
    (C.ROOT / "src" / "data" / "generated" / "plants.json").write_text(json.dumps(out, separators=(",", ":")))
    U.log("plan", {k: len(v) for k, v in out.items()})


if __name__ == "__main__":
    steps = U.script_args() or ["clumps", "plants", "plan"]
    if "clumps" in steps:
        render_clumps()
    if "plants" in steps:
        plants()
    if "plan" in steps:
        planting()
