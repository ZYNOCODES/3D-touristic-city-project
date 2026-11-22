// World-space placement of amenity props (loungers, umbrellas, lamps, benches)
// and activity anchors used by the animated people. Derived from layout.json.
import * as THREE from 'three'
import layout from './layout.json'
import { height, padHeight, shoreZ } from '../lib/heightfield'

const A = layout.amenities
const padIdx = (name: 'pool' | 'lounge' | 'court' | 'playground') => {
  const am = A[name]
  return layout.pads.findIndex((p) => Math.abs(p.x - am.x) < 0.01 && Math.abs(p.z - am.z) < 0.01)
}
export const AMENITY_Y = {
  pool: padHeight(padIdx('pool')),
  lounge: padHeight(padIdx('lounge')),
  court: padHeight(padIdx('court')),
  playground: padHeight(padIdx('playground')),
}

export interface PropXf {
  x: number
  y: number
  z: number
  rot: number
}

export const LOUNGERS: PropXf[] = []
export const UMBRELLAS: PropXf[] = []
export const LAMPS: PropXf[] = []
export const BENCHES: PropXf[] = []

// pool deck: two rows facing the pool
{
  const { x, z, w } = A.pool
  const y = AMENITY_Y.pool + 0.12
  for (let i = 0; i < 9; i++) {
    const lx = x - w / 2 + 2 + i * 4.1
    LOUNGERS.push({ x: lx - 0.8, y, z: z - 11.5, rot: 0 }, { x: lx + 0.8, y, z: z - 11.5, rot: 0 })
    if (i % 2 === 0) UMBRELLAS.push({ x: lx, y, z: z - 12.6, rot: 0 })
    if (i % 3 !== 1) {
      LOUNGERS.push({ x: lx, y, z: z + 11.3, rot: Math.PI })
      if (i % 3 === 0) UMBRELLAS.push({ x: lx + 2, y, z: z + 12.4, rot: 0 })
    }
  }
}
// beach club: loungers on the sand in pairs
{
  const { x, w } = A.beachClub
  for (let i = 0; i < 12; i++) {
    const bx = x - w / 2 + i * 3.8
    const bz = shoreZ(bx) - 14 - (i % 2) * 0.6
    const y = height(bx, bz)
    LOUNGERS.push({ x: bx - 0.7, y, z: bz, rot: Math.PI }, { x: bx + 0.7, y, z: bz, rot: Math.PI })
    UMBRELLAS.push({ x: bx, y, z: bz + 1.2, rot: 0 })
  }
}
// lamp posts along the road and paths
for (const p of layout.paths) {
  let acc = 0
  for (let k = 0; k < p.points.length - 1; k++) {
    const [ax, az] = p.points[k]
    const [bx, bz] = p.points[k + 1]
    const len = Math.hypot(bx - ax, bz - az)
    acc += len
    const spacing = p.kind === 'road' ? 34 : 46
    if (acc > spacing) {
      acc = 0
      const nx = -(bz - az) / len
      const nz = (bx - ax) / len
      const off = p.width / 2 + 0.8
      const lx = bx + nx * off
      const lz = bz + nz * off
      LAMPS.push({ x: lx, y: height(lx, lz), z: lz, rot: Math.atan2(-nx, -nz) })
    }
  }
}
// benches around garden & playground
for (const [cx, cz, r, n] of [[A.garden.x, A.garden.z, A.garden.r - 4, 6], [A.playground.x, A.playground.z, A.playground.r + 1.5, 5]] as const) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3
    const bx = cx + Math.cos(a) * r
    const bz = cz + Math.sin(a) * r
    BENCHES.push({ x: bx, y: height(bx, bz), z: bz, rot: -a - Math.PI / 2 })
  }
}

// ---- activity anchors for people ------------------------------------------------
export const ANCHORS = {
  poolWater: { x: A.pool.x, z: A.pool.z, w: A.pool.w - 2, l: A.pool.l - 2, y: AMENITY_Y.pool - 0.1 },
  court: { x: A.court.x, z: A.court.z, w: A.court.w, l: A.court.l, y: AMENITY_Y.court + 0.05 },
  playground: { x: A.playground.x, z: A.playground.z, r: A.playground.r, y: AMENITY_Y.playground + 0.08 },
  lounge: { x: A.lounge.x, z: A.lounge.z, y: AMENITY_Y.lounge + 0.15 },
  swings: [-1.1, 0, 1.1].map((dx) => new THREE.Vector3(A.playground.x + 6 + dx, AMENITY_Y.playground + 2.4, A.playground.z - 4)),
  slideTop: new THREE.Vector3(A.playground.x - 3.2, AMENITY_Y.playground + 2.12, A.playground.z - 0.4),
  slideBottom: new THREE.Vector3(A.playground.x - 3.2, AMENITY_Y.playground + 0.36, A.playground.z + 4.3),
}
