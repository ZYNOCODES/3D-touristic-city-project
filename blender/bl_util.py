"""Blender helpers shared by every builder script.

Coordinates: all builders are written in *web* space (metres, y up, +z = front
facing the ocean) so they read exactly like the TypeScript fallbacks in
src/scene/geo/*.ts. `W(x, y, z)` converts to Blender space (z up, -y front); the
glTF exporter converts back to y-up on export.

Materials: meshes are assigned materials whose *names* match the web material
library (plaster, roof, glass, wood, …). For GLB export they are kept plain (the
web app re-shades them with its own PBR library); for Cycles renders
`MATERIAL_MODE = "render"` builds full node trees with the downloaded Poly Haven
textures (or procedural fallbacks when a texture is missing).
"""
from __future__ import annotations

import json
import math
import random
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

MATERIAL_MODE = "export"  # or "render"


def log(*a):
    print("[blender]", *a, flush=True)


# ---------------------------------------------------------------------------
# scene
# ---------------------------------------------------------------------------
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections):
        bpy.data.collections.remove(c)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    return scene


def collection(name: str, parent=None):
    col = bpy.data.collections.get(name) or bpy.data.collections.new(name)
    if col.name not in (parent or bpy.context.scene.collection).children:
        (parent or bpy.context.scene.collection).children.link(col)
    return col


def W(x, y, z):
    """web (x, y-up, z-front) → Blender (x, -z, y)"""
    return Vector((x, -z, y))


def manifest() -> dict:
    p = C.PUBLIC / "assets-manifest.json"
    return json.loads(p.read_text()) if p.exists() else {}


def layout() -> dict:
    return json.loads(C.LAYOUT_JSON.read_text())


# ---------------------------------------------------------------------------
# materials
# ---------------------------------------------------------------------------
BASE_COLORS = {
    "plaster": ((0.89, 0.87, 0.83), 0.9, 0.0),
    "roof": ((0.04, 0.11, 0.07), 0.45, 0.35),
    "glass": ((0.6, 0.72, 0.74), 0.02, 0.0),
    "wood": ((0.62, 0.42, 0.26), 0.55, 0.0),
    "deck": ((0.55, 0.38, 0.25), 0.7, 0.0),
    "stone": ((0.62, 0.57, 0.5), 0.8, 0.0),
    "frame": ((0.03, 0.03, 0.03), 0.35, 0.8),
    "water": ((0.1, 0.55, 0.65), 0.02, 0.0),
    "glow": ((0.02, 0.02, 0.02), 0.6, 0.0),
    "concrete": ((0.66, 0.64, 0.6), 0.9, 0.0),
    "paving": ((0.78, 0.74, 0.66), 0.85, 0.0),
    "pooltile": ((0.55, 0.8, 0.86), 0.3, 0.0),
    "fabric": ((0.74, 0.68, 0.6), 0.95, 0.0),
    "cushion": ((0.86, 0.83, 0.77), 0.95, 0.0),
    "walnut": ((0.24, 0.14, 0.08), 0.5, 0.0),
    "marble": ((0.9, 0.89, 0.87), 0.2, 0.0),
    "floor": ((0.8, 0.76, 0.69), 0.35, 0.0),
    "ceiling": ((0.92, 0.91, 0.89), 0.95, 0.0),
    "black": ((0.02, 0.02, 0.02), 0.4, 0.0),
    "lamp": ((1.0, 0.92, 0.8), 0.4, 0.0),
    "metal": ((0.7, 0.7, 0.72), 0.3, 1.0),
    "rope": ((0.6, 0.5, 0.35), 0.9, 0.0),
    "umbrella": ((0.9, 0.87, 0.8), 0.9, 0.0),
    "plastic_red": ((0.75, 0.07, 0.04), 0.35, 0.0),
    "plastic_yellow": ((0.88, 0.5, 0.05), 0.35, 0.0),
    "plastic_teal": ((0.03, 0.4, 0.33), 0.35, 0.0),
    "rubber": ((0.75, 0.35, 0.2), 0.95, 0.0),
    "court": ((0.07, 0.3, 0.14), 0.8, 0.0),
}
# library name -> manifest texture set used in render mode
TEX_FOR = {
    "plaster": ("plaster", 0.5), "wood": ("oak", 0.6), "deck": ("deck", 0.4), "stone": ("stone_floor", 0.3),
    "paving": ("paving", 0.25), "pooltile": ("pool_tiles", 0.5), "fabric": ("linen", 1.2), "cushion": ("linen", 1.2),
    "walnut": ("walnut", 0.8), "marble": ("marble", 0.6), "floor": ("stone_floor", 0.4), "roof": ("roof", 0.6),
    "rubber": ("rubber", 0.3),
}


def _tex_node(nt, path: Path, colorspace: str):
    img = bpy.data.images.load(str(path), check_existing=True)
    img.colorspace_settings.name = colorspace
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = img
    n.projection = "BOX"
    n.projection_blend = 0.2
    return n


def material(name: str):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get("Principled BSDF")
    col, rough, metal = BASE_COLORS.get(name, ((0.7, 0.7, 0.7), 0.8, 0.0))
    bsdf.inputs["Base Color"].default_value = (*col, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    if name == "glass":
        bsdf.inputs["Transmission Weight"].default_value = 1.0
        bsdf.inputs["IOR"].default_value = 1.5
        m.diffuse_color = (*col, 0.4)
    if name == "water":
        bsdf.inputs["Transmission Weight"].default_value = 0.9
        bsdf.inputs["IOR"].default_value = 1.33
    if name in ("lamp", "glow"):
        bsdf.inputs["Emission Color"].default_value = (1.0, 0.75, 0.45, 1)
        bsdf.inputs["Emission Strength"].default_value = 6.0 if name == "lamp" else 0.0
    if MATERIAL_MODE == "render" and name in TEX_FOR:
        texname, scale = TEX_FOR[name]
        entry = (manifest().get("textures") or {}).get(texname) or {}
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (scale, scale, scale)
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        if entry.get("diff_cache") and (C.ROOT / entry["diff_cache"]).exists():
            d = _tex_node(nt, C.ROOT / entry["diff_cache"], "sRGB")
            nt.links.new(mapping.outputs["Vector"], d.inputs["Vector"])
            if name in ("roof", "plaster", "fabric", "cushion"):
                pass  # keep the painted colour; use the maps for relief/roughness only
            else:
                nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
        else:
            # procedural fallback: subtle noise variation
            noise = nt.nodes.new("ShaderNodeTexNoise")
            noise.inputs["Scale"].default_value = 8.0
            ramp = nt.nodes.new("ShaderNodeValToRGB")
            ramp.color_ramp.elements[0].color = (*[c * 0.85 for c in col], 1)
            ramp.color_ramp.elements[1].color = (*[min(1, c * 1.1) for c in col], 1)
            nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
            nt.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
            nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
        if entry.get("rough_cache") and (C.ROOT / entry["rough_cache"]).exists():
            r = _tex_node(nt, C.ROOT / entry["rough_cache"], "Non-Color")
            nt.links.new(mapping.outputs["Vector"], r.inputs["Vector"])
            nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
        if entry.get("nor_gl_cache") and (C.ROOT / entry["nor_gl_cache"]).exists():
            n = _tex_node(nt, C.ROOT / entry["nor_gl_cache"], "Non-Color")
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nm.inputs["Strength"].default_value = 0.6
            nt.links.new(mapping.outputs["Vector"], n.inputs["Vector"])
            nt.links.new(n.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    return m


# ---------------------------------------------------------------------------
# geometry primitives (web coordinates)
# ---------------------------------------------------------------------------
def _link(obj, col=None):
    (col or bpy.context.scene.collection).objects.link(obj)
    return obj


def box(name, mat, x0, y0, z0, x1, y1, z1, col=None, bevel=0.0, segments=2):
    """Axis-aligned box from web-space min/max corners."""
    a = W(min(x0, x1), min(y0, y1), max(z0, z1))
    b = W(max(x0, x1), max(y0, y1), min(z0, z1))
    lo = Vector((min(a.x, b.x), min(a.y, b.y), min(a.z, b.z)))
    hi = Vector((max(a.x, b.x), max(a.y, b.y), max(a.z, b.z)))
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((lo.x if v.co.x < 0 else hi.x, lo.y if v.co.y < 0 else hi.y, lo.z if v.co.z < 0 else hi.z))
    bm.to_mesh(me)
    bm.free()
    obj = _link(bpy.data.objects.new(name, me), col)
    obj.data.materials.append(material(mat))
    if bevel > 0:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        mod.harden_normals = True
    return obj


def cyl(name, mat, x, y0, z, r, h, seg=16, r2=None, col=None, bevel=0.0):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r, radius2=r if r2 is None else r2, depth=h, location=W(x, y0 + h / 2, z))
    obj = bpy.context.active_object
    obj.name = name
    for c in obj.users_collection:
        c.objects.unlink(obj)
    _link(obj, col)
    obj.data.materials.append(material(mat))
    bpy.ops.object.shade_smooth() if False else None
    for p in obj.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    if bevel:
        mod = obj.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
    return obj


def mesh_from(name, mat, verts, faces, col=None, smooth=False):
    me = bpy.data.meshes.new(name)
    me.from_pydata([W(*v) for v in verts], [], faces)
    me.update()
    obj = _link(bpy.data.objects.new(name, me), col)
    obj.data.materials.append(material(mat))
    for p in me.polygons:
        p.use_smooth = smooth
    return obj


def hip_roof(name, mat, x0, z0, x1, z1, y, rise, col=None, thickness=0.22):
    w, d = x1 - x0, z1 - z0
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    inset = min(w, d) / 2
    A, B, Cc, D = (x0, y, z0), (x1, y, z0), (x1, y, z1), (x0, y, z1)
    if w >= d:
        R1, R2 = (x0 + inset, y + rise, cz), (x1 - inset, y + rise, cz)
        faces = [(3, 2, 5, 4), (1, 0, 4, 5), (0, 3, 4), (2, 1, 5)]
    else:
        R1, R2 = (cx, y + rise, z0 + inset), (cx, y + rise, z1 - inset)
        faces = [(0, 3, 5, 4), (2, 1, 4, 5), (3, 2, 5), (1, 0, 4)]
    obj = mesh_from(name, mat, [A, B, Cc, D, R1, R2], faces, col)
    sol = obj.modifiers.new("solid", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = -1
    return obj


def apply_all_modifiers(objs=None):
    for o in objs or list(bpy.context.scene.objects):
        if o.type != "MESH" or not o.modifiers:
            continue
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            try:
                bpy.ops.object.modifier_apply(modifier=m.name)
            except RuntimeError as e:
                log("modifier apply failed", o.name, m.name, e)


def cube_project_uvs(objs=None, scale=1.0):
    """World-scale box projection (metres) for every mesh without UVs."""
    for o in objs or list(bpy.context.scene.objects):
        if o.type != "MESH":
            continue
        me = o.data
        if not me.uv_layers:
            me.uv_layers.new(name="UVMap")
        uv = me.uv_layers.active.data
        mw = o.matrix_world
        for poly in me.polygons:
            n = (mw.to_3x3() @ poly.normal).normalized()
            ax = max(range(3), key=lambda i: abs(n[i]))
            for li in poly.loop_indices:
                co = mw @ me.vertices[me.loops[li].vertex_index].co
                if ax == 2:
                    u, v = co.x, co.y
                elif ax == 0:
                    u, v = co.y, co.z
                else:
                    u, v = co.x, co.z
                uv[li].uv = (u * scale, v * scale)


def import_polyhaven(pid: str, loc=(0, 0, 0), rot_y=0.0, scale=1.0, col=None, decimate=None):
    """Import a cached Poly Haven glTF; returns the root objects or [] when missing."""
    rel = (manifest().get("models") or {}).get(pid)
    if not rel or not (C.ROOT / rel).exists():
        log("  (missing Poly Haven model, skipped)", pid)
        return []
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(C.ROOT / rel))
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    for o in new:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        _link(o, col)
        if decimate and o.type == "MESH" and len(o.data.polygons) > 4000:
            d = o.modifiers.new("decimate", "DECIMATE")
            d.ratio = decimate
    for r in roots:
        r.location = W(*loc)
        r.rotation_mode = "XYZ"
        r.rotation_euler = (math.radians(90), 0, rot_y)  # glTF importer stores y-up roots rotated
        r.rotation_euler = (0, 0, rot_y)
        r.scale = (scale, scale, scale)
    return roots


# ---------------------------------------------------------------------------
# export
# ---------------------------------------------------------------------------
def export_glb(path: Path, objects=None, draco=True, images="WEBP"):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    objs = objects or [o for o in bpy.context.scene.objects]
    for o in objs:
        try:
            o.select_set(True)
        except RuntimeError:
            pass
    kwargs = dict(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_extras=True,
    )
    try:
        kwargs["export_image_format"] = images
    except Exception:
        pass
    if draco:
        kwargs.update(export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                      export_draco_position_quantization=14, export_draco_normal_quantization=10,
                      export_draco_texcoord_quantization=12)
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError as e:  # parameter names differ between Blender versions
        log("exporter rejected an option, retrying with defaults:", e)
        bpy.ops.export_scene.gltf(filepath=str(path), export_format="GLB", use_selection=True, export_apply=True)
    log("exported", path.relative_to(C.ROOT), f"{path.stat().st_size / 1e6:.2f} MB")
    return path


def register_model(key: str, path: Path):
    mp = C.OUT_MODELS / "manifest.json"
    data = json.loads(mp.read_text()) if mp.exists() else {"models": {}}
    data.setdefault("models", {})[key] = {
        "file": str(path.relative_to(C.PUBLIC)).replace("\\", "/"),
        "bytes": path.stat().st_size,
    }
    mp.write_text(json.dumps(data, indent=2))


def script_args():
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def rng(seed=7):
    return random.Random(seed)
