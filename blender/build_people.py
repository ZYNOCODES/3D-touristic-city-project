"""Realistic people → public/models/people/*.glb + people_anims.glb + people.json

Converts the Microsoft Rocketbox avatars (MIT) downloaded by fetch_people.py:

* one GLB per avatar: skinned mesh (81-bone Biped rig incl. face & fingers), PBR materials
  rebuilt from the 2K TGA maps (downscaled to 1K/512 WebP), hair/eyelash cards as alpha;
* one shared people_anims.glb with every motion-capture clip on the common Bip01 skeleton
  (scale channels stripped, keyframes kept) — the web app retargets clips by bone name;
* people.json: avatar list (sex, child flag, height) + clip metadata (duration, root speed).

    blender -b --python blender/build_people.py
"""
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402
import fetch_people as FP  # noqa: E402

SRC = FP.OUT
OUT = C.OUT_MODELS / "people"
TEX = C.CACHE / "rocketbox_tex"


def load_resized(path: Path, size: int, name: str):
    """Load a TGA, downscale it and keep it as a packed image for the exporter."""
    TEX.mkdir(parents=True, exist_ok=True)
    img = bpy.data.images.load(str(path), check_existing=False)
    if img.size[0] > size:
        img.scale(size, size)
    img.name = name
    return img


def tex_node(nt, img, colorspace):
    n = nt.nodes.new("ShaderNodeTexImage")
    n.image = img
    img.colorspace_settings.name = colorspace
    return n


def rebuild_materials(mesh_obj, folder: Path, prefix: str):
    tex = {p.name: p for p in (folder / "Textures").glob("*.tga")}

    def find(part, kind):
        for n, p in tex.items():
            if part in n and kind in n and "wrinkle" not in n:
                return p
        return None

    for slot in mesh_obj.material_slots:
        old = slot.material
        part = "body" if "body" in old.name else "head" if "head" in old.name else "opacity"
        m = bpy.data.materials.new(f"{prefix}_{part}")
        m.use_nodes = True
        nt = m.node_tree
        bsdf = nt.nodes["Principled BSDF"]
        bsdf.inputs["Roughness"].default_value = 0.55 if part != "opacity" else 0.7
        bsdf.inputs["Specular IOR Level"].default_value = 0.35
        col = find(part, "_color")
        if col:
            size = 1024 if part in ("head", "body") else 512
            c = tex_node(nt, load_resized(col, size, f"{prefix}_{part}_color"), "sRGB")
            nt.links.new(c.outputs["Color"], bsdf.inputs["Base Color"])
            if part == "opacity":
                nt.links.new(c.outputs["Alpha"], bsdf.inputs["Alpha"])
                m.surface_render_method = "DITHERED"
        nrm = find(part, "_normal")
        if nrm:
            n = tex_node(nt, load_resized(nrm, 512, f"{prefix}_{part}_normal"), "Non-Color")
            nm = nt.nodes.new("ShaderNodeNormalMap")
            nt.links.new(n.outputs["Color"], nm.inputs["Color"])
            nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
        slot.material = m


def import_fbx(path: Path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=str(path), use_anim=True, automatic_bone_orientation=False)
    return [o for o in bpy.data.objects if o not in before]


def build_avatar(av: str):
    name = av.split("/")[1]
    folder = SRC / name
    U.reset_scene()
    objs = import_fbx(folder / f"{name}.fbx")
    arm = next(o for o in objs if o.type == "ARMATURE")
    arm.name = "Bip01"
    meshes = [o for o in objs if o.type == "MESH"]
    for o in [o for o in objs if o.type == "EMPTY"]:
        bpy.data.objects.remove(o)
    for me in meshes:
        me.name = name
        rebuild_materials(me, folder, name.lower())
    if arm.animation_data:
        arm.animation_data_clear()
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    bpy.context.view_layer.update()
    height = max((me.matrix_world @ v.co).z for me in meshes for v in me.data.vertices)
    out = OUT / f"{name}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in [arm, *meshes]:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_animations=False,
                              export_image_format="WEBP", export_skins=True, export_apply=False)
    U.log(f"avatar {name}: {sum(len(m.data.polygons) for m in meshes)} polys, {height:.2f} m, {out.stat().st_size / 1e6:.2f} MB")
    return {"id": name, "file": f"models/people/{name}.glb", "child": "Child" in name, "female": name.startswith("Female"), "height": round(height, 3)}


def strip_action(act):
    """Remove scale channels (and bone translations other than the pelvis) to slim the clip."""
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in list(cb.fcurves):
                    p = fc.data_path
                    fine = any(k in p for k in ("Finger", "Eye", "\"Bip01 M", "Tongue", "Lip", "Mouth", "Cheek", "Brow", "Jaw"))
                    if fine or p.endswith("scale") or (p.endswith("location") and p.startswith("pose.bones") and "Pelvis" not in p):
                        cb.fcurves.remove(fc)


def root_curves(act):
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                for fc in cb.fcurves:
                    if fc.data_path == "location":
                        yield fc


def build_animations():
    """One small GLB per clip, exported from the clip's own armature so bone rotations are
    absolute local transforms (independent of each avatar's bind pose)."""
    clips = {}
    fps = 30
    adir = OUT / "anims"
    adir.mkdir(parents=True, exist_ok=True)
    for folder, clip in FP.CLIPS:
        path = SRC / "Animations" / f"{clip.replace(' ', '_')}.fbx"
        if not path.exists():
            continue
        U.reset_scene()
        objs = import_fbx(path)
        fps = bpy.context.scene.render.fps
        arm = next(o for o in objs if o.type == "ARMATURE")
        arm.name = "Bip01"
        for o in [o for o in objs if o.type != "ARMATURE"]:
            bpy.data.objects.remove(o)
        act = arm.animation_data.action
        act.name = clip
        strip_action(act)
        speed = 0.0
        y0 = None
        for fc in root_curves(act):
            ks = fc.keyframe_points
            if fc.array_index in (0, 1):
                speed = math.hypot(speed, abs(ks[-1].co[1] - ks[0].co[1]))
            if fc.array_index == 2:
                y0 = ks[0].co[1]
        f0, f1 = act.frame_range
        f1 = min(f1, f0 + 16 * fps)  # long idles: keep 16 s
        bpy.context.scene.frame_start, bpy.context.scene.frame_end = int(f0), int(f1)
        dur = (f1 - f0) / fps
        out = adir / f"{clip.replace(' ', '_')}.glb"
        bpy.ops.object.select_all(action="DESELECT")
        arm.select_set(True)
        bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", use_selection=True, export_animations=True,
                                  export_animation_mode="ACTIVE_ACTIONS", export_skins=False, export_force_sampling=True,
                                  export_frame_range=True, export_optimize_animation_size=True)
        clips[clip] = {"file": f"models/people/anims/{out.name}", "duration": round(dur, 3),
                       "rootSpeed": round(speed / max(dur, 1e-3), 3) if folder == "xy" else 0.0,
                       "rootHeight": round(y0 or 0.0, 3), "inPlace": folder != "xyz"}
        U.log(f"clip {clip}: {dur:.2f}s, root speed {clips[clip]['rootSpeed']} m/s, {out.stat().st_size / 1e3:.0f} kB")
    return clips


def main():
    avatars = []
    only_anims = "--anims" in U.script_args()
    if only_anims and (OUT / "people.json").exists():
        avatars = json.loads((OUT / "people.json").read_text())["avatars"]
    for av in ([] if only_anims else FP.AVATARS):
        try:
            avatars.append(build_avatar(av))
        except Exception as e:  # keep going with the rest
            U.log("avatar failed", av, e)
    clips = build_animations()
    meta = {"source": "Microsoft Rocketbox (MIT) — https://github.com/microsoft/Microsoft-Rocketbox",
            "avatars": avatars, "clips": clips}
    (OUT / "people.json").write_text(json.dumps(meta, indent=1))
    old = OUT / "people_anims.glb"
    if old.exists():
        old.unlink()
    U.log(f"{len(avatars)} avatars, {len(clips)} clips")


if __name__ == "__main__":
    main()
