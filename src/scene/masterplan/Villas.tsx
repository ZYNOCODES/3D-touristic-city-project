import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { STATUS_META, VILLAS } from '../../data/units'
import { loadModel } from '../../lib/assets'
import { padHeight } from '../../lib/heightfield'
import { useStore } from '../../store'
import { villaParts } from '../geo/build'
import { buildInstanced, gltfToProto, hoverUniform, type Proto } from '../geo/instancing'
import { HIDE } from '../interior/hide'

export const VILLA_SCALE: Record<string, number> = { ocean: 1.12, ridge: 1.0, canopy: 0.9 }

export function villaTransform(i: number) {
  const v = layout.villas[i]
  return { position: new THREE.Vector3(v.x, padHeight(i), v.z), rotationY: v.rot, scale: VILLA_SCALE[v.type] ?? 1 }
}

export function Villas() {
  const [proto, setProto] = useState<Proto | null>(null)
  useEffect(() => {
    loadModel('villa').then((g) => {
      if (g) {
        console.info('[villas] using Blender villa.glb')
        setProto(gltfToProto(g))
      } else {
        console.info('[villas] villa.glb not found → procedural fallback')
        setProto({ parts: villaParts(), custom: new Map() })
      }
    })
  }, [])

  const built = useMemo(() => {
    if (!proto) return null
    const xf = layout.villas.map((_, i) => villaTransform(i))
    return buildInstanced(proto, xf, { variant: 'villa', hover: hoverUniform.villa })
  }, [proto])

  // write status colours into the shared tint attribute
  useEffect(() => {
    if (!built) return
    const c = new THREE.Color()
    VILLAS.forEach((u, i) => {
      c.set(STATUS_META[u.status].color)
      built.tintAttr.setXYZW(i, c.r, c.g, c.b, 1)
    })
    built.tintAttr.needsUpdate = true
  }, [built])

  const hidden = useRef(-1)
  useFrame(() => {
    // hide the villa we are touring inside
    if (built && hidden.current !== HIDE.villa) {
      const m4 = new THREE.Matrix4()
      const zero = new THREE.Matrix4().makeScale(0, 0, 0)
      for (const im of built.meshes) {
        if (hidden.current >= 0) {
          const xf = villaTransform(hidden.current)
          m4.compose(xf.position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), xf.rotationY), new THREE.Vector3(xf.scale, xf.scale, xf.scale))
          im.setMatrixAt(hidden.current, m4)
        }
        if (HIDE.villa >= 0) im.setMatrixAt(HIDE.villa, zero)
        im.instanceMatrix.needsUpdate = true
      }
      hidden.current = HIDE.villa
    }
    const st = useStore.getState()
    const sel = st.selectedUnit ?? st.hoveredUnit
    const idx = sel && sel.startsWith('V') ? VILLAS.findIndex((v) => v.id === sel) : -1
    hoverUniform.villa.value = idx
  })

  if (!built) return null
  const pick = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    if (e.instanceId == null) return null
    return VILLAS[e.instanceId]?.id ?? null
  }
  return (
    <primitive
      object={built.group}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const st = useStore.getState()
        if (st.mode !== 'masterplan' || st.flying) return
        e.stopPropagation()
        const id = pick(e)
        if (id !== st.hoveredUnit) useStore.setState({ hoveredUnit: id })
        document.body.style.cursor = 'pointer'
      }}
      onPointerOut={() => {
        useStore.setState({ hoveredUnit: null })
        document.body.style.cursor = ''
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        const st = useStore.getState()
        if (st.mode !== 'masterplan' || e.delta > 6) return
        e.stopPropagation()
        const id = pick(e)
        if (id) st.selectUnit(id)
      }}
    />
  )
}
