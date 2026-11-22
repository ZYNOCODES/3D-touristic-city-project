// Interior layout shared by the procedural fallback and (by convention) blender/interior.py.
// Local space: metres, floor at y = 0, glass facade at z = 4 facing the ocean (+z).
import * as THREE from 'three'
import type { HotspotId } from '../../store'
import { Parts, type PartMap } from '../geo/build'

export const HOTSPOTS: { id: HotspotId; label: string; pos: [number, number, number]; look: [number, number, number] }[] = [
  { id: 'living', label: 'Living Room', pos: [-3.2, 1.6, 2.9], look: [-8, 1.1, -2.5] },
  { id: 'dining', label: 'Dining & Kitchen', pos: [3.0, 1.6, 3.1], look: [3.2, 1.0, -5] },
  { id: 'stair', label: 'Stair & Lounge', pos: [7.6, 1.6, 2.6], look: [11, 3.6, -3.5] },
  { id: 'terrace', label: 'Pool Terrace', pos: [-1.5, 1.65, 6.2], look: [4, 0.2, 16] },
  { id: 'bedroom', label: 'Master Bedroom', pos: [-11.2, 1.6, 2.6], look: [-12.6, 0.9, -5] },
]

/** Point lights (warm) — intensity scales up at night. */
export const INTERIOR_LIGHTS: { pos: [number, number, number]; color: string; power: number; distance: number }[] = [
  { pos: [2.0, 2.3, 1.2], color: '#ffc98a', power: 30, distance: 7 },
  { pos: [3.0, 2.3, 1.2], color: '#ffc98a', power: 30, distance: 7 },
  { pos: [4.0, 2.3, 1.2], color: '#ffc98a', power: 30, distance: 7 },
  { pos: [-5.5, 3.1, 0.5], color: '#ffd7a8', power: 45, distance: 10 },
  { pos: [3.0, 3.1, -3.1], color: '#ffe0b8', power: 35, distance: 8 },
  { pos: [8.5, 6.2, -0.5], color: '#ffd7a8', power: 60, distance: 12 },
  { pos: [-12.5, 3.0, -2.5], color: '#ffcf96', power: 35, distance: 9 },
  { pos: [-1.6, 1.5, -1.6], color: '#ffbf7a', power: 12, distance: 5 },
]

export const BOUNDS = new THREE.Box3(new THREE.Vector3(-16.6, -0.5, -6.6), new THREE.Vector3(11.6, 7, 12.6))

export function interiorParts(): PartMap {
  const P = new Parts()
  // ---- podium, floor, terrace ------------------------------------------------
  P.box('stone', -17, -7, -7, 12, -0.3, 13)
  P.box('floor', -16.5, -0.3, -6.3, 11.5, 0, 4.0)
  P.box('stone', -16.5, -0.3, 4.0, 11.5, 0, 7.8)
  P.box('stone', -16.5, -0.3, 7.8, -4.2, 0, 12.6)
  P.box('stone', 9.2, -0.3, 7.8, 11.5, 0, 12.6)
  // infinity pool (vanishing edge on the ocean side)
  P.box('pooltile', -4.2, -1.4, 7.8, 9.2, -1.25, 12.4)
  P.box('pooltile', -4.2, -1.4, 7.8, 9.2, 0, 8.0)
  P.box('pooltile', -4.2, -1.4, 7.8, -4.0, 0, 12.4)
  P.box('pooltile', 9.0, -1.4, 7.8, 9.2, 0, 12.4)
  P.box('pooltile', -4.2, -1.6, 12.4, 9.2, -0.12, 12.6)
  P.plane('water', -4.0, 8.0, 9.0, 12.55, -0.08)
  // ---- walls ---------------------------------------------------------------------
  P.box('plaster', -16.5, 0, -6.3, 6, 3.4, -6.0)
  P.box('plaster', 6, 0, -6.3, 11.5, 6.8, -6.0)
  P.box('plaster', -16.8, 0, -6.3, -16.5, 3.4, 4.0)
  P.box('plaster', 11.5, 0, -6.3, 11.8, 6.8, 4.0)
  // partition bedroom | living with door opening
  P.box('plaster', -9.4, 0, -6.0, -9.1, 3.4, -4.3)
  P.box('plaster', -9.4, 0, -2.7, -9.1, 3.4, 2.4)
  P.box('plaster', -9.4, 2.4, -4.3, -9.1, 3.4, -2.7)
  // ceilings
  P.box('ceiling', -16.5, 3.4, -6.3, 6, 3.6, 4.0)
  P.box('ceiling', 6, 6.8, -6.3, 11.5, 7.0, 4.0)
  P.box('plaster', 6, 3.4, 3.4, 11.5, 6.8, 4.0)
  // cove light strip
  P.box('lamp', -16.4, 3.32, -5.9, 5.9, 3.36, -5.8)
  // ---- glazing ------------------------------------------------------------------
  P.box('glass', -16.5, 0.02, 3.92, 11.5, 3.38, 3.98)
  P.box('frame', -16.5, 3.3, 3.88, 11.5, 3.42, 4.02)
  for (let x = -16.5; x <= 11.5; x += 2.8) P.box('frame', x - 0.03, 0, 3.88, x + 0.03, 3.4, 4.02)
  P.box('frame', -16.5, 0, 3.88, 11.5, 0.03, 4.02)
  // ---- covered terrace soffit + columns --------------------------------------------
  P.box('wood', -16.5, 3.4, 4.0, 11.5, 3.55, 7.8)
  P.box('plaster', -16.6, 3.55, 4.0, 11.6, 3.9, 7.9)
  for (const x of [-16.2, -8, 0.5, 11.2]) P.cyl('wood', x, 0, 7.5, 0.16, 3.4, 10)
  // glass balustrades
  P.box('glass', -16.5, 0, 12.5, -4.2, 1.05, 12.56)
  P.box('glass', -16.56, 0, 4.0, -16.5, 1.05, 12.6)
  P.box('glass', 11.5, 0, 4.0, 11.56, 1.05, 12.6)

  // ---- wood slat feature wall + floating stair ---------------------------------------
  P.box('walnut', 11.2, 0, -6.0, 11.5, 6.8, 3.4)
  for (let z = -5.95; z < 3.35; z += 0.16) P.box('wood', 11.05, 0, z, 11.2, 6.8, z + 0.08)
  for (let i = 0; i < 18; i++) {
    const y = (i + 1) * 0.19
    const z = 1.5 - i * 0.27
    P.box('wood', 9.9, y - 0.08, z - 0.3, 11.05, y, z)
  }
  // mezzanine walkway + glass railing
  P.box('concrete', 6, 3.2, -6.0, 11.05, 3.4, -3.45)
  P.box('wood', 6, 3.4, -6.0, 11.05, 3.42, -3.45)
  P.box('glass', 6, 3.42, -3.5, 9.85, 4.45, -3.44)
  P.box('glass', 9.85, 0.2, -3.45, 9.9, 4.45, 1.5)
  // pebble bed + planter under the stair
  P.box('stone', 8.2, 0, -2.6, 11.0, 0.08, 0.8)
  P.cyl('plaster', 8.9, 0.08, -1.2, 0.45, 0.55, 18, 0.38)

  // ---- living -----------------------------------------------------------------
  P.box('fabric', -7.8, 0.0, -1.8, -1.4, 0.015, 3.0)
  // sectional sofa (faces the media wall at -x), chaise return at the back
  P.box('fabric', -4.4, 0, -1.9, -3.4, 0.42, 2.4)
  P.box('cushion', -4.35, 0.42, -1.85, -3.55, 0.56, 2.35)
  P.box('fabric', -3.75, 0.42, -1.9, -3.35, 0.9, 2.4)
  P.box('fabric', -7.6, 0, -2.0, -3.4, 0.42, -1.0)
  P.box('cushion', -7.55, 0.42, -1.95, -3.6, 0.56, -1.1)
  P.box('fabric', -7.6, 0.42, -2.0, -3.4, 0.9, -1.75)
  for (let i = 0; i < 4; i++) P.box('cushion', -4.0, 0.56, -0.6 + i * 0.75, -3.75, 0.95, -0.05 + i * 0.75)
  // organic coffee table
  P.cyl('walnut', -6.0, 0, 0.6, 0.85, 0.36, 24)
  P.cyl('walnut', -6.9, 0, 1.3, 0.55, 0.3, 24)
  // media wall
  P.box('walnut', -9.1, 0, -2.6, -8.75, 3.4, 2.4)
  for (let z = -2.55; z < 2.35; z += 0.12) P.box('wood', -8.75, 0, z, -8.68, 3.4, z + 0.06)
  P.box('black', -8.67, 1.05, -1.25, -8.62, 2.2, 0.85)
  P.box('walnut', -8.68, 0, -2.4, -8.0, 0.45, 2.2)
  // lounge chairs by the glass
  for (const z of [2.9, 1.7]) {
    P.box('walnut', -8.0, 0, z - 0.4, -7.2, 0.38, z + 0.4)
    P.box('cushion', -7.95, 0.38, z - 0.36, -7.25, 0.5, z + 0.36)
    P.box('cushion', -8.0, 0.38, z - 0.4, -7.85, 0.95, z + 0.4)
  }
  // ---- dining & kitchen ----------------------------------------------------------
  P.box('walnut', 1.0, 0.72, 0.5, 5.0, 0.78, 1.9)
  P.box('walnut', 1.4, 0, 1.0, 1.6, 0.72, 1.4)
  P.box('walnut', 4.4, 0, 1.0, 4.6, 0.72, 1.4)
  for (let i = 0; i < 4; i++) {
    for (const s of [-1, 1]) {
      const x = 1.5 + i * 1.0
      const z = 1.2 + s * 1.05
      P.box('wood', x - 0.22, 0, z - 0.22, x + 0.22, 0.46, z + 0.22)
      P.box('wood', x - 0.22, 0.46, z + s * 0.18, x + 0.22, 0.95, z + s * 0.22)
    }
  }
  // pendants over the table
  for (const x of [2.0, 3.0, 4.0]) {
    P.cyl('frame', x, 2.35, 1.2, 0.006, 1.05, 4)
    P.cyl('rope', x, 2.05, 1.2, 0.28, 0.32, 16, 0.08)
    P.cyl('lamp', x, 2.04, 1.2, 0.2, 0.02, 14)
  }
  // island
  P.box('marble', 0.6, 0, -3.6, 5.4, 0.92, -2.5)
  P.box('marble', 0.5, 0.92, -3.65, 5.5, 0.97, -2.45)
  for (let i = 0; i < 3; i++) {
    const x = 1.6 + i * 1.4
    P.cyl('frame', x, 0, -2.0, 0.025, 0.7, 6)
    P.cyl('wood', x, 0.7, -2.0, 0.21, 0.06, 14)
  }
  // tall cabinetry + backsplash
  P.box('walnut', -0.2, 0, -6.0, 6.0, 2.9, -5.35)
  P.box('marble', 1.2, 0.92, -5.36, 4.8, 2.0, -5.3)
  P.box('black', 4.95, 0.9, -5.36, 5.75, 1.6, -5.31)
  P.box('black', 4.95, 1.65, -5.36, 5.75, 2.2, -5.31)
  // ---- bedroom ------------------------------------------------------------------
  P.box('fabric', -15.4, 0, -5.2, -10.2, 0.015, -0.6)
  P.box('walnut', -14.6, 0, -6.0, -10.6, 1.4, -5.8)
  P.box('wood', -13.7, 0, -5.8, -11.5, 0.32, -3.4)
  P.box('cushion', -13.65, 0.32, -5.75, -11.55, 0.6, -3.45)
  P.box('fabric', -13.68, 0.6, -4.6, -11.52, 0.66, -3.42)
  P.box('cushion', -13.4, 0.6, -5.7, -12.7, 0.78, -5.25)
  P.box('cushion', -12.5, 0.6, -5.7, -11.8, 0.78, -5.25)
  for (const x of [-14.3, -10.95]) P.box('walnut', x - 0.3, 0, -5.8, x + 0.3, 0.5, -5.3)
  P.box('wood', -13.4, 0, -3.1, -11.8, 0.45, -2.7)
  P.box('walnut', -16.5, 0, -5.8, -15.9, 2.9, -1.0)
  P.box('fabric', -15.2, 0, 2.2, -14.4, 0.42, 3.0)
  P.box('cushion', -15.2, 0.42, 2.2, -15.05, 0.9, 3.0)
  // ---- terrace furniture ----------------------------------------------------------
  for (const x of [-9.5, -7.8]) {
    P.box('wood', x - 0.36, 0, 8.6, x + 0.36, 0.3, 10.6)
    P.box('cushion', x - 0.33, 0.3, 8.7, x + 0.33, 0.38, 10.1)
  }
  P.box('fabric', -14.5, 0, 4.8, -10.5, 0.4, 5.7)
  P.box('cushion', -14.45, 0.4, 4.85, -10.55, 0.52, 5.65)
  P.box('fabric', -14.5, 0.4, 4.8, -10.5, 0.85, 5.05)
  P.cyl('stone', -12.5, 0, 6.6, 0.6, 0.35, 20)
  return P.merged()
}
