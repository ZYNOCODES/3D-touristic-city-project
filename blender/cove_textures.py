"""Textures for the cove: simulated caustics atlas, tileable wave normals, limestone/ground sets as WebP (full + phone size)."""
import sys
from pathlib import Path

import bpy
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bl_util as U  # noqa: E402
import config as C  # noqa: E402

OUT = C.OUT_TEXTURES / "cove"
OUT.mkdir(parents=True, exist_ok=True)


def save(name, arr, quality=82):
    h, w = arr.shape[:2]
    px = np.ones((h, w, 4), np.float32)
    px[..., : arr.shape[2]] = arr
    img = bpy.data.images.new(name, w, h, alpha=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(px.ravel())
    sc = bpy.context.scene
    sc.render.image_settings.file_format = "WEBP"
    sc.render.image_settings.color_mode = "RGB"
    sc.render.image_settings.quality = quality
    sc.view_settings.view_transform = "Raw"
    p = OUT / f"{name}.webp"
    img.save_render(str(p), scene=sc)
    U.log(p.name, p.stat().st_size // 1024, "KB")


def convert(src, name, size, quality=82):
    img = bpy.data.images.load(str(src))
    img.colorspace_settings.name = "Non-Color"
    img.scale(size, size)
    a = np.empty(size * size * 4, np.float32)
    img.pixels.foreach_get(a)
    save(name, a.reshape(size, size, 4)[..., :3], quality)


def waves(rng, kmin, kmax, n, slope):
    out = []
    while len(out) < n:
        kx, ky = rng.integers(-kmax, kmax + 1, 2)
        k = np.hypot(kx, ky)
        if k < kmin or k > kmax:
            continue
        out.append((kx, ky, rng.random() * 6.28318, slope / k / np.sqrt(n), max(1, int(round(np.sqrt(k) * 1.15))) * rng.choice([-1, 1, 1])))
    return out


def caustics():
    """photon-map caustics of a tileable rippled surface, 32 looping frames (8x4 atlas)."""
    S, SS = 256, 1280
    W = waves(np.random.default_rng(5), 1.5, 6.5, 26, 1.0)
    g = (np.arange(SS) + 0.5) / SS
    X, Y = np.meshgrid(g, g)
    atlas = np.zeros((S * 4, S * 8), np.float32)
    for fr in range(32):
        t = fr / 32 * 2 * np.pi
        gx = np.zeros_like(X)
        gy = np.zeros_like(X)
        for kx, ky, ph, a, w in W:
            c = np.cos(2 * np.pi * (kx * X + ky * Y) + ph + w * t) * a
            gx += c * kx
            gy += c * ky
        f = 0.085
        acc = np.zeros((S, S), np.float32)
        px, py = (X + gx * f) % 1, (Y + gy * f) % 1
        fx, fy = px * S - 0.5, py * S - 0.5
        ix, iy = np.floor(fx).astype(int), np.floor(fy).astype(int)
        ux, uy = fx - ix, fy - iy
        for dx, wx in ((0, 1 - ux), (1, ux)):
            for dy, wy in ((0, 1 - uy), (1, uy)):
                np.add.at(acc, ((iy + dy) % S, (ix + dx) % S), wx * wy)
        acc /= acc.mean()
        v = np.clip(acc / 6.0, 0, 1) ** 0.5
        r, c = fr // 8, fr % 8
        atlas[r * S:(r + 1) * S, c * S:(c + 1) * S] = v
    save("caustics", np.repeat(atlas[..., None], 3, -1), 78)


def wave_normals():
    S = 512
    W = waves(np.random.default_rng(9), 1, 9, 34, 0.55) + waves(np.random.default_rng(10), 9, 34, 60, 0.30)
    g = (np.arange(S) + 0.5) / S
    X, Y = np.meshgrid(g, g)
    gx = np.zeros_like(X)
    gy = np.zeros_like(X)
    for kx, ky, ph, a, _ in W:
        c = np.cos(2 * np.pi * (kx * X + ky * Y) + ph) * a
        gx += c * kx
        gy += c * ky
    s = 2.2 * np.sqrt((gx ** 2 + gy ** 2).mean())
    n = np.stack([np.clip(gx / s / 2 + 0.5, 0, 1), np.clip(gy / s / 2 + 0.5, 0, 1), np.full_like(gx, 0.5)], -1)
    save("wave_n", n.astype(np.float32), 92)


def main():
    U.reset_scene()
    caustics()
    wave_normals()
    T = C.CACHE / "cove_tex"
    for name, size in (("cliff_a", 1024), ("cliff_b", 1024), ("cliff_c", 1024), ("seabed_sand", 512), ("ground_rocky", 1024), ("deck_grey", 1024)):
        for m in ("diff", "nor_gl"):
            p = T / name / f"{m}.jpg"
            if p.exists():
                convert(p, f"{name}_{m}", size, 82 if m == "diff" else 86)


if __name__ == "__main__":
    main()
