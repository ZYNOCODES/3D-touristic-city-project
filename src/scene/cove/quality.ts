// Quality tiers. Detected once from the device, adjustable from the HUD or ?q=low|medium|high,
// and stepped down automatically when the measured frame rate stays low (see AutoQuality).
import * as THREE from 'three'

export type Tier = 'low' | 'medium' | 'high'

export interface Quality {
  tier: Tier
  dpr: number
  shadow: number
  post: boolean
  ao: boolean
  planar: number // reflection resolution factor, 0 = static probe
  people: number
  texture: number // max texture size for characters
  foliage: number // density multiplier
  fps: number
}

const T: Record<Tier, Quality> = {
  low: { tier: 'low', dpr: 1, shadow: 1024, post: false, ao: false, planar: 0, people: 0.5, texture: 256, foliage: 0.55, fps: 30 },
  medium: { tier: 'medium', dpr: 1.25, shadow: 2048, post: true, ao: false, planar: 0.35, people: 0.8, texture: 512, foliage: 0.8, fps: 60 },
  high: { tier: 'high', dpr: 1.75, shadow: 4096, post: true, ao: true, planar: 0.5, people: 1, texture: 1024, foliage: 1, fps: 60 },
}

function detect(): Tier {
  const q = new URLSearchParams(location.search).get('q') as Tier | null
  if (q && T[q]) return q
  try {
    const saved = localStorage.getItem('quality') as Tier | null
    if (saved && T[saved]) return saved
  } catch {
    /* private mode */
  }
  const nav = navigator as Navigator & { deviceMemory?: number }
  const phone = /Android|iPhone|iPad|Mobile/i.test(nav.userAgent) || (matchMedia('(pointer: coarse)').matches && innerWidth < 1100)
  const mem = nav.deviceMemory ?? 8
  const cores = nav.hardwareConcurrency ?? 8
  let gpu = ''
  try {
    const gl = document.createElement('canvas').getContext('webgl2')!
    const e = gl.getExtension('WEBGL_debug_renderer_info')
    gpu = e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  } catch {
    return 'low'
  }
  if (/SwiftShader|llvmpipe|Basic Render/i.test(gpu)) return 'low'
  if (phone) return mem >= 8 && cores >= 8 ? 'medium' : 'low'
  if (mem <= 4 || cores <= 4) return 'low'
  if (/Intel(?!.*Arc)/i.test(gpu)) return 'medium'
  return 'high'
}

export const quality: Quality = { ...T[detect()] }
const subs = new Set<() => void>()
export const onQuality = (f: () => void) => (subs.add(f), () => void subs.delete(f))
export function setTier(t: Tier, persist = true) {
  Object.assign(quality, T[t])
  if (persist)
    try {
      localStorage.setItem('quality', t)
    } catch {
      /* private mode */
    }
  subs.forEach((f) => f())
}

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()
/** Cove texture (public/textures/cove/*.webp), shared and cached. */
export function coveTex(name: string, srgb = false, aniso = 4) {
  if (!cache.has(name)) {
    const t = loader.load(`${import.meta.env.BASE_URL}textures/cove/${name}.webp`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.anisotropy = aniso
    cache.set(name, t)
  }
  return cache.get(name)!
}
