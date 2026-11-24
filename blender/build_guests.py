"""Compact hotel guests from Microsoft Rocketbox avatars (MIT) → public/models/people/*.glb + guests.json.
Draco-compressed skinned meshes, WebP textures (body 1024, head 512), swimwear / skin-tone variants."""
import json
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402

SRC = C.CACHE / "rocketbox"
OUT = C.OUT_MODELS / "people"

# id, source, swim, options
GUESTS = [
    ("swim_m1", "Sports_Male_01", True, {}),
    ("swim_m2", "Sports_Male_01", True, {"trunks": (0.62, 0.10, 0.08), "skin": (0.80, 0.70, 0.62)}),
    ("swim_m3", "Sports_Male_01", True, {"trunks": (0.10, 0.42, 0.48), "skin": (0.62, 0.50, 0.42), "hair": (0.5, 0.5, 0.5)}),
    ("swim_m4", "Sports_Male_01", True, {"trunks": (0.80, 0.62, 0.22), "skin": (0.92, 0.84, 0.78)}),
    ("swim_f1", "Sports_Female_01", True, {"suit": (0.06, 0.09, 0.16)}),
    ("swim_f2", "Sports_Female_01", True, {"suit": (0.05, 0.36, 0.36), "skin": (0.82, 0.72, 0.64)}),
    ("swim_f3", "Sports_Female_01", True, {"suit": (0.72, 0.68, 0.6), "skin": (0.66, 0.54, 0.46), "hair": (0.42, 0.36, 0.32)}),
    ("f_a", "Female_Adult_03", False, {}), ("f_b", "Female_Adult_17", False, {}), ("f_c", "Female_Adult_08", False, {}), ("f_d", "Sports_Female_02", False, {}),
    ("m_a", "Male_Adult_01", False, {}), ("m_b", "Male_Adult_08", False, {}), ("m_c", "Male_Adult_16", False, {}), ("m_d", "Sports_Male_04", False, {}),
]


def px(img):
    a = np.empty(img.size[0] * img.size[1] * img.channels, np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(img.size[1], img.size[0], img.channels)


def save_tex(name, arr, size, quality=84):
    h, w = arr.shape[:2]
    a = np.ones((h, w, 4), np.float32)
    a[..., : min(4, arr.shape[2])] = arr[..., :4]
    im = bpy.data.images.new(name, w, h, alpha=True)
    im.pixels.foreach_set(np.clip(a, 0, 1).ravel())
    if w > size:
        im.scale(size, size)
    return im


def recolor(a, part, o, female):
    rgb = a[..., :3]
    lum = rgb @ np.array([0.3, 0.59, 0.11])
    mx, mn = rgb.max(-1), rgb.min(-1)
    sat = (mx - mn) / (mx + 1e-4)
    if part == "body":
        if female:
            r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
            mask = ((b > g * 1.12) & (r > g * 1.35) & (sat > 0.28)).astype(np.float32)
            col = o.get("suit")
        else:
            mask = ((lum < 0.20) & ~((rgb[..., 0] > rgb[..., 2] * 1.5) & (sat > 0.45))).astype(np.float32)
            col = o.get("trunks")
        for _ in range(3):
            mask = np.maximum.reduce([mask, np.roll(mask, 1, 0), np.roll(mask, -1, 0), np.roll(mask, 1, 1), np.roll(mask, -1, 1)]) if female else mask
        if col is not None:
            sh = np.clip((lum / (np.median(lum[mask > 0.5]) + 1e-4)) ** 0.7, 0.5, 1.5)[..., None]
            rgb[:] = np.where(mask[..., None] > 0.5, np.array(col) * sh, rgb)
        if "skin" in o:
            rgb[:] = np.where(mask[..., None] > 0.5, rgb, rgb * np.array(o["skin"]))
    elif part == "head" and "skin" in o:
        rgb[:] = rgb * np.array(o["skin"])
    elif part == "opacity" and "hair" in o:
        rgb[:] = rgb * np.array(o["hair"])
    return a


def build(gid, src, swim, o):
    U.reset_scene()
    folder = SRC / src
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(folder / f"{src}.fbx"), use_anim=True, automatic_bone_orientation=False)
    objs = [x for x in bpy.data.objects if x not in before]
    arm = next(x for x in objs if x.type == "ARMATURE")
    arm.name = "Bip01"
    meshes = [x for x in objs if x.type == "MESH"]
    for e in [x for x in objs if x.type == "EMPTY"]:
        bpy.data.objects.remove(e)
    tex = list((folder / "Textures").glob("*.tga"))
    female = "Female" in src
    for me in meshes:
        me.name = gid
        for slot in me.material_slots:
            part = "body" if "body" in slot.material.name else "head" if "head" in slot.material.name else "opacity"
            m = bpy.data.materials.new(part)
            m.use_nodes = True
            nt = m.node_tree
            bs = nt.nodes["Principled BSDF"]
            bs.inputs["Roughness"].default_value = 0.6

            def find(kind):
                return next((p for p in tex if part in p.name and kind in p.name and "wrinkle" not in p.name), None)
            c = find("_color")
            if c:
                im = bpy.data.images.load(str(c))
                a = recolor(px(im).copy(), part, o, female)
                t = nt.nodes.new("ShaderNodeTexImage")
                t.image = save_tex(f"{gid}_{part}", a, {"body": 1024, "head": 512, "opacity": 256}[part])
                nt.links.new(t.outputs["Color"], bs.inputs["Base Color"])
                if part == "opacity":
                    nt.links.new(t.outputs["Alpha"], bs.inputs["Alpha"])
            n = find("_normal")
            if n and part == "body":
                t = nt.nodes.new("ShaderNodeTexImage")
                t.image = save_tex(f"{gid}_{part}_n", px(bpy.data.images.load(str(n))), 512)
                t.image.colorspace_settings.name = "Non-Color"
                nm = nt.nodes.new("ShaderNodeNormalMap")
                nt.links.new(t.outputs["Color"], nm.inputs["Color"])
                nt.links.new(nm.outputs["Normal"], bs.inputs["Normal"])
            slot.material = m
    if arm.animation_data:
        arm.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    bpy.ops.object.select_all(action="DESELECT")
    for x in [arm, *meshes]:
        x.select_set(True)
    out = OUT / f"{gid}.glb"
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_animations=False, export_image_format="WEBP", export_image_quality=82,
                              export_skins=True, export_apply=False, export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
                              export_draco_position_quantization=13, export_draco_texcoord_quantization=12)
    U.log(gid, src, out.stat().st_size // 1024, "KB")
    return {"id": gid, "female": female, "swim": swim}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    res = []
    for g in GUESTS:
        try:
            res.append(build(*g))
        except Exception as e:  # noqa: BLE001
            U.log("FAILED", g[0], repr(e))
    (OUT / "guests.json").write_text(json.dumps(res))


if __name__ == "__main__":
    main()
