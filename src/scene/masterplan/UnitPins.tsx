// Floating availability pins above every villa (fade in with the Availability overlay),
// plus amenity labels anchored in 3D.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { SHOTS } from '../../data/project'
import { STATUS_META, VILLAS } from '../../data/units'
import { height } from '../../lib/heightfield'
import { useStore } from '../../store'
import { GLOBAL } from '../shared'
import { villaTransform } from './Villas'

export function UnitPins() {
  const head = useRef<THREE.InstancedMesh>(null)
  const stem = useRef<THREE.InstancedMesh>(null)
  const { headGeo, stemGeo, headMat, stemMat } = useMemo(() => {
    const headMat = new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, depthWrite: false })
    const stemMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false })
    return { headGeo: new THREE.SphereGeometry(0.9, 16, 12), stemGeo: new THREE.CylinderGeometry(0.06, 0.06, 1, 4), headMat, stemMat }
  }, [])
  const placed = useRef(false)
  useFrame(({ clock }) => {
    const a = GLOBAL.uAvail.value
    if (head.current && stem.current) {
      head.current.visible = stem.current.visible = a > 0.01
      headMat.opacity = a
      stemMat.opacity = 0.45 * a
      if (!placed.current) {
        const m4 = new THREE.Matrix4()
        const c = new THREE.Color()
        VILLAS.forEach((u, i) => {
          const xf = villaTransform(i)
          const top = xf.position.y + 13
          head.current!.setMatrixAt(i, m4.makeTranslation(xf.position.x, top, xf.position.z))
          stem.current!.setMatrixAt(i, m4.compose(new THREE.Vector3(xf.position.x, top - 2.5, xf.position.z), new THREE.Quaternion(), new THREE.Vector3(1, 4.6, 1)))
          head.current!.setColorAt(i, c.set(STATUS_META[u.status].color).multiplyScalar(1.6))
        })
        head.current.instanceMatrix.needsUpdate = true
        stem.current.instanceMatrix.needsUpdate = true
        if (head.current.instanceColor) head.current.instanceColor.needsUpdate = true
        head.current.computeBoundingSphere()
        stem.current.computeBoundingSphere()
        placed.current = true
      }
      head.current.position.y = Math.sin(clock.elapsedTime * 1.5) * 0.4
    }
  })
  return (
    <>
      <instancedMesh ref={head} args={[headGeo, headMat, VILLAS.length]} />
      <instancedMesh ref={stem} args={[stemGeo, stemMat, VILLAS.length]} />
      <AmenityLabels />
    </>
  )
}

function AmenityLabels() {
  const show = useStore((s) => s.showLabels && s.mode === 'masterplan')
  const go = useStore((s) => s.goShot)
  if (!show) return null
  const items = SHOTS.filter((s) => !['masterplan', 'villas', 'boat'].includes(s.id))
  return (
    <>
      {items.map((s) => {
        const [x, z] = s.target
        const y = height(x, z) + (s.id === 'residence' ? 34 : 9)
        return (
          <Html key={s.id} position={[x, y, z]} center zIndexRange={[5, 0]} distanceFactor={undefined} occlude={false}>
            <button className="amenity-tag" onClick={() => go(s.id)}>
              <span className="dot" />
              {s.label}
            </button>
          </Html>
        )
      })}
    </>
  )
}

export const _l = layout
