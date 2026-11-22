"""Run the whole asset pipeline inside one Blender process.

    blender -b --factory-startup --python blender/run_all.py -- [steps...] [--samples N]

steps (default: fetch villa residence amenities interior gallery):
    fetch      download CC0 HDRIs / textures / models (cached)
    villa      public/models/villa.glb
    residence  public/models/residence.glb
    amenities  public/models/amenities.glb + props.glb
    interior   public/models/interior.glb
    gallery    Cycles stills → public/renders/*.jpg
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

DEFAULT = ["fetch", "villa", "residence", "amenities", "interior", "gallery"]


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
