"""Download CC0 HDRIs, PBR textures and models from Poly Haven into assets/cache.

Runs either inside Blender (`blender -b --python blender/fetch_assets.py`) or
with any Python >= 3.9 (`python blender/fetch_assets.py`) — it only uses the
standard library.

* Everything is cached; re-running only fetches what is missing.
* Every failure is logged and skipped: downstream builders fall back to
  procedural materials, so the pipeline never hard-fails because of the network.
* HDRIs and textures are copied into public/ for the web app, and a
  manifest (public/assets-manifest.json) records what is available plus the
  sun direction detected in each HDRI so the web app can align its sun light.
"""
from __future__ import annotations

import json
import math
import shutil
import struct
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402


def log(*a):
    print("[fetch]", *a, flush=True)


def http_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": C.USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def download(url: str, dest: Path, retries: int = 3) -> bool:
    if dest.exists() and dest.stat().st_size > 0:
        return True
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_suffix(dest.suffix + ".part")
    for attempt in range(1, retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": C.USER_AGENT})
            with urllib.request.urlopen(req, timeout=120) as r, open(tmp, "wb") as f:
                shutil.copyfileobj(r, f, 1 << 16)
            tmp.replace(dest)
            log("  ok", dest.relative_to(C.ROOT), f"{dest.stat().st_size/1e6:.1f}MB")
            return True
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            log(f"  retry {attempt}/{retries} {url}: {e}")
            time.sleep(1.5 * attempt)
    if tmp.exists():
        tmp.unlink()
    return False


# ---------------------------------------------------------------------------
# HDRI sun detection (tiny Radiance .hdr reader, standard library only)
# ---------------------------------------------------------------------------
def _read_hdr(path: Path):
    data = path.read_bytes()
    pos = 0
    w = h = 0
    while True:
        end = data.index(b"\n", pos)
        line = data[pos:end].decode("ascii", "ignore")
        pos = end + 1
        if line.startswith("-Y") or line.startswith("+Y"):
            parts = line.split()
            h, w = int(parts[1]), int(parts[3])
            break
    rows = []
    for _ in range(h):
        scan = [bytearray(w) for _ in range(4)]
        if data[pos] == 2 and data[pos + 1] == 2:
            pos += 4
            for c in range(4):
                x = 0
                ch = scan[c]
                while x < w:
                    n = data[pos]
                    pos += 1
                    if n > 128:
                        n -= 128
                        v = data[pos]
                        pos += 1
                        ch[x:x + n] = bytes([v]) * n
                    else:
                        ch[x:x + n] = data[pos:pos + n]
                        pos += n
                    x += n
            rows.append(scan)
        else:  # flat (uncompressed) scanline
            for x in range(w):
                for c in range(4):
                    scan[c][x] = data[pos + c]
                pos += 4
            rows.append(scan)
    return w, h, rows


def detect_sun(path: Path):
    """Return (azimuth_rad, elevation_rad, peak_luminance) of the brightest region."""
    try:
        w, h, rows = _read_hdr(path)
    except Exception as e:  # pragma: no cover - diagnostic only
        log("  sun detection failed:", e)
        return None
    best = (0.0, 0, 0)
    step = max(1, w // 512)
    for y in range(0, h // 2 + 1, step):  # sun is above the horizon
        r, g, b, e = rows[y]
        for x in range(0, w, step):
            ex = e[x]
            if ex == 0:
                continue
            f = math.ldexp(1.0, ex - 136)
            lum = (0.2126 * r[x] + 0.7152 * g[x] + 0.0722 * b[x]) * f
            if lum > best[0]:
                best = (lum, x, y)
    lum, x, y = best
    u, v = (x + 0.5) / w, (y + 0.5) / h
    # three.js equirect convention: u=0.5 looks down -Z
    azimuth = (u - 0.5) * 2 * math.pi
    elevation = (0.5 - v) * math.pi
    return azimuth, elevation, lum


# ---------------------------------------------------------------------------
def fetch_hdris(manifest: dict):
    out = {}
    for key, pid in C.HDRIS.items():
        try:
            files = http_json(f"{C.POLYHAVEN_API}/files/{pid}")
            info = files["hdri"][C.HDRI_RES]["hdr"]
        except Exception as e:
            log("HDRI lookup failed", pid, e)
            continue
        dest = C.CACHE / "hdri" / f"{pid}_{C.HDRI_RES}.hdr"
        if not download(info["url"], dest):
            continue
        pub = C.OUT_HDRI / f"{key}.hdr"
        pub.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(dest, pub)
        sun = detect_sun(dest)
        out[key] = {
            "id": pid,
            "file": f"hdri/{key}.hdr",
            "cachePath": str(dest.relative_to(C.ROOT)).replace("\\", "/"),
            "sun": None if sun is None else {"azimuth": sun[0], "elevation": sun[1], "peak": sun[2]},
            "license": "CC0 (Poly Haven)",
        }
    manifest["hdri"] = out


def fetch_textures(manifest: dict):
    out = {}
    for name, (pid, maps) in C.TEXTURES.items():
        try:
            files = http_json(f"{C.POLYHAVEN_API}/files/{pid}")
        except Exception as e:
            log("texture lookup failed", pid, e)
            continue
        entry = {"id": pid}
        for m in maps:
            key = {"diff": "Diffuse", "nor_gl": "nor_gl", "rough": "Rough"}[m]
            node = files.get(key) or files.get(m)
            if not node:
                continue
            try:
                url = node[C.TEX_RES]["jpg"]["url"]
            except KeyError:
                continue
            dest = C.CACHE / "textures" / pid / f"{pid}_{m}_{C.TEX_RES}.jpg"
            if download(url, dest):
                pub = C.OUT_TEXTURES / name / f"{m}.jpg"
                pub.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(dest, pub)
                entry[m] = f"textures/{name}/{m}.jpg"
                entry[m + "_cache"] = str(dest.relative_to(C.ROOT)).replace("\\", "/")
        if len(entry) > 1:
            out[name] = entry
    manifest["textures"] = out


def fetch_models(manifest: dict):
    out = {}
    for pid in C.MODELS:
        try:
            files = http_json(f"{C.POLYHAVEN_API}/files/{pid}")
            g = files["gltf"]["1k"]["gltf"]
        except Exception as e:
            log("model lookup failed", pid, e)
            continue
        base = C.CACHE / "models" / pid
        ok = download(g["url"], base / Path(g["url"]).name)
        for rel, inc in (g.get("include") or {}).items():
            ok = download(inc["url"], base / rel) and ok
        if ok:
            out[pid] = str((base / Path(g["url"]).name).relative_to(C.ROOT)).replace("\\", "/")
    manifest["models"] = out


def fetch_khronos(manifest: dict):
    base = "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models"
    out = {}
    for name, lic in C.KHRONOS.items():
        dest = C.CACHE / "khronos" / f"{name}.glb"
        if not download(f"{base}/{name}/glTF-Binary/{name}.glb", dest):
            continue
        out[name] = {"path": str(dest.relative_to(C.ROOT)).replace("\\", "/"), "license": lic,
                     "source": f"https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/{name}"}
    manifest["khronos"] = out


def main():
    manifest_path = C.PUBLIC / "assets-manifest.json"
    manifest = {"generated": time.strftime("%Y-%m-%dT%H:%M:%S"), "offline": C.OFFLINE}
    if C.OFFLINE:
        log("OFFLINE=1 → skipping downloads; procedural fallbacks will be used.")
    else:
        try:
            fetch_hdris(manifest)
            fetch_textures(manifest)
            fetch_models(manifest)
            fetch_khronos(manifest)
        except Exception as e:  # never break the pipeline
            log("unexpected error, continuing with what we have:", e)
    # keep entries from a previous successful run if this run lost them
    if manifest_path.exists():
        prev = json.loads(manifest_path.read_text())
        for k in ("hdri", "textures", "models", "khronos"):
            merged = dict(prev.get(k) or {})
            merged.update(manifest.get(k) or {})
            manifest[k] = merged
    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(manifest, indent=2))
    log("manifest ->", manifest_path.relative_to(C.ROOT),
        {k: len(manifest.get(k) or {}) for k in ("hdri", "textures", "models")})


if __name__ == "__main__":
    main()
