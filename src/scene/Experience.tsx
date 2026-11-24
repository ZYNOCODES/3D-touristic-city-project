import { Suspense, useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store'
import { SkySystem } from './env/SkySystem'
import { CoveTerrain } from './cove/Terrain'
import { Sea } from './cove/Sea'
import { Rocks } from './cove/Rocks'
import { Plants } from './cove/Plants'
import { Hotel } from './hotel/Hotel'
import { RoomInterior } from './hotel/RoomInterior'
import { Guests } from './people/Guests'
import { CameraRig } from './camera/CameraRig'
import { PostFX } from './post/PostFX'
import { GLOBAL, damp } from './shared'
import { onQuality, quality, setTier } from './cove/quality'
import { roomAnchor } from '../data/rooms'
import { UnitCard } from '../ui/UnitCard'

const pending = { total: 0, done: 0 }
const mgr = THREE.DefaultLoadingManager
mgr.onStart = mgr.onProgress = (_u, loaded, total) => {
  pending.total = Math.max(pending.total, total)
  pending.done = loaded
}

/** Opens the experience as soon as the terrain, sea and hotel are in; the rest streams in afterwards. */
function ReadyGate() {
  const frames = useRef(0)
  const t0 = useRef(performance.now())
  const { gl, scene, camera } = useThree()
  if (import.meta.env.DEV) Object.assign(window as unknown as Record<string, unknown>, { __gl: gl, __scene: scene, __camera: camera })
  useFrame(() => {
    const st = useStore.getState()
    if (st.ready) return
    const core = ['cove-terrain', 'sea', 'hotel'].filter((n) => scene.getObjectByName(n)).length
    const prog = pending.total ? pending.done / pending.total : 0
    frames.current = core === 3 ? frames.current + 1 : 0
    const elapsed = performance.now() - t0.current
    useStore.setState({ loadProgress: Math.max(st.loadProgress, Math.min(0.97, core * 0.22 + prog * 0.31)) })
    if ((frames.current > 3 && elapsed > 900) || elapsed > 30000) useStore.setState({ ready: true, loadProgress: 1 })
  })
  return null
}

/** Steps the quality down when the device cannot hold the frame rate. */
function AutoQuality() {
  const acc = useRef({ t: 0, n: 0, bad: 0 })
  const setDpr = useThree((s) => s.setDpr)
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    const apply = () => {
      setDpr(Math.min(devicePixelRatio, quality.dpr))
      gl.toneMapping = quality.post ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    }
    apply()
    return onQuality(apply)
  }, [gl, setDpr])
  useFrame((_, dt) => {
    const st = useStore.getState()
    if (!st.ready || document.hidden || dt > 0.5 || new URLSearchParams(location.search).has('q')) return
    const a = acc.current
    a.t += dt
    a.n++
    if (a.t < 2.5) return
    const fps = a.n / a.t
    a.t = a.n = 0
    a.bad = fps < 24 ? a.bad + 1 : 0
    if (a.bad >= 2) {
      a.bad = 0
      if (quality.tier !== 'low') setTier(quality.tier === 'high' ? 'medium' : 'low', false)
      else if (quality.dpr > 0.65) {
        quality.dpr = Math.max(0.65, quality.dpr - 0.15)
        setDpr(quality.dpr)
      }
    }
  })
  return null
}

/** Draws only while the page is visible; capped on weak devices. */
function Loop() {
  const advance = useThree((s) => s.advance)

  const clock = useThree((s) => s.clock)
  useEffect(() => {
    let raf = 0
    let last = 0
    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      if (quality.fps < 60 && t - last < 1000 / quality.fps - 3) return
      // keep the clock finite and continuous (first frame, tab switches)
      if (!Number.isFinite(clock.elapsedTime) || t / 1000 - clock.elapsedTime > 0.5) clock.elapsedTime = t / 1000 - 1 / 60
      last = t
      advance(t / 1000)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [advance, clock])
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
    <Html position={roomAnchor(sel)} zIndexRange={[20, 10]} style={{ pointerEvents: 'auto' }}>
      <UnitCard id={sel} visible={!flying} />
    </Html>
  )
}

function Later({ ms, children }: { ms: number; children: React.ReactNode }) {
  const ready = useStore((s) => s.ready)
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!ready) return
    const id = setTimeout(() => setOn(true), ms)
    return () => clearTimeout(id)
  }, [ready, ms])
  return on ? <>{children}</> : null
}

function World() {
  const shadowFocus = useRef(new THREE.Vector3(0, 20, -60))
  return (
    <>
      <Loop />
      <SkySystem shadowFocus={shadowFocus} />
      <CoveTerrain />
      <Sea />
      <Hotel />
      <Rocks />
      <Plants />
      <Later ms={300}>
        <Guests />
      </Later>
      <RoomInterior />
      <CameraRig shadowFocus={shadowFocus} />
      <SelectedCard />
      <AvailabilityAnimator />
      <AutoQuality />
      <ReadyGate />
      <PostFX />
    </>
  )
}

export function Experience() {
  return (
    <Canvas
      className="three-canvas"
      frameloop="never"
      shadows
      flat
      dpr={Math.min(devicePixelRatio, quality.dpr)}
      gl={{ antialias: !quality.post, powerPreference: 'high-performance', stencil: false, preserveDrawingBuffer: import.meta.env.DEV }}
      camera={{ fov: 40, near: 0.5, far: 24000, position: [0, 12, 60] }}
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
