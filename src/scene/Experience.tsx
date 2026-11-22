import { Suspense, useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { SkySystem } from './env/SkySystem'
import { Terrain } from './masterplan/Terrain'
import { BayLife, Ocean } from './masterplan/Ocean'
import { Paths } from './masterplan/Paths'
import { MediterraneanVegetation as Vegetation } from './vegetation/MediterraneanVegetation'
import { Villas } from './masterplan/Villas'
import { ResidenceBlock } from './masterplan/ResidenceBlock'
import { Amenities } from './masterplan/Amenities'
import { UnitPins } from './masterplan/UnitPins'
import { BoatView } from './masterplan/BoatView'
import { RealPeople as People } from './people/RealPeople'
import { CameraRig, unitAnchor } from './camera/CameraRig'
import { Interior } from './interior/Interior'
import { PostFX } from './post/PostFX'
import { GLOBAL, damp } from './shared'
import { UnitCard } from '../ui/UnitCard'

/** Tracks THREE.DefaultLoadingManager and flips `ready` once everything settled. */
export const pending = { n: 0, total: 0, done: 0 }
if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__pending = pending
const mgr = THREE.DefaultLoadingManager
mgr.onStart = (_u, loaded, total) => {
  pending.total = Math.max(pending.total, total)
  pending.done = loaded
}
mgr.onProgress = (_u, loaded, total) => {
  pending.total = Math.max(pending.total, total)
  pending.done = loaded
}

function ReadyGate() {
  const frames = useRef(0)
  const t0 = useRef(performance.now())
  const { gl, scene, camera } = useThree()
  if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __gl: gl, __scene: scene, __camera: camera })
  useEffect(() => {
    // precompile shaders to avoid hitches on the first flight
    const id = setTimeout(() => gl.compile(scene, camera), 1200)
    return () => clearTimeout(id)
  }, [gl, scene, camera])
  useFrame(() => {
    const st = useStore.getState()
    if (st.ready) return
    const prog = pending.total ? pending.done / pending.total : 0
    const loading = pending.total > pending.done
    frames.current = loading ? 0 : frames.current + 1
    const elapsed = performance.now() - t0.current
    useStore.setState({ loadProgress: Math.max(st.loadProgress, Math.min(0.98, prog * 0.85 + Math.min(elapsed / 6000, 0.15))) })
    if (frames.current > 4 && elapsed > 1800) useStore.setState({ ready: true, loadProgress: 1 })
  })
  return null
}

function AvailabilityAnimator() {
  useFrame((_, dt) => {
    const st = useStore.getState()
    GLOBAL.uAvail.value = damp(GLOBAL.uAvail.value, st.availability && st.mode === 'masterplan' ? 1 : 0, 5, dt)
  })
  return null
}

function SelectedCard() {
  const sel = useStore((s) => s.selectedUnit)
  const mode = useStore((s) => s.mode)
  const flying = useStore((s) => s.flying)
  if (!sel || mode !== 'masterplan') return null
  return (
    <Html position={unitAnchor(sel)} zIndexRange={[20, 10]} style={{ pointerEvents: 'auto' }}>
      <UnitCard id={sel} visible={!flying} />
    </Html>
  )
}

function World() {
  const shadowFocus = useRef(new THREE.Vector3(0, 30, -40))
  const inside = useStore((s) => s.mode === 'interior' || s.mode === 'sheet')
  const hasInterior = useStore((s) => !!s.interiorUnit)
  return (
    <>
      <SkySystem shadowFocus={shadowFocus} />
      <Terrain />
      <Ocean />
      <Paths />
      <Vegetation />
      <Villas />
      <ResidenceBlock />
      <Amenities />
      <People />
      <BayLife />
      <BoatView />
      {!inside && <UnitPins />}
      {inside && hasInterior && <Interior />}
      <InteriorShadowFocus focus={shadowFocus} />
      <CameraRig shadowFocus={shadowFocus} />
      <SelectedCard />
      <AvailabilityAnimator />
      <ReadyGate />
      <PostFX />
    </>
  )
}

function InteriorShadowFocus({ focus }: { focus: React.MutableRefObject<THREE.Vector3> }) {
  const camera = useThree((s) => s.camera)
  useFrame(() => {
    const st = useStore.getState()
    if (st.mode === 'interior' || st.mode === 'sheet') focus.current.copy(camera.position).add(new THREE.Vector3(0, -1.5, 0))
  })
  return null
}

export function Experience() {
  return (
    <Canvas
      className="three-canvas"
      shadows
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: import.meta.env.DEV }}
      camera={{ fov: 40, near: 0.5, far: 30000, position: [0, 600, 1200] }}
      onPointerMissed={() => {
        const st = useStore.getState()
        if (st.mode === 'masterplan' && st.selectedUnit) st.selectUnit(null)
      }}
    >
      <Suspense fallback={null}>
        <World />
      </Suspense>
    </Canvas>
  )
}
