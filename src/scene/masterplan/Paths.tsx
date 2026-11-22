// Roads and footpaths as terrain-hugging ribbons (curbs for the road).
import { useMemo } from 'react'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { height } from '../../lib/heightfield'
import { getMaterial } from '../materials/library'

export function pathCurve(points: number[][]) {
  return new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal')
}

function ribbon(points: number[][], width: number, lift: number, across = 4) {
  const curve = pathCurve(points)
  const len = curve.getLength()
  const n = Math.max(2, Math.ceil(len / 1.6))
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  const p = new THREE.Vector3()
  const t = new THREE.Vector3()
  for (let i = 0; i <= n; i++) {
    const u = i / n
    curve.getPointAt(u, p)
    curve.getTangentAt(u, t)
    const nx = -t.z
    const nz = t.x
    for (let k = 0; k <= across; k++) {
      const s = (k / across - 0.5) * width
      const x = p.x + nx * s
      const z = p.z + nz * s
      pos.push(x, height(x, z) + lift, z)
      uv.push(s, u * len)
    }
    if (i < n) {
      for (let k = 0; k < across; k++) {
        const a = i * (across + 1) + k
        const b = a + across + 1
        idx.push(a, b, a + 1, a + 1, b, b + 1)
      }
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}

export function Paths() {
  const meshes = useMemo(() => {
    const out: { geo: THREE.BufferGeometry; mat: THREE.Material }[] = []
    for (const p of layout.paths) {
      if (p.kind === 'road') {
        out.push({ geo: ribbon(p.points, p.width, 0.14, 6), mat: getMaterial('asphalt') })
        out.push({ geo: ribbon(p.points, p.width + 1.6, 0.1, 6), mat: getMaterial('paving') })
      } else {
        out.push({ geo: ribbon(p.points, p.width, 0.12, 3), mat: getMaterial('paving') })
      }
    }
    return out
  }, [])
  return (
    <group name="paths">
      {meshes.map((m, i) => (
        <mesh key={i} geometry={m.geo} material={m.mat} receiveShadow />
      ))}
    </group>
  )
}
