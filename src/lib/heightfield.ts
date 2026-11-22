// Deterministic terrain height function.
// IMPORTANT: blender/heightfield.py is a line-by-line port of this file.
// Keep them in sync (scripts/check-heightfield.mjs compares sample values).
import layout from '../data/layout.json' with { type: 'json' }

const T = layout.terrain

function hash(ix: number, iz: number, seed: number): number {
  let n = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) >>> 0
  n = Math.imul(n ^ (n >>> 13), 1274126177) >>> 0
  n = (n ^ (n >>> 16)) >>> 0
  return n / 4294967296
}

export function valueNoise(x: number, z: number, seed = T.seed): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash(ix, iz, seed)
  const b = hash(ix + 1, iz, seed)
  const c = hash(ix, iz + 1, seed)
  const d = hash(ix + 1, iz + 1, seed)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

export function fbm(x: number, z: number, octaves = 5, seed = T.seed): number {
  let amp = 0.5
  let freq = 1
  let sum = 0
  for (let i = 0; i < octaves; i++) {
    sum += amp * (valueNoise(x * freq, z * freq, seed + i * 17) * 2 - 1)
    freq *= 2.03
    amp *= 0.5
  }
  return sum
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function shoreZ(x: number): number {
  const s = smoothstep(T.headlandStart, T.headlandEnd, Math.abs(x))
  return T.shoreZ + T.headlandPush * s + T.shoreAmp * Math.sin(x * T.shoreFreq)
}

/** Natural terrain without the flattened pads. */
export function baseHeight(x: number, z: number): number {
  const d = shoreZ(x) - z // distance inland (negative = under water)
  const n = fbm(x * 0.006, z * 0.006)
  let h: number
  if (d < 0) {
    h = Math.max(-28, d * 0.07) + n * 1.5
  } else if (d < T.beachWidth) {
    h = d * 0.065 + n * 0.4
  } else {
    const inland = d - T.beachWidth
    h = T.beachWidth * 0.065 + inland * T.slope + n * T.noiseAmp * smoothstep(0, 120, inland)
    // rolling ridges + mountains behind the site
    h += T.mountainHeight * smoothstep(T.mountainStart, T.mountainEnd, d) * (0.65 + 0.35 * fbm(x * 0.0021, z * 0.0021, 4, T.seed + 3))
    h += fbm(x * 0.0016 + 3.1, z * 0.0016, 3, T.seed + 9) * 40 * smoothstep(300, 900, d)
  }
  // headland ridges either side of the bay
  const ax = Math.abs(x)
  const ridge = smoothstep(T.headlandStart - 40, T.headlandEnd + 120, ax) * smoothstep(-160, 60, d)
  h += ridge * (38 + 26 * fbm(x * 0.004, z * 0.004, 4, T.seed + 5))
  // offshore island
  const I = T.island
  const di = Math.hypot(x - I.x, z - I.z) / I.r
  if (di < 1.3) {
    const k = Math.max(0, 1 - di)
    h = Math.max(h, -6 + (I.h + 6) * k * k * (1.2 + 0.4 * fbm(x * 0.02, z * 0.02, 3, T.seed + 11)))
  }
  return h
}

type Pad = { x: number; z: number; rx: number; rz: number; rot: number; falloff: number; h?: number }
const pads: Pad[] = layout.pads.map((p) => ({ ...p }))
for (const p of pads) p.h = baseHeight(p.x, p.z)

/** Terrain height including the flattened terraces under buildings & amenities. */
export function height(x: number, z: number): number {
  let h = baseHeight(x, z)
  for (const p of pads) {
    const dx = x - p.x
    const dz = z - p.z
    if (Math.abs(dx) > p.rx + p.falloff + 40 || Math.abs(dz) > p.rz + p.falloff + 40) continue
    const c = Math.cos(p.rot)
    const s = Math.sin(p.rot)
    const lx = Math.abs(dx * c - dz * s)
    const lz = Math.abs(dx * s + dz * c)
    // rounded-rectangle distance outside the pad
    const ox = Math.max(0, lx - p.rx)
    const oz = Math.max(0, lz - p.rz)
    const dist = Math.hypot(ox, oz)
    const w = 1 - smoothstep(0, p.falloff, dist)
    if (w > 0) h = h + (p.h! - h) * w
  }
  return h
}

export const padHeight = (i: number) => pads[i].h!

/** Numerical normal (y-up). */
export function slopeAt(x: number, z: number, e = 1.5): number {
  const hx = height(x + e, z) - height(x - e, z)
  const hz = height(x, z + e) - height(x, z - e)
  return Math.hypot(hx, hz) / (2 * e)
}
