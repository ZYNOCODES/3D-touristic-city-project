// Mediterranean planting plan (pure data, runs in the browser and in Node for validation).
import layout from '../../data/layout.json' with { type: 'json' }
import { RESIDENCE_SPEC } from '../../data/residenceSpec'
import { blockedBy, pathClearance } from '../../lib/footprints'
import { fbm, height, padHeight, shoreZ } from '../../lib/heightfield'
import { BUILDING, GARDEN, PATH, VIEW, maskAt } from '../../lib/siteMask'
import type { ImpostorMeta, Plant } from './impostor'

export type Species = 'olive_a' | 'olive_b' | 'olive_c' | 'pine_a' | 'pine_b' | 'pine_c' | 'broadleaf' | 'ornamental' | 'cypress_a' | 'cypress_b' | 'palm_a' | 'palm_b' | 'shrub_round' | 'shrub_wide' | 'pampas' | 'lavender'

function prng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

/** crown radius (m) at scale 1 — used to keep crowns off buildings and paths */
export const CROWN: Record<string, number> = { olive_a: 2.6, olive_b: 2.4, olive_c: 2.0, pine_a: 3.0, pine_b: 2.8, pine_c: 2.9, broadleaf: 4.5, ornamental: 2.2, cypress_a: 0.9, cypress_b: 0.7, palm_a: 2.4, palm_b: 2.6, shrub_round: 0.7, shrub_wide: 1.3, pampas: 0.8, lavender: 0.45 }
export const REJECTED: { sp: string; x: number; z: number; why: string }[] = []

const VILLA_SCALE: Record<string, number> = { ocean: 1.12, ridge: 1.0, canopy: 0.9 }

export function plan(meta: Record<string, ImpostorMeta | true>) {
  REJECTED.length = 0
  const trunks = new Map<string, [number, number][]>()
  const r = prng(77)
  const out = new Map<Species, Plant[]>()
  const add = (sp: Species, x: number, z: number, s = 1, yOff = 0) => {
    if (!meta[sp]) return
    // spatial validation: no trunk inside a building/hardscape, crowns kept clear of facades,
    // nothing growing on a road or path
    const crown = (CROWN[sp] ?? 1) * s
    const trunkHit = blockedBy(x, z, 0.3)
    const crownHit = crown > 1.5 ? blockedBy(x, z, crown * 0.55) : null
    if (trunkHit || crownHit) {
      REJECTED.push({ sp, x, z, why: (trunkHit ?? crownHit)!.name })
      return
    }
    // keep trunks apart (no two trees growing out of the same spot)
    if (crown > 1.5) {
      const key = `${Math.round(x / 2)},${Math.round(z / 2)}`
      for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
        const near = trunks.get(`${Math.round(x / 2) + dx},${Math.round(z / 2) + dz}`)
        if (near && near.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 1.6)) {
          REJECTED.push({ sp, x, z, why: 'too close to another trunk' })
          return
        }
      }
      if (!trunks.has(key)) trunks.set(key, [])
      trunks.get(key)!.push([x, z])
    }
    if (pathClearance(x, z) < 0.4) {
      REJECTED.push({ sp, x, z, why: 'path' })
      return
    }
    if (!out.has(sp)) out.set(sp, [])
    out.get(sp)!.push({ x, y: height(x, z) - 0.15 + yOff, z, s, r: r() * Math.PI * 2 })
  }
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]

  // ---- hillside forest: pines + holm-oak-like broadleaves + olives, cypress groups --------
  const step = 7.2
  for (let z = -1500; z < 650; z += step) {
    for (let x = -1500; x < 1500; x += step) {
      const near = Math.abs(x) < 600 && z > -650 && z < 520
      if (!near && (Math.abs(Math.round(x / step)) % 2 || Math.abs(Math.round(z / step)) % 2)) continue
      const px = x + (r() - 0.5) * step * 0.95
      const pz = z + (r() - 0.5) * step * 0.95
      const d = shoreZ(px) - pz
      if (d < 30) continue
      const h = height(px, pz)
      if (h < 3) continue
      const m = maskAt(px, pz)
      if (m === BUILDING || m === PATH || m === VIEW) continue
      if (m === GARDEN && r() > 0.25) continue
      const dens = 0.68 + 0.45 * fbm(px * 0.008, pz * 0.008, 3, 41)
      if (r() > dens) continue
      const kind = fbm(px * 0.004 + 9, pz * 0.004, 2, 5)
      const u = r()
      if (kind > 0.12) add(pick(['pine_a', 'pine_b', 'pine_c']), px, pz, 0.85 + r() * 0.35)
      else if (kind < -0.18 && u < 0.5) add('broadleaf', px, pz, 0.8 + r() * 0.4)
      else if (u < 0.55) add(pick(['olive_a', 'olive_b', 'olive_c']), px, pz, 0.85 + r() * 0.4)
      else if (u < 0.7) add(pick(['cypress_a', 'cypress_b']), px, pz, 0.8 + r() * 0.4)
      else add(pick(['pine_a', 'pine_b', 'pine_c', 'broadleaf']), px, pz, 0.8 + r() * 0.3)
      // understorey scrub
      if (near && r() < 0.35) add(pick(['shrub_wide', 'shrub_round']), px + 2.5, pz + 1.5, 0.8 + r() * 0.8)
    }
  }

  // ---- villa gardens ---------------------------------------------------------------------
  for (const v of layout.villas) {
    const k = VILLA_SCALE[v.type] ?? 1
    const c = Math.cos(v.rot)
    const s = Math.sin(v.rot)
    const w = (lx: number, lz: number): [number, number] => [v.x + lx * c + lz * s, v.z - lx * s + lz * c]
    // olives framing the terrace
    for (const [lx, lz] of [[-16.5, 6], [15.5, 13.5]] as const) {
      const [x, z] = w(lx * k, lz * k)
      add(pick(['olive_a', 'olive_b', 'olive_c']), x, z, 0.75 + r() * 0.3)
    }
    // palm by the pool
    if (r() < 0.8) {
      const [x, z] = w(13.5 * k, 3.5 * k)
      add(pick(['palm_a', 'palm_b']), x, z, 0.75 + r() * 0.25)
    }
    // cypress hedge along the back boundary
    for (let i = 0; i < 6; i++) {
      const [x, z] = w((-13 + i * 5.2) * k, -14 * k)
      if (maskAt(x, z) === PATH) continue
      add(pick(['cypress_a', 'cypress_b']), x, z, 0.65 + r() * 0.2)
    }
    // clipped shrubs, lavender and pampas around the podium
    for (let i = 0; i < 9; i++) {
      const lx = (-14 + i * 3.4) * k
      const [x, z] = w(lx, 13.6 * k)
      if (maskAt(x, z) === PATH) continue
      add(i % 3 === 0 ? 'pampas' : i % 3 === 1 ? 'lavender' : 'shrub_round', x, z, 0.8 + r() * 0.4)
    }
    for (const lz of [-6, 0, 6]) {
      const [x, z] = w(-14.2 * k, lz * k)
      add('shrub_round', x, z, 0.9 + r() * 0.3)
      const [x2, z2] = w(14.2 * k, lz * k)
      add(r() < 0.5 ? 'lavender' : 'shrub_wide', x2, z2, 0.9)
    }
  }

  // ---- cypress avenue along the main road; lavender beds along the footpaths -------------
  for (const p of layout.paths) {
    const road = p.kind === 'road'
    let acc = 0
    for (let k = 0; k < p.points.length - 1; k++) {
      const [ax, az] = p.points[k]
      const [bx, bz] = p.points[k + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const nx = -(bz - az) / len
      const nz = (bx - ax) / len
      for (let t = 0; t < len; t += road ? 9 : 4) {
        acc++
        const x = ax + ((bx - ax) * t) / len
        const z = az + ((bz - az) * t) / len
        for (const side of [-1, 1]) {
          const off = p.width / 2 + (road ? 3.2 : 1.6)
          const px = x + nx * off * side
          const pz = z + nz * off * side
          const m = maskAt(px, pz)
          if (m === BUILDING) continue
          if (road) add(pick(['cypress_a', 'cypress_b']), px, pz, 0.75 + r() * 0.2)
          else if (acc % 2) add(acc % 4 === 1 ? 'lavender' : 'shrub_round', px, pz, 0.8 + r() * 0.4)
        }
      }
    }
  }

  // ---- amenities -----------------------------------------------------------------------------
  const A = layout.amenities
  const ring = (cx: number, cz: number, rx: number, rz: number, n: number, kinds: Species[], scale = 1) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const x = cx + Math.cos(a) * rx
      const z = cz + Math.sin(a) * rz
      if (maskAt(x, z) === PATH) continue
      add(kinds[i % kinds.length], x, z, scale * (0.85 + r() * 0.3))
    }
  }
  ring(A.pool.x, A.pool.z, 35, 19.5, 18, ['palm_a', 'shrub_round', 'palm_b', 'pampas', 'olive_b', 'lavender'])
  ring(A.lounge.x, A.lounge.z, 14.5, 11, 10, ['olive_a', 'lavender', 'shrub_round', 'pampas'])
  ring(A.court.x, A.court.z, 20, 12.5, 12, ['cypress_a', 'shrub_wide', 'cypress_b'])
  ring(A.playground.x, A.playground.z, 17, 17, 12, ['olive_c', 'shrub_round', 'ornamental', 'lavender'])
  ring(A.garden.x, A.garden.z, 9, 9, 10, ['lavender', 'shrub_round', 'olive_a', 'pampas'])
  for (let x = -640; x < 640; x += 7) {
    if (r() < 0.45) continue
    const pz = shoreZ(x) - (26 + r() * 20)
    if (height(x, pz) < 1.2 || maskAt(x, pz) === PATH || maskAt(x, pz) === BUILDING) continue
    add(pick(['palm_a', 'palm_b']), x + r() * 3, pz, 0.85 + r() * 0.35)
  }

  // ---- residence forecourt (positions exported by blender/residence.py) -------------------------
  const ry = padHeight(layout.pads.length - 1)
  for (const t of RESIDENCE_SPEC.trees ?? []) {
    const x = layout.residence.x + t.x
    const z = layout.residence.z + t.z
    const sp: Species = t.kind === 'olive' ? pick(['olive_a', 'olive_b', 'olive_c']) : t.kind === 'cypress' ? pick(['cypress_a', 'cypress_b']) : pick(['palm_a', 'palm_b'])
    if (!out.has(sp)) out.set(sp, [])
    if (meta[sp]) out.get(sp)!.push({ x, y: ry + (t.kind === 'olive' ? 0.47 : 0.02), z, s: t.kind === 'cypress' ? 0.7 : 0.9, r: r() * 6.28 })
  }
  return out
}

