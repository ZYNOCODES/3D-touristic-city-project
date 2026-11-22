// Solid footprints of buildings and hardscape, shared by the planting plan and the
// site validator (scripts/validate-site.mjs). Rectangles are in each object's local
// frame (x along, z towards the sea) and tested in world XZ.
import layout from '../data/layout.json' with { type: 'json' }

const VILLA_SCALE: Record<string, number> = { ocean: 1.12, ridge: 1.0, canopy: 0.9 }

export interface Footprint {
  name: string
  x: number
  z: number
  rot: number
  x0: number
  x1: number
  z0: number
  z1: number
}

const A = layout.amenities
const R = layout.residence

export const FOOTPRINTS: Footprint[] = [
  ...layout.villas.map((v) => {
    const k = VILLA_SCALE[v.type] ?? 1
    return { name: `villa ${v.id}`, x: v.x, z: v.z, rot: v.rot, x0: -12.6 * k, x1: 12.6 * k, z0: -9.6 * k, z1: 11.7 * k }
  }),
  { name: 'residence building', x: R.x, z: R.z, rot: 0, x0: -66, x1: 66, z0: -15, z1: 16 },
  { name: 'residence forecourt (paving & drop-off)', x: R.x, z: R.z, rot: 0, x0: -14, x1: 14, z0: 16, z1: 46 },
  { name: 'pool deck', x: A.pool.x, z: A.pool.z, rot: 0, x0: -A.pool.deckW / 2, x1: A.pool.deckW / 2, z0: -A.pool.deckL / 2, z1: A.pool.deckL / 2 },
  { name: 'social lounge', x: A.lounge.x, z: A.lounge.z, rot: 0, x0: -A.lounge.w / 2, x1: A.lounge.w / 2, z0: -A.lounge.l / 2, z1: A.lounge.l / 2 },
  { name: 'sports court', x: A.court.x, z: A.court.z, rot: 0, x0: -A.court.w / 2 - 3, x1: A.court.w / 2 + 3, z0: -A.court.l / 2 - 3, z1: A.court.l / 2 + 3 },
  { name: 'playground', x: A.playground.x, z: A.playground.z, rot: 0, x0: -A.playground.r, x1: A.playground.r, z0: -A.playground.r, z1: A.playground.r },
  { name: 'beach club deck', x: A.beachClub.x, z: A.beachClub.z, rot: 0, x0: -A.beachClub.w / 2, x1: A.beachClub.w / 2 - 22, z0: -A.beachClub.l / 2, z1: A.beachClub.l / 2 },
]

/** First footprint containing the circle (x, z, radius), or null. */
export function blockedBy(x: number, z: number, radius = 0): Footprint | null {
  for (const f of FOOTPRINTS) {
    const dx = x - f.x
    const dz = z - f.z
    if (Math.abs(dx) > 120 || Math.abs(dz) > 120) continue
    const c = Math.cos(f.rot)
    const s = Math.sin(f.rot)
    const lx = dx * c - dz * s
    const lz = dx * s + dz * c
    if (lx > f.x0 - radius && lx < f.x1 + radius && lz > f.z0 - radius && lz < f.z1 + radius) return f
  }
  return null
}

/** Distance from a point to the nearest road/path centreline minus its half width (≤ 0 = on it). */
export function pathClearance(x: number, z: number) {
  let best = Infinity
  for (const p of layout.paths) {
    for (let k = 0; k < p.points.length - 1; k++) {
      const [ax, az] = p.points[k]
      const [bx, bz] = p.points[k + 1]
      const dx = bx - ax
      const dz = bz - az
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)))
      best = Math.min(best, Math.hypot(x - (ax + dx * t), z - (az + dz * t)) - p.width / 2)
    }
  }
  return best
}
