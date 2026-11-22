// Terraced residence block with 48 selectable apartments. Selecting an apartment
// triggers an architectural "X-ray" cutaway: the facade inside the unit's volume is
// discarded in the shader and a furnished, lit diorama of the unit is revealed,
// outlined by a glowing frame.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { APARTMENTS, STATUS_META } from '../../data/units'
import { loadModel } from '../../lib/assets'
import { padHeight } from '../../lib/heightfield'
import { useStore } from '../../store'
import { Parts, RES, cellBox, cellEdgeZ, residenceParts } from '../geo/build'
import { gltfToProto, type Proto } from '../geo/instancing'
import { getMaterial } from '../materials/library'
import { GLOBAL, damp } from '../shared'
import { HIDE } from '../interior/hide'

const PAD_INDEX = layout.pads.length - 1 // residence pad is last
export const RES_ORIGIN = new THREE.Vector3(RES.x, 0, RES.z)
export function resOrigin() {
  RES_ORIGIN.y = padHeight(PAD_INDEX)
  return RES_ORIGIN
}

const cut = {
  uCutMin: { value: new THREE.Vector3(1e6, 1e6, 1e6) },
  uCutMax: { value: new THREE.Vector3(1e6, 1e6, 1e6) },
}

function patchCut(mat: THREE.Material) {
  if (mat.userData.__cut) return mat
  mat.userData.__cut = true
  const prev = mat.onBeforeCompile
  const key = mat.customProgramCacheKey()
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r)
    Object.assign(s.uniforms, cut)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvCutW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCutW;\nuniform vec3 uCutMin; uniform vec3 uCutMax;')
      .replace(
        'void main() {',
        `void main() {
        if (all(greaterThan(vCutW, uCutMin)) && all(lessThan(vCutW, uCutMax))) discard;`,
      )
  }
  mat.customProgramCacheKey = () => key + '|cut'
  return mat
}

/** Furnished interior shown inside the cut-open apartment (local to the cell box). */
function buildDiorama(box: THREE.Box3, beds: number) {
  const size = box.getSize(new THREE.Vector3())
  const P = new Parts()
  const W = size.x
  const H = size.y
  const D = size.z
  const x0 = -W / 2
  const z0 = -D / 2
  P.box('floor', x0, 0, z0, x0 + W, 0.04, z0 + D)
  P.box('ceiling', x0, H - 0.06, z0, x0 + W, H, z0 + D)
  P.box('plaster', x0, 0, z0, x0 + W, H, z0 + 0.12)
  P.box('plaster', x0, 0, z0, x0 + 0.12, H, z0 + D)
  P.box('plaster', x0 + W - 0.12, 0, z0, x0 + W, H, z0 + D)
  // partition between living and bedroom
  const split = x0 + W * 0.58
  P.box('plaster', split, 0, z0, split + 0.1, H, z0 + D * 0.62)
  // living: rug, sofa, coffee table, media wall, plant
  P.box('fabric', x0 + 1.0, 0.04, z0 + D * 0.42, x0 + 5.0, 0.06, z0 + D * 0.8)
  P.box('cushion', x0 + 1.1, 0.04, z0 + D * 0.38, x0 + 4.6, 0.45, z0 + D * 0.38 + 0.95)
  P.box('cushion', x0 + 1.1, 0.04, z0 + D * 0.38, x0 + 4.6, 0.85, z0 + D * 0.38 + 0.25)
  P.box('cushion', x0 + 1.1, 0.04, z0 + D * 0.38, x0 + 1.95, 0.45, z0 + D * 0.38 + 2.2)
  P.box('walnut', x0 + 2.3, 0.04, z0 + D * 0.6, x0 + 3.8, 0.38, z0 + D * 0.6 + 0.8)
  P.box('wood', x0 + 0.13, 0.04, z0 + D * 0.3, x0 + 0.35, H - 0.2, z0 + D * 0.9)
  P.box('black', x0 + 0.36, 1.0, z0 + D * 0.45, x0 + 0.42, 1.95, z0 + D * 0.75)
  P.cyl('plaster', x0 + W * 0.5, 0.04, z0 + D * 0.85, 0.25, 0.5, 10, 0.2)
  // dining
  P.box('walnut', x0 + W * 0.3, 0.72, z0 + 1.2, x0 + W * 0.3 + 2.0, 0.78, z0 + 2.2)
  P.box('black', x0 + W * 0.3 + 0.1, 0.04, z0 + 1.6, x0 + W * 0.3 + 1.9, 0.72, z0 + 1.8)
  // bedroom
  if (beds > 0) {
    P.box('walnut', split + 0.9, 0.04, z0 + 0.15, split + 3.2, 1.2, z0 + 0.35)
    P.box('wood', split + 0.9, 0.04, z0 + 0.35, split + 3.2, 0.35, z0 + 2.6)
    P.box('cushion', split + 0.95, 0.35, z0 + 0.4, split + 3.15, 0.6, z0 + 2.55)
    P.box('fabric', split + 0.95, 0.6, z0 + 1.6, split + 3.15, 0.66, z0 + 2.55)
    P.box('walnut', split + 0.3, 0.04, z0 + 0.2, split + 0.8, 0.5, z0 + 0.6)
    P.box('walnut', split + 3.3, 0.04, z0 + 0.2, split + 3.8, 0.5, z0 + 0.6)
  }
  const g = new THREE.Group()
  for (const [name, geo] of P.merged()) {
    const m = new THREE.Mesh(geo, getMaterial(name))
    m.castShadow = name !== 'ceiling'
    m.receiveShadow = true
    g.add(m)
  }
  // plants (sphere clusters)
  const leaf = new THREE.MeshStandardMaterial({ color: '#3f6b35', roughness: 0.8 })
  for (const [px, pz] of [[x0 + W * 0.5, z0 + D * 0.85], [split - 0.5, z0 + 0.6]]) {
    for (let k = 0; k < 4; k++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32 - k * 0.04, 1), leaf)
      s.position.set(px + Math.sin(k * 2.1) * 0.15, 0.75 + k * 0.28, pz + Math.cos(k * 2.1) * 0.15)
      g.add(s)
    }
  }
  // warm interior light
  const lamp = new THREE.PointLight('#ffd2a0', 18, 14, 1.6)
  lamp.position.set(0, H - 0.5, 0)
  g.add(lamp)
  const lamp2 = new THREE.PointLight('#ffe3c0', 10, 9, 1.6)
  lamp2.position.set(split + 2, H - 0.6, z0 + 2)
  g.add(lamp2)
  return g
}

export function ResidenceBlock() {
  const [proto, setProto] = useState<Proto | null>(null)
  useEffect(() => {
    loadModel('residence').then((g) => {
      setProto(g ? gltfToProto(g) : { parts: residenceParts(), custom: new Map() })
      console.info(g ? '[residence] using Blender residence.glb' : '[residence] procedural fallback')
    })
  }, [])
  const origin = useMemo(() => resOrigin().clone(), [])

  const building = useMemo(() => {
    if (!proto) return null
    const g = new THREE.Group()
    for (const [name, geo] of proto.parts) {
      const base = name.startsWith('custom:') ? proto.custom.get(name)!.clone() : getMaterial(name, 'res')
      const mesh = new THREE.Mesh(geo, patchCut(base))
      mesh.castShadow = !base.transparent && name !== 'glow'
      mesh.receiveShadow = !base.transparent
      if (base.transparent) mesh.renderOrder = 2
      g.add(mesh)
    }
    return g
  }, [proto])

  // apartment volumes (pickable, tinted in availability mode)
  const cells = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0 })
    mat.onBeforeCompile = (s) => {
      s.uniforms.uAvail = GLOBAL.uAvail
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uAvail;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * 0.35 * uAvail;')
    }
    const im = new THREE.InstancedMesh(geo, mat, APARTMENTS.length)
    const m4 = new THREE.Matrix4()
    const c = new THREE.Color()
    APARTMENTS.forEach((a, i) => {
      const b = cellBox(a.floorIdx!, a.bay!)
      const ctr = b.getCenter(new THREE.Vector3())
      const sz = b.getSize(new THREE.Vector3())
      m4.compose(ctr, new THREE.Quaternion(), sz.addScalar(0.15))
      im.setMatrixAt(i, m4)
      im.setColorAt(i, c.set(STATUS_META[a.status].color))
    })
    im.renderOrder = 3
    im.computeBoundingSphere()
    return im
  }, [])

  const frameRef = useRef<THREE.LineSegments>(null)
  const dioramaRef = useRef<THREE.Group>(null)
  const [diorama, setDiorama] = useState<{ id: string; obj: THREE.Group; box: THREE.Box3; edge: number } | null>(null)
  const cutAmt = useRef(0)

  // build the diorama for the selected apartment
  useEffect(() => {
    return useStore.subscribe((st, prev) => {
      if (st.cutaway === prev.cutaway) return
      const a = APARTMENTS.find((x) => x.id === st.cutaway)
      if (!a) {
        setDiorama(null)
        return
      }
      const box = cellBox(a.floorIdx!, a.bay!)
      setDiorama({ id: a.id, obj: buildDiorama(box, a.bedrooms), box, edge: cellEdgeZ(a.floorIdx!, a.bay!) })
      cutAmt.current = 0
    })
  }, [])

  const frameGeo = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), [])
  const frameMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(0.6, 2.6, 3.0), toneMapped: false, transparent: true, depthTest: false }), [])
  const glowMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 1.2, 1.4), toneMapped: false, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending }), [])
  const glowRef = useRef<THREE.Mesh>(null)
  const hoverMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6), toneMapped: false, transparent: true, opacity: 0.7 }), [])
  const hoverRef = useRef<THREE.LineSegments>(null)

  useFrame((_, dt) => {
    const st = useStore.getState()
    ;(cells.material as THREE.MeshStandardMaterial).opacity = 0.42 * GLOBAL.uAvail.value
    // hover outline
    const hov = st.hoveredUnit && st.hoveredUnit.startsWith('A') ? APARTMENTS.find((a) => a.id === st.hoveredUnit) : null
    if (hoverRef.current) {
      hoverRef.current.visible = !!hov && hov.id !== diorama?.id
      if (hov) {
        const b = cellBox(hov.floorIdx!, hov.bay!)
        b.getCenter(hoverRef.current.position)
        b.getSize(hoverRef.current.scale).addScalar(0.25)
      }
    }
    // touring an apartment: open the building around its cell + terrace (interior model fills it)
    const touring = (st.mode === 'interior' || st.mode === 'sheet' || st.mode === 'entering') && st.interiorUnit?.startsWith('A')
    if (touring && st.mode !== 'entering') {
      const a = APARTMENTS.find((x) => x.id === st.interiorUnit)!
      const b = cellBox(a.floorIdx!, a.bay!)
      cut.uCutMin.value.copy(b.min).add(origin).add(new THREE.Vector3(-0.05, -0.1, -0.05))
      cut.uCutMax.value.copy(b.max).add(origin).add(new THREE.Vector3(0.05, 0.08, 0))
      cut.uCutMax.value.z = origin.z + b.max.z + 3.2
      if (dioramaRef.current) dioramaRef.current.visible = false
      if (frameRef.current) frameRef.current.visible = false
      return
    }
    if (dioramaRef.current) dioramaRef.current.visible = true
    if (frameRef.current) frameRef.current.visible = true
    // cutaway animation
    if (diorama) {
      cutAmt.current = damp(cutAmt.current, 1, 3.5, dt)
      const k = cutAmt.current
      const b = diorama.box
      const min = b.min.clone().add(origin)
      const max = b.max.clone().add(origin)
      max.z = diorama.edge + 0.3 + origin.z // also open the terrace and its balustrade in front of the unit
      min.y -= 0.05
      max.y -= 0.05
      // reveal grows from the centre outwards
      const ctr = min.clone().add(max).multiplyScalar(0.5)
      cut.uCutMin.value.copy(ctr).lerp(min, k)
      cut.uCutMax.value.copy(ctr).lerp(max, k)
      if (dioramaRef.current) {
        b.getCenter(dioramaRef.current.position).setY(b.min.y)
        dioramaRef.current.scale.setScalar(0.96 + 0.04 * k)
      }
      if (frameRef.current) {
        b.getCenter(frameRef.current.position)
        b.getSize(frameRef.current.scale).addScalar(0.2)
        frameMat.opacity = k * (0.75 + 0.25 * Math.sin(performance.now() / 300))
        if (glowRef.current) {
          glowRef.current.position.copy(frameRef.current.position)
          glowRef.current.scale.copy(frameRef.current.scale)
          glowMat.opacity = 0.1 * k
        }
      }
    } else {
      cut.uCutMin.value.set(1e6, 1e6, 1e6)
      cut.uCutMax.value.set(1e6, 1e6, 1e6)
    }
  })

  const rootRef = useRef<THREE.Group>(null)
  useFrame(() => {
    if (rootRef.current) rootRef.current.visible = !HIDE.residence
  })
  if (!building) return null
  return (
    <group position={origin} rotation-y={RES.rot} ref={rootRef}>
      <primitive object={building} />
      <primitive
        object={cells}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          const st = useStore.getState()
          if (st.mode !== 'masterplan' || st.flying || e.instanceId == null) return
          e.stopPropagation()
          const id = APARTMENTS[e.instanceId].id
          if (id !== st.hoveredUnit) useStore.setState({ hoveredUnit: id })
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          useStore.setState({ hoveredUnit: null })
          document.body.style.cursor = ''
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const st = useStore.getState()
          if (st.mode !== 'masterplan' || e.delta > 6 || e.instanceId == null) return
          e.stopPropagation()
          st.selectUnit(APARTMENTS[e.instanceId].id)
        }}
      />
      <lineSegments ref={hoverRef} geometry={frameGeo} material={hoverMat} visible={false} />
      {diorama && (
        <>
          <group ref={dioramaRef}>
            <primitive object={diorama.obj} />
          </group>
          <lineSegments ref={frameRef} geometry={frameGeo} material={frameMat} renderOrder={10} />
          <mesh ref={glowRef} material={glowMat} renderOrder={9}>
            <boxGeometry args={[1, 1, 1]} />
          </mesh>
        </>
      )}
    </group>
  )
}
