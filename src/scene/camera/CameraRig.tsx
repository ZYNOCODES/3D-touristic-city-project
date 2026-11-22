// Cinematic camera: arcing Catmull-Rom flights with smootherstep easing between
// shots / units, damped orbit controls once landed, and the fade-through
// choreography into and out of the interior tour.
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { SHOTS, type ShotId } from '../../data/project'
import { UNIT_BY_ID } from '../../data/units'
import { height } from '../../lib/heightfield'
import { loadModel } from '../../lib/assets'
import { useStore } from '../../store'
import { cellBox } from '../geo/build'
import { resOrigin } from '../masterplan/ResidenceBlock'
import { villaTransform } from '../masterplan/Villas'
import { MOTION } from './motion'

export function shotPose(id: ShotId) {
  const s = SHOTS.find((x) => x.id === id)!
  const [tx, tz] = s.target
  const target = new THREE.Vector3(tx, height(tx, tz) + s.lift, tz)
  const az = THREE.MathUtils.degToRad(s.azimuth)
  const el = THREE.MathUtils.degToRad(s.elevation)
  const pos = target.clone().add(new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)).multiplyScalar(s.distance))
  return { pos, target }
}

export function unitPose(id: string, close = false) {
  const u = UNIT_BY_ID.get(id)!
  if (u.kind === 'villa') {
    const xf = villaTransform(u.index)
    const front = new THREE.Vector3(Math.sin(xf.rotationY), 0, Math.cos(xf.rotationY))
    const side = new THREE.Vector3(front.z, 0, -front.x)
    if (close) {
      const target = xf.position.clone().add(new THREE.Vector3(0, 1.8, 0))
      const pos = xf.position.clone().addScaledVector(front, 9 * xf.scale).add(new THREE.Vector3(0, 2.2, 0)).addScaledVector(side, 1.5)
      return { pos, target }
    }
    // frame the villa left of centre so the preview card fits on its right
    const target = xf.position.clone().addScaledVector(side, 9).add(new THREE.Vector3(0, 3, 0))
    const pos = xf.position.clone().addScaledVector(front, 50).addScaledVector(side, -12).add(new THREE.Vector3(0, 21, 0))
    return { pos, target }
  }
  const b = cellBox(u.floorIdx!, u.bay!)
  const c = b.getCenter(new THREE.Vector3()).add(resOrigin())
  if (close) return { pos: c.clone().add(new THREE.Vector3(0, 0.2, 7)), target: c }
  return { pos: c.clone().add(new THREE.Vector3(-14, 5, 38)), target: c.clone().add(new THREE.Vector3(8, 0, 0)) }
}

/** World point the floating unit card is anchored to (right of the unit). */
export function unitAnchor(id: string) {
  const u = UNIT_BY_ID.get(id)!
  if (u.kind === 'villa') {
    const xf = villaTransform(u.index)
    const side = new THREE.Vector3(Math.cos(xf.rotationY), 0, -Math.sin(xf.rotationY))
    return xf.position.clone().addScaledVector(side, 12 * xf.scale).add(new THREE.Vector3(0, 5, 0))
  }
  const b = cellBox(u.floorIdx!, u.bay!)
  return b.getCenter(new THREE.Vector3()).add(resOrigin()).add(new THREE.Vector3(8.5, 0, 2))
}

interface Flight {
  curve: THREE.CatmullRomCurve3
  t0: THREE.Vector3
  t1: THREE.Vector3
  dur: number
  time: number
  onDone?: () => void
}

const ease = (x: number) => x * x * x * (x * (x * 6 - 15) + 10) // smootherstep

export function CameraRig({ shadowFocus }: { shadowFocus: React.MutableRefObject<THREE.Vector3> }) {
  const { camera } = useThree()
  const controls = useRef<OrbitControlsImpl>(null)
  const flight = useRef<Flight | null>(null)
  const lastPos = useRef(new THREE.Vector3())
  const idle = useRef(0)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__controls = controls

  const flyTo = (pos: THREE.Vector3, target: THREE.Vector3, opts: { dur?: number; arc?: number; onDone?: () => void } = {}) => {
    const c = controls.current
    const p0 = camera.position.clone()
    const t0 = c ? c.target.clone() : target.clone()
    const dist = p0.distanceTo(pos)
    const mid = p0.clone().lerp(pos, 0.5)
    const lift = opts.arc ?? THREE.MathUtils.clamp(dist * 0.22, 4, 160)
    mid.y = Math.max(mid.y, Math.max(p0.y, pos.y) * 0.6 + lift)
    // keep the arc above the terrain
    mid.y = Math.max(mid.y, height(mid.x, mid.z) + 30)
    const q1 = p0.clone().lerp(mid, 0.5)
    const q2 = mid.clone().lerp(pos, 0.5)
    const curve = new THREE.CatmullRomCurve3([p0, q1, mid, q2, pos], false, 'centripetal', 0.5)
    const dur = opts.dur ?? THREE.MathUtils.clamp(1.9 + dist / 380, 2.2, 5.2)
    flight.current = { curve, t0, t1: target.clone(), dur, time: 0, onDone: opts.onDone }
    useStore.setState({ flying: true })
    if (c) c.enabled = false
  }

  // initial camera: high above the bay, then sweep into the masterplan
  useEffect(() => {
    const { pos, target } = shotPose('masterplan')
    camera.position.copy(target).add(new THREE.Vector3(-260, 520, 900))
    camera.lookAt(target)
    controls.current?.target.copy(target)
  }, [camera])

  useEffect(() => {
    const unsub = useStore.subscribe((st, prev) => {
      if (st.ready && !prev.ready) {
        // ?shot=pool&t=0.3 jumps straight to a shot (handy for reviews / debugging)
        const q = new URLSearchParams(location.search)
        const jump = q.get('shot') as ShotId | null
        if (q.has('t')) useStore.setState({ timeOfDay: +q.get('t')!, timeTarget: +q.get('t')! })
        const { pos, target } = shotPose(jump ?? 'masterplan')
        const cam = q.get('cam')?.split(',').map(Number)
        if (cam && cam.length === 6) {
          // ?cam=ex,ey,ez,tx,ty,tz — exact eye/target for close-up QA screenshots
          pos.set(cam[0], cam[1], cam[2])
          target.set(cam[3], cam[4], cam[5])
        }
        if (jump || cam) {
          camera.position.copy(pos)
          camera.lookAt(target)
          controls.current?.target.copy(target)
          useStore.setState({ mode: 'masterplan', ...(jump ? { shot: jump } : {}), status: SHOTS.find((x) => x.id === jump)?.status ?? '' })
          return
        }
        flyTo(pos, target, { dur: 6.5, arc: 40 })
        useStore.setState({ mode: 'masterplan', status: 'Masterplan overview' })
      }
      if (st.shot !== prev.shot && st.mode === 'masterplan') {
        const { pos, target } = shotPose(st.shot)
        const s = SHOTS.find((x) => x.id === st.shot)!
        useStore.setState({ status: s.status })
        flyTo(pos, target)
      }
      if (st.selectedUnit && st.selectedUnit !== prev.selectedUnit && st.mode === 'masterplan') {
        const { pos, target } = unitPose(st.selectedUnit)
        flyTo(pos, target, { dur: 2.6 })
      }
      // enter the interior: dolly up to the glass, fade, swap scenes
      if (st.mode === 'entering' && prev.mode !== 'entering' && st.interiorUnit) {
        const { pos, target } = unitPose(st.interiorUnit, true)
        const ready = loadModel(st.interiorUnit.startsWith('A') ? 'apartment_interior' : 'villa_interior')
        flyTo(pos, target, {
          dur: 2.2,
          arc: 3,
          onDone: () => {
            useStore.setState({ fade: 1 })
            Promise.all([ready, new Promise((r) => setTimeout(r, 700))]).then(() => {
              useStore.setState({ mode: 'interior', hotspot: 'living', status: 'Interior tour' })
              setTimeout(() => useStore.setState({ fade: 0 }), 250)
            })
          },
        })
      }
      // back from the interior
      if (st.mode === 'masterplan' && (prev.mode === 'interior' || prev.mode === 'sheet') && prev.interiorUnit) {
        const unit = prev.interiorUnit
        useStore.setState({ fade: 1 })
        setTimeout(() => {
          const { pos, target } = unitPose(unit, true)
          camera.position.copy(pos)
          controls.current?.target.copy(target)
          camera.lookAt(target)
          useStore.setState({ fade: 0 })
          const far = unitPose(unit)
          flyTo(far.pos, far.target, { dur: 2.6, arc: 6 })
        }, 450)
      }
    })
    return unsub
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1)
    const st = useStore.getState()
    const c = controls.current
    if (st.mode === 'interior' || st.mode === 'sheet') {
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
      // target leads slightly so the camera "banks" into the move
      const tk = ease(Math.min(1, k * 1.08))
      const tgt = f.t0.clone().lerp(f.t1, tk)
      camera.lookAt(tgt)
      if (c) c.target.copy(tgt)
      if (k >= 1) {
        flight.current = null
        if (c) c.enabled = st.mode === 'masterplan'
        useStore.setState({ flying: false })
        f.onDone?.()
      }
    } else if (c) {
      c.update()
      // never dip under the terrain
      const g = height(camera.position.x, camera.position.z) + 2.5
      if (camera.position.y < g) camera.position.y = g
      idle.current += dt
      c.autoRotate = idle.current > 25 && st.mode === 'masterplan' && !st.selectedUnit
    }
    // camera speed → motion blur strength
    const v = camera.position.distanceTo(lastPos.current) / Math.max(dt, 1e-3)
    lastPos.current.copy(camera.position)
    const dist = c ? camera.position.distanceTo(c.target) : 100
    const norm = v / Math.max(dist, 20)
    MOTION.speed = THREE.MathUtils.lerp(MOTION.speed, flight.current ? THREE.MathUtils.clamp(norm * 0.9, 0, 1) : 0, 0.15)
    if (c) shadowFocus.current.copy(c.target)
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping
      dampingFactor={0.06}
      rotateSpeed={0.5}
      zoomSpeed={0.8}
      panSpeed={0.8}
      minDistance={8}
      maxDistance={1500}
      maxPolarAngle={1.42}
      autoRotateSpeed={0.25}
      screenSpacePanning={false}
      onStart={() => {
        idle.current = 0
      }}
    />
  )
}

export const _layout = layout
