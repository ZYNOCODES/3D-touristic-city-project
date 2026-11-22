// Turns a multi-material prototype (procedural PartMap or Blender GLB) into one
// InstancedMesh per material, with per-instance availability tint + hover glow.
import * as THREE from 'three'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { getMaterial, isKnownMaterial, normalizeName } from '../materials/library'
import { GLOBAL } from '../shared'
import { boxUV, type PartMap } from './build'

export interface Proto {
  parts: PartMap
  /** materials that came with the GLB and are not in the library (e.g. Poly Haven props) */
  custom: Map<string, THREE.Material>
}

export function gltfToProto(gltf: GLTF, root?: THREE.Object3D): Proto {
  const scene = root ?? gltf.scene
  scene.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(scene.matrixWorld).invert()
  const lists = new Map<string, THREE.BufferGeometry[]>()
  const custom = new Map<string, THREE.Material>()
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material as THREE.Material
    const key = isKnownMaterial(mat.name) ? normalizeName(mat.name) : `custom:${mat.name || mat.uuid}`
    if (key.startsWith('custom:')) custom.set(key, mat)
    let g = mesh.geometry.clone()
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld))
    if (g.index) g = g.toNonIndexed()
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k)
    if (!g.attributes.normal) g.computeVertexNormals()
    if (!g.attributes.uv) boxUV(g)
    if (!lists.has(key)) lists.set(key, [])
    lists.get(key)!.push(g)
  })
  const parts: PartMap = new Map()
  for (const [k, l] of lists) {
    // merge per material; keep uv only if every piece has it
    const g = mergeSafe(l)
    if (g) parts.set(k, g)
  }
  return { parts, custom }
}

function mergeSafe(list: THREE.BufferGeometry[]) {
  const pos: number[] = []
  const nrm: number[] = []
  const uv: number[] = []
  for (const g of list) {
    const p = g.attributes.position
    const n = g.attributes.normal
    const u = g.attributes.uv
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i))
      nrm.push(n.getX(i), n.getY(i), n.getZ(i))
      uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0)
    }
  }
  if (!pos.length) return null
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.computeBoundingSphere()
  return g
}

export const hoverUniform = { villa: { value: -1 }, apt: { value: -1 } }

/** Adds availability tint (instanced attribute aTint) + hover glow to a material. */
export function patchTint(mat: THREE.Material, hover: { value: number }) {
  if (mat.userData.__tint) return mat
  mat.userData.__tint = true
  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey()
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r)
    s.uniforms.uAvail = GLOBAL.uAvail
    s.uniforms.uHoverId = hover
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aTint;\nvarying vec4 vTint;\nvarying float vHover;\nuniform float uHoverId;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vTint = aTint;
        #ifdef USE_INSTANCING
          vHover = abs(float(gl_InstanceID) - uHoverId) < 0.5 ? 1.0 : 0.0;
        #else
          vHover = 0.0;
        #endif`,
      )
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec4 vTint;\nvarying float vHover;\nuniform float uAvail;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float tintK = vTint.a * uAvail * (0.62 + 0.3 * vHover);
        diffuseColor.rgb = mix(diffuseColor.rgb, vTint.rgb * 0.9, tintK);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += vTint.rgb * tintK * 0.45 + vec3(0.55, 0.85, 0.9) * vHover * 0.22;`,
      )
  }
  mat.customProgramCacheKey = () => prevKey + '|tint'
  return mat
}

export interface InstanceXform {
  position: THREE.Vector3
  rotationY: number
  scale: number
}

export function buildInstanced(proto: Proto, xforms: InstanceXform[], opts: { variant: string; hover: { value: number }; castShadow?: boolean }) {
  const group = new THREE.Group()
  const tint = new Float32Array(xforms.length * 4)
  const tintAttr = new THREE.InstancedBufferAttribute(tint, 4)
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const meshes: THREE.InstancedMesh[] = []
  for (const [name, geo] of proto.parts) {
    const base = name.startsWith('custom:') ? proto.custom.get(name)!.clone() : getMaterial(name, opts.variant)
    const mat = patchTint(base, opts.hover)
    const g = geo.clone()
    g.setAttribute('aTint', tintAttr)
    const im = new THREE.InstancedMesh(g, mat, xforms.length)
    xforms.forEach((x, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), x.rotationY)
      m4.compose(x.position, q, new THREE.Vector3(x.scale, x.scale, x.scale))
      im.setMatrixAt(i, m4)
    })
    im.computeBoundingSphere()
    const transparent = (mat as THREE.Material).transparent
    im.castShadow = (opts.castShadow ?? true) && !transparent && name !== 'glow'
    im.receiveShadow = !transparent
    im.name = name
    if (transparent) im.renderOrder = 2
    group.add(im)
    meshes.push(im)
  }
  return { group, meshes, tintAttr }
}
