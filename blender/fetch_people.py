"""Download realistic rigged human avatars + animation clips from Microsoft Rocketbox (MIT licence).

https://github.com/microsoft/Microsoft-Rocketbox — 115 professionally modelled, rigged
(3ds Max Biped "Bip01") characters with 2K skin/clothing textures, plus motion clips.
Cached in assets/cache/rocketbox; build_people.py turns them into optimised GLBs.
Stdlib only — runs inside Blender or with any Python 3.9+.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

REPO = "microsoft/Microsoft-Rocketbox"
RAW = f"https://raw.githubusercontent.com/{REPO}/master/Assets"
API = f"https://api.github.com/repos/{REPO}/contents/Assets"
OUT = C.CACHE / "rocketbox"

# casual, warm-climate outfits; varied ages, skin tones, hair and body types
AVATARS = [
    "Adults/Female_Adult_01", "Adults/Female_Adult_02", "Adults/Female_Adult_03", "Adults/Female_Adult_05",
    "Adults/Female_Adult_08", "Adults/Female_Adult_13", "Adults/Female_Adult_17",
    "Adults/Male_Adult_01", "Adults/Male_Adult_02", "Adults/Male_Adult_06", "Adults/Male_Adult_08",
    "Adults/Male_Adult_09", "Adults/Male_Adult_14", "Adults/Male_Adult_16",
    "Children/Female_Child_01", "Children/Female_Child_02", "Children/Male_Child_01", "Children/Male_Child_02",
]
# in-place ("static" motion extraction) clips used by the web behaviours
CLIPS = [
    # (folder, clip) — "static" = in place, "xy" = root motion on the ground plane (stripped later)
    ("static", "f_idle_neutral_01"), ("static", "f_idle_look_around_01"), ("static", "f_drink_idle"),
    ("static", "f_sit_chair_idle_relaxed_01"), ("static", "f_sit_table_idle_neutral_01"), ("static", "f_crouch_idle"),
    ("static", "m_idle_neutral_01"), ("static", "m_idle_look_around_01"), ("static", "m_drink_idle"),
    ("static", "m_cell_phone_talk_01"), ("static", "m_sit_chair_idle_relaxed_01"), ("static", "m_sit_table_idle_relaxed_01"),
    ("xy", "f_walk_neutral"), ("xy", "f_walk_stroll_01"), ("xy", "f_walk_fast_01"),
    ("xy", "m_walk_neutral"), ("xy", "m_walk_stroll_01"), ("xy", "m_walk_fast_01"),
    ("xyz", "f_gestic_talk_neutral_04"), ("xyz", "m_gestic_talk_neutral_04"), ("xyz", "m_gestic_talk_self_assured_01"),
]
WANT_MAPS = ("_color", "_normal.", "opacity")


def log(*a):
    print("[people]", *a, flush=True)


def get(url: str, dest: Path) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": C.USER_AGENT})
            with urllib.request.urlopen(req, timeout=180) as r:
                data = r.read()
            dest.write_bytes(data)
            return True
        except Exception as e:  # noqa: BLE001
            log(f"retry {attempt + 1}: {url} ({e})")
    return False


def list_dir(path: str):
    req = urllib.request.Request(f"{API}/{path}", headers={"User-Agent": C.USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def jobs():
    out = []
    for av in AVATARS:
        name = av.split("/")[1]
        out.append((f"{RAW}/Avatars/{av}/Export/{name}.fbx", OUT / name / f"{name}.fbx"))
        cache = OUT / name / "textures.json"
        if cache.exists():
            files = json.loads(cache.read_text())
        else:
            files = [f["name"] for f in list_dir(f"Avatars/{av}/Textures") if f["name"].endswith(".tga")]
            cache.parent.mkdir(parents=True, exist_ok=True)
            cache.write_text(json.dumps(files))
        for f in files:
            if any(k in f for k in WANT_MAPS) and "wrinkle" not in f:
                out.append((f"{RAW}/Avatars/{av}/Textures/{f}", OUT / name / "Textures" / f))
    for folder, clip in CLIPS:
        url = f"{RAW}/Animations/all_animations_max_motextr_{folder}/{clip}.max.fbx".replace(" ", "%20")
        out.append((url, OUT / "Animations" / f"{clip.replace(' ', '_')}.fbx"))
    return out


def main():
    todo = jobs()
    log(f"{len(todo)} files")
    with ThreadPoolExecutor(6) as ex:
        ok = list(ex.map(lambda j: get(*j), todo))
    log(f"done: {sum(ok)}/{len(ok)} ok")


if __name__ == "__main__":
    main()
