"""Shared configuration for the Blender asset pipeline.

All paths are resolved relative to the repository root so the scripts work no
matter where `blender` is launched from.
"""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"                # download cache (CC0 sources, never edited)
CACHE = ASSETS / "cache"
PUBLIC = ROOT / "public"                # what the web app serves
OUT_MODELS = PUBLIC / "models"
OUT_TEXTURES = PUBLIC / "textures"
OUT_HDRI = PUBLIC / "hdri"
OUT_RENDERS = PUBLIC / "renders"
LAYOUT_JSON = ROOT / "src" / "data" / "layout.json"

USER_AGENT = "re-promo-asset-pipeline/1.0 (+https://polyhaven.com/license)"
POLYHAVEN_API = "https://api.polyhaven.com"

# Set OFFLINE=1 to skip all network access and use procedural fallbacks only.
OFFLINE = os.environ.get("OFFLINE", "0") == "1"
# Texture / HDRI resolution to fetch ("1k", "2k", "4k").
TEX_RES = os.environ.get("TEX_RES", "1k")
HDRI_RES = os.environ.get("HDRI_RES", "2k")

# --------------------------------------------------------------------------
# Asset manifest — every entry is CC0 from Poly Haven (https://polyhaven.com)
# --------------------------------------------------------------------------
HDRIS = {
    # key used by the web app       Poly Haven id
    "day": "kloofendal_48d_partly_cloudy_puresky",
    "golden": "qwantani_sunset_puresky",
    "night": "qwantani_night_puresky",
}

# name in web app -> (polyhaven id, maps wanted)
TEXTURES = {
    "terrain_grass": ("aerial_grass_rock", ["diff", "nor_gl"]),
    "terrain_forest": ("forest_ground_04", ["diff", "nor_gl"]),
    "terrain_rock": ("aerial_rocks_02", ["diff", "nor_gl"]),
    "terrain_sand": ("coast_sand_01", ["diff", "nor_gl"]),
    "paving": ("patterned_paving", ["diff", "nor_gl", "rough"]),
    "plaster": ("white_plaster_02", ["diff", "nor_gl", "rough"]),
    "oak": ("oak_veneer_01", ["diff", "nor_gl", "rough"]),
    "deck": ("wood_floor_deck", ["diff", "nor_gl", "rough"]),
    "stone_floor": ("large_floor_tiles_02", ["diff", "nor_gl", "rough"]),
    "pool_tiles": ("blue_floor_tiles_01", ["diff", "nor_gl", "rough"]),
    "linen": ("rough_linen", ["diff", "nor_gl", "rough"]),
    "marble": ("marble_01", ["diff", "nor_gl", "rough"]),
    "walnut": ("walnut_veneer", ["diff", "nor_gl", "rough"]),
    "asphalt": ("clean_asphalt", ["diff", "nor_gl", "rough"]),
    "rubber": ("rubber_tiles", ["diff", "nor_gl", "rough"]),
    "roof": ("grey_roof_01", ["diff", "nor_gl", "rough"]),
}

# Furniture / plant models (glTF, 1k textures) imported into the interior.
MODELS = [
    "potted_plant_01",
    "potted_plant_02",
    "potted_plant_04",
    "pachira_aquatica_01",
    "calathea_orbifolia_01",
    "dining_chair_02",
    "mid_century_lounge_chair",
    "modern_ceiling_lamp_01",
    "ceramic_vase_01",
    "ceramic_vase_03",
    "wicker_basket_01",
    "side_table_01",
]
