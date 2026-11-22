// Named PBR material library shared by procedural and Blender-exported geometry.
// Blender materials are matched by name prefix (e.g. "plaster", "M_plaster.001").
import * as THREE from 'three'
import { applyPBR } from '../../lib/assets'
import { GLOBAL } from '../shared'
import { makeWaterMaterial } from './water'

export type MatName =
  | 'plaster' | 'roof' | 'glass' | 'wood' | 'deck' | 'stone' | 'frame' | 'water' | 'glow'
  | 'concrete' | 'paving' | 'asphalt' | 'fabric' | 'metal' | 'court' | 'rubber' | 'plastic_red'
  | 'plastic_yellow' | 'plastic_teal' | 'umbrella' | 'lamp' | 'marble' | 'walnut' | 'floor' | 'pooltile'
  | 'ceiling' | 'black' | 'cushion' | 'rope' | 'stucco' | 'travertine' | 'cladding' | 'stone_wall'
  | 'terracotta' | 'parquet' | 'terrazzo' | 'lawn' | 'foliage' | 'curtain' | 'dark_metal' | 'brass'

const cache = new Map<string, THREE.Material>()

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(p)
}

/** night-time emissive window glow, varied per instance */
function glowMaterial() {
  const m = std({ color: '#1b1a18', roughness: 0.6, emissive: new THREE.Color('#ffb36b'), emissiveIntensity: 0 })
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = GLOBAL.uNight
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying float vInst;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float on = step(0.28, fract(sin(vInst * 12.9898) * 43758.5453));
        totalEmissiveRadiance = vec3(1.0, 0.68, 0.38) * (uNight * 3.2 * on + 0.04);`,
      )
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vInst;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n#ifdef USE_INSTANCING\nvInst = float(gl_InstanceID);\n#else\nvInst = 1.0;\n#endif`)
  }
  m.customProgramCacheKey = () => 'glow'
  return m
}

export function getMaterial(name: MatName | string, variant = ''): THREE.Material {
  const key = normalizeName(name)
  const ck = key + '|' + variant
  if (cache.has(ck)) return cache.get(ck)!
  let m: THREE.Material
  switch (key) {
    case 'plaster': {
      const s = std({ color: '#f3efe8', roughness: 0.92 })
      // keep the plaster relief + roughness but not its greyish albedo
      applyPBR(s, 'plaster', 0.5, 0.45).then(() => {
        s.map = null
        s.needsUpdate = true
      })
      m = s
      break
    }
    case 'roof': {
      const s = std({ color: '#2f5a46', roughness: 0.48, metalness: 0.35 })
      applyPBR(s, 'roof', 0.6, 0.8).then(() => {
        s.map = null // keep the painted standing-seam colour, use only relief & roughness
        s.needsUpdate = true
      })
      m = s
      break
    }
    case 'glass': {
      // architectural low-iron glazing: see-through face-on, mirror-like at grazing angles
      const g = new THREE.MeshPhysicalMaterial({ color: '#6f8a90', metalness: 0.05, roughness: 0.015, transparent: true, opacity: 0.3, envMapIntensity: 1.9, specularIntensity: 1, ior: 1.52, depthWrite: false, side: THREE.DoubleSide })
      g.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader.replace(
          '#include <opaque_fragment>',
          `float fres = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 3.0);
          diffuseColor.a = mix(diffuseColor.a, 0.96, fres);
          #include <opaque_fragment>`,
        )
      }
      g.customProgramCacheKey = () => 'glass-fresnel'
      m = g
      break
    }
    case 'stucco': {
      const s2 = std({ color: '#f2efe9', roughness: 0.9 })
      applyPBR(s2, 'stucco', 0.5, 0.5).then(() => {
        s2.map = null
        s2.needsUpdate = true
      })
      m = s2
      break
    }
    case 'travertine': {
      const s2 = std({ color: '#efe4d2', roughness: 0.75 })
      applyPBR(s2, 'travertine', 0.35, 0.6)
      m = s2
      break
    }
    case 'cladding': {
      const s2 = std({ color: '#e8c9a6', roughness: 0.55 })
      applyPBR(s2, 'cladding', 0.5, 0.6)
      m = s2
      break
    }
    case 'stone_wall': {
      const s2 = std({ color: '#f0e6d8', roughness: 0.85 })
      applyPBR(s2, 'stone_wall', 0.35, 1.0)
      m = s2
      break
    }
    case 'terracotta': {
      const s2 = std({ color: '#ffd2b8', roughness: 0.6 })
      applyPBR(s2, 'terracotta', 0.5, 0.6)
      m = s2
      break
    }
    case 'parquet': {
      const s2 = std({ color: '#f2e2cf', roughness: 0.45 })
      applyPBR(s2, 'parquet', 0.5, 0.5)
      m = s2
      break
    }
    case 'terrazzo': {
      const s2 = std({ color: '#ffffff', roughness: 0.3 })
      applyPBR(s2, 'terrazzo', 0.5, 0.4)
      m = s2
      break
    }
    case 'lawn': {
      const s2 = std({ color: '#b7cf9a', roughness: 0.95 })
      applyPBR(s2, 'lawn', 0.3, 0.8)
      m = s2
      break
    }
    case 'foliage':
      m = std({ color: '#2f5222', roughness: 0.6, side: THREE.DoubleSide })
      break
    case 'curtain':
      m = std({ color: '#efe6d6', roughness: 1, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false })
      break
    case 'dark_metal':
      m = std({ color: '#1d1f21', roughness: 0.35, metalness: 0.8 })
      break
    case 'brass':
      m = std({ color: '#c9a15e', roughness: 0.25, metalness: 1 })
      break
    case 'wood': {
      const s = std({ color: '#d9b38a', roughness: 0.6 })
      applyPBR(s, 'oak', 0.6, 0.7)
      m = s
      break
    }
    case 'deck': {
      const s = std({ color: '#e2c7a6', roughness: 0.72 })
      applyPBR(s, 'oak', 0.35, 0.8)
      m = s
      break
    }
    case 'stone': {
      const s = std({ color: '#cfc5b5', roughness: 0.85 })
      applyPBR(s, 'stone_floor', 0.3, 0.6)
      m = s
      break
    }
    case 'paving': {
      const s = std({ color: '#e8e0d2', roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      applyPBR(s, 'paving', 0.25, 0.7)
      m = s
      break
    }
    case 'asphalt': {
      const s = std({ color: '#7b7a78', roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
      applyPBR(s, 'asphalt', 0.12, 0.6)
      m = s
      break
    }
    case 'frame':
      m = std({ color: '#2b2b2a', roughness: 0.4, metalness: 0.6 })
      break
    case 'metal':
      m = std({ color: '#b9bbbd', roughness: 0.3, metalness: 0.9 })
      break
    case 'black':
      m = std({ color: '#1a1a1a', roughness: 0.5 })
      break
    case 'concrete':
      m = std({ color: '#d6d2cb', roughness: 0.9 })
      break
    case 'water':
      m = makeWaterMaterial({ kind: 'pool', opacity: 0.88 })
      break
    case 'pooltile': {
      const s = std({ color: '#bfe8f0', roughness: 0.35 })
      applyPBR(s, 'pool_tiles', 0.5, 0.5)
      m = s
      break
    }
    case 'glow':
      m = glowMaterial()
      break
    case 'fabric':
    case 'cushion': {
      const s = std({ color: key === 'cushion' ? '#efe8dc' : '#e6dfd3', roughness: 0.95 })
      // linen relief/roughness only — its albedo is too blue for the warm palette
      applyPBR(s, 'linen', 1.2, 0.5).then(() => {
        s.map = null
        s.color.set(key === 'cushion' ? '#f1ebe1' : '#e4dacb')
        s.needsUpdate = true
      })
      m = s
      break
    }
    case 'court':
      m = std({ color: '#3f8a5c', roughness: 0.8 })
      break
    case 'rubber': {
      const s = std({ color: '#d58a5b', roughness: 0.95 })
      applyPBR(s, 'rubber', 0.3, 0.4).then(() => s.color.set('#e7a074'))
      m = s
      break
    }
    case 'plastic_red':
      m = std({ color: '#e0483a', roughness: 0.35 })
      break
    case 'plastic_yellow':
      m = std({ color: '#f2b53a', roughness: 0.35 })
      break
    case 'plastic_teal':
      m = std({ color: '#2fa59a', roughness: 0.35 })
      break
    case 'umbrella':
      m = std({ color: '#f3ede2', roughness: 0.9, side: THREE.DoubleSide })
      break
    case 'rope':
      m = std({ color: '#cbb48f', roughness: 0.9 })
      break
    case 'lamp': {
      const s = std({ color: '#fff3df', emissive: new THREE.Color('#ffcf8a'), emissiveIntensity: 0.1, roughness: 0.4 })
      s.onBeforeCompile = (sh) => {
        sh.uniforms.uNight = GLOBAL.uNight
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform float uNight;')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= 1.0 + uNight * 60.0;')
      }
      s.customProgramCacheKey = () => 'lamp'
      m = s
      break
    }
    case 'marble': {
      const s = std({ color: '#f4f1ec', roughness: 0.25 })
      applyPBR(s, 'marble', 0.6, 0.3)
      m = s
      break
    }
    case 'walnut': {
      const s = std({ color: '#8a6446', roughness: 0.5 })
      applyPBR(s, 'walnut', 0.8, 0.5)
      m = s
      break
    }
    case 'floor': {
      const s = std({ color: '#e9e2d6', roughness: 0.4 })
      applyPBR(s, 'stone_floor', 0.4, 0.4)
      m = s
      break
    }
    case 'ceiling':
      m = std({ color: '#f6f3ee', roughness: 0.95 })
      break
    default:
      m = std({ color: '#cccccc', roughness: 0.8 })
  }
  m.name = key
  cache.set(ck, m)
  return m
}

const KNOWN = ['plaster', 'roof', 'glass', 'wood', 'deck', 'stone', 'frame', 'water', 'glow', 'concrete', 'paving', 'asphalt', 'fabric', 'metal', 'court', 'rubber', 'plastic_red', 'plastic_yellow', 'plastic_teal', 'umbrella', 'lamp', 'marble', 'walnut', 'floor', 'pooltile', 'ceiling', 'black', 'cushion', 'rope', 'stucco', 'travertine', 'cladding', 'stone_wall', 'terracotta', 'parquet', 'terrazzo', 'lawn', 'foliage', 'curtain', 'dark_metal', 'brass']

export function normalizeName(n: string) {
  const s = n.toLowerCase().replace(/^m_/, '').replace(/\.\d+$/, '')
  if (KNOWN.includes(s)) return s
  let best = ''
  for (const k of KNOWN) if (s.startsWith(k) && k.length > best.length) best = k
  return best || s
}
export const isKnownMaterial = (n: string) => KNOWN.includes(normalizeName(n))
