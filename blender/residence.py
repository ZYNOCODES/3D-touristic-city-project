"""Terraced residence block → public/models/residence.glb

Generated from layout.json["residence"] with the same rules as residenceParts()
in src/scene/geo/build.ts (the web app cuts apartments open using those rules,
so floor heights, bay widths and facade set-backs MUST match).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402


def build(col=None):
    R = U.layout()["residence"]
    FH = R["floorHeight"]
    half = R["length"] / 2
    core = 6.0
    bay_w = (half - core) / (R["bays"] / 2)
    back = -R["depth"] / 2

    def fz(f):
        return R["depth"] / 2 - f * R["stepBack"]

    b = U.box
    b("base", "stone", -half - 4, -9, back - 3, half + 4, 0, fz(0) + 8, col, bevel=0.04)
    b("forecourt", "paving", -half - 4, 0, fz(0), half + 4, 0.06, fz(0) + 8, col)
    for f in range(R["floors"]):
        zf = fz(f)
        y0 = f * FH
        slab_front = zf + 1.2 if f == 0 else fz(f - 1)
        for w, (xa, xb) in enumerate(((-half, -core), (core, half))):
            t = f"f{f}w{w}"
            b(f"slab_{t}", "concrete", xa, y0, back, xb, y0 + 0.36, slab_front, col, bevel=0.03)
            b(f"slab_edge_{t}", "plaster", xa, y0 + 0.02, slab_front - 0.04, xb, y0 + 0.36, slab_front + 0.03, col)
            b(f"backwall_{t}", "plaster", xa, y0 + 0.36, back, xb, y0 + FH, back + 0.3, col)
            b(f"glass_{t}", "glass", xa + 0.2, y0 + 0.4, zf - 0.12, xb - 0.2, y0 + FH - 0.05, zf - 0.04, col)
            b(f"glow_{t}", "glow", xa + 0.3, y0 + 0.45, zf - 6, xb - 0.3, y0 + FH - 0.1, zf - 5.95, col)
            for i in range(R["bays"] // 2 + 1):
                x = xa + i * bay_w
                b(f"pier_{t}_{i}", "plaster", x - 0.35, y0 + 0.36, zf - 0.5, x + 0.35, y0 + FH, zf + 0.15, col, bevel=0.02)
                if i < R["bays"] // 2:
                    for m in range(1, 6):
                        mx = x + m * bay_w / 6
                        b(f"mull_{t}_{i}_{m}", "frame", mx - 0.04, y0 + 0.4, zf - 0.1, mx + 0.04, y0 + FH, zf, col)
                    # timber privacy fins between terraces
                    b(f"fin_{t}_{i}", "wood", x - 0.06, y0 + 0.36, zf, x + 0.06, y0 + FH - 0.1, slab_front - 0.9, col)
            if f > 0:
                rz = slab_front
                b(f"rail_glass_{t}", "glass", xa, y0 + 0.36, rz - 0.06, xb, y0 + 1.45, rz, col)
                b(f"rail_top_{t}", "frame", xa, y0 + 1.42, rz - 0.08, xb, y0 + 1.5, rz + 0.02, col)
                b(f"planter_{t}", "plaster", xa, y0 - 0.5, rz - 0.9, xb, y0 + 0.36, rz + 0.05, col)
        b(f"side_l_{f}", "plaster", -half - 0.3, y0, back, -half, y0 + FH, zf, col)
        b(f"side_r_{f}", "plaster", half, y0, back, half + 0.3, y0 + FH, zf, col)
    top = R["floors"] * FH
    for w, (xa, xb) in enumerate(((-half - 0.3, -core), (core, half + 0.3))):
        b(f"roof_{w}", "concrete", xa, top, back, xb, top + 0.5, fz(R["floors"] - 1), col)
        b(f"parapet_{w}", "plaster", xa, top + 0.5, back, xb, top + 1.4, back + 0.25, col)
        # rooftop pergola
        for k in range(10):
            x = xa + 2 + k * (xb - xa - 4) / 9
            b(f"pergola_{w}_{k}", "wood", x - 0.08, top + 3.2, back + 1, x + 0.08, top + 3.4, fz(R["floors"] - 1) - 1, col)
    b("atrium_glass", "glass", -core + 0.2, 0, back + 6, core - 0.2, top + 2.5, back + 6.2, col)
    b("atrium_cap", "frame", -core, top + 2.5, back, core, top + 2.9, back + 6.4, col)
    b("atrium_glow", "glow", -core + 0.5, 0, back + 2, core - 0.5, top + 2, back + 2.1, col)
    x = -core
    k = 0
    while x <= core + 0.01:
        b(f"atrium_mull_{k}", "frame", x - 0.05, 0, back + 6.1, x + 0.05, top + 2.5, back + 6.3, col)
        x += 2
        k += 1


def main():
    U.reset_scene()
    col = U.collection("residence")
    build(col)
    U.apply_all_modifiers()
    U.cube_project_uvs()
    out = C.OUT_MODELS / "residence.glb"
    U.export_glb(out)
    U.register_model("residence", out)


if __name__ == "__main__":
    main()
