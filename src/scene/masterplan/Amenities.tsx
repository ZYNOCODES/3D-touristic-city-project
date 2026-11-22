import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { AMENITY_Y, ANCHORS, BENCHES, LAMPS, LOUNGERS, UMBRELLAS, type PropXf } from '../../data/amenityProps'
import { loadModel } from '../../lib/assets'
import { height } from '../../lib/heightfield'
import type { PartMap } from '../geo/build'
import * as F from '../geo/amenities'
import { gltfToProto } from '../geo/instancing'
import { getMaterial } from '../materials/library'
import { GLOBAL } from '../shared'

const A = layout.amenities

function meshesFromParts(parts: PartMap, custom?: Map<string, THREE.Material>) {
  const g = new THREE.Group()
  for (const [name, geo] of parts) {
    const mat = name.startsWith('custom:') ? custom!.get(name)! : getMaterial(name)
    const m = new THREE.Mesh(geo, mat)
    m.castShadow = !mat.transparent && name !== 'water'
    m.receiveShadow = true
    if (mat.transparent) m.renderOrder = 2
    g.add(m)
  }
  return g
}

function instancedProps(parts: PartMap, list: PropXf[], custom?: Map<string, THREE.Material>, shadow = true) {
  const g = new THREE.Group()
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  for (const [name, geo] of parts) {
    const mat = name.startsWith('custom:') ? custom!.get(name)! : getMaterial(name)
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((p, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot)
      im.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(1, 1, 1)))
    })
    im.castShadow = shadow && !mat.transparent
    im.receiveShadow = true
    im.computeBoundingSphere()
    g.add(im)
  }
  return g
}

function courtTexture() {
  const c = document.createElement('canvas')
  c.width = 1024
  c.height = 560
  const x = c.getContext('2d')!
  x.fillStyle = '#c7663f'
  x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = '#3d8a5f'
  x.fillRect(40, 40, c.width - 80, c.height - 80)
  x.strokeStyle = '#f4f1ea'
  x.lineWidth = 6
  x.strokeRect(40, 40, c.width - 80, c.height - 80)
  x.beginPath()
  x.moveTo(c.width / 2, 40)
  x.lineTo(c.width / 2, c.height - 40)
  x.stroke()
  x.beginPath()
  x.arc(c.width / 2, c.height / 2, 66, 0, Math.PI * 2)
  x.stroke()
  for (const s of [0, 1]) {
    const ex = s ? c.width - 40 : 40
    const dir = s ? -1 : 1
    x.fillStyle = '#c7663f'
    x.fillRect(s ? ex - 210 : ex, c.height / 2 - 72, 210, 144)
    x.strokeRect(s ? ex - 210 : ex, c.height / 2 - 72, 210, 144)
    x.beginPath()
    x.arc(ex + dir * 210, c.height / 2, 66, -Math.PI / 2, Math.PI / 2, s === 1)
    x.stroke()
    x.beginPath()
    x.arc(ex + dir * 30, c.height / 2, 250, -Math.PI / 2 + 0.25, Math.PI / 2 - 0.25, s === 1)
    x.stroke()
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  return t
}

function Swings() {
  const seats = useRef<THREE.Group[]>([])
  const rope = useMemo(() => getMaterial('metal'), [])
  const seatMat = useMemo(() => getMaterial('plastic_teal'), [])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    seats.current.forEach((s, i) => s && (s.rotation.x = Math.sin(t * 1.9 + i * 1.7) * (0.45 + 0.15 * i)))
  })
  return (
    <>
      {ANCHORS.swings.map((p, i) => (
        <group key={i} position={p} ref={(g) => void (seats.current[i] = g!)}>
          <mesh position={[-0.22, -0.9, 0]} material={rope}>
            <cylinderGeometry args={[0.012, 0.012, 1.8, 4]} />
          </mesh>
          <mesh position={[0.22, -0.9, 0]} material={rope}>
            <cylinderGeometry args={[0.012, 0.012, 1.8, 4]} />
          </mesh>
          <mesh position={[0, -1.8, 0]} material={seatMat} castShadow>
            <boxGeometry args={[0.55, 0.05, 0.22]} />
          </mesh>
        </group>
      ))}
    </>
  )
}

export function Amenities() {
  const [models, setModels] = useState<{ structures: Record<string, THREE.Group>; props: Record<string, PartMap>; custom: Map<string, THREE.Material> } | null>(null)

  useEffect(() => {
    Promise.all([loadModel('amenities'), loadModel('props')]).then(([am, pr]) => {
      const fallbacks: Record<string, () => PartMap> = {
        pool: F.poolParts,
        lounge: F.loungeParts,
        court: F.courtParts,
        playground: F.playgroundParts,
        beachclub: F.beachClubParts,
        garden: F.gardenParts,
      }
      const structures: Record<string, THREE.Group> = {}
      const custom = new Map<string, THREE.Material>()
      for (const [k, fb] of Object.entries(fallbacks)) {
        const node = am?.scene.getObjectByName(k)
        if (node) {
          const proto = gltfToProto(am!, node)
          proto.custom.forEach((v, kk) => custom.set(kk, v))
          structures[k] = meshesFromParts(proto.parts, proto.custom)
        } else structures[k] = meshesFromParts(fb())
      }
      const propFb: Record<string, () => PartMap> = { lounger: F.loungerParts, umbrella: F.umbrellaParts, lamp: F.lampParts, bench: F.benchParts }
      const props: Record<string, PartMap> = {}
      for (const [k, fb] of Object.entries(propFb)) {
        const node = pr?.scene.getObjectByName(k)
        if (node) {
          const proto = gltfToProto(pr!, node)
          proto.custom.forEach((v, kk) => custom.set(kk, v))
          props[k] = proto.parts
        } else props[k] = fb()
      }
      console.info(`[amenities] structures from ${am ? 'amenities.glb' : 'procedural'}, props from ${pr ? 'props.glb' : 'procedural'}`)
      setModels({ structures, props, custom })
    })
  }, [])

  const court = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ map: courtTexture(), roughness: 0.85 })
    return m
  }, [])
  const rubber = useMemo(() => getMaterial('rubber'), [])
  const props = useMemo(() => {
    if (!models) return null
    const g = new THREE.Group()
    g.add(instancedProps(models.props.lounger, LOUNGERS, models.custom))
    g.add(instancedProps(models.props.umbrella, UMBRELLAS, models.custom))
    g.add(instancedProps(models.props.lamp, LAMPS, models.custom))
    g.add(instancedProps(models.props.bench, BENCHES, models.custom))
    return g
  }, [models])

  // night lights for key amenities (a handful of real lights; the rest is emissive + bloom)
  const lights = useRef<THREE.PointLight[]>([])
  useFrame(() => {
    const n = GLOBAL.uNight.value
    lights.current.forEach((l) => l && (l.intensity = n * l.userData.base))
  })
  const L = (i: number, base: number) => (l: THREE.PointLight | null) => {
    if (l) {
      l.userData.base = base
      lights.current[i] = l
    }
  }

  if (!models) return null
  const S = models.structures
  const bcY = height(A.beachClub.x, A.beachClub.z)
  return (
    <group name="amenities">
      <primitive object={S.pool} position={[A.pool.x, AMENITY_Y.pool, A.pool.z]} />
      <primitive object={S.lounge} position={[A.lounge.x, AMENITY_Y.lounge, A.lounge.z]} />
      <primitive object={S.court} position={[A.court.x, AMENITY_Y.court, A.court.z]} />
      <mesh position={[A.court.x, AMENITY_Y.court + 0.04, A.court.z]} rotation-x={-Math.PI / 2} material={court} receiveShadow>
        <planeGeometry args={[A.court.w + 3, A.court.l + 3]} />
      </mesh>
      <primitive object={S.playground} position={[A.playground.x, AMENITY_Y.playground, A.playground.z]} />
      <mesh position={[A.playground.x, AMENITY_Y.playground + 0.05, A.playground.z]} rotation-x={-Math.PI / 2} material={rubber} receiveShadow>
        <circleGeometry args={[A.playground.r, 48]} />
      </mesh>
      <Swings />
      <primitive object={S.beachclub} position={[A.beachClub.x, bcY, A.beachClub.z]} />
      <primitive object={S.garden} position={[A.garden.x, height(A.garden.x, A.garden.z), A.garden.z]} />
      {props && <primitive object={props} />}
      <pointLight ref={L(0, 400)} position={[A.pool.x, AMENITY_Y.pool + 6, A.pool.z]} color="#9fe7ff" distance={60} decay={1.6} />
      <pointLight ref={L(1, 260)} position={[A.lounge.x, AMENITY_Y.lounge + 3, A.lounge.z]} color="#ffc27a" distance={30} decay={1.6} />
      <pointLight ref={L(2, 500)} position={[A.court.x, AMENITY_Y.court + 9, A.court.z]} color="#fff2dc" distance={50} decay={1.4} />
      <pointLight ref={L(3, 200)} position={[A.playground.x, AMENITY_Y.playground + 6, A.playground.z]} color="#ffd9a8" distance={35} decay={1.5} />
    </group>
  )
}
