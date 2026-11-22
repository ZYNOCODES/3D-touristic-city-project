"""Line-by-line port of src/lib/heightfield.ts (deterministic terrain).

Keep both files in sync — `node scripts/check-heightfield.mjs` compares samples.
"""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import config as C  # noqa: E402

_L = json.loads(C.LAYOUT_JSON.read_text())
T = _L["terrain"]
M32 = 0xFFFFFFFF


def _imul(a, b):
    return ((a & M32) * (b & M32)) & M32


def _hash(ix, iz, seed):
    n = (_imul(ix, 374761393) + _imul(iz, 668265263) + _imul(seed, 1442695041)) & M32
    n = _imul(n ^ (n >> 13), 1274126177)
    n = (n ^ (n >> 16)) & M32
    return n / 4294967296


def value_noise(x, z, seed=None):
    seed = T["seed"] if seed is None else seed
    ix = math.floor(x)
    iz = math.floor(z)
    fx = x - ix
    fz = z - iz
    ux = fx * fx * (3 - 2 * fx)
    uz = fz * fz * (3 - 2 * fz)
    a = _hash(ix, iz, seed)
    b = _hash(ix + 1, iz, seed)
    c = _hash(ix, iz + 1, seed)
    d = _hash(ix + 1, iz + 1, seed)
    return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz


def fbm(x, z, octaves=5, seed=None):
    seed = T["seed"] if seed is None else seed
    amp, freq, s = 0.5, 1.0, 0.0
    for i in range(octaves):
        s += amp * (value_noise(x * freq, z * freq, seed + i * 17) * 2 - 1)
        freq *= 2.03
        amp *= 0.5
    return s


def smoothstep(a, b, x):
    t = min(1.0, max(0.0, (x - a) / (b - a)))
    return t * t * (3 - 2 * t)


def shore_z(x):
    s = smoothstep(T["headlandStart"], T["headlandEnd"], abs(x))
    return T["shoreZ"] + T["headlandPush"] * s + T["shoreAmp"] * math.sin(x * T["shoreFreq"])


def base_height(x, z):
    d = shore_z(x) - z
    n = fbm(x * 0.006, z * 0.006)
    if d < 0:
        h = max(-28, d * 0.07) + n * 1.5
    elif d < T["beachWidth"]:
        h = d * 0.065 + n * 0.4
    else:
        inland = d - T["beachWidth"]
        h = T["beachWidth"] * 0.065 + inland * T["slope"] + n * T["noiseAmp"] * smoothstep(0, 120, inland)
        h += T["mountainHeight"] * smoothstep(T["mountainStart"], T["mountainEnd"], d) * (0.65 + 0.35 * fbm(x * 0.0021, z * 0.0021, 4, T["seed"] + 3))
        h += fbm(x * 0.0016 + 3.1, z * 0.0016, 3, T["seed"] + 9) * 40 * smoothstep(300, 900, d)
    ax = abs(x)
    ridge = smoothstep(T["headlandStart"] - 40, T["headlandEnd"] + 120, ax) * smoothstep(-160, 60, d)
    h += ridge * (38 + 26 * fbm(x * 0.004, z * 0.004, 4, T["seed"] + 5))
    I = T["island"]
    di = math.hypot(x - I["x"], z - I["z"]) / I["r"]
    if di < 1.3:
        k = max(0.0, 1 - di)
        h = max(h, -6 + (I["h"] + 6) * k * k * (1.2 + 0.4 * fbm(x * 0.02, z * 0.02, 3, T["seed"] + 11)))
    return h


_PADS = [dict(p) for p in _L["pads"]]
for _p in _PADS:
    _p["h"] = base_height(_p["x"], _p["z"])


def height(x, z):
    h = base_height(x, z)
    for p in _PADS:
        dx = x - p["x"]
        dz = z - p["z"]
        if abs(dx) > p["rx"] + p["falloff"] + 40 or abs(dz) > p["rz"] + p["falloff"] + 40:
            continue
        c, s = math.cos(p["rot"]), math.sin(p["rot"])
        lx = abs(dx * c - dz * s)
        lz = abs(dx * s + dz * c)
        ox = max(0.0, lx - p["rx"])
        oz = max(0.0, lz - p["rz"])
        dist = math.hypot(ox, oz)
        w = 1 - smoothstep(0, p["falloff"], dist)
        if w > 0:
            h = h + (p["h"] - h) * w
    return h


def pad_height(i):
    return _PADS[i]["h"]


if __name__ == "__main__":
    pts = [(-300.5, 120.25), (0, 0), (12.3, -250.7), (480, 600), (560, 820), (-800, -900), (55.5, 30.1)]
    print(json.dumps([[x, z, round(height(x, z), 6)] for x, z in pts]))
