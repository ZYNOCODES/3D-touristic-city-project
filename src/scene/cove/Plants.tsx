// Aleppo pines, mastic and rosemary (blender/cove_plants.py): light card trees near the cove, impostors on the hills.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { loadGLTFUrl } from '../../lib/assets'
import plan from '../../data/generated/plants.json'
import { GLOBAL } from '../shared'
import { buildImpostorGroup, type ImpostorMeta } from '../vegetation/impostor'
import { quality } from './quality'

type P = [number, number, number, number, number]
const PLAN = plan as unknown as Record<string, P[]>
const BASE = import.meta.env.BASE_URL

const WIND = /* glsl */ `
  #ifdef USE_INSTANCING
  vec3 wOrg = instanceMatrix[3].xyz;
  #else
  vec3 wOrg = vec3(0.0);
  #endif
  float wk = smoothstep(0.2, 6.0, position.y + 0.4);
  float ph = uTime * 1.25 + wOrg.x * 0.31 + wOrg.z * 0.23;
  transformed.x += (sin(ph) * 0.05 + sin(ph * 2.7 + position.y * 2.0 + position.x * 3.0) * 0.022) * wk;
  transformed.z += (cos(ph * 0.83) * 0.04 + sin(ph * 2.1 + position.x * 2.3) * 0.02) * wk;`

function leafMaterial(map: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({ map, alphaTest: 0.36, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.5 })
  m.onBeforeCompile = (s) => {
    s.uniforms.uTime = GLOBAL.uTime
    s.uniforms.uSunDir = GLOBAL.uSunDir
    s.uniforms.uSunColor = GLOBAL.uSunColor
    s.uniforms.uNight = GLOBAL.uNight
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; varying vec3 vLp; varying float vTone; varying float vIn;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
        { vec4 lp = vec4(transformed, 1.0); vTone = 0.5;
        #ifdef USE_INSTANCING
        lp = instanceMatrix * lp; vTone = fract(sin(instanceMatrix[3].x * 12.9 + instanceMatrix[3].z * 78.2) * 43758.5);
        #endif
        vLp = (modelMatrix * lp).xyz; vIn = clamp(length(position.xz) * 0.35 + position.y * 0.05, 0.0, 1.0); }`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uSunDir, uSunColor; uniform float uNight; varying vec3 vLp; varying float vTone; varying float vIn;')
      .replace('#include <map_fragment>', `
        vec4 tx = texture2D(map, vMapUv);
        // keep coverage when the atlas is minified
        tx.a *= 1.0 + 0.22 * max(0.0, log2(max(length(dFdx(vMapUv)), length(dFdy(vMapUv))) * 1024.0));
        diffuseColor *= tx;
        diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.18)) * mix(vec3(0.72, 0.84, 0.66), vec3(1.0, 0.94, 0.66), vTone) * mix(0.5, 1.0, vIn);`)
      // keep the puffy crown normals on both faces of the cards
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal); nonPerturbedNormal = normal;')
      .replace('#include <opaque_fragment>', `
        vec3 V = normalize(cameraPosition - vLp);
        float back = pow(max(dot(-V, uSunDir), 0.0), 4.0) * 0.5 + 0.05;
        outgoingLight += diffuseColor.rgb * uSunColor * back * reflectedLight.directDiffuse.g / max(diffuseColor.g, 0.02) * 0.3 * (1.0 - uNight);
        #include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'cove-leaf'
  return m
}

function leafDepth(map: THREE.Texture) {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.36, side: THREE.DoubleSide })
  d.onBeforeCompile = (s) => {
    s.uniforms.uTime = GLOBAL.uTime
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>\n${WIND}`)
  }
  return d
}

export function Plants() {
  const [near, setNear] = useState<THREE.Group | null>(null)
  const [far, setFar] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let on = true
    ;(async () => {
      const [g, map] = await Promise.all([loadGLTFUrl('models/cove_plants.glb'), new THREE.TextureLoader().loadAsync(BASE + 'textures/cove/clumps.webp')])
      if (!g || !on) return
      map.colorSpace = THREE.SRGBColorSpace
      map.flipY = false
      map.anisotropy = 4
      const leaf = leafMaterial(map)
      const depth = leafDepth(map)
      const bark = new THREE.MeshStandardMaterial({ color: '#75655a', roughness: 1, envMapIntensity: 0.7 })
      const out = new THREE.Group()
      out.name = 'plants'
      const dummy = new THREE.Object3D()
      const keep = quality.foliage
      g.scene.updateMatrixWorld(true)
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const sp = Object.keys(PLAN).find((k) => m.name.startsWith(k) || m.parent?.name.startsWith(k))
        if (!sp) return
        const isLeaf = /clump/.test((m.material as THREE.Material).name)
        const tree = sp.startsWith('aleppo')
        // spatial chunks for culling
        const chunks = new Map<string, P[]>()
        PLAN[sp].forEach((p, i) => {
          if (!tree && ((i * 0.618) % 1) > keep) return
          const k = `${Math.floor(p[0] / 70)},${Math.floor(p[2] / 90)}`
          if (!chunks.has(k)) chunks.set(k, [])
          chunks.get(k)!.push(p)
        })
        for (const list of chunks.values()) {
          const im = new THREE.InstancedMesh(m.geometry, isLeaf ? leaf : bark, list.length)
          list.forEach((p, i) => {
            dummy.position.set(p[0], p[1], p[2])
            dummy.rotation.set(0, p[4], 0)
            dummy.scale.setScalar(p[3])
            dummy.updateMatrix()
            im.setMatrixAt(i, dummy.matrix)
          })
          im.castShadow = tree || quality.tier === 'high'
          im.receiveShadow = true
          if (isLeaf) im.customDepthMaterial = depth
          im.computeBoundingSphere()
          out.add(im)
        }
      })
      setNear(out)
    })()
    ;(async () => {
      const r = await fetch(BASE + 'models/vegetation/cove.json')
      const meta = (await r.json()) as Record<string, ImpostorMeta>
      const l = new THREE.TextureLoader()
      const g = new THREE.Group()
      g.name = 'far-plants'
      const map: Record<string, string> = { far_a: 'aleppo_a', far_b: 'aleppo_b', far_s: 'mastic_b' }
      for (const [k, sp] of Object.entries(map)) {
        const t = await l.loadAsync(BASE + meta[sp].atlas)
        t.colorSpace = THREE.SRGBColorSpace
        t.anisotropy = 2
        const list = PLAN[k].filter((_, i) => ((i * 0.618) % 1) < Math.min(1, quality.foliage + 0.15)).map(([x, y, z, s, rot]) => ({ x, y, z, s, r: rot }))
        g.add(buildImpostorGroup(k, meta[sp], t, list, { shadow: false, chunk: 420, tint: k === 'far_s' ? new THREE.Color(0.8, 0.86, 0.66) : new THREE.Color(0.66, 0.74, 0.5) }))
      }
      if (on) setFar(g)
    })()
    return () => {
      on = false
    }
  }, [])
  return (
    <>
      {near && <primitive object={near} />}
      {far && <primitive object={far} />}
    </>
  )
}
