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
  | 'ceiling' | 'black' | 'cushion' | 'rope'

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
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ color: '#9fb7bd', metalness: 0, roughness: 0.04, transmission: 0, transparent: true, opacity: 0.55, envMapIntensity: 1.6, specularIntensity: 1, ior: 1.5, depthWrite: false })
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

const KNOWN = ['plaster', 'roof', 'glass', 'wood', 'deck', 'stone', 'frame', 'water', 'glow', 'concrete', 'paving', 'asphalt', 'fabric', 'metal', 'court', 'rubber', 'plastic_red', 'plastic_yellow', 'plastic_teal', 'umbrella', 'lamp', 'marble', 'walnut', 'floor', 'pooltile', 'ceiling', 'black', 'cushion', 'rope']

export function normalizeName(n: string) {
  const s = n.toLowerCase().replace(/^m_/, '').replace(/\.\d+$/, '')
  for (const k of KNOWN) if (s === k || s.startsWith(k)) return k
  return s
}
export const isKnownMaterial = (n: string) => KNOWN.includes(normalizeName(n))
