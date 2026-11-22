// Terrain "holes": the terrain is discarded under villa podiums and the pool deck so
// sunken pools and podium tops are not buried by the flattened pads. A second,
// dynamic rectangle opens the footprint of the interior currently being toured.
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { RESIDENCE_SPEC } from '../../data/residenceSpec'

export const HOLE_BOUNDS = { x0: -560, z0: -620, size: 1120, res: 1120 }
const VILLA_SCALE: Record<string, number> = { ocean: 1.12, ridge: 1.0, canopy: 0.9 }

export function buildHoleTexture() {
  const { x0, z0, size, res } = HOLE_BOUNDS
  const data = new Uint8Array(res * res)
  const cell = size / res
  const rect = (cx: number, cz: number, rot: number, lx0: number, lx1: number, lz0: number, lz1: number) => {
    const r = Math.hypot(Math.max(-lx0, lx1), Math.max(-lz0, lz1)) + 1
    const c = Math.cos(rot)
    const s = Math.sin(rot)
    for (let z = cz - r; z <= cz + r; z += cell)
      for (let x = cx - r; x <= cx + r; x += cell) {
        const dx = x - cx
        const dz = z - cz
        const lx = dx * c - dz * s
        const lz = dx * s + dz * c
        if (lx < lx0 || lx > lx1 || lz < lz0 || lz > lz1) continue
        const i = Math.floor((x - x0) / cell)
        const j = Math.floor((z - z0) / cell)
        if (i >= 0 && j >= 0 && i < res && j < res) data[j * res + i] = 255
      }
  }
  for (const v of layout.villas) {
    const k = VILLA_SCALE[v.type] ?? 1
    rect(v.x, v.z, v.rot, -12.2 * k, 12.2 * k, -9.2 * k, 11.2 * k)
  }
  const P = layout.amenities.pool
  rect(P.x, P.z, 0, -P.deckW / 2 + 0.4, P.deckW / 2 - 0.4, -P.deckL / 2 + 0.4, P.deckL / 2 - 0.4)
  // residence: garage ramp and the sunken basement entrance
  const RH = RESIDENCE_SPEC.rampHole
  if (RH) rect(layout.residence.x, layout.residence.z, 0, RH.x0, RH.x1, RH.z0, RH.z1)
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.UnsignedByteType)
  t.magFilter = THREE.NearestFilter
  t.minFilter = THREE.NearestFilter
  t.needsUpdate = true
  return t
}

/** Dynamic hole for the interior being toured (local rect in the unit's frame). */
export const INTERIOR_HOLE = {
  uHoleOn: { value: 0 },
  uHoleCenter: { value: new THREE.Vector2() },
  uHoleRot: { value: 0 },
  uHoleRect: { value: new THREE.Vector4(-16.9, 11.9, -6.9, 12.9) }, // lx0, lx1, lz0, lz1
}
