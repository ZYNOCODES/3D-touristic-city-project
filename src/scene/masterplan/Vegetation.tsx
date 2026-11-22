// Scatters thousands of procedural trees, palms and flowering shrubs over the hills.
// Instances are bucketed into spatial chunks so the camera AND the shadow camera
// can frustum-cull them per chunk.
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { fbm, height, shoreZ } from '../../lib/heightfield'
import { BUILDING, FREE, GARDEN, PATH, VIEW, maskAt } from '../../lib/siteMask'
import { broadleafTree, palmTree, patchFoliage, shrub } from '../geo/plants'
import { GLOBAL } from '../shared'

type Inst = { x: number; y: number; z: number; s: number; r: number; c?: THREE.Color }

function prng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

const NEAR = { x0: -560, x1: 560, z0: -620, z1: 500 }
const CHUNK = 140

function scatter() {
  const rnd = prng(42)
  const trees: Inst[][] = [[], [], []]
  const far: Inst[] = []
  const palms: Inst[] = []
  const shrubs: Inst[] = []
  const flowerCols = ['#b8577e', '#c96f8f', '#e8e2d2', '#c98d45', '#a8456a'].map((c) => new THREE.Color(c))
  const greenCols = ['#2f4a22', '#3b5a26', '#466a2a', '#2d4530'].map((c) => new THREE.Color(c))
const canopyTints = ['#ffffff', '#d8f0c8', '#f2f7d0', '#c4dcc0', '#e6efb8', '#b9d2b0'].map((c) => new THREE.Color(c))

  // dense rainforest on the hillsides
  const step = 6.8
  for (let z = -1500; z < 600; z += step) {
    for (let x = -1500; x < 1500; x += step) {
      const nearZone = x > NEAR.x0 && x < NEAR.x1 && z > NEAR.z0 && z < NEAR.z1
      if (!nearZone && (Math.abs(x / step) % 2 > 0.5 || Math.abs(z / step) % 2 > 0.5)) continue // sparser far away
      const px = x + (rnd() - 0.5) * step * 0.9
      const pz = z + (rnd() - 0.5) * step * 0.9
      const d = shoreZ(px) - pz
      if (d < 26) continue
      const h = height(px, pz)
      if (h < 3) continue
      const dens = 0.8 + 0.5 * fbm(px * 0.01, pz * 0.01, 3, 99)
      if (rnd() > dens) continue
      const m = maskAt(px, pz)
      if (m === BUILDING || m === PATH) continue
      if (m === VIEW) {
        // keep sightlines open: only low shrubs in front of the residences
        if (rnd() < 0.08) shrubs.push({ x: px, y: h, z: pz, s: 1 + rnd() * 0.8, r: rnd() * 6.28, c: greenCols[Math.floor(rnd() * greenCols.length)] })
        continue
      }
      if (m === GARDEN && rnd() > 0.4) continue
      if (nearZone) {
        const v = rnd() < 0.35 ? 0 : rnd() < 0.6 ? 1 : 2
        trees[v].push({ x: px, y: h - 0.3, z: pz, s: 1.0 + rnd() * 0.8, r: rnd() * Math.PI * 2, c: canopyTints[Math.floor(rnd() * canopyTints.length)] })
      } else {
        far.push({ x: px, y: h - 0.5, z: pz, s: 1.4 + rnd() * 0.9, r: rnd() * Math.PI * 2, c: canopyTints[Math.floor(rnd() * canopyTints.length)] })
      }
    }
  }
  // beach palms & palms in the gardens
  for (let x = -640; x < 640; x += 6) {
    if (rnd() < 0.45) continue
    const pz = shoreZ(x) - (24 + rnd() * 22)
    const h = height(x, pz)
    if (h < 1.2 || maskAt(x, pz) === PATH || maskAt(x, pz) === BUILDING) continue
    palms.push({ x: x + rnd() * 3, y: h - 0.2, z: pz, s: 0.8 + rnd() * 0.5, r: rnd() * Math.PI * 2 })
  }
  for (const v of layout.villas) {
    const c = Math.cos(v.rot)
    const s = Math.sin(v.rot)
    const spots: [number, number][] = [
      [-17, 9], [17, 10], [-16, -8], [15, -9], [0, -14],
    ]
    for (const [lx, lz] of spots) {
      if (rnd() < 0.35) continue
      const x = v.x + lx * c + lz * s
      const z = v.z - lx * s + lz * c
      if (maskAt(x, z) === PATH) continue
      if (rnd() < 0.35) palms.push({ x, y: height(x, z) - 0.1, z, s: 0.65 + rnd() * 0.35, r: rnd() * 6.28 })
      for (let k = 0; k < 3; k++) {
        const sx = x + (rnd() - 0.5) * 6
        const sz = z + (rnd() - 0.5) * 6
        if (maskAt(sx, sz) === PATH) continue
        shrubs.push({ x: sx, y: height(sx, sz), z: sz, s: 0.8 + rnd() * 0.9, r: rnd() * 6.28, c: rnd() < 0.12 ? flowerCols[Math.floor(rnd() * flowerCols.length)] : greenCols[Math.floor(rnd() * greenCols.length)] })
      }
    }
  }
  // amenity planting
  const A = layout.amenities
  const ring = (cx: number, cz: number, rx: number, rz: number, n: number, palmsToo = true) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd() * 0.2
      const x = cx + Math.cos(a) * rx * (1 + rnd() * 0.1)
      const z = cz + Math.sin(a) * rz * (1 + rnd() * 0.1)
      if (maskAt(x, z) === PATH) continue
      if (palmsToo && i % 2 === 0) palms.push({ x, y: height(x, z) - 0.1, z, s: 0.7 + rnd() * 0.4, r: rnd() * 6.28 })
      shrubs.push({ x, y: height(x, z), z, s: 1 + rnd(), r: rnd() * 6.28, c: rnd() < 0.2 ? flowerCols[i % flowerCols.length] : greenCols[i % greenCols.length] })
    }
  }
  ring(A.pool.x, A.pool.z, 38, 21, 34)
  ring(A.lounge.x, A.lounge.z, 16, 12, 14)
  ring(A.court.x, A.court.z, 21, 13, 16, false)
  ring(A.playground.x, A.playground.z, 18, 18, 16)
  ring(A.garden.x, A.garden.z, 12, 12, 14)
  // path-side shrubs
  for (const p of layout.paths) {
    for (let k = 0; k < p.points.length - 1; k++) {
      const [ax, az] = p.points[k]
      const [bx, bz] = p.points[k + 1]
      const nx = -(bz - az)
      const nz = bx - ax
      const l = Math.hypot(nx, nz) || 1
      for (const side of [-1, 1]) {
        if (rnd() < 0.4) continue
        const off = (p.width / 2 + 2.6) * side
        const x = (ax + bx) / 2 + (nx / l) * off
        const z = (az + bz) / 2 + (nz / l) * off
        const m = maskAt(x, z)
        if (m === BUILDING) continue
        shrubs.push({ x, y: height(x, z), z, s: 0.7 + rnd() * 0.6, r: rnd() * 6.28, c: rnd() < 0.3 ? flowerCols[Math.floor(rnd() * 5)] : greenCols[Math.floor(rnd() * 4)] })
      }
    }
  }
  void FREE
  return { trees, far, palms, shrubs }
}

interface Lod { center: THREE.Vector3; near: THREE.InstancedMesh; far?: THREE.InstancedMesh }
const LODS: Lod[] = []
const LOD_DIST = 240

function chunked(geo: THREE.BufferGeometry, mat: THREE.Material, items: Inst[], opts: { shadow: boolean; chunk?: number; tint?: boolean; name: string; lodGeo?: THREE.BufferGeometry }) {
  const size = opts.chunk ?? CHUNK
  const buckets = new Map<string, Inst[]>()
  for (const it of items) {
    const k = `${Math.floor(it.x / size)},${Math.floor(it.z / size)}`
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push(it)
  }
  const group = new THREE.Group()
  group.name = opts.name
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const up = new THREE.Vector3(0, 1, 0)
  const lean = new THREE.Quaternion()
  for (const list of buckets.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    const lo = opts.lodGeo ? new THREE.InstancedMesh(opts.lodGeo, mat, list.length) : null
    list.forEach((it, i) => {
      q.setFromAxisAngle(up, it.r)
      lean.setFromEuler(new THREE.Euler(Math.sin(it.r * 3) * 0.04, 0, Math.cos(it.r * 5) * 0.04))
      q.multiply(lean)
      m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.s, it.s * (0.9 + (it.r % 0.3)), it.s))
      im.setMatrixAt(i, m4)
      lo?.setMatrixAt(i, m4)
      if (opts.tint) {
        im.setColorAt(i, it.c ?? new THREE.Color(1, 1, 1))
        lo?.setColorAt(i, it.c ?? new THREE.Color(1, 1, 1))
      }
    })
    im.castShadow = opts.shadow
    im.receiveShadow = true
    im.computeBoundingSphere()
    group.add(im)
    if (lo) {
      lo.castShadow = false
      lo.receiveShadow = true
      lo.computeBoundingSphere()
      lo.visible = false
      group.add(lo)
      LODS.push({ center: im.boundingSphere!.center.clone(), near: im, far: lo })
    }
  }
  return group
}

export function Vegetation() {
  const groups = useMemo(() => {
    const t0 = performance.now()
    const data = scatter()
    const fol = () => patchFoliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 }), GLOBAL)
    const treeMat = fol()
    const out = new THREE.Group()
    LODS.length = 0
    data.trees.forEach((list, v) => out.add(chunked(broadleafTree(v, 0), treeMat, list, { shadow: true, tint: true, name: `trees-${v}`, lodGeo: broadleafTree(v, 1) })))
    out.add(chunked(broadleafTree(1, 1), treeMat, data.far, { shadow: false, tint: true, chunk: 400, name: 'trees-far' }))
    const palmMat = patchFoliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide }), GLOBAL, { leafNoise: 0.4, flutter: 2.5 })
    out.add(chunked(palmTree(3), palmMat, data.palms.filter((_, i) => i % 2 === 0), { shadow: true, name: 'palms-a' }))
    out.add(chunked(palmTree(8), palmMat, data.palms.filter((_, i) => i % 2 === 1), { shadow: true, name: 'palms-b' }))
    const shrubMat = patchFoliage(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), GLOBAL, { leafNoise: 0.7 })
    out.add(chunked(shrub(5), shrubMat, data.shrubs, { shadow: true, tint: true, name: 'shrubs' }))
    const n = data.trees.reduce((a, l) => a + l.length, 0)
    console.info(`[vegetation] ${n} trees, ${data.far.length} far trees, ${data.palms.length} palms, ${data.shrubs.length} shrubs in ${(performance.now() - t0).toFixed(0)}ms`)
    return out
  }, [])
  useEffect(() => () => groups.traverse((o) => (o as THREE.Mesh).geometry?.dispose?.()), [groups])
  // chunk-level LOD: detailed crowns (with shadows) near the camera, cheap crowns beyond
  useFrame(({ camera }) => {
    for (const l of LODS) {
      const near = camera.position.distanceTo(l.center) < LOD_DIST + 70
      l.near.visible = near
      if (l.far) l.far.visible = !near
    }
  })
  return <primitive object={groups} />
}
