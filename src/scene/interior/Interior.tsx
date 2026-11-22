// Interior walkthrough. The interior model is placed in the real world at the
// selected unit (the villa instance / residence facade is hidden), so the view
// through the glass is the live masterplan, ocean and time of day.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { UNIT_BY_ID } from '../../data/units'
import { loadModel } from '../../lib/assets'
import { useStore, type HotspotId } from '../../store'
import { cellBox, facadeZ } from '../geo/build'
import { gltfToProto, type Proto } from '../geo/instancing'
import { getMaterial } from '../materials/library'
import { resOrigin } from '../masterplan/ResidenceBlock'
import { villaTransform } from '../masterplan/Villas'
import { GLOBAL } from '../shared'
import { HOTSPOTS, INTERIOR_LIGHTS, interiorParts } from './interiorSpec'
import { HIDE } from './hide'
import { INTERIOR_HOLE } from '../masterplan/terrainHoles'

export function interiorFrame(unitId: string) {
  const u = UNIT_BY_ID.get(unitId)!
  if (u.kind === 'villa') {
    const xf = villaTransform(u.index)
    return { position: xf.position.clone(), rotationY: xf.rotationY }
  }
  const b = cellBox(u.floorIdx!, u.bay!)
  const c = b.getCenter(new THREE.Vector3()).add(resOrigin())
  return { position: new THREE.Vector3(c.x, resOrigin().y + b.min.y - 0.36, resOrigin().z + facadeZ(u.floorIdx!) - 4), rotationY: 0 }
}

function useInteriorModel() {
  const [proto, setProto] = useState<Proto | null>(null)
  useEffect(() => {
    loadModel('interior').then((g) => {
      console.info(g ? '[interior] using Blender interior.glb' : '[interior] procedural fallback')
      setProto(g ? gltfToProto(g) : { parts: interiorParts(), custom: new Map() })
    })
  }, [])
  return proto
}

function InteriorRig({ frame }: { frame: { position: THREE.Vector3; rotationY: number } }) {
  const { camera, gl } = useThree()
  const hotspot = useStore((s) => s.hotspot)
  const st = useRef({ yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), k: 1, fov: 62, tFov: 62 })
  const toWorld = (p: [number, number, number]) =>
    new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.rotationY).add(frame.position)

  // place the camera on mount
  useEffect(() => {
    const h = HOTSPOTS.find((x) => x.id === useStore.getState().hotspot)!
    const p = toWorld(h.pos)
    const l = toWorld(h.look)
    const d = l.clone().sub(p).normalize()
    const s = st.current
    s.yaw = s.tYaw = Math.atan2(-d.x, -d.z)
    s.pitch = s.tPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    s.from.copy(p)
    s.to.copy(p)
    s.k = 1
    camera.position.copy(p).add(d.clone().multiplyScalar(-0.6)) // small push-in on arrival
    s.from.copy(camera.position)
    s.k = 0
    const cam = camera as THREE.PerspectiveCamera
    cam.near = 0.05
    cam.updateProjectionMatrix()
    return () => {
      cam.near = 0.5
      cam.fov = 40
      cam.updateProjectionMatrix()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // glide to a new hotspot
  useEffect(() => {
    const h = HOTSPOTS.find((x) => x.id === hotspot)!
    const s = st.current
    s.from.copy(camera.position)
    s.to.copy(toWorld(h.pos))
    s.k = 0
    const d = toWorld(h.look).sub(s.to).normalize()
    let yaw = Math.atan2(-d.x, -d.z)
    while (yaw - s.yaw > Math.PI) yaw -= Math.PI * 2
    while (yaw - s.yaw < -Math.PI) yaw += Math.PI * 2
    s.tYaw = yaw
    s.tPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspot])

  // drag-to-look, wheel zoom, arrow keys
  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!drag) return
      const s = st.current
      s.tYaw += (e.clientX - drag.x) * 0.0042
      s.tPitch = THREE.MathUtils.clamp(s.tPitch + (e.clientY - drag.y) * 0.0032, -1.2, 1.2)
      drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => (drag = null)
    const wheel = (e: WheelEvent) => {
      st.current.tFov = THREE.MathUtils.clamp(st.current.tFov + e.deltaY * 0.03, 32, 78)
    }
    const key = (e: KeyboardEvent) => {
      const ids = HOTSPOTS.map((h) => h.id)
      const i = ids.indexOf(useStore.getState().hotspot)
      if (e.key === 'ArrowRight') useStore.setState({ hotspot: ids[(i + 1) % ids.length] })
      if (e.key === 'ArrowLeft') useStore.setState({ hotspot: ids[(i + ids.length - 1) % ids.length] })
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  }, [gl])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = st.current
    if (s.k < 1) {
      s.k = Math.min(1, s.k + dt / 1.6)
      const e = s.k * s.k * (3 - 2 * s.k)
      camera.position.lerpVectors(s.from, s.to, e)
      camera.position.y += Math.sin(e * Math.PI) * 0.05 // gentle "step" bob
    }
    const a = 1 - Math.exp(-6 * dt)
    s.yaw += (s.tYaw - s.yaw) * a
    s.pitch += (s.tPitch - s.pitch) * a
    s.fov += (s.tFov - s.fov) * a
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ')
  })
  return null
}

function HotspotMarkers({ toWorld }: { toWorld: (p: [number, number, number]) => THREE.Vector3 }) {
  const current = useStore((s) => s.hotspot)
  const [hover, setHover] = useState<HotspotId | null>(null)
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }), [])
  const discMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }), [])
  const t = useRef(0)
  const refs = useRef<THREE.Group[]>([])
  useFrame((_, dt) => {
    t.current += dt
    refs.current.forEach((g, i) => g && g.scale.setScalar(1 + Math.sin(t.current * 2.5 + i) * 0.06))
  })
  return (
    <>
      {HOTSPOTS.filter((h) => h.id !== current).map((h, i) => {
        const p = toWorld([h.pos[0], 0.02, h.pos[2]])
        return (
          <group key={h.id} position={p} ref={(g) => void (refs.current[i] = g!)}>
            <mesh
              rotation-x={-Math.PI / 2}
              material={discMat}
              onClick={(e) => {
                e.stopPropagation()
                if (e.delta < 6) useStore.setState({ hotspot: h.id })
              }}
              onPointerOver={() => {
                setHover(h.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setHover(null)
                document.body.style.cursor = ''
              }}
            >
              <circleGeometry args={[0.42, 32]} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.005} material={ringMat} scale={hover === h.id ? 1.15 : 1}>
              <ringGeometry args={[0.36, 0.42, 48]} />
            </mesh>
            <Html position={[0, 0.25, 0]} center distanceFactor={7} zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`hotspot-label ${hover === h.id ? 'on' : ''}`}>{h.label}</div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

export function Interior() {
  const unitId = useStore((s) => s.interiorUnit)
  const proto = useInteriorModel()
  const frame = useMemo(() => (unitId ? interiorFrame(unitId) : null), [unitId])

  const group = useMemo(() => {
    if (!proto) return null
    const g = new THREE.Group()
    for (const [name, geo] of proto.parts) {
      const custom = name.startsWith('custom:')
      const mat = custom ? proto.custom.get(name)! : getMaterial(name, 'interior')
      if (!custom && 'envMapIntensity' in mat && !['glass', 'water', 'pooltile', 'stone'].includes(name)) (mat as THREE.MeshStandardMaterial).envMapIntensity = 0.3
      if (custom && 'envMapIntensity' in mat) (mat as THREE.MeshStandardMaterial).envMapIntensity = 0.3
      const m = new THREE.Mesh(geo, mat)
      m.castShadow = !mat.transparent && name !== 'lamp' && name !== 'water'
      m.receiveShadow = true
      if (mat.transparent) m.renderOrder = 2
      g.add(m)
    }
    return g
  }, [proto])

  const lights = useRef<THREE.PointLight[]>([])
  const bounce = useRef<THREE.PointLight>(null)
  useFrame(() => {
    const n = GLOBAL.uNight.value
    if (bounce.current) bounce.current.intensity = 22 * (1 - n)
    lights.current.forEach((l, i) => l && (l.intensity = INTERIOR_LIGHTS[i].power * (0.08 + 0.92 * n)))
  })

  // hide the exterior shell of the unit we are standing in
  useEffect(() => {
    if (!unitId) return
    const u = UNIT_BY_ID.get(unitId)!
    HIDE.villa = u.kind === 'villa' ? u.index : -1
    HIDE.residence = u.kind === 'apartment'
    const fr = interiorFrame(unitId)
    INTERIOR_HOLE.uHoleOn.value = 1
    INTERIOR_HOLE.uHoleCenter.value.set(fr.position.x, fr.position.z)
    INTERIOR_HOLE.uHoleRot.value = fr.rotationY
    return () => {
      INTERIOR_HOLE.uHoleOn.value = 0
      HIDE.villa = -1
      HIDE.residence = false
    }
  }, [unitId])

  if (!frame || !group) return null
  const toWorld = (p: [number, number, number]) => new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.rotationY).add(frame.position)
  return (
    <>
      <group position={frame.position} rotation-y={frame.rotationY}>
        <primitive object={group} />
        {INTERIOR_LIGHTS.map((l, i) => (
          <pointLight key={i} ref={(r) => void (lights.current[i] = r!)} position={l.pos} color={l.color} distance={l.distance} decay={1.8} />
        ))}
        {/* soft daylight bounce from the glazing */}
        <pointLight ref={bounce} position={[-2, 2.2, 2.6]} color="#fff4e6" distance={18} decay={1.2} />
      </group>
      <HotspotMarkers toWorld={toWorld} />
      <InteriorRig frame={frame} />
    </>
  )
}
