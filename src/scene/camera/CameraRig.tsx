// Cinematic camera: arcing flights between the curated views, then tightly limited orbit so only
// finished scenery can be framed. Handles the choreography into and out of a room.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import { SHOTS, type ShotId } from '../../data/project'
import { ROOM_BY_ID, roomFrame } from '../../data/rooms'
import { preloadRoom } from '../hotel/RoomInterior'
import { useStore } from '../../store'
import { MOTION } from './motion'

export function shotPose(id: ShotId) {
  const s = SHOTS.find((x) => x.id === id)!
  return { pos: new THREE.Vector3(...s.eye), target: new THREE.Vector3(...s.target) }
}

/** Camera in front of a room's balcony (portrait screens look straight on, landscape leaves space for the card). */
export function roomPose(id: string, aspect: number, close = false) {
  const f = roomFrame(ROOM_BY_ID.get(id)!)
  const c = f.center.clone()
  if (close) return { pos: c.clone().addScaledVector(f.out, 7.2).add(new THREE.Vector3(0, 0.15, 0)), target: c }
  const k = aspect < 1 ? 19 : 15
  const side = aspect < 1 ? 0 : 3.4
  return {
    pos: c.clone().addScaledVector(f.out, k).addScaledVector(f.right, -side).add(new THREE.Vector3(0, 2.2, 0)),
    target: c.clone().addScaledVector(f.right, side * 0.55).add(new THREE.Vector3(0, aspect < 1 ? -2.4 : 0, 0)),
  }
}

interface Flight {
  curve: THREE.CatmullRomCurve3
  t0: THREE.Vector3
  t1: THREE.Vector3
  f0: number
  f1: number
  dur: number
  time: number
  onDone?: () => void
}
const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)
const DEG = THREE.MathUtils.DEG2RAD

export function CameraRig({ shadowFocus }: { shadowFocus: React.MutableRefObject<THREE.Vector3> }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const controls = useRef<OrbitControlsImpl>(null)
  const flight = useRef<Flight | null>(null)
  const lastPos = useRef(new THREE.Vector3())
  const free = useRef(false)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__controls = controls

  const shotFov = (id: ShotId) => {
    const s = SHOTS.find((x) => x.id === id)!
    const a = size.width / size.height
    return a < 0.9 ? (s.portraitFov ?? 54) : (s.fov ?? 40)
  }

  /** clamp orbit to a window around the arrival pose */
  const limit = (pos: THREE.Vector3, target: THREE.Vector3, L: { az: number; up: number; down: number; zoom: [number, number] } | null) => {
    const c = controls.current
    if (!c) return
    if (!L) {
      c.minAzimuthAngle = -Infinity
      c.maxAzimuthAngle = Infinity
      c.minPolarAngle = 0
      c.maxPolarAngle = Math.PI
      c.minDistance = 0
      c.maxDistance = Infinity
      return
    }
    const sp = new THREE.Spherical().setFromVector3(pos.clone().sub(target))
    c.minAzimuthAngle = sp.theta - L.az * DEG
    c.maxAzimuthAngle = sp.theta + L.az * DEG
    c.minPolarAngle = sp.phi - L.up * DEG
    c.maxPolarAngle = sp.phi + L.down * DEG
    c.minDistance = sp.radius * L.zoom[0]
    c.maxDistance = sp.radius * L.zoom[1]
  }

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, o: { dur?: number; arc?: number; fov?: number; limits?: { az: number; up: number; down: number; zoom: [number, number] } | null; onDone?: () => void } = {}) => {
    const c = controls.current
    limit(pos, target, null)
    const p0 = camera.position.clone()
    const t0 = c ? c.target.clone() : target.clone()
    const dist = p0.distanceTo(pos)
    const mid = p0.clone().lerp(pos, 0.5)
    mid.y = Math.max(p0.y, pos.y, mid.y + (o.arc ?? THREE.MathUtils.clamp(dist * 0.14, 1, 14)))
    // stay over the water instead of cutting through the headlands
    mid.x = THREE.MathUtils.clamp(mid.x, -24, 28)
    const curve = new THREE.CatmullRomCurve3([p0, p0.clone().lerp(mid, 0.5).add(new THREE.Vector3(0, dist * 0.02, 0)), mid, mid.clone().lerp(pos, 0.5).add(new THREE.Vector3(0, dist * 0.02, 0)), pos], false, 'centripetal', 0.5)
    flight.current = {
      curve, t0, t1: target.clone(), f0: camera.fov, f1: o.fov ?? camera.fov,
      dur: o.dur ?? THREE.MathUtils.clamp(1.8 + dist / 70, 2, 4.4), time: 0,
      onDone: () => {
        limit(pos, target, o.limits ?? null)
        o.onDone?.()
      },
    }
    useStore.setState({ flying: true })
    if (c) c.enabled = false
  }
  const goShot = (id: ShotId, dur?: number) => {
    const { pos, target } = shotPose(id)
    flyTo(pos, target, { fov: shotFov(id), limits: SHOTS.find((x) => x.id === id)!, dur })
  }

  useEffect(() => {
    const { pos, target } = shotPose('hotel')
    camera.position.copy(pos).add(new THREE.Vector3(6, -2, 26))
    camera.fov = shotFov('hotel')
    camera.updateProjectionMatrix()
    camera.lookAt(target)
    controls.current?.target.copy(target)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useEffect(() => {
    const unsub = useStore.subscribe((st, prev) => {
      const aspect = size.width / size.height
      if (st.ready && !prev.ready) {
        const q = new URLSearchParams(location.search)
        const jump = q.get('shot') as ShotId | null
        if (q.has('t')) useStore.setState({ timeOfDay: +q.get('t')!, timeTarget: +q.get('t')! })
        const cam = q.get('cam')?.split(',').map(Number)
        useStore.setState({ mode: 'masterplan', ...(jump ? { shot: jump } : {}), status: SHOTS.find((x) => x.id === (jump ?? 'hotel'))!.status })
        if (cam && cam.length >= 6) {
          free.current = true
          camera.position.set(cam[0], cam[1], cam[2])
          controls.current?.target.set(cam[3], cam[4], cam[5])
          camera.lookAt(cam[3], cam[4], cam[5])
          return
        }
        if (jump) {
          const { pos, target } = shotPose(jump)
          camera.position.copy(pos)
          camera.fov = shotFov(jump)
          camera.updateProjectionMatrix()
          controls.current?.target.copy(target)
          camera.lookAt(target)
          limit(pos, target, SHOTS.find((x) => x.id === jump)!)
        } else goShot('hotel', 4.2)
        const room = q.get('room')
        if (room && ROOM_BY_ID.has(room)) setTimeout(() => useStore.getState().selectUnit(room), 600)
      }
      if (st.shot !== prev.shot && st.mode === 'masterplan' && prev.mode === 'masterplan') {
        useStore.setState({ status: SHOTS.find((x) => x.id === st.shot)!.status })
        goShot(st.shot)
      } else if (st.mode === 'masterplan' && prev.selectedUnit && !st.selectedUnit && st.shot === prev.shot && prev.mode === 'masterplan') {
        goShot(st.shot)
      }
      if (st.selectedUnit && st.selectedUnit !== prev.selectedUnit && st.mode === 'masterplan') {
        const { pos, target } = roomPose(st.selectedUnit, aspect)
        preloadRoom(st.selectedUnit)
        flyTo(pos, target, { dur: 2.4, arc: 2, fov: 40, limits: { az: 22, up: 12, down: 12, zoom: [0.6, 1.5] } })
      }
      if (st.mode === 'entering' && prev.mode !== 'entering' && st.interiorUnit) {
        const { pos, target } = roomPose(st.interiorUnit, aspect, true)
        const ready = preloadRoom(st.interiorUnit)
        flyTo(pos, target, {
          dur: 1.9,
          arc: 0.4,
          onDone: () => {
            useStore.setState({ fade: 1 })
            Promise.all([ready, new Promise((r) => setTimeout(r, 600))]).then(() => {
              useStore.setState({ mode: 'interior', status: 'Room tour' })
              setTimeout(() => useStore.setState({ fade: 0 }), 250)
            })
          },
        })
      }
      if (st.mode === 'masterplan' && (prev.mode === 'interior' || prev.mode === 'sheet') && prev.interiorUnit) {
        const unit = prev.interiorUnit
        useStore.setState({ fade: 1 })
        setTimeout(() => {
          const { pos, target } = roomPose(unit, aspect, true)
          camera.position.copy(pos)
          camera.fov = 40
          camera.near = 0.5
          camera.updateProjectionMatrix()
          controls.current?.target.copy(target)
          camera.lookAt(target)
          useStore.setState({ fade: 0 })
          const far = roomPose(unit, aspect)
          flyTo(far.pos, far.target, { dur: 2.2, arc: 1, onDone: () => goShot('rooms') })
          useStore.setState({ shot: 'rooms' })
        }, 450)
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera, size])

  useFrame((_, dtRaw) => {
    const dt = Number.isFinite(dtRaw) ? THREE.MathUtils.clamp(dtRaw, 0, 0.1) : 0.016
    const st = useStore.getState()
    const c = controls.current
    if (st.mode === 'interior' || (st.mode === 'sheet' && st.interiorUnit)) {
      if (c) c.enabled = false
      MOTION.speed = 0
      return
    }
    const f = flight.current
    if (f) {
      f.time += dt
      const k = Math.min(1, f.time / f.dur)
      const e = ease(k)
      f.curve.getPointAt(e, camera.position)
      const tgt = f.t0.clone().lerp(f.t1, ease(Math.min(1, k * 1.08)))
      if (f.f0 !== f.f1) {
        camera.fov = THREE.MathUtils.lerp(f.f0, f.f1, e)
        camera.updateProjectionMatrix()
      }
      camera.lookAt(tgt)
      if (c) c.target.copy(tgt)
      if (k >= 1) {
        flight.current = null
        if (c) c.enabled = st.mode === 'masterplan'
        useStore.setState({ flying: false })
        f.onDone?.()
      }
    } else if (c) {
      c.enabled = st.mode === 'masterplan'
      if (!free.current) {
        // breathing drift: a few centimetres of hand-held life
        c.update()
        if (camera.position.y < 0.75) camera.position.y = 0.75
      }
    }
    const v = camera.position.distanceTo(lastPos.current) / Math.max(dt, 1e-3)
    lastPos.current.copy(camera.position)
    const dist = c ? camera.position.distanceTo(c.target) : 100
    MOTION.speed = THREE.MathUtils.lerp(MOTION.speed, flight.current ? THREE.MathUtils.clamp((v / Math.max(dist, 20)) * 0.6, 0, 0.7) : 0, 0.15)
    if (c) shadowFocus.current.copy(c.target)
  })

  return <OrbitControls ref={controls} makeDefault enableDamping dampingFactor={0.06} rotateSpeed={0.35} zoomSpeed={0.6} enablePan={false} />
}
