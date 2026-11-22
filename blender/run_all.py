"""Run the whole asset pipeline inside one Blender process.

    blender -b --factory-startup --python blender/run_all.py -- [steps...] [--samples N]

steps (default: everything below except masterplan):
    fetch               download CC0 HDRIs / textures / models / Khronos products (cached)
    fetch_people        download Rocketbox avatars + mocap clips (MIT, ~1.1 GB, cached)
    villa               public/models/villa.glb
    residence           public/models/residence.glb + src/data/generated/residence.json
    amenities           public/models/amenities.glb + props.glb
    interior_villa      public/models/villa_interior.glb (+ .json hotspots, validation report)
    interior_apartment  public/models/apartment_interior.glb (+ .json)
    build_people        public/models/people/*.glb, anims/*.glb, people.json
    build_vegetation    public/models/vegetation/*.webp impostor atlases + vegetation.json
    gallery             Cycles stills → public/renders/*.jpg
    masterplan full site assembly → assets/masterplan.blend + public/renders/aerial.jpg (slow)

Every step is isolated: a failure is logged and the next step still runs, and the
web app falls back to its procedural version of anything that is missing.
"""
import importlib
import sys
import time
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402

DEFAULT = ["fetch", "fetch_people", "villa", "residence", "amenities", "interior_villa", "interior_apartment",
           "build_people", "build_vegetation", "gallery"]


def main():
    args = U.script_args()
    steps = [a for a in args if not a.startswith("--") and not a[:1].isdigit() and "x" not in a[1:2]] or DEFAULT
    if "all" in steps:
        steps = DEFAULT + ["masterplan"]
    results = {}
    for step in steps:
        t0 = time.time()
        U.log(f"=== {step} ===")
        try:
            if step == "fetch":
                importlib.import_module("fetch_assets").main()
            elif step == "gallery":
                U.MATERIAL_MODE = "render"
                importlib.import_module("render_gallery").main()
                U.MATERIAL_MODE = "export"
            elif step == "masterplan":
                importlib.import_module("build_masterplan").main()
            else:
                importlib.import_module(step).main()
            results[step] = f"ok ({time.time() - t0:.0f}s)"
        except Exception as e:  # keep going — fallbacks exist for everything
            traceback.print_exc()
            results[step] = f"FAILED: {e}"
    U.log("summary:")
    for k, v in results.items():
        U.log(f"  {k:<11} {v}")


if __name__ == "__main__":
    main()
