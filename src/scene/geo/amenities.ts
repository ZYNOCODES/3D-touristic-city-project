// Procedural fallbacks for amenity structures & props (local space, y = 0 at pad level).
// blender/amenities.py builds the same pieces in more detail with the same node names.
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { Parts, type PartMap } from './build'

const A = layout.amenities

export function poolParts(): PartMap {
  const P = new Parts()
  const { w, l, deckW, deckL } = A.pool
  P.box('stone', -deckW / 2, -4, -deckL / 2, deckW / 2, 0.12, -l / 2 - 0.6)
  P.box('stone', -deckW / 2, -4, l / 2 + 0.6, deckW / 2, 0.12, deckL / 2)
  P.box('stone', -deckW / 2, -4, -l / 2 - 0.6, -w / 2 - 0.6, 0.12, l / 2 + 0.6)
  P.box('stone', w / 2 + 0.6, -4, -l / 2 - 0.6, deckW / 2, 0.12, l / 2 + 0.6)
  // coping
  P.box('marble', -w / 2 - 0.6, 0.0, -l / 2 - 0.6, w / 2 + 0.6, 0.16, -l / 2)
  P.box('marble', -w / 2 - 0.6, 0.0, l / 2, w / 2 + 0.6, 0.16, l / 2 + 0.6)
  P.box('marble', -w / 2 - 0.6, 0.0, -l / 2, -w / 2, 0.16, l / 2)
  P.box('marble', w / 2, 0.0, -l / 2, w / 2 + 0.6, 0.16, l / 2)
  // basin
  P.box('pooltile', -w / 2, -1.8, -l / 2, w / 2, -1.6, l / 2)
  P.box('pooltile', -w / 2, -1.8, -l / 2, w / 2, 0, -l / 2 + 0.15)
  P.box('pooltile', -w / 2, -1.8, l / 2 - 0.15, w / 2, 0, l / 2)
  P.box('pooltile', -w / 2, -1.8, -l / 2, -w / 2 + 0.15, 0, l / 2)
  P.box('pooltile', w / 2 - 0.15, -1.8, -l / 2, w / 2, 0, l / 2)
  P.box('pooltile', -w / 2, -1.8, -l / 2, -w / 2 + 6, -0.5, l / 2) // shallow lounging ledge
  P.plane('water', -w / 2, -l / 2, w / 2, l / 2, -0.1)
  // pool bar pavilion at the west end
  const bx = -deckW / 2 + 5
  P.box('wood', bx - 4, 3.1, -6, bx + 4, 3.35, 6)
  P.box('plaster', bx - 4.2, 3.35, -6.2, bx + 4.2, 3.6, 6.2)
  for (const [cx, cz] of [[-3.6, -5.6], [3.6, -5.6], [-3.6, 5.6], [3.6, 5.6]]) P.cyl('wood', bx + cx, 0.12, cz, 0.16, 3.0)
  P.box('walnut', bx - 1.2, 0.12, -3.5, bx + 0.6, 1.1, 3.5)
  P.box('marble', bx - 1.35, 1.1, -3.6, bx + 0.75, 1.18, 3.6)
  return P.merged()
}

export function loungeParts(): PartMap {
  const P = new Parts()
  const { w, l } = A.lounge
  P.box('deck', -w / 2, -3, -l / 2, w / 2, 0.15, l / 2)
  P.box('wood', -8, 3.2, -5.5, 8, 3.5, 5.5)
  P.box('roof', -8.3, 3.5, -5.8, 8.3, 3.7, 5.8)
  for (const cx of [-7.6, 0, 7.6]) for (const cz of [-5, 5]) P.cyl('wood', cx, 0.15, cz, 0.18, 3.05)
  // sofas around a fire pit
  for (const [cx, cz, rot] of [[0, -3.2, 0], [0, 3.2, Math.PI], [-4.5, 0, Math.PI / 2]] as const) {
    const g = new Parts()
    g.box('wood', -2.4, 0.15, -0.5, 2.4, 0.45, 0.5)
    g.box('cushion', -2.3, 0.45, -0.45, 2.3, 0.65, 0.45)
    g.box('cushion', -2.3, 0.45, -0.5, 2.3, 1.05, -0.25)
    for (const [k, geo] of g.merged()) {
      geo.rotateY(rot)
      geo.translate(cx, 0, cz)
      P.add(k, geo)
    }
  }
  P.cyl('stone', 0, 0.15, 0, 1.0, 0.45, 18)
  P.cyl('lamp', 0, 0.6, 0, 0.6, 0.06, 14)
  // outdoor kitchen
  P.box('walnut', 4.5, 0.15, -2.5, 6.8, 1.05, 2.5)
  P.box('marble', 4.4, 1.05, -2.6, 6.9, 1.12, 2.6)
  return P.merged()
}

export function courtParts(): PartMap {
  const P = new Parts()
  const { w, l } = A.court
  P.box('concrete', -w / 2 - 3, -3, -l / 2 - 3, w / 2 + 3, 0.02, l / 2 + 3)
  // hoops
  for (const s of [-1, 1]) {
    const x = s * (w / 2 + 1.0)
    P.cyl('metal', x, 0, 0, 0.1, 3.2, 8)
    P.box('metal', x - s * 0.1, 2.9, -0.05, x - s * 1.1, 3.0, 0.05)
    P.box('glass', x - s * 1.1 - 0.03, 2.9, -0.9, x - s * 1.1 + 0.03, 3.95, 0.9)
    P.box('frame', x - s * 1.1 - 0.035, 2.9, -0.9, x - s * 1.1 + 0.035, 2.95, 0.9)
    const rim = new THREE.TorusGeometry(0.23, 0.018, 6, 18)
    rim.rotateX(Math.PI / 2)
    rim.translate(x - s * 1.4, 3.05, 0)
    P.add('plastic_red', rim)
  }
  // fence posts + light poles
  for (let x = -w / 2 - 2.5; x <= w / 2 + 2.5; x += 3.1) {
    P.cyl('frame', x, 0, -l / 2 - 2.5, 0.04, 3.4, 6)
    P.cyl('frame', x, 0, l / 2 + 2.5, 0.04, 3.4, 6)
  }
  P.box('frame', -w / 2 - 2.5, 3.35, -l / 2 - 2.55, w / 2 + 2.5, 3.42, -l / 2 - 2.45)
  P.box('frame', -w / 2 - 2.5, 3.35, l / 2 + 2.45, w / 2 + 2.5, 3.42, l / 2 + 2.55)
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    P.cyl('frame', sx * (w / 2 + 2.6), 0, sz * (l / 2 + 2.6), 0.09, 8, 8)
    P.box('lamp', sx * (w / 2 + 2.6) - 0.5, 7.8, sz * (l / 2 + 2.6) - 0.2, sx * (w / 2 + 2.6) + 0.5, 8.1, sz * (l / 2 + 2.6) + 0.2)
  }
  return P.merged()
}

export function playgroundParts(): PartMap {
  const P = new Parts()
  // tower + roof + slide
  const tx = -3.2
  const tz = -1.5
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box('wood', tx + cx * 1.0 - 0.08, 0, tz + cz * 1.0 - 0.08, tx + cx * 1.0 + 0.08, 3.2, tz + cz * 1.0 + 0.08)
  P.box('wood', tx - 1.1, 1.9, tz - 1.1, tx + 1.1, 2.05, tz + 1.1)
  P.hipRoof('plastic_red', tx - 1.35, tz - 1.35, tx + 1.35, tz + 1.35, 3.25, 1.0, 'plastic_red')
  P.box('plastic_yellow', tx - 1.05, 2.05, tz - 1.05, tx + 1.05, 2.8, tz - 0.98)
  // slide (tilted)
  const slide = new THREE.BoxGeometry(0.8, 0.08, 5.0)
  slide.rotateX(0.36)
  slide.translate(tx, 1.15, tz + 3.4)
  P.add('plastic_red', slide)
  for (const s of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.06, 0.3, 5.0)
    rail.rotateX(0.36)
    rail.translate(tx + s * 0.42, 1.3, tz + 3.4)
    P.add('plastic_red', rail)
  }
  // second tower with yellow roof & climbing wall
  const ux = 1.5
  const uz = 3.5
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.box('wood', ux + cx * 0.8 - 0.07, 0, uz + cz * 0.8 - 0.07, ux + cx * 0.8 + 0.07, 2.7, uz + cz * 0.8 + 0.07)
  P.box('wood', ux - 0.9, 1.4, uz - 0.9, ux + 0.9, 1.52, uz + 0.9)
  P.hipRoof('plastic_yellow', ux - 1.1, uz - 1.1, ux + 1.1, uz + 1.1, 2.75, 0.8, 'plastic_yellow')
  P.box('plastic_teal', ux - 0.9, 0, uz + 0.9, ux + 0.9, 1.4, uz + 1.0)
  // bridge between towers
  P.box('wood', tx + 1.0, 1.9, tz + 0.3, ux - 0.8, 2.0, tz + 1.0)
  // swing frame (seats are animated separately)
  const sx = 6
  const sz = -4
  for (const s of [-1, 1]) {
    for (const d of [-1, 1]) {
      const leg = new THREE.CylinderGeometry(0.06, 0.06, 2.75, 6)
      leg.rotateX(d * 0.32)
      leg.translate(sx + s * 2.1, 1.3, sz + d * 0.42)
      P.add('metal', leg)
    }
  }
  P.cyl('metal', sx - 2.1, 2.4, sz, 0.06, 0.0001)
  const beam = new THREE.CylinderGeometry(0.06, 0.06, 4.3, 8)
  beam.rotateZ(Math.PI / 2)
  beam.translate(sx, 2.45, sz)
  P.add('metal', beam)
  // spring riders
  for (const [x, z, m] of [[4, 5, 'plastic_teal'], [6.5, 3, 'plastic_yellow']] as const) {
    P.cyl('metal', x, 0, z, 0.06, 0.4)
    P.box(m, x - 0.45, 0.4, z - 0.15, x + 0.45, 0.75, z + 0.15)
  }
  return P.merged()
}

export function beachClubParts(): PartMap {
  const P = new Parts()
  const { w, l } = A.beachClub
  // raised deck with a thatched bar
  P.box('deck', -w / 2, -2, -l / 2, w / 2 - 22, 0.6, l / 2)
  for (let x = -w / 2 + 0.5; x < w / 2 - 22; x += 3) for (const z of [-l / 2 + 0.4, l / 2 - 0.4]) P.cyl('wood', x, -2, z, 0.15, 2.4)
  P.box('wood', -w / 2 + 3, 0.6, -2, -w / 2 + 9, 1.7, 2)
  P.box('marble', -w / 2 + 2.8, 1.7, -2.2, -w / 2 + 9.2, 1.8, 2.2)
  P.hipRoof('rope', -w / 2 + 1, -l / 2 + 1, w / 2 - 23, l / 2 - 1, 3.6, 2.2, 'wood')
  for (const [cx, cz] of [[-w / 2 + 1.5, -l / 2 + 1.5], [w / 2 - 23.5, -l / 2 + 1.5], [-w / 2 + 1.5, l / 2 - 1.5], [w / 2 - 23.5, l / 2 - 1.5]]) P.cyl('wood', cx, 0.6, cz, 0.15, 3.0)
  return P.merged()
}

export function gardenParts(): PartMap {
  const P = new Parts()
  const { r } = A.garden
  const ring = new THREE.RingGeometry(r - 3.5, r - 1.5, 48)
  ring.rotateX(-Math.PI / 2)
  ring.translate(0, 0.08, 0)
  P.add('paving', ring)
  P.cyl('stone', 0, 0, 0, 3.2, 0.55, 32)
  P.cyl('stone', 0, 0.55, 0, 0.5, 1.2, 12)
  const wtr = new THREE.CircleGeometry(2.9, 32)
  wtr.rotateX(-Math.PI / 2)
  wtr.translate(0, 0.5, 0)
  P.add('water', wtr)
  return P.merged()
}

// ---- props ------------------------------------------------------------------
export function loungerParts(): PartMap {
  const P = new Parts()
  P.box('wood', -0.36, 0.0, -1.0, 0.36, 0.3, 1.0)
  P.box('cushion', -0.33, 0.3, -0.95, 0.33, 0.38, 0.45)
  const back = new THREE.BoxGeometry(0.66, 0.08, 0.7)
  back.rotateX(0.75)
  back.translate(0, 0.58, 0.72)
  P.add('cushion', back)
  return P.merged()
}
export function umbrellaParts(): PartMap {
  const P = new Parts()
  P.cyl('wood', 0, 0, 0, 0.04, 2.5, 6)
  const cone = new THREE.ConeGeometry(1.6, 0.5, 8, 1, true)
  cone.translate(0, 2.55, 0)
  P.add('umbrella', cone)
  return P.merged()
}
export function lampParts(): PartMap {
  const P = new Parts()
  P.cyl('frame', 0, 0, 0, 0.07, 4.2, 6, 0.05)
  P.box('frame', -0.08, 4.1, -0.08, 0.08, 4.2, 0.7)
  P.box('lamp', -0.12, 3.98, 0.45, 0.12, 4.1, 0.78)
  return P.merged()
}
export function benchParts(): PartMap {
  const P = new Parts()
  P.box('wood', -0.9, 0.42, -0.22, 0.9, 0.48, 0.22)
  P.box('wood', -0.9, 0.48, 0.18, 0.9, 0.9, 0.24)
  P.box('stone', -0.8, 0, -0.2, -0.65, 0.42, 0.2)
  P.box('stone', 0.65, 0, -0.2, 0.8, 0.42, 0.2)
  return P.merged()
}
