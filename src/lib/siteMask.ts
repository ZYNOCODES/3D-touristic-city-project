// Rasterised site mask (2 m cells) used to keep trees off roads, buildings and amenities.
import layout from '../data/layout.json'

export const MASK = { x0: -560, z0: -620, size: 1120, cell: 2 }
export const FREE = 0
export const PATH = 1
export const BUILDING = 2
export const GARDEN = 3
/** view corridor in front of a residence: no tall trees */
export const VIEW = 4

let grid: Uint8Array | null = null

export function siteMask() {
  if (grid) return grid
  const n = MASK.size / MASK.cell
  const g = new Uint8Array(n * n)
  const mark = (x: number, z: number, r: number, v: number, overwrite: (cur: number) => boolean = (cur) => cur === FREE || cur === GARDEN) => {
    const ci = Math.floor((x - MASK.x0) / MASK.cell)
    const cj = Math.floor((z - MASK.z0) / MASK.cell)
    const rc = Math.ceil(r / MASK.cell)
    for (let j = cj - rc; j <= cj + rc; j++)
      for (let i = ci - rc; i <= ci + rc; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue
        const cx = MASK.x0 + (i + 0.5) * MASK.cell
        const cz = MASK.z0 + (j + 0.5) * MASK.cell
        if ((cx - x) ** 2 + (cz - z) ** 2 > r * r) continue
        if (overwrite(g[j * n + i])) g[j * n + i] = v
      }
  }
  // gardens & building cores from pads
  for (const p of layout.pads) {
    const c = Math.cos(p.rot)
    const s = Math.sin(p.rot)
    const ex = p.rx + 8
    const ez = p.rz + 8
    for (let lz = -ez; lz <= ez; lz += MASK.cell)
      for (let lx = -ex; lx <= ex; lx += MASK.cell) {
        const x = p.x + lx * c + lz * s
        const z = p.z - lx * s + lz * c
        const core = Math.abs(lx) < p.rx + 1 && Math.abs(lz) < p.rz + 1
        mark(x, z, MASK.cell * 0.75, core ? BUILDING : GARDEN, (cur) => (core ? cur !== BUILDING : cur === FREE))
      }
  }
  // ocean-view corridors in front of every villa (local +z) and the residence block
  const corridor = (cx: number, cz: number, rot: number, x0: number, x1: number, z0: number, z1: number) => {
    const c = Math.cos(rot)
    const sn = Math.sin(rot)
    for (let lz = z0; lz <= z1; lz += MASK.cell)
      for (let lx = x0; lx <= x1; lx += MASK.cell) {
        const x = cx + lx * c + lz * sn
        const z = cz - lx * sn + lz * c
        mark(x, z, MASK.cell * 0.75, VIEW, (cur) => cur === FREE || cur === GARDEN)
      }
  }
  for (const v of layout.villas) corridor(v.x, v.z, v.rot, -19, 15, 10, 46)
  corridor(layout.residence.x, layout.residence.z, layout.residence.rot, -70, 70, 12, 60)
  for (const path of layout.paths) {
    const pts = path.points
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, az] = pts[k]
      const [bx, bz] = pts[k + 1]
      const len = Math.hypot(bx - ax, bz - az)
      const steps = Math.ceil(len / 1.5)
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        mark(ax + (bx - ax) * t, az + (bz - az) * t, path.width / 2 + 2.2, PATH, (cur) => cur !== BUILDING)
      }
    }
  }
  grid = g
  return g
}

export function maskAt(x: number, z: number): number {
  const g = siteMask()
  const n = MASK.size / MASK.cell
  const i = Math.floor((x - MASK.x0) / MASK.cell)
  const j = Math.floor((z - MASK.z0) / MASK.cell)
  if (i < 0 || j < 0 || i >= n || j >= n) return FREE
  return g[j * n + i]
}
