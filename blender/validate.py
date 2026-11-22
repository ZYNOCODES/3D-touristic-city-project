"""Spatial validation for generated interiors and outdoor furniture.

Objects created by furniture.py carry custom properties:
    asm (assembly id), kind (furniture|fixture|decor|soft), room, item, support
Each assembly is checked as a whole (world-space AABB in web coordinates):

1. containment  — inside its room's XZ bounds (else it is pushed back inside);
2. overlaps     — no two furniture/fixture assemblies on the same level intersect, except
                  semantically valid pairs (chairs tucked under tables, stools at islands,
                  pieces standing on rugs …); invalid overlaps are resolved by pushing the
                  smaller assembly out along the axis of least penetration;
3. grounding    — furniture rests on a floor level (no floating / sinking);
4. support      — decor rests on its declared support surface (vase on a table …).

Returns a report (also printed) that is stored next to the exported GLB.
"""
from collections import defaultdict

import bpy
from mathutils import Vector

import bl_util as U

ALLOWED = {
    frozenset(("chair", "dining_table")), frozenset(("dining_chair_02", "dining_table")), frozenset(("chair", "parasol")), frozenset(("dining_table", "parasol")),
    frozenset(("island", "kitchen")), frozenset(("nightstand", "bed")), frozenset(("lounger", "parasol")),
}
FLOORS = (0.0, 0.02, 0.08, 3.75, 3.77)


def _aabb(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            # Blender (x, y, z) → web (x, z_up, -y)
            p = Vector((w.x, w.z, -w.y))
            mn = Vector(map(min, mn, p))
            mx = Vector(map(max, mx, p))
    return mn, mx


def _move(objs, dx=0.0, dy=0.0, dz=0.0):
    for o in objs:
        if o.parent is None:
            o.location += U.W(dx, dy, dz)
    bpy.context.view_layer.update()


def run(col, rooms, name="scene", tol=0.02):
    bpy.context.view_layer.update()
    asms = defaultdict(list)
    for o in col.all_objects:
        if "asm" in o.keys():
            asms[o["asm"]].append(o)
    info = {}
    for k, objs in asms.items():
        o0 = objs[0]
        info[k] = {"objs": objs, "kind": o0.get("kind"), "room": o0.get("room"), "item": o0.get("item"), "support": o0.get("support")}
    report = {"assemblies": len(info), "contained": 0, "overlaps_fixed": [], "grounded_fixed": [], "support_fixed": [], "outside_fixed": [], "remaining": []}

    # 1. containment
    for k, a in info.items():
        if a["kind"] == "decor" or a["room"] not in rooms or a["item"] == "curtain":
            continue
        (x0, z0), (x1, z1) = rooms[a["room"]]
        mn, mx = _aabb(a["objs"])
        dx = max(0.0, x0 - mn.x) - max(0.0, mx.x - x1)
        dz = max(0.0, z0 - mn.z) - max(0.0, mx.z - z1)
        if abs(dx) > tol or abs(dz) > tol:
            _move(a["objs"], dx, 0, dz)
            report["outside_fixed"].append(f"{a['item']}@{a['room']} moved ({dx:+.2f}, {dz:+.2f})")
        else:
            report["contained"] += 1

    # 2. overlaps (iterate a few times to settle chains of pushes)
    keys = [k for k, a in info.items() if a["kind"] in ("furniture", "fixture")]
    for _ in range(4):
        moved = False
        for i, ka in enumerate(keys):
            for kb in keys[i + 1:]:
                a, b = info[ka], info[kb]
                if frozenset((a["item"], b["item"])) in ALLOWED or a["item"] == b["item"] == "chair":
                    continue
                amn, amx = _aabb(a["objs"])
                bmn, bmx = _aabb(b["objs"])
                ox = min(amx.x, bmx.x) - max(amn.x, bmn.x)
                oy = min(amx.y, bmx.y) - max(amn.y, bmn.y)
                oz = min(amx.z, bmx.z) - max(amn.z, bmn.z)
                if ox <= 0.03 or oy <= 0.03 or oz <= 0.03:
                    continue
                # push the smaller assembly out along the cheaper horizontal axis
                small, big = (a, b) if (amx - amn).length < (bmx - bmn).length else (b, a)
                smn, smx = _aabb(small["objs"])
                bmn2, bmx2 = _aabb(big["objs"])
                if ox < oz:
                    d = (ox + 0.03) * (1 if (smn.x + smx.x) > (bmn2.x + bmx2.x) else -1)
                    _move(small["objs"], dx=d)
                else:
                    d = (oz + 0.03) * (1 if (smn.z + smx.z) > (bmn2.z + bmx2.z) else -1)
                    _move(small["objs"], dz=d)
                report["overlaps_fixed"].append(f"{small['item']} pushed off {big['item']} in {small['room']}")
                moved = True
        if not moved:
            break

    # 3. grounding
    for k, a in info.items():
        if a["kind"] not in ("furniture", "fixture", "soft"):
            continue
        mn, mx = _aabb(a["objs"])
        nearest = min(FLOORS, key=lambda f: abs(mn.y - f))
        if 0.03 < abs(mn.y - nearest) < 0.5:
            _move(a["objs"], dy=nearest - mn.y)
            report["grounded_fixed"].append(f"{a['item']} snapped {nearest - mn.y:+.2f} m")

    # 4. decor on supports
    tops = {}
    for o in col.all_objects:
        if o.type == "MESH":
            mn, mx = _aabb([o])
            tops.setdefault(o.name.split(".")[0], []).append((mn, mx))
    for k, a in info.items():
        if a["kind"] != "decor" or not a["support"]:
            continue
        mn, mx = _aabb(a["objs"])
        c = (mn + mx) / 2
        best = None
        for smn, smx in tops.get(a["support"], []):
            if smn.x - 0.05 <= c.x <= smx.x + 0.05 and smn.z - 0.05 <= c.z <= smx.z + 0.05:
                if best is None or abs(smx.y - mn.y) < abs(best - mn.y):
                    best = smx.y
        if best is None:
            report["remaining"].append(f"{a['item']}: support '{a['support']}' not found under it")
        elif abs(best - mn.y) > 0.01:
            _move(a["objs"], dy=best - mn.y)
            report["support_fixed"].append(f"{a['item']} placed on {a['support']} ({best - mn.y:+.3f} m)")

    # final pass: anything still overlapping is reported
    for i, ka in enumerate(keys):
        for kb in keys[i + 1:]:
            a, b = info[ka], info[kb]
            if frozenset((a["item"], b["item"])) in ALLOWED or a["item"] == b["item"] == "chair":
                continue
            amn, amx = _aabb(a["objs"])
            bmn, bmx = _aabb(b["objs"])
            if min(amx.x, bmx.x) - max(amn.x, bmn.x) > 0.03 and min(amx.y, bmx.y) - max(amn.y, bmn.y) > 0.03 and min(amx.z, bmx.z) - max(amn.z, bmn.z) > 0.03:
                report["remaining"].append(f"{a['item']} ∩ {b['item']}")
    U.log(f"[validate:{name}] {report['assemblies']} assemblies, {len(report['overlaps_fixed'])} overlaps fixed, "
          f"{len(report['outside_fixed'])} moved inside rooms, {len(report['grounded_fixed'])} grounded, "
          f"{len(report['support_fixed'])} decor placed, {len(report['remaining'])} remaining")
    for line in report["overlaps_fixed"] + report["outside_fixed"] + report["remaining"]:
        U.log("   ", line)
    return report
