"""Modern coastal villa prototype → public/models/villa.glb

Origin: centre of the terrace pad at finished floor level; front (+z web) faces
the ocean. Same envelope as villaParts() in src/scene/geo/build.ts, with bevels,
deeper window frames, slatted screens, gutters, wall lights and a stair to the
garden. Instanced ~80× by the web app, so keep it lean (~25k tris).

Run:  blender -b --python blender/villa.py
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402


def build(col=None):
    b = U.box
    # podium, retaining wall with a stone cap, terrace
    # dry-stone podium, open where the pool is sunk into it
    b("podium_back", "stone_wall", -12.5, -7, -9.5, 12.5, -0.05, 5.6, col, bevel=0.03)
    b("podium_front", "stone_wall", -12.5, -7, 10.2, 12.5, -0.05, 11.5, col, bevel=0.03)
    b("podium_w", "stone_wall", -12.5, -7, 5.6, 2.2, -0.05, 10.2, col)
    b("podium_e", "stone_wall", 11.2, -7, 5.6, 12.5, -0.05, 10.2, col)
    b("podium_under_pool", "stone_wall", 2.2, -7, 5.6, 11.2, -1.26, 10.2, col)
    b("podium_cap", "travertine", -12.6, -0.12, 11.2, 12.6, 0.02, 11.65, col, bevel=0.02)
    b("deck", "deck", -9, -0.05, 3, 1.2, 0.08, 11, col, bevel=0.01)
    for i in range(int(8 / 0.16)):
        z = 3 + i * 0.16
        b(f"deck_gap_{i}", "black", -9, 0.079, z, 1.2, 0.081, z + 0.008, col)
    # travertine deck framing the (sunken) pool — the basin itself stays open
    b("pool_deck_n", "travertine", 1.2, -0.05, 3, 12, 0.1, 5.4, col, bevel=0.005)
    b("pool_deck_s", "travertine", 1.2, -0.05, 10.4, 12, 0.1, 11, col, bevel=0.005)
    b("pool_deck_w", "travertine", 1.2, -0.05, 5.4, 2.0, 0.1, 10.4, col, bevel=0.005)
    b("pool_deck_e", "travertine", 11.4, -0.05, 5.4, 12, 0.1, 10.4, col, bevel=0.005)
    # pool
    b("pool_floor", "pooltile", 2.2, -1.25, 5.6, 11.2, -1.2, 10.2, col)
    b("pool_wall_n", "pooltile", 2.2, -1.25, 5.6, 11.2, -0.02, 5.75, col)
    b("pool_wall_s", "pooltile", 2.2, -1.25, 10.05, 11.2, -0.02, 10.2, col)
    b("pool_wall_w", "pooltile", 2.2, -1.25, 5.6, 2.35, -0.02, 10.2, col)
    b("pool_wall_e", "pooltile", 11.05, -1.25, 5.6, 11.2, -0.02, 10.2, col)
    U.mesh_from("pool_water", "water", [(2.25, -0.12, 5.65), (11.15, -0.12, 5.65), (11.15, -0.12, 10.15), (2.25, -0.12, 10.15)], [(3, 2, 1, 0)], col)
    for nm, a in (("n", (2.0, 5.4, 11.4, 5.65)), ("s", (2.0, 10.15, 11.4, 10.4)), ("w", (2.0, 5.4, 2.25, 10.4)), ("e", (11.15, 5.4, 11.4, 10.4))):
        b(f"pool_coping_{nm}", "travertine", a[0], -0.02, a[1], a[2], 0.13, a[3], col, bevel=0.015)
    # garden stair down the podium
    for i in range(8):
        b(f"stair_{i}", "stone", 10.6 - 0.0, -0.05 - i * 0.18 - 0.18, 11.65 + i * 0.3, 12.2, -0.05 - i * 0.18, 11.95 + i * 0.3, col)

    # ---- ground floor ---------------------------------------------------------
    b("gf_left", "stone_wall", -9, 0, -6, -5.5, 3.4, 3, col, bevel=0.02)
    b("gf_back", "plaster", -5.5, 0, -6, 9, 3.4, -5.6, col, bevel=0.02)
    b("gf_right", "plaster", 8.6, 0, -6, 9, 3.4, 3, col, bevel=0.02)
    b("gf_glass", "glass", -5.4, 0.08, 2.88, 8.5, 3.15, 2.92, col)
    b("gf_glow", "glow", -5.3, 0.1, -5.5, 8.5, 3.1, -5.45, col)
    x = -5.5
    i = 0
    while x <= 8.65:
        b(f"gf_mullion_{i}", "frame", x, 0.06, 2.78, x + 0.07, 3.2, 3.02, col)
        x += 2.35
        i += 1
    b("gf_head", "frame", -5.5, 3.12, 2.78, 9, 3.26, 3.02, col)
    b("gf_sill", "frame", -5.5, 0.04, 2.78, 9, 0.1, 3.02, col)
    # slatted timber screen on the entrance wing
    b("screen_back", "walnut", -9.04, 0.2, -2.5, -9.0, 3.1, 2.6, col)
    for k in range(18):
        z = -2.4 + k * 0.28
        b(f"slat_{k}", "wood", -9.2, 0.15, z, -9.04, 3.15, z + 0.11, col, bevel=0.01)
    # slab + covered terrace with timber soffit and slim columns
    b("slab", "concrete", -9.4, 3.4, -6.4, 9.4, 3.75, 7.2, col, bevel=0.02)
    b("soffit", "wood", -9.3, 3.36, 3.0, 9.3, 3.4, 7.1, col)
    for k, xx in enumerate((-8.9, 0.9, 8.9)):
        U.cyl(f"column_{k}", "wood", xx, 0.08, 6.8, 0.14, 3.3, 16, col=col)
    # wall lights
    for k, xx in enumerate((-8.95, 8.95)):
        b(f"sconce_{k}", "lamp", xx - 0.08, 2.2, 3.05, xx + 0.08, 2.45, 3.2, col)

    # ---- upper floor -------------------------------------------------------------
    b("uf_left", "plaster", -7, 3.75, -5.5, -3, 6.8, 2.5, col, bevel=0.02)
    b("uf_back", "plaster", -3, 3.75, -5.5, 10.5, 6.8, -5.1, col, bevel=0.02)
    b("uf_right", "plaster", 10.1, 3.75, -5.5, 10.5, 6.8, 2.5, col, bevel=0.02)
    b("uf_glass", "glass", -3, 3.85, 2.38, 10.1, 6.65, 2.42, col)
    b("uf_glow", "glow", -2.9, 3.9, -5.0, 10, 6.6, -4.95, col)
    x = -3.0
    i = 0
    while x <= 10.15:
        b(f"uf_mullion_{i}", "frame", x, 3.85, 2.3, x + 0.07, 6.7, 2.5, col)
        x += 2.6
        i += 1
    # small windows in the solid upper wing
    b("uf_win_l", "glass", -7.02, 4.6, -3.6, -6.98, 6.0, -0.6, col)
    b("uf_win_l_frame", "frame", -7.06, 4.55, -3.65, -6.97, 6.05, -0.55, col)
    # balcony glass balustrade
    b("balcony_glass", "glass", -7, 3.75, 5.6, 9.4, 4.85 + 0.95, 5.66, col)
    b("balcony_rail", "frame", -7, 5.68, 5.55, 9.4, 5.76, 5.7, col)
    # flat roof with a slim white overhang, timber soffit and a travertine band
    b("roof_slab", "stucco", -8.0, 6.8, -6.6, 11.6, 7.25, 3.6, col, bevel=0.02)
    b("roof_soffit", "cladding", -7.9, 6.78, -6.5, 11.5, 6.8, 3.5, col)
    b("roof_parapet_back", "stucco", -8.0, 7.25, -6.6, 11.6, 7.6, -6.35, col)
    b("roof_gravel", "concrete", -7.7, 7.25, -6.3, 11.3, 7.27, 3.3, col)
    b("band_upper", "travertine", -7.05, 3.75, -5.55, 10.55, 3.98, 2.55, col, bevel=0.01)
    # timber pergola over the upper balcony
    for k in range(13):
        x = -6.8 + k * 1.35
        b(f"perg_{k}", "cladding", x, 6.35, 2.5, x + 0.12, 6.55, 5.6, col)
    b("perg_beam", "cladding", -7.0, 6.2, 5.45, 9.4, 6.4, 5.6, col)
    for k, x in enumerate((-6.9, 1.2, 9.25)):
        b(f"perg_post_{k}", "cladding", x, 3.75, 5.45, x + 0.14, 6.2, 5.6, col)
    # teak loungers + parasol by the pool, planted stone planters along the deck edge
    import furniture as F
    from residence import Foliage
    for xx in (3.6, 5.3):
        F.lounger(col, "pool", xx, 4.25, rot=math.pi)
    F.parasol(col, "pool", 7.1, 4.3, r=1.4)
    fol = Foliage()
    for k, xx in enumerate((-8.4, -6.0, -3.6)):
        b(f"planter_{k}", "travertine", xx - 0.75, 0.08, 10.0, xx + 0.75, 0.62, 10.9, col, bevel=0.02)
        fol.bush(xx, 0.62, 10.45, 0.7, 0.45, 0.35, 380, 0.06)
    fol.to_object("villa_greenery", col)


def main():
    U.reset_scene()
    col = U.collection("villa")
    build(col)
    U.apply_all_modifiers()
    U.cube_project_uvs()
    out = C.OUT_MODELS / "villa.glb"
    U.export_glb(out)
    U.register_model("villa", out)


if __name__ == "__main__":
    main()
