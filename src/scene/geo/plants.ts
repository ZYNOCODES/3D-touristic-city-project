// Procedural plant geometry (merged, vertex-coloured, with an `aSway` attribute
// that tells the wind shader how much each vertex may move).
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

function prng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function finish(g: THREE.BufferGeometry, color: THREE.Color, sway: (y: number, x: number, z: number) => number, ao?: (y: number) => number) {
  g.deleteAttribute('uv')
  const pos = g.attributes.position
  const col = new Float32Array(pos.count * 3)
  const sw = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    const k = ao ? ao(y) : 1
    col[i * 3] = color.r * k
    col[i * 3 + 1] = color.g * k
    col[i * 3 + 2] = color.b * k
    sw[i] = sway(y, pos.getX(i), pos.getZ(i))
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1))
  return g
}

function blob(r: number, detail: number, rnd: () => number, squash = 0.72) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(r, detail)
  g.deleteAttribute('uv')
  g.deleteAttribute('normal')
  g = mergeVertices(g)
  const p = g.attributes.position
  const ox = rnd() * 10
  for (let i = 0; i < p.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(p, i)
    const n = Math.sin(v.x * 1.7 + ox) * Math.cos(v.z * 1.9 - ox) * Math.sin(v.y * 2.3 + ox * 0.5)
    v.multiplyScalar(1 + n * 0.16 + (rnd() - 0.5) * 0.1)
    v.y *= squash
    p.setXYZ(i, v.x, v.y, v.z)
  }
  g.computeVertexNormals()
  return g
}

/** Broadleaf rainforest tree, ~1 unit = 1 m. variant 0: tall emergent, 1: round, 2: umbrella */
export function broadleafTree(variant: number, lod: 0 | 1 = 0) {
  const rnd = prng(17 + variant * 101)
  const H = [11, 7.5, 8][variant]
  const parts: THREE.BufferGeometry[] = []
  const trunkH = H * (variant === 2 ? 0.5 : 0.42)
  const trunk = new THREE.CylinderGeometry(0.16 + variant * 0.03, 0.34, trunkH, lod ? 4 : 7, 3, true)
  trunk.translate(0, trunkH / 2, 0)
  const tp = trunk.attributes.position
  for (let i = 0; i < tp.count; i++) tp.setX(i, tp.getX(i) + Math.pow(tp.getY(i) / trunkH, 2) * 0.5)
  trunk.computeVertexNormals()
  parts.push(finish(trunk.toNonIndexed(), new THREE.Color(0.32, 0.26, 0.2), (y) => Math.pow(y / H, 2) * 0.5))

  const n = lod ? 2 : variant === 2 ? 6 : 6
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd()
    const spread = variant === 2 ? 2.6 : 1.9
    const r = (variant === 2 ? 2.2 : 2.1) * (0.75 + rnd() * 0.5) * (lod ? 1.7 : 1)
    const b = blob(r, lod ? 0 : 1, rnd, variant === 2 ? 0.5 : 0.75)
    const cy = trunkH + (variant === 0 ? 1.8 : 1.2) + (i === 0 ? 1.6 : rnd() * 1.4) - (variant === 2 ? 0.6 : 0)
    b.translate(Math.cos(a) * spread * (i === 0 ? 0.2 : 1) + 0.4, cy, Math.sin(a) * spread * (i === 0 ? 0.2 : 1))
    const green = new THREE.Color().setHSL(0.25 + rnd() * 0.07, 0.42 + rnd() * 0.18, 0.13 + rnd() * 0.07)
    parts.push(finish(b.toNonIndexed(), green, (y) => Math.pow(y / H, 2), (y) => THREE.MathUtils.clamp(0.45 + ((y - trunkH) / 4) * 0.7, 0.4, 1.15)))
  }
  if (!lod && variant === 0) {
    const crown = blob(2.6, 1, rnd, 0.6)
    crown.translate(0.6, H + 0.6, 0)
    parts.push(finish(crown.toNonIndexed(), new THREE.Color().setHSL(0.22, 0.5, 0.25), (y) => Math.pow(y / H, 2), () => 1.1))
  }
  const g = mergeGeometries(parts)!
  g.computeBoundingSphere()
  return g
}

/** Coconut-style palm with arching, double-sided fronds. */
export function palmTree(seed = 3) {
  const rnd = prng(seed)
  const H = 9
  const parts: THREE.BufferGeometry[] = []
  // curved trunk built from a tube
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 8; i++) {
    const t = i / 8
    pts.push(new THREE.Vector3(Math.sin(t * 1.4) * 1.1, t * H, 0))
  }
  const curve = new THREE.CatmullRomCurve3(pts)
  const trunk = new THREE.TubeGeometry(curve, 14, 0.2, 6, false)
  const tp = trunk.attributes.position
  // ring bumps & taper
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i)
    const c = curve.getPointAt(Math.min(1, Math.max(0, y / H)))
    const k = 1.25 - (y / H) * 0.35 + (Math.sin(y * 9) > 0.7 ? 0.08 : 0)
    tp.setX(i, c.x + (tp.getX(i) - c.x) * k)
    tp.setZ(i, tp.getZ(i) * k)
  }
  trunk.computeVertexNormals()
  parts.push(finish(trunk.toNonIndexed(), new THREE.Color(0.45, 0.38, 0.3), (y) => Math.pow(y / H, 2) * 0.6))
  const top = curve.getPointAt(1)
  const fronds = 11
  for (let f = 0; f < fronds; f++) {
    const yaw = (f / fronds) * Math.PI * 2 + rnd() * 0.3
    const len = 4.2 + rnd() * 1.4
    const lift = 0.5 + rnd() * 0.6
    const seg = 9
    const verts: number[] = []
    const idx: number[] = []
    for (let s = 0; s <= seg; s++) {
      const t = s / seg
      const x = t * len
      const y = lift * Math.sin(t * Math.PI * 0.7) * 1.6 - t * t * 2.6
      const w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.75 + 0.05
      const droop = -w * 0.45
      verts.push(x, y, 0, x, y + droop, w, x, y + droop, -w)
      if (s < seg) {
        const a = s * 3
        idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a, a + 2, a + 3, a + 2, a + 5, a + 3)
      }
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3))
    g.setIndex(idx)
    g.rotateY(yaw)
    g.translate(top.x, top.y, top.z)
    g.computeVertexNormals()
    const green = new THREE.Color().setHSL(0.2 + rnd() * 0.04, 0.5, 0.26 + rnd() * 0.06)
    parts.push(finish(g.toNonIndexed(), green, (y, x, z) => 0.6 + Math.hypot(x - top.x, z - top.z) * 0.25, () => 1))
  }
  const g = mergeGeometries(parts)!
  g.computeBoundingSphere()
  return g
}

/** Low shrub / flowering bush (instance colour tints the foliage). */
export function shrub(seed = 5) {
  const rnd = prng(seed)
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 3; i++) {
    const b = blob(0.7 + rnd() * 0.4, 1, rnd, 0.7)
    b.translate((rnd() - 0.5) * 1.1, 0.55 + rnd() * 0.2, (rnd() - 0.5) * 1.1)
    parts.push(finish(b.toNonIndexed(), new THREE.Color(0.9, 0.9, 0.9), (y) => y * 0.15, (y) => THREE.MathUtils.clamp(0.55 + y * 0.45, 0.5, 1.1)))
  }
  return mergeGeometries(parts)!
}

/** Patches a MeshStandardMaterial with wind sway, leaf-cluster normal noise and back-light translucency. */
export function patchFoliage(mat: THREE.MeshStandardMaterial, uniforms: { uTime: { value: number }; uWind: { value: number }; uSunDir: { value: THREE.Vector3 }; uSunColor: { value: THREE.Color }; uNight: { value: number } }, opts: { leafNoise?: number; flutter?: number } = {}) {
  const leaf = opts.leafNoise ?? 1
  const flutter = opts.flutter ?? 1
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSway; uniform float uTime; uniform float uWind; varying vec3 vWPos; varying float vSway;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = dot(ip.xz, vec2(0.13, 0.071));
        float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ip.x * 0.004);
        float sway = (sin(uTime * 1.25 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.22) * aSway * 0.22 * uWind * gust;
        float flut = sin(uTime * 7.0 + position.x * 3.0 + position.z * 2.0 + ph) * 0.045 * aSway * ${flutter.toFixed(2)};
        transformed.x += sway + flut;
        transformed.z += sway * 0.6 + flut;
        transformed.y += flut * 0.5;
        vSway = aSway;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        #endif`,
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos; varying float vSway; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uNight;
        float lh(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float ln3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
          return mix(mix(mix(lh(i),lh(i+vec3(1,0,0)),f.x),mix(lh(i+vec3(0,1,0)),lh(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(lh(i+vec3(0,0,1)),lh(i+vec3(1,0,1)),f.x),mix(lh(i+vec3(0,1,1)),lh(i+vec3(1,1,1)),f.x),f.y),f.z); }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float e = 0.35;
          vec3 q = vWPos * 2.3;
          vec3 gN = vec3(ln3(q+vec3(e,0,0))-ln3(q-vec3(e,0,0)), ln3(q+vec3(0,e,0))-ln3(q-vec3(0,e,0)), ln3(q+vec3(0,0,e))-ln3(q-vec3(0,0,e)));
          normal = normalize(normal + (viewMatrix * vec4(gN, 0.0)).xyz * 2.1 * ${leaf.toFixed(2)} * step(0.15, vSway));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float clump = ln3(vWPos * 0.9) * 0.6 + ln3(vWPos * 3.1) * 0.4;
        diffuseColor.rgb *= mix(0.6, 1.25, clump * step(0.15, vSway) + (1.0 - step(0.15, vSway))*0.5);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 Vd = normalize(cameraPosition - vWPos);
        float back = pow(max(dot(Vd, -uSunDir), 0.0), 3.0) * step(0.15, vSway);
        totalEmissiveRadiance += diffuseColor.rgb * uSunColor * back * 0.55 * (1.0 - uNight);`,
      )
  }
  mat.customProgramCacheKey = () => `foliage-${leaf}-${flutter}`
  return mat
}
