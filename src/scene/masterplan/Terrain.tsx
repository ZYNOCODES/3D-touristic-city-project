import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { baseHeight, height } from '../../lib/heightfield'
import { loadTexture } from '../../lib/assets'
import { GLOBAL, GLSL_NOISE } from '../shared'
import { HOLE_BOUNDS, INTERIOR_HOLE, buildHoleTexture } from './terrainHoles'

const INNER = { cx: 0, cz: -60, size: 1100, step: 2.5 }
const OUTER = { size: 7000, step: 25 }

// distance from point to the paths/pads, used to paint lawns & clearings
function clearing(x: number, z: number) {
  let c = 0
  for (const p of layout.pads) {
    const d = Math.hypot((x - p.x) / (p.rx + 9), (z - p.z) / (p.rz + 9))
    if (d < 1.4) c = Math.max(c, 1 - Math.max(0, d - 0.75) / 0.65)
  }
  return c
}

function buildInner() {
  const n = Math.round(INNER.size / INNER.step)
  const g = new THREE.PlaneGeometry(INNER.size, INNER.size, n, n)
  g.rotateX(-Math.PI / 2)
  g.translate(INNER.cx, 0, INNER.cz)
  const pos = g.attributes.position as THREE.BufferAttribute
  const clear = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, height(x, z))
    clear[i] = clearing(x, z)
  }
  g.setAttribute('aClear', new THREE.BufferAttribute(clear, 1))
  g.computeVertexNormals()
  return g
}

function buildOuter() {
  const n = Math.round(OUTER.size / OUTER.step)
  const g = new THREE.PlaneGeometry(OUTER.size, OUTER.size, n, n)
  g.rotateX(-Math.PI / 2)
  g.translate(0, 0, 1200)
  const pos = g.attributes.position as THREE.BufferAttribute
  const half = INNER.size / 2
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    const inside = Math.abs(x - INNER.cx) < half - 1 && Math.abs(z - INNER.cz) < half - 1
    pos.setY(i, baseHeight(x, z) - (inside ? 30 : 0))
  }
  g.setAttribute('aClear', new THREE.BufferAttribute(new Float32Array(pos.count).fill(-1), 1))
  g.computeVertexNormals()
  return g
}

export function makeTerrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 })
  const blank = (c: string) => {
    const t = new THREE.DataTexture(new Uint8Array([...new THREE.Color(c).toArray().map((v) => v * 255), 255]), 1, 1)
    t.needsUpdate = true
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const uniforms = {
    tGrass: { value: blank('#5f7a3a') as THREE.Texture },
    tForest: { value: blank('#3e4a26') as THREE.Texture },
    tRock: { value: blank('#7d7466') as THREE.Texture },
    tSand: { value: blank('#d9c6a0') as THREE.Texture },
    uHasTex: { value: 0 },
    tHoles: { value: buildHoleTexture() as THREE.Texture },
    uHoleBounds: { value: new THREE.Vector3(HOLE_BOUNDS.x0, HOLE_BOUNDS.z0, HOLE_BOUNDS.size) },
    ...INTERIOR_HOLE,
  }
  ;(['grass', 'forest', 'rock', 'sand'] as const).forEach((k) => {
    loadTexture(`terrain_${k}`, 'diff').then((t) => {
      if (!t) return
      const key = ('t' + k[0].toUpperCase() + k.slice(1)) as keyof typeof uniforms
      ;(uniforms[key] as { value: THREE.Texture }).value = t
      uniforms.uHasTex.value = 1
    })
  })
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms, { uNight: GLOBAL.uNight })
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aClear;\nvarying vec3 vWPos;\nvarying vec3 vWNrm;\nvarying float vClear;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);\nvClear = aClear;',
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\nuniform sampler2D tGrass, tForest, tRock, tSand, tHoles; uniform float uHasTex; uniform vec3 uHoleBounds;\nuniform float uHoleOn, uHoleRot; uniform vec2 uHoleCenter; uniform vec4 uHoleRect;\nvarying vec3 vWPos; varying vec3 vWNrm; varying float vClear;\n${GLSL_NOISE}
vec3 tri(sampler2D t, vec2 p){ return mix(texture2D(t, p*0.045).rgb, texture2D(t, p*0.0113 + 0.37).rgb, 0.45); }`,
      )
      .replace(
        '#include <map_fragment>',
        `
        vec2 wp = vWPos.xz;
        vec2 huv = (wp - uHoleBounds.xy) / uHoleBounds.z;
        if (vClear >= 0.0 && huv.x > 0.0 && huv.y > 0.0 && huv.x < 1.0 && huv.y < 1.0 && texture2D(tHoles, huv).r > 0.5) discard;
        if (uHoleOn > 0.5) {
          vec2 d = wp - uHoleCenter;
          float c = cos(uHoleRot); float s = sin(uHoleRot);
          vec2 l = vec2(d.x * c - d.y * s, d.x * s + d.y * c);
          if (l.x > uHoleRect.x && l.x < uHoleRect.y && l.y > uHoleRect.z && l.y < uHoleRect.w) discard;
        }
        float h = vWPos.y;
        float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);
        float macro = vfbm(wp * 0.004);
        float micro = vnoise(wp * 0.15);
        vec3 grass = tri(tGrass, wp) * mix(vec3(0.62,0.86,0.46), vec3(0.78,0.92,0.55), macro);
        vec3 forest = mix(tri(tForest, wp) * vec3(0.3, 0.36, 0.2), tri(tGrass, wp) * vec3(0.55, 0.62, 0.38), 0.45);
        vec3 rock = tri(tRock, wp) * vec3(0.95, 0.92, 0.86);
        vec3 sand = mix(texture2D(tSand, wp*0.08).rgb, texture2D(tSand, wp*0.017).rgb, 0.5) * vec3(1.04,1.0,0.94);
        if (uHasTex < 0.5) { grass *= 0.9 + 0.2*micro; forest *= 0.85 + 0.3*micro; rock *= 0.85 + 0.3*micro; sand *= 0.95 + 0.1*micro; }
        // lawns around buildings, forest floor elsewhere
        vec3 col = mix(forest, grass, clamp(vClear * 1.2, 0.0, 1.0));
        col = mix(col, grass * 0.7, smoothstep(0.6, 0.8, macro) * 0.25);
        col = mix(col, rock, smoothstep(0.42, 0.62, slope + micro*0.08));
        float beach = 1.0 - smoothstep(2.2, 3.4, h + macro*0.8);
        float wet = 1.0 - smoothstep(-0.2, 0.6, h);
        col = mix(col, sand, beach);
        col = mix(col, sand * vec3(0.62, 0.6, 0.56), wet);
        col = mix(col, col * vec3(0.55, 0.62, 0.62), 1.0 - smoothstep(-6.0, -0.5, h)); // seabed
        diffuseColor.rgb *= col;
        `,
      )
  }
  mat.customProgramCacheKey = () => 'terrain-v3'
  return mat
}

/** Ocean-depth texture (metres below sea level) for the water shader. */
export const DEPTH_BOUNDS = { x0: -1700, x1: 1700, z0: -100, z1: 3300 }
export function buildDepthTexture(res = 320) {
  const data = new Float32Array(res * res)
  const { x0, x1, z0, z1 } = DEPTH_BOUNDS
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const x = x0 + ((i + 0.5) / res) * (x1 - x0)
      const z = z0 + ((j + 0.5) / res) * (z1 - z0)
      data[j * res + i] = -baseHeight(x, z)
    }
  }
  const t = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.FloatType)
  t.magFilter = THREE.LinearFilter
  t.minFilter = THREE.LinearFilter
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
  t.needsUpdate = true
  return t
}

export function Terrain() {
  const { inner, outer, mat } = useMemo(() => ({ inner: buildInner(), outer: buildOuter(), mat: makeTerrainMaterial() }), [])
  useEffect(
    () => () => {
      inner.dispose()
      outer.dispose()
      mat.dispose()
    },
    [inner, outer, mat],
  )
  return (
    <group name="terrain">
      <mesh geometry={inner} material={mat} receiveShadow castShadow={false} />
      <mesh geometry={outer} material={mat} receiveShadow={false} />
    </group>
  )
}
