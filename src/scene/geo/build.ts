// Procedural architecture helpers + fallback models for villas and the residence
// block. Blender produces richer versions of the same designs (blender/villa.py,
// blender/residence.py) with the same dimensions, origins and material names.
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import layout from '../../data/layout.json'

export type PartMap = Map<string, THREE.BufferGeometry>

/** Cube-projected UVs in metres so tiling textures keep a constant scale. */
export function boxUV(g: THREE.BufferGeometry) {
  const p = g.attributes.position
  const n = g.attributes.normal
  const uv = new Float32Array(p.count * 2)
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i))
    const ay = Math.abs(n.getY(i))
    const az = Math.abs(n.getZ(i))
    let u: number, v: number
    if (ay >= ax && ay >= az) {
      u = p.getX(i)
      v = p.getZ(i)
    } else if (ax >= az) {
      u = p.getZ(i)
      v = p.getY(i)
    } else {
      u = p.getX(i)
      v = p.getY(i)
    }
    uv[i * 2] = u
    uv[i * 2 + 1] = v
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}

export class Parts {
  map = new Map<string, THREE.BufferGeometry[]>()
  add(mat: string, g: THREE.BufferGeometry) {
    let geo = g.index ? g.toNonIndexed() : g
    if (!geo.attributes.normal) geo.computeVertexNormals()
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k)
    geo = boxUV(geo)
    if (!this.map.has(mat)) this.map.set(mat, [])
    this.map.get(mat)!.push(geo)
    return this
  }
  box(mat: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, rotY = 0) {
    const g = new THREE.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0))
    if (rotY) g.rotateY(rotY)
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2)
    return this.add(mat, g)
  }
  cyl(mat: string, x: number, y0: number, z: number, r: number, h: number, seg = 10, r2 = r) {
    const g = new THREE.CylinderGeometry(r2, r, h, seg)
    g.translate(x, y0 + h / 2, z)
    return this.add(mat, g)
  }
  plane(mat: string, x0: number, z0: number, x1: number, z1: number, y: number) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0)
    g.rotateX(-Math.PI / 2)
    g.translate((x0 + x1) / 2, y, (z0 + z1) / 2)
    return this.add(mat, g)
  }
  /** Hipped roof with soffit; ridge along the longer side. */
  hipRoof(mat: string, x0: number, z0: number, x1: number, z1: number, y: number, rise: number, soffit = 'wood') {
    const w = x1 - x0
    const d = z1 - z0
    const cx = (x0 + x1) / 2
    const cz = (z0 + z1) / 2
    const inset = Math.min(w, d) / 2
    const verts: number[] = []
    const A = [x0, y, z0], B = [x1, y, z0], Cc = [x1, y, z1], D = [x0, y, z1]
    let R1: number[], R2: number[]
    if (w >= d) {
      R1 = [x0 + inset, y + rise, cz]
      R2 = [x1 - inset, y + rise, cz]
      verts.push(...D, ...Cc, ...R2, ...D, ...R2, ...R1) // front (+z)
      verts.push(...B, ...A, ...R1, ...B, ...R1, ...R2) // back
      verts.push(...A, ...D, ...R1) // left
      verts.push(...Cc, ...B, ...R2) // right
    } else {
      R1 = [cx, y + rise, z0 + inset]
      R2 = [cx, y + rise, z1 - inset]
      verts.push(...A, ...D, ...R2, ...A, ...R2, ...R1)
      verts.push(...Cc, ...B, ...R1, ...Cc, ...R1, ...R2)
      verts.push(...D, ...Cc, ...R2)
      verts.push(...B, ...A, ...R1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.computeVertexNormals()
    this.add(mat, g)
    this.box(mat, x0, y - 0.22, z0, x1, y, z0 + 0.06)
    this.box(mat, x0, y - 0.22, z1 - 0.06, x1, y, z1)
    this.box(mat, x0, y - 0.22, z0, x0 + 0.06, y, z1)
    this.box(mat, x1 - 0.06, y - 0.22, z0, x1, y, z1)
    const sof = new THREE.PlaneGeometry(w, d)
    sof.rotateX(Math.PI / 2) // faces down
    sof.translate(cx, y - 0.22, cz)
    this.add(soffit, sof)
    return this
  }
  merged(): PartMap {
    const out: PartMap = new Map()
    for (const [k, list] of this.map) {
      const g = mergeGeometries(list)!
      g.computeBoundingSphere()
      out.set(k, g)
    }
    return out
  }
}

// ---------------------------------------------------------------------------
// Villa (origin = centre of the terrace pad at floor level, facing +z / the ocean)
// ---------------------------------------------------------------------------
export function villaParts(): PartMap {
  const P = new Parts()
  // podium & retaining base
  P.box('stone', -12.5, -7, -9.5, 12.5, 0.0, 11.5)
  P.box('deck', -9, 0.0, 3, 1.2, 0.08, 11)
  P.box('stone', 1.2, 0.0, 3, 12, 0.1, 11)
  // pool
  P.box('pooltile', 2.2, -1.2, 5.6, 11.2, -0.02, 10.2)
  P.plane('water', 2.25, 5.65, 11.15, 10.15, -0.12)
  P.box('stone', 2.0, -0.02, 5.4, 11.4, 0.14, 5.65)
  // ground floor
  P.box('plaster', -9, 0, -6, -5.5, 3.4, 3) // solid left wing
  P.box('plaster', -5.5, 0, -6, 9, 3.4, -5.6) // back wall
  P.box('plaster', 8.6, 0, -6, 9, 3.4, 3)
  P.box('glass', -5.4, 0.08, 2.85, 8.5, 3.15, 2.95)
  P.box('glow', -5.3, 0.1, -5.5, 8.5, 3.1, -5.45)
  for (let x = -5.5; x <= 8.6; x += 2.35) P.box('frame', x, 0.08, 2.8, x + 0.08, 3.2, 3.0)
  P.box('frame', -5.5, 3.15, 2.8, 9, 3.25, 3.0)
  P.box('wood', -9.02, 0.2, -2.5, -8.96, 3.1, 2.6) // slat panel
  for (let z = -2.4; z < 2.6; z += 0.28) P.box('wood', -9.18, 0.2, z, -9.02, 3.1, z + 0.12)
  // slab + covered terrace
  P.box('concrete', -9.4, 3.4, -6.4, 9.4, 3.75, 7.2)
  P.box('wood', -9.3, 3.36, 3.0, 9.3, 3.4, 7.1)
  P.cyl('wood', -8.9, 0.08, 6.8, 0.14, 3.3, 8)
  P.cyl('wood', 0.9, 0.08, 6.8, 0.14, 3.3, 8)
  P.cyl('wood', 8.9, 0.08, 6.8, 0.14, 3.3, 8)
  // upper floor (cantilevered to the right)
  P.box('plaster', -7, 3.75, -5.5, -3, 6.8, 2.5)
  P.box('plaster', -3, 3.75, -5.5, 10.5, 6.8, -5.1)
  P.box('plaster', 10.1, 3.75, -5.5, 10.5, 6.8, 2.5)
  P.box('glass', -3, 3.85, 2.35, 10.1, 6.65, 2.45)
  P.box('glow', -2.9, 3.9, -5.0, 10, 6.6, -4.95)
  for (let x = -3; x <= 10.1; x += 2.6) P.box('frame', x, 3.85, 2.3, x + 0.08, 6.7, 2.5)
  P.box('glass', -7, 4.75, 5.6, 9.4, 4.85 + 0.95, 5.66) // balcony glass
  P.box('frame', -7, 5.68, 5.55, 9.4, 5.75, 5.7)
  // hipped roof
  P.hipRoof('roof', -8.6, -7.0, 12.0, 4.0, 7.0, 2.2)
  P.box('concrete', -7.2, 6.8, -5.7, 10.7, 7.0, 2.7)
  // loungers on the pool deck
  for (const x of [3.4, 5.4]) {
    P.box('wood', x - 0.35, 0.1, 3.4, x + 0.35, 0.38, 5.2)
    P.box('cushion', x - 0.32, 0.38, 3.5, x + 0.32, 0.46, 5.1)
  }
  return P.merged()
}

// ---------------------------------------------------------------------------
// Residence block (stepped terraces facing the ocean)
// ---------------------------------------------------------------------------
export const RES = layout.residence
export const RES_HALF = RES.length / 2
export const CORE = 6
export const BAY_W = (RES_HALF - CORE) / (RES.bays / 2)

/** z of the facade of floor f (front faces +z) */
export const facadeZ = (f: number) => RES.depth / 2 - f * RES.stepBack
export function bayX(b: number): [number, number] {
  const wing = b < RES.bays / 2 ? 0 : 1
  const i = b % (RES.bays / 2)
  const x0 = wing === 0 ? -RES_HALF + i * BAY_W : CORE + i * BAY_W
  return [x0, x0 + BAY_W]
}
/** Local-space bounds of an apartment cell */
export function cellBox(f: number, b: number) {
  const [x0, x1] = bayX(b)
  const y0 = f * RES.floorHeight + 0.36
  const y1 = (f + 1) * RES.floorHeight
  const z1 = facadeZ(f)
  return new THREE.Box3(new THREE.Vector3(x0 + 0.3, y0, z1 - 11), new THREE.Vector3(x1 - 0.3, y1, z1))
}

export function residenceParts(): PartMap {
  const P = new Parts()
  const FH = RES.floorHeight
  const back = -RES.depth / 2
  P.box('stone', -RES_HALF - 4, -9, back - 3, RES_HALF + 4, 0, facadeZ(0) + 8)
  P.box('paving', -RES_HALF - 4, 0, facadeZ(0), RES_HALF + 4, 0.06, facadeZ(0) + 8)
  for (let f = 0; f < RES.floors; f++) {
    const zf = facadeZ(f)
    const y0 = f * FH
    const slabFront = f === 0 ? zf + 1.2 : facadeZ(f - 1)
    for (const [xa, xb] of [[-RES_HALF, -CORE], [CORE, RES_HALF]]) {
      P.box('concrete', xa, y0, back, xb, y0 + 0.36, slabFront)
      P.box('plaster', xa, y0 + 0.36, back, xb, y0 + FH, back + 0.3)
      P.box('glass', xa + 0.2, y0 + 0.4, zf - 0.12, xb - 0.2, y0 + FH - 0.05, zf - 0.04)
      P.box('glow', xa + 0.3, y0 + 0.45, zf - 6, xb - 0.3, y0 + FH - 0.1, zf - 5.95)
      // bay piers & mullions
      for (let i = 0; i <= RES.bays / 2; i++) {
        const x = xa + i * BAY_W
        P.box('plaster', x - 0.35, y0 + 0.36, zf - 0.5, x + 0.35, y0 + FH, zf + 0.15)
        for (let m = 1; m < 6 && i < RES.bays / 2; m++) P.box('frame', x + (m * BAY_W) / 6 - 0.04, y0 + 0.4, zf - 0.1, x + (m * BAY_W) / 6 + 0.04, y0 + FH, zf)
      }
      // terrace railing + planters on the slab in front of this floor
      if (f > 0) {
        const rz = slabFront
        P.box('glass', xa, y0 + 0.36, rz - 0.06, xb, y0 + 1.45, rz)
        P.box('frame', xa, y0 + 1.42, rz - 0.08, xb, y0 + 1.5, rz + 0.02)
        P.box('plaster', xa, y0 - 0.5, rz - 0.9, xb, y0 + 0.36, rz + 0.05)
      }
    }
    // side walls
    P.box('plaster', -RES_HALF - 0.3, y0, back, -RES_HALF, y0 + FH, zf)
    P.box('plaster', RES_HALF, y0, back, RES_HALF + 0.3, y0 + FH, zf)
  }
  const top = RES.floors * FH
  for (const [xa, xb] of [[-RES_HALF - 0.3, -CORE], [CORE, RES_HALF + 0.3]]) {
    P.box('concrete', xa, top, back, xb, top + 0.5, facadeZ(RES.floors - 1))
    P.box('plaster', xa, top + 0.5, back, xb, top + 1.4, back + 0.25)
  }
  // glass atrium core
  P.box('glass', -CORE + 0.2, 0, back + 6, CORE - 0.2, top + 2.5, back + 6.2)
  P.box('frame', -CORE, top + 2.5, back, CORE, top + 2.9, back + 6.4)
  P.box('glow', -CORE + 0.5, 0, back + 2, CORE - 0.5, top + 2, back + 2.1)
  for (let x = -CORE; x <= CORE; x += 2) P.box('frame', x - 0.05, 0, back + 6.1, x + 0.05, top + 2.5, back + 6.3)
  return P.merged()
}

export { mergeVertices }
