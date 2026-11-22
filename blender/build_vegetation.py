"""Photoreal Mediterranean vegetation → impostor atlases for the web app.

Sources
* Poly Haven scanned trees (CC0, 1–17 M polygons each): island_tree_01/02/03 (gnarled,
  olive-like), pine_tree_01 a/b/c, jacaranda_tree, tree_small_02.
* Procedural species built here from real scanned leaf textures:
  - Italian cypress  — thousands of fir-twig cards (fir_tree_01 twig material) on a spindle;
  - date palm        — ringed trunk + fronds with individually modelled leaflets;
  - clipped shrubs   — olive-leaf cards (island_tree_01 leaves) filling an ellipsoid;
  - pampas grass and lavender — blades, plumes and flower spikes as geometry.

Every species is baked into an impostor atlas: 8 azimuths × 3 elevations (0°, 30°, 60°),
orthographic, alpha, lit from the camera's upper side, colour-dilated to avoid mip halos.
The web app draws them as instanced camera-facing cards that pick (and cross-fade) the
closest view — thousands of photographic trees for a few thousand triangles.

    blender -b --python blender/build_vegetation.py -- [--only olive_a,palm_a] [--tile 512]
"""
import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Euler, Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402

OUT = C.OUT_MODELS / "vegetation"
AZ = 8
ELEV = [0, 30, 60]
R = random.Random(7)


# ---------------------------------------------------------------------------
# sources
# ---------------------------------------------------------------------------
def import_ph(pid, obj_filter=None):
    rel = (U.manifest().get("models") or {}).get(pid)
    if not rel:
        raise RuntimeError(f"{pid} not downloaded")
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(C.ROOT / rel))
    objs = [o for o in bpy.data.objects if o not in before and o.type == "MESH"]
    if obj_filter:
        keep = [o for o in objs if obj_filter in o.name]
        for o in objs:
            if o not in keep:
                bpy.data.objects.remove(o)
        objs = keep
    # move to the origin (base of trunk at 0)
    bpy.context.view_layer.update()
    mn, mx = bbox(objs)
    for o in objs:
        o.location -= Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    return objs


def bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector(map(min, mn, w))
            mx = Vector(map(max, mx, w))
    return mn, mx


def borrow_material(pid, name_part):
    """Import a scanned model only to steal one of its (alpha leaf) materials."""
    objs = import_ph(pid)
    mat = None
    for o in objs:
        for s in o.material_slots:
            if s.material and name_part in s.material.name:
                mat = s.material
    for o in objs:
        bpy.data.objects.remove(o)
    if mat:
        # scanned leaf materials multiply by a per-vertex colour attribute our cards do not
        # have; neutralise it (white, opaque) so only the photographed texture remains
        nt = mat.node_tree
        for n in [n for n in nt.nodes if n.type == "ATTRIBUTE"]:
            for link in list(nt.links):
                if link.from_node == n:
                    sock = link.to_socket
                    nt.links.remove(link)
                    try:
                        sock.default_value = (1, 1, 1, 1) if len(sock.default_value) == 4 else 1.0
                    except TypeError:
                        sock.default_value = 1.0
    return mat


def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = True
    return o


def card(bm, uv, center, normal_dir, up, w, h):
    """Textured quad (alpha leaf card) centred at `center`."""
    side = normal_dir.cross(up).normalized() * (w / 2)
    upv = up.normalized() * (h / 2)
    vs = [bm.verts.new(center - side - upv), bm.verts.new(center + side - upv), bm.verts.new(center + side + upv), bm.verts.new(center - side + upv)]
    f = bm.faces.new(vs)
    for loop, (u, v) in zip(f.loops, ((0, 0), (1, 0), (1, 1), (0, 1))):
        loop[uv].uv = (u, v)
    return f


def bark_material(name, base=(0.32, 0.25, 0.18)):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18
    noise.inputs["Detail"].default_value = 8
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*[c * 0.55 for c in base], 1)
    ramp.color_ramp.elements[1].color = (*[min(1, c * 1.35) for c in base], 1)
    nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.6
    nt.links.new(noise.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    b.inputs["Roughness"].default_value = 0.9
    return m


def leaf_material(name, color, sheen=0.25):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = 0.55
    b.inputs["Subsurface Weight"].default_value = sheen
    return m


# ---------------------------------------------------------------------------
# procedural species
# ---------------------------------------------------------------------------
def make_cypress(seed, height):
    r = random.Random(seed)
    twig = borrow_material("fir_tree_01", "twig")
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new()
    radius = height * 0.085
    n = int(height * 260)
    for _ in range(n):
        h = r.random() ** 0.85 * height
        t = h / height
        prof = math.sin(math.pi * min(1, t * 1.02)) ** 0.7 * (1 - 0.35 * t)  # spindle, pointed top
        rad = radius * prof * r.uniform(0.55, 1.05) + 0.05
        a = r.uniform(0, math.tau)
        c = Vector((math.cos(a) * rad, math.sin(a) * rad, h + 0.6))
        out = Vector((math.cos(a), math.sin(a), 0))
        up = Vector((r.uniform(-0.25, 0.25), r.uniform(-0.25, 0.25), 1)).normalized()
        nrm = (out + Vector((r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), r.uniform(-0.2, 0.4)))).normalized()
        s = r.uniform(0.45, 0.8) * (1 - 0.4 * t)
        card(bm, uv, c, nrm, up, s * 0.7, s)
    foliage = mesh_obj("cypress_foliage", bm, twig)
    bpy.ops.mesh.primitive_cone_add(vertices=8, radius1=0.16, radius2=0.04, depth=height * 0.9, location=(0, 0, height * 0.45))
    trunk = bpy.context.active_object
    trunk.data.materials.append(bark_material("cypress_bark"))
    return [foliage, trunk]


def make_palm(seed, height):
    r = random.Random(seed)
    bark = bark_material("palm_bark", (0.3, 0.25, 0.19))
    leaf = leaf_material("palm_leaf", (0.12, 0.2, 0.05))
    bm = bmesh.new()
    # ringed, slightly curved trunk
    segs, ring = 36, 10
    lean = Vector((r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), 0))
    prev = None
    for i in range(segs + 1):
        t = i / segs
        c = lean * t * t + Vector((0, 0, t * height))
        rad = 0.33 * (1.3 - 0.35 * t) * (1.07 if i % 2 == 0 else 0.96)
        cur = [bm.verts.new(c + Vector((math.cos(a) * rad, math.sin(a) * rad, 0))) for a in np.linspace(0, math.tau, ring, endpoint=False)]
        if prev:
            for k in range(ring):
                bm.faces.new((prev[k], prev[(k + 1) % ring], cur[(k + 1) % ring], cur[k]))
        prev = cur
    trunk = mesh_obj("palm_trunk", bm, bark)
    top = lean + Vector((0, 0, height))
    bm = bmesh.new()
    fronds = 30
    for f in range(fronds):
        yaw = f / fronds * math.tau + r.uniform(-0.15, 0.15)
        pitch = r.uniform(-0.3, 0.75) if f % 3 else r.uniform(0.6, 1.1)  # some upright young fronds
        length = r.uniform(3.2, 4.2)
        d = Vector((math.cos(yaw), math.sin(yaw), 0))
        side = Vector((-d.y, d.x, 0))
        pts = []
        for k in range(16):
            t = k / 15
            z = math.sin(pitch) * length * t - (t ** 2) * length * 0.55 * (1 - math.sin(pitch) * 0.5)
            pts.append(top + d * (math.cos(pitch) * length * t) + Vector((0, 0, z)))
        # rachis
        for k in range(15):
            a, b = pts[k], pts[k + 1]
            w = 0.04 * (1 - k / 15) + 0.01
            v = [bm.verts.new(a - side * w), bm.verts.new(a + side * w), bm.verts.new(b + side * w * 0.9), bm.verts.new(b - side * w * 0.9)]
            bm.faces.new(v)
        # leaflets on both sides, V-shaped and drooping
        for k in range(2, 60):
            t = k / 60
            p = pts[0].lerp(pts[-1], t)
            i = min(14, int(t * 15))
            p = pts[i].lerp(pts[i + 1], t * 15 - i)
            ll = 0.75 * math.sin(math.pi * min(1, t * 1.1)) + 0.15
            for s in (-1, 1):
                dirv = (side * s * 0.8 + d * 0.55 + Vector((0, 0, -0.35 + r.uniform(-0.1, 0.15)))).normalized()
                tip = p + dirv * ll
                mid = p + dirv * ll * 0.5 + Vector((0, 0, 0.04))
                wv = Vector((0, 0, 0.035))
                bm.faces.new([bm.verts.new(p), bm.verts.new(mid + wv), bm.verts.new(tip)])
                bm.faces.new([bm.verts.new(p), bm.verts.new(tip), bm.verts.new(mid - wv)])
    crown = mesh_obj("palm_crown", bm, leaf)
    for p in crown.data.polygons:
        p.use_smooth = False
    return [trunk, crown]


def make_shrub(seed, rx, ry, rz):
    """Clipped Mediterranean shrub (pittosporum / myrtle): thousands of small modelled leaves
    with per-leaf colour variation, denser and lighter on the sunlit outer shell."""
    r = random.Random(seed)
    m = bpy.data.materials.new("shrub_leaf")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    attr = nt.nodes.new("ShaderNodeVertexColor")
    attr.layer_name = "Col"
    nt.links.new(attr.outputs["Color"], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.45
    bsdf.inputs["Subsurface Weight"].default_value = 0.15
    bm = bmesh.new()
    colv = bm.loops.layers.color.new("Col")
    n = int(rx * ry * rz * 9000) + 800
    for _ in range(n):
        while True:
            d = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(-1, 1)))
            if 0.55 < d.length <= 1.0:
                break
        c = Vector((d.x * rx, d.y * ry, (d.z * 0.5 + 0.5) * rz * 1.9 + 0.05))
        nrm = Vector((d.x, d.y, d.z * 0.6 + 0.3)).normalized()
        t1 = nrm.orthogonal().normalized()
        t1.rotate(Euler((0, 0, r.uniform(0, math.tau))))
        t1 = (t1 - nrm * t1.dot(nrm)).normalized()
        t2 = nrm.cross(t1)
        L, W = r.uniform(0.045, 0.075), r.uniform(0.018, 0.028)
        vs = [bm.verts.new(c - t1 * L), bm.verts.new(c + t2 * W), bm.verts.new(c + t1 * L), bm.verts.new(c - t2 * W)]
        f = bm.faces.new(vs)
        shell = (d.length - 0.55) / 0.45
        g = r.uniform(0.75, 1.15)
        col = (0.05 * g + 0.03 * shell, (0.12 + 0.08 * shell) * g, 0.03 * g, 1)
        for lp in f.loops:
            lp[colv] = col
    o = mesh_obj("shrub", bm, m)
    for p in o.data.polygons:
        p.use_smooth = False
    return [o]


def make_pampas(seed):
    r = random.Random(seed)
    blade = leaf_material("pampas_blade", (0.16, 0.22, 0.09))
    plume = leaf_material("pampas_plume", (0.88, 0.82, 0.68), 0.6)
    bm = bmesh.new()
    for _ in range(260):
        a = r.uniform(0, math.tau)
        lean = r.uniform(0.15, 0.9)
        L = r.uniform(0.9, 1.6)
        base = Vector((math.cos(a) * 0.12, math.sin(a) * 0.12, 0))
        d = Vector((math.cos(a) * lean, math.sin(a) * lean, 1)).normalized()
        side = Vector((-math.sin(a), math.cos(a), 0))
        prev = None
        for k in range(7):
            t = k / 6
            p = base + d * L * t + Vector((0, 0, -t * t * L * 0.35 * lean))
            w = 0.012 * (1 - t) + 0.002
            cur = (bm.verts.new(p - side * w), bm.verts.new(p + side * w))
            if prev:
                bm.faces.new((prev[0], prev[1], cur[1], cur[0]))
            prev = cur
    grass = mesh_obj("pampas_blades", bm, blade)
    bm = bmesh.new()
    for _ in range(14):
        a = r.uniform(0, math.tau)
        lean = r.uniform(0.0, 0.25)
        stem_top = Vector((math.cos(a) * lean, math.sin(a) * lean, 1)) * r.uniform(1.8, 2.4)
        for _k in range(70):
            t = r.uniform(0.0, 1.0)
            p = stem_top + Vector((r.uniform(-0.06, 0.06), r.uniform(-0.06, 0.06), t * 0.55))
            q = p + Vector((r.uniform(-0.1, 0.1), r.uniform(-0.1, 0.1), r.uniform(0.05, 0.18))) * (1.2 - t)
            o = Vector((0.012, 0, 0))
            bm.faces.new((bm.verts.new(p - o), bm.verts.new(p + o), bm.verts.new(q)))
        # stem
        bm.faces.new((bm.verts.new(Vector((-0.01, 0, 0))), bm.verts.new(Vector((0.01, 0, 0))), bm.verts.new(stem_top + Vector((0.01, 0, 0))), bm.verts.new(stem_top - Vector((0.01, 0, 0)))))
    plumes = mesh_obj("pampas_plumes", bm, plume)
    return [grass, plumes]


def make_lavender(seed):
    r = random.Random(seed)
    green = leaf_material("lavender_leaf", (0.22, 0.27, 0.2))
    flower = leaf_material("lavender_flower", (0.32, 0.22, 0.55), 0.5)
    bm = bmesh.new()
    bm2 = bmesh.new()
    for _ in range(900):
        while True:
            d = Vector((r.uniform(-1, 1), r.uniform(-1, 1), r.uniform(0, 1)))
            if d.length <= 1:
                break
        p = Vector((d.x * 0.45, d.y * 0.45, d.z * 0.4))
        q = p + Vector((r.uniform(-0.03, 0.03), r.uniform(-0.03, 0.03), 0.08))
        o = Vector((0.008, 0, 0))
        bm.faces.new((bm.verts.new(p - o), bm.verts.new(p + o), bm.verts.new(q)))
    for _ in range(140):
        a = r.uniform(0, math.tau)
        rr = r.uniform(0, 0.4)
        base = Vector((math.cos(a) * rr, math.sin(a) * rr, 0.35))
        tip = base + Vector((math.cos(a) * 0.1, math.sin(a) * 0.1, r.uniform(0.3, 0.45)))
        o = Vector((0.004, 0, 0))
        bm2.faces.new((bm2.verts.new(base - o), bm2.verts.new(base + o), bm2.verts.new(tip)))
        for k in range(6):
            p = base.lerp(tip, 0.6 + k * 0.07)
            s = 0.018
            bm2.faces.new((bm2.verts.new(p + Vector((-s, 0, 0))), bm2.verts.new(p + Vector((s, 0, 0))), bm2.verts.new(p + Vector((0, 0, s * 2.5)))))
    return [mesh_obj("lavender_leaves", bm, green), mesh_obj("lavender_flowers", bm2, flower)]


SPECIES = {
    # key: (builder, tile px, scale)
    "olive_a": (lambda: import_ph("island_tree_01"), 512, 1.35),
    "olive_b": (lambda: import_ph("island_tree_02"), 512, 1.45),
    "olive_c": (lambda: import_ph("island_tree_03"), 512, 1.7),
    "pine_a": (lambda: import_ph("pine_tree_01", "_a_"), 384, 1.0),
    "pine_b": (lambda: import_ph("pine_tree_01", "_b_"), 384, 1.0),
    "pine_c": (lambda: import_ph("pine_tree_01", "_c_"), 384, 1.0),
    "broadleaf": (lambda: import_ph("jacaranda_tree"), 384, 0.62),
    "ornamental": (lambda: import_ph("tree_small_02"), 512, 1.3),
    "cypress_a": (lambda: make_cypress(1, 12.0), 384, 1.0),
    "cypress_b": (lambda: make_cypress(2, 9.0), 384, 1.0),
    "palm_a": (lambda: make_palm(3, 8.5), 512, 1.0),
    "palm_b": (lambda: make_palm(4, 11.0), 512, 1.0),
    "shrub_round": (lambda: make_shrub(5, 0.8, 0.8, 0.75), 256, 1.0),
    "shrub_wide": (lambda: make_shrub(6, 1.5, 1.0, 0.9), 256, 1.0),
    "pampas": (lambda: make_pampas(8), 256, 1.0),
    "lavender": (lambda: make_lavender(9), 256, 1.0),
}


# ---------------------------------------------------------------------------
# impostor baking
# ---------------------------------------------------------------------------
def setup_render(tile):
    sc = bpy.context.scene
    engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
    sc.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    sc.render.resolution_x = sc.render.resolution_y = tile
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_mode = "RGBA"
    sc.view_settings.view_transform = "Standard"
    try:
        sc.eevee.taa_render_samples = 32
    except Exception:
        pass
    world = bpy.data.worlds.new("w")
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (0.75, 0.82, 0.95, 1)
    bg.inputs["Strength"].default_value = 0.55


def bake(key, objs, tile, scale):
    sc = bpy.context.scene
    for o in objs:
        o.scale = (scale, scale, scale)
        for s in o.material_slots:
            m = s.material
            if m:
                m.surface_render_method = "DITHERED"
    bpy.context.view_layer.update()
    mn, mx = bbox(objs)
    center = (mn + mx) / 2
    size = max(mx.x - mn.x, mx.y - mn.y, mx.z - mn.z) * 1.04
    cam_data = bpy.data.cameras.new("imp")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = size
    cam_data.clip_end = size * 10
    cam = bpy.data.objects.new("imp", cam_data)
    sc.collection.objects.link(cam)
    sc.camera = cam
    sun = bpy.data.lights.new("key", "SUN")
    sun.energy = 3.2
    sun.angle = math.radians(8)
    sun_o = bpy.data.objects.new("key", sun)
    sc.collection.objects.link(sun_o)
    tmp = C.CACHE / "impostor_tmp"
    tmp.mkdir(parents=True, exist_ok=True)
    rows = []
    for el in ELEV:
        row = []
        for a in range(AZ):
            az = a / AZ * math.tau
            # web convention: azimuth 0 looks at the tree from +z (web) = -y (Blender)
            d = Vector((math.sin(az) * math.cos(math.radians(el)), -math.cos(az) * math.cos(math.radians(el)), math.sin(math.radians(el))))
            cam.location = center + d * size * 3
            cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
            # key light from the camera's upper-left, slightly in front
            ld = (d + Vector((0, 0, 1.2)) + d.cross(Vector((0, 0, 1))) * 0.6).normalized()
            sun_o.rotation_euler = (-ld).to_track_quat("-Z", "Y").to_euler()
            sc.render.filepath = str(tmp / f"{key}_{el}_{a}.png")
            bpy.ops.render.render(write_still=True)
            img = bpy.data.images.load(sc.render.filepath)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(tile, tile, 4)
            bpy.data.images.remove(img)
            row.append(px)
        rows.append(np.concatenate(row, axis=1))
    atlas = np.concatenate(rows[::-1], axis=0)  # Blender images are bottom-up: elevation 0 ends at the top row
    # colour dilation: give transparent texels the average crown colour (no dark halos in mips)
    a = atlas[..., 3:4]
    mask = a[..., 0] > 0.5
    mean = atlas[mask][:, :3].mean(axis=0) if mask.any() else np.array([0.2, 0.3, 0.1])
    # PNG renders are straight alpha already: keep RGB, only fill fully transparent texels
    atlas[..., :3] = np.where(a > 0.02, atlas[..., :3], mean)
    atlas[..., :3] = np.clip(atlas[..., :3], 0, 1)
    h, w = atlas.shape[:2]
    out = bpy.data.images.new(f"{key}_atlas", w, h, alpha=True)
    out.pixels = atlas.ravel()
    OUT.mkdir(parents=True, exist_ok=True)
    out.filepath_raw = str(OUT / f"{key}.webp")
    out.file_format = "WEBP"
    sc.render.image_settings.quality = 88
    out.save()
    U.log(f"{key}: atlas {w}x{h}, height {mx.z - mn.z:.1f} m, crown {max(mx.x - mn.x, mx.y - mn.y):.1f} m")
    return {
        "atlas": f"models/vegetation/{key}.webp", "cols": AZ, "rows": len(ELEV), "elevations": ELEV,
        "size": round(size, 3), "center": [round(center.x, 3), round(center.z - mn.z, 3), round(-center.y, 3)],
        "height": round(mx.z - mn.z, 3), "width": round(max(mx.x - mn.x, mx.y - mn.y), 3),
    }


def main():
    args = U.script_args()
    only = set(args[args.index("--only") + 1].split(",")) if "--only" in args else None
    meta_path = OUT / "vegetation.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    U.MATERIAL_MODE = "render"
    for key, (builder, tile, scale) in SPECIES.items():
        if only and key not in only:
            continue
        try:
            U.reset_scene()
            setup_render(tile)
            objs = builder()
            meta[key] = bake(key, objs, tile, scale)
            meta_path.write_text(json.dumps(meta, indent=1))
        except Exception as e:  # noqa: BLE001
            import traceback

            traceback.print_exc()
            U.log(f"{key} FAILED: {e}")
    meta_path.write_text(json.dumps(meta, indent=1))


if __name__ == "__main__":
    main()
