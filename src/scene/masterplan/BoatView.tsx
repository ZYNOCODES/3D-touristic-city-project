// "From the Bay": the foredeck of the yacht the camera is standing on, moving with the
// same swell as the camera (see camera/boat.ts), plus drag-to-look while aboard.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useStore } from '../../store'
import { BOAT, boatPose } from '../camera/boat'
import { shotPose } from '../camera/CameraRig'
import { getMaterial } from '../materials/library'

const EYE = 1.68 // standing eye height above the deck
// half outline of the foredeck: [x, forward distance] from just behind the helm to the bow
const HALF: [number, number][] = [[1.78, -1.4], [1.82, 0.6], [1.72, 2.6], [1.45, 4.3], [1.02, 5.8], [0.5, 7.0], [0.0, 7.75]]

function outline(scale: number) {
  const pts = HALF.map(([x, f]) => new THREE.Vector2(x * scale, f))
  const left = [...HALF].reverse().slice(1).map(([x, f]) => new THREE.Vector2(-x * scale, f))
  return [...pts, ...left]
}

function buildYacht() {
  const g = new THREE.Group()
  g.name = 'yacht-foredeck'
  const toWorld = (geo: THREE.BufferGeometry) => {
    geo.rotateX(-Math.PI / 2) // shape (x, forward) → (x, z = -forward); extrusion → +y
    return geo
  }
  // teak deck with caulked seams (planks along the boat)
  const deckShape = new THREE.Shape(outline(0.97))
  const deck = toWorld(new THREE.ExtrudeGeometry(deckShape, { depth: 0.08, bevelEnabled: false }))
  deck.translate(0, -EYE - 0.08, 0)
  const teak = (getMaterial('deck') as THREE.MeshStandardMaterial).clone()
  teak.color.set('#d7b48c')
  g.add(new THREE.Mesh(deck, teak))
  const seamMat = new THREE.MeshStandardMaterial({ color: '#2a2622', roughness: 0.8 })
  for (let x = -1.65; x <= 1.65; x += 0.11) {
    const len = 7.6 - Math.pow(Math.abs(x) / 1.8, 2) * 5.2
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.004, len), seamMat)
    seam.position.set(x, -EYE + 0.002, -(len / 2 - 1.4))
    g.add(seam)
  }
  // glossy gelcoat topsides (hollow ring) with a teak cap rail
  const hullShape = new THREE.Shape(outline(1.04))
  hullShape.holes.push(new THREE.Path(outline(0.97)))
  const hull = toWorld(new THREE.ExtrudeGeometry(hullShape, { depth: 1.75, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2 }))
  hull.translate(0, -EYE - 1.6, 0)
  const gelcoat = new THREE.MeshPhysicalMaterial({ color: '#f4f5f2', roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 })
  g.add(new THREE.Mesh(hull, gelcoat))
  const cap = toWorld(new THREE.ExtrudeGeometry(hullShape, { depth: 0.035, bevelEnabled: false }))
  cap.translate(0, -EYE + 0.15, 0)
  g.add(new THREE.Mesh(cap, teak))
  // stainless bow rail + stanchions
  const steel = new THREE.MeshStandardMaterial({ color: '#d9dcdf', roughness: 0.18, metalness: 1 })
  const railPts = outline(0.95).map((p) => new THREE.Vector3(p.x, -EYE + 0.7, -p.y))
  const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 120, 0.016, 8, false), steel)
  g.add(rail)
  const midPts = outline(0.95).map((p) => new THREE.Vector3(p.x, -EYE + 0.38, -p.y))
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(midPts), 120, 0.007, 6, false), steel))
  for (const p of railPts.filter((_, i) => i % 2 === 0)) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.7, 8), steel)
    post.position.set(p.x, -EYE + 0.35, p.z)
    g.add(post)
  }
  // twin sunpads, deck hatch, cleats and windlass
  const cushion = new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.95 })
  for (const sx of [-0.52, 0.52]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 2.3, 4, 1, 8), cushion)
    pad.position.set(sx, -EYE + 0.07, -3.0)
    g.add(pad)
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.35), cushion)
    pillow.position.set(sx, -EYE + 0.2, -1.95)
    pillow.rotation.x = -0.35
    g.add(pillow)
  }
  const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.05, 0.7), new THREE.MeshPhysicalMaterial({ color: '#1b2226', roughness: 0.05, metalness: 0.2, clearcoat: 1 }))
  hatch.position.set(0, -EYE + 0.03, -5.0)
  g.add(hatch)
  for (const sx of [-1.4, 1.4]) {
    const cleat = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.25), steel)
    cleat.position.set(sx, -EYE + 0.03, -4.4)
    g.add(cleat)
  }
  const windlass = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 20), steel)
  windlass.position.set(0, -EYE + 0.08, -6.6)
  g.add(windlass)
  g.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.isMesh) {
      m.castShadow = true
      m.receiveShadow = true
    }
  })
  return g
}

export function BoatView() {
  const yacht = useMemo(() => buildYacht(), [])
  const ref = useRef<THREE.Group>(null)
  const gl = useThree((s) => s.gl)

  // drag to look around while aboard
  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => {
      if (BOAT.active) drag = { x: e.clientX, y: e.clientY }
    }
    const move = (e: PointerEvent) => {
      if (!drag || !BOAT.active) return
      BOAT.yawT = THREE.MathUtils.clamp(BOAT.yawT + (e.clientX - drag.x) * 0.004, -1.4, 1.4)
      BOAT.pitchT = THREE.MathUtils.clamp(BOAT.pitchT + (e.clientY - drag.y) * 0.003, -0.35, 0.45)
      drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => (drag = null)
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [gl])

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const st = useStore.getState()
    const show = BOAT.active && st.shot === 'boat' && !st.flying && st.mode === 'masterplan' && !st.selectedUnit
    g.visible = show
    if (!show) return
    const t = performance.now() / 1000 - BOAT.t0
    const k = Math.min(1, t / 6)
    const bp = boatPose(t)
    const { pos, target } = shotPose('boat')
    g.position.copy(pos).add(bp.offset.multiplyScalar(k))
    const d = target.clone().sub(g.position)
    const heading = Math.atan2(-d.x, -d.z) + bp.heading * k
    g.rotation.set(bp.pitch * k, heading, bp.roll * k, 'YXZ')
  })

  return (
    <group ref={ref} visible={false}>
      <primitive object={yacht} />
    </group>
  )
}
