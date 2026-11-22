import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { makeWaterMaterial } from '../materials/water'
import { DEPTH_BOUNDS, buildDepthTexture } from './Terrain'
import { getMaterial } from '../materials/library'
import { Parts } from '../geo/build'

export function Ocean() {
  const mat = useMemo(() => makeWaterMaterial({ kind: 'ocean', depthTex: buildDepthTexture(), depthBounds: DEPTH_BOUNDS }), [])
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0, 1500]} material={mat} receiveShadow renderOrder={-1}>
      <planeGeometry args={[40000, 40000, 1, 1]} />
    </mesh>
  )
}

/** Sailboats bobbing in the bay + gulls circling overhead. */
export function BayLife() {
  const boats = useMemo(() => {
    const P = new Parts()
    const hull = new THREE.CylinderGeometry(0.9, 0.5, 9, 10, 1)
    hull.rotateX(Math.PI / 2)
    hull.scale(1, 0.6, 1)
    P.add('plaster', hull)
    P.box('deck', -0.7, 0.35, -3.5, 0.7, 0.45, 3.2)
    P.cyl('metal', 0, 0.4, -0.5, 0.06, 11, 6)
    const sail = new THREE.BufferGeometry()
    sail.setAttribute('position', new THREE.Float32BufferAttribute([0, 1.4, -0.4, 0, 11, -0.45, 0, 1.4, 3.6, 0, 1.4, -0.6, 0, 9.5, -0.6, 0, 1.4, -4.2], 3))
    sail.computeVertexNormals()
    P.add('umbrella', sail)
    const parts = P.merged()
    const spots = [
      [-160, 420, 0.4], [120, 520, 2.1], [380, 640, 1.2], [-420, 700, 3.0], [40, 900, 5.0], [250, 360, 4.1],
    ]
    return spots.map(([x, z, r]) => ({ x, z, r, parts }))
  }, [])
  const refs = useRef<THREE.Group[]>([])
  const gulls = useRef<THREE.InstancedMesh>(null)
  const gullGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.3, -1.1, 0.25, -0.1, 0, 0, -0.3, 0, 0, 0.3, 0, 0, -0.3, 1.1, 0.25, -0.1], 3))
    g.computeVertexNormals()
    return g
  }, [])
  const gullMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f2f2ef', side: THREE.DoubleSide, roughness: 0.8 }), [])
  const tmp = useMemo(() => new THREE.Object3D(), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    refs.current.forEach((g, i) => {
      if (!g) return
      g.position.y = Math.sin(t * 0.8 + i) * 0.18
      g.rotation.z = Math.sin(t * 0.6 + i * 2) * 0.05
      g.rotation.x = Math.sin(t * 0.7 + i) * 0.03
    })
    const im = gulls.current
    if (im) {
      for (let i = 0; i < 14; i++) {
        const a = t * 0.08 + i * 0.45 + (i % 3) * 0.2
        const r = 120 + (i % 4) * 18
        tmp.position.set(Math.cos(a) * r - 40, 70 + Math.sin(t * 0.5 + i) * 6 + (i % 5) * 3, Math.sin(a) * r * 0.6 + 260)
        tmp.rotation.set(0, -a, Math.sin(t * 2 + i) * 0.2)
        const flap = Math.sin(t * 7 + i * 1.3)
        tmp.scale.set(1.4, 1.4 * (1 + flap * 0.8), 1.4)
        tmp.updateMatrix()
        im.setMatrixAt(i, tmp.matrix)
      }
      im.instanceMatrix.needsUpdate = true
    }
  })
  return (
    <group name="bay-life">
      {boats.map((b, i) => (
        <group key={i} position={[b.x, 0, b.z]} rotation-y={b.r} ref={(g) => void (refs.current[i] = g!)}>
          {[...b.parts].map(([k, geo]) => (
            <mesh key={k} geometry={geo} material={getMaterial(k)} castShadow />
          ))}
        </group>
      ))}
      <instancedMesh ref={gulls} args={[gullGeo, gullMat, 14]} frustumCulled={false} />
    </group>
  )
}
