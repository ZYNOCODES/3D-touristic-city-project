"""Shape of the calanque: coastline, cliff heights, seabed. Web axes (x right, y up, z to the open sea)."""
import numpy as np

PLATFORM_Y = 9.0
# coast polyline, west → east: x, z, cliff height, cliff run (m, small = steep), shore depth
COAST = np.array([
    [-520, 60, 30, 60, 4], [-330, 120, 24, 50, 4], [-230, 132, 20, 40, 4], [-150, 148, 15, 30, 4], [-108, 138, 12, 24, 4],
    [-82, 104, 15, 22, 4], [-64, 70, 20, 17, 4.5], [-53, 40, 17, 12, 5], [-42, 22, 10, 6, 6], [-34, 2, 11, 3.5, 7],
    [-31, -13, 13, 3.0, 8], [-40, -30, 11, 5, 5], [-39, -44, 9, 4, 4], [-31, -52, 9, 3.2, 3.5], [0, -54, 9, 3.2, 3],
    [31, -52, 9, 3.2, 3.5], [41, -44, 12, 6, 4], [47, -26, 36, 12, 5], [52, 0, 56, 13, 6], [56, 28, 64, 13, 6.5],
    [62, 58, 60, 13, 6], [72, 92, 50, 13, 6], [92, 128, 36, 15, 6], [150, 150, 34, 22, 5], [260, 128, 40, 40, 5], [520, 90, 50, 60, 4],
], float)


def _hash(ix, iy, iz, s):
    n = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (s * 2654435)
    n = (n ^ (n >> 13)) * 1274126177 & 0x7FFFFFFF
    n = (n ^ (n >> 16)) & 0x7FFFFFFF
    return (n % 1000003) / 1000003.0


def vnoise(x, y, z, s=0):
    x, y, z = np.broadcast_arrays(np.asarray(x, float), np.asarray(y, float), np.asarray(z, float))
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    fx, fy, fz = x - ix, y - iy, z - iz
    ux, uy, uz = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy), fz * fz * (3 - 2 * fz)
    r = 0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                w = (ux if dx else 1 - ux) * (uy if dy else 1 - uy) * (uz if dz else 1 - uz)
                r = r + w * _hash(ix + dx, iy + dy, iz + dz, s)
    return r * 2 - 1


def fbm(x, y, z, oct=4, s=0):
    a, f, r = 0.5, 1.0, 0
    for o in range(oct):
        r = r + a * vnoise(x * f, y * f, z * f, s + o)
        a *= 0.5
        f *= 2.03
    return r


def worley(x, y, z, s=0):
    """F1, F2, random value of nearest cell."""
    ix, iy, iz = np.floor(x), np.floor(y), np.floor(z)
    f1 = np.full(x.shape, 9.0)
    f2 = np.full(x.shape, 9.0)
    rid = np.zeros(x.shape)
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                cx, cy, cz = ix + dx, iy + dy, iz + dz
                d = np.sqrt((cx + _hash(cx, cy, cz, s) - x) ** 2 + (cy + _hash(cx, cy, cz, s + 1) - y) ** 2 + (cz + _hash(cx, cy, cz, s + 2) - z) ** 2)
                h = _hash(cx, cy, cz, s + 3)
                near = d < f1
                f2 = np.where(near, f1, np.minimum(f2, d))
                rid = np.where(near, h, rid)
                f1 = np.where(near, d, f1)
    return f1, f2, rid


def _frac_local(a):
    """smooth saw in -1..1 used for per-block plane tilt"""
    return np.sin(a * 2.399)


def sstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def coast_dist(x, z):
    """signed distance to the coast (positive on land) and interpolated coast attributes."""
    p = np.stack([x, z], -1)
    best = np.full(x.shape, 1e9)
    sign = np.ones(x.shape)
    at = np.zeros(x.shape + (3,))
    for i in range(len(COAST) - 1):
        a, b = COAST[i, :2], COAST[i + 1, :2]
        ab = b - a
        t = np.clip(((p - a) @ ab) / (ab @ ab), 0, 1)
        q = a + t[..., None] * ab
        d = np.hypot(*(np.moveaxis(p - q, -1, 0)))
        m = d < best
        best = np.where(m, d, best)
        attr = COAST[i, 2:] * (1 - t[..., None]) + COAST[i + 1, 2:] * t[..., None]
        at = np.where(m[..., None], attr, at)
    # point in land polygon (close far to the north)
    poly = np.vstack([COAST[:, :2], [[900, 90], [900, -900], [-900, -900], [-900, 60]]])
    inside = np.zeros(x.shape, bool)
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi, xj, zj = *poly[i], *poly[j]
        c = ((zi > z) != (zj > z)) & (x < (xj - xi) * (z - zi) / (zj - zi + 1e-12) + xi)
        inside ^= c
        j = i
    return np.where(inside, best, -best), at


DISCS = [  # natural ledges guests jump from: x, z, radius, height
    (-36.5, -13, 5.5, 12.0), (-40.5, 3, 4.5, 8.0), (-48.5, 19, 4.5, 4.2),
]


def height(x, z):
    x, z = np.asarray(x, float), np.asarray(z, float)
    plat = sstep(58, 44, np.abs(x)) * sstep(-40, -58, z)  # keep the coast straight under the terrace
    wob = 1 - plat
    wx = x + wob * 3.2 * fbm(x / 17, 0 * x, z / 17, 3, 11)
    wz = z + wob * 3.2 * fbm(x / 17, 0 * x + 5, z / 17, 3, 12)
    d, at = coast_dist(wx, wz)
    hc, run, dep = at[..., 0], at[..., 1], at[..., 2]
    hc = hc * (1 + 0.18 * fbm(x / 30, 0 * x, z / 30, 3, 21) * wob)
    # cliff: steep foot, broken by one or two benches
    u = np.clip(d / np.maximum(run, 1), 0, 1)
    bench = 0.5 + 0.16 * vnoise(x / 26, 0 * x, z / 26, 5)
    prof = np.where(u < 0.42, u / 0.42 * bench, np.where(u < 0.58, bench + (u - 0.42) * 0.25, bench + 0.04 + (1 - bench - 0.04) * (u - 0.58) / 0.42))
    prof = np.clip(prof, 0, 1)
    land = hc * prof + 0.2
    inland = np.clip(d - run, 0, None)
    land = land + inland * 0.16 * (1 + 0.5 * fbm(x / 60, 0 * x, z / 60, 3, 31)) * sstep(0, 25, inland)
    # mountain behind the hotel, with bare limestone bands
    back = sstep(-118, -330, z)
    ridge = 118 * back * (0.75 + 0.45 * fbm(x / 120, 0 * x, z / 120, 4, 41)) + 30 * sstep(70, 260, np.abs(x)) * sstep(-60, -260, z)
    land = land + ridge
    land = land + wob * sstep(1, 8, d) * (1.3 * fbm(x / 11, 0 * x, z / 11, 4, 51))
    # hotel platform
    pm = sstep(54, 46, np.abs(x)) * sstep(-136, -124, z) * sstep(0.5, 3.4, d)
    land = land * (1 - pm) + PLATFORM_Y * pm
    for cx, cz, r, h in DISCS:
        m = sstep(r + 2.2, r, np.hypot(x - cx, z - cz))
        land = land * (1 - m) + (h + 0.25 * fbm(x / 2, 0 * x, z / 2, 2, 61)) * m
    # seabed
    s = -d
    sea = -(0.4 + dep * sstep(0, 5, s) + 3.0 * sstep(8, 40, s) + 10 * sstep(90, 260, z) + 8 * sstep(40, 200, s))
    sea = sea + 0.7 * fbm(x / 14, 0 * x, z / 14, 3, 71) + 0.15 * fbm(x / 2.5, 0 * x, z / 2.5, 2, 72)
    # swimming ledge in front of the jetty
    return np.where(d > 0, land, sea), d
