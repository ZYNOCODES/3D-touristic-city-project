// Loads public/assets-manifest.json (written by blender/fetch_assets.py) and
// public/models/manifest.json (written by blender/run_all.py). Every consumer must
// handle a missing entry by falling back to procedural content.
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'

const BASE = import.meta.env.BASE_URL

export interface AssetsManifest {
  hdri?: Record<string, { file: string; sun: { azimuth: number; elevation: number; peak: number } | null }>
  textures?: Record<string, { diff?: string; nor_gl?: string; rough?: string }>
}
export interface ModelsManifest {
  models?: Record<string, { file: string; bytes: number }>
}

async function getJSON<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(BASE + url, { cache: 'no-cache' })
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    if (!ct.includes('json')) return null // vite serves index.html for missing files
    return (await r.json()) as T
  } catch {
    return null
  }
}

let assetsP: Promise<AssetsManifest> | null = null
let modelsP: Promise<ModelsManifest> | null = null
export const loadAssetsManifest = () => (assetsP ??= getJSON<AssetsManifest>('assets-manifest.json').then((m) => m ?? {}))
export const loadModelsManifest = () => (modelsP ??= getJSON<ModelsManifest>('models/manifest.json').then((m) => m ?? {}))

// ---------------------------------------------------------------------------
const texLoader = new THREE.TextureLoader()
const texCache = new Map<string, Promise<THREE.Texture | null>>()

/** Load a PBR map from the manifest; resolves null when unavailable. */
export function loadTexture(name: string, map: 'diff' | 'nor_gl' | 'rough', opts: { repeat?: number; srgb?: boolean } = {}) {
  const key = `${name}/${map}`
  if (!texCache.has(key)) {
    texCache.set(
      key,
      loadAssetsManifest().then(
        (m) =>
          new Promise<THREE.Texture | null>((resolve) => {
            const file = m.textures?.[name]?.[map]
            if (!file) return resolve(null)
            texLoader.load(
              BASE + file,
              (t) => {
                t.wrapS = t.wrapT = THREE.RepeatWrapping
                t.anisotropy = 8
                t.colorSpace = map === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace
                resolve(t)
              },
              undefined,
              () => resolve(null),
            )
          }),
      ),
    )
  }
  return texCache.get(key)!.then((t) => {
    if (!t) return null
    const c = t.clone()
    c.needsUpdate = true
    if (opts.repeat) c.repeat.set(opts.repeat, opts.repeat)
    return c
  })
}

/** Apply diff/normal/rough maps of a texture set to a material (no-op when missing). */
export async function applyPBR(
  mat: THREE.MeshStandardMaterial,
  name: string,
  repeat = 1,
  normalScale = 1,
): Promise<boolean> {
  const [d, n, r] = await Promise.all([
    loadTexture(name, 'diff'),
    loadTexture(name, 'nor_gl'),
    loadTexture(name, 'rough'),
  ])
  for (const t of [d, n, r]) t?.repeat.set(repeat, repeat)
  if (d) mat.map = d
  if (n) {
    mat.normalMap = n
    mat.normalScale.set(normalScale, normalScale)
  }
  if (r) {
    mat.roughnessMap = r
  }
  mat.needsUpdate = true
  return !!d
}

const hdrLoader = new HDRLoader().setDataType(THREE.HalfFloatType)
const hdrCache = new Map<string, Promise<THREE.DataTexture | null>>()
export function loadHDRI(key: string) {
  if (!hdrCache.has(key)) {
    hdrCache.set(
      key,
      loadAssetsManifest().then(
        (m) =>
          new Promise<THREE.DataTexture | null>((resolve) => {
            const file = m.hdri?.[key]?.file
            if (!file) return resolve(null)
            hdrLoader.load(
              BASE + file,
              (t) => {
                t.mapping = THREE.EquirectangularReflectionMapping
                t.minFilter = THREE.LinearFilter
                t.magFilter = THREE.LinearFilter
                t.generateMipmaps = false
                resolve(t)
              },
              undefined,
              () => resolve(null),
            )
          }),
      ),
    )
  }
  return hdrCache.get(key)!
}

const draco = new DRACOLoader().setDecoderPath(BASE + 'draco/')
const gltfLoader = new GLTFLoader().setDRACOLoader(draco)
const gltfCache = new Map<string, Promise<GLTF | null>>()

/** Load a Blender-exported model by manifest key; null if the pipeline has not produced it. */
export function loadModel(key: string, onProgress?: (p: number) => void) {
  if (!gltfCache.has(key)) {
    gltfCache.set(
      key,
      loadModelsManifest().then(
        (m) =>
          new Promise<GLTF | null>((resolve) => {
            const entry = m.models?.[key]
            if (!entry) return resolve(null)
            gltfLoader.load(
              BASE + entry.file,
              (g) => resolve(g),
              (e) => onProgress?.(e.total ? e.loaded / e.total : 0),
              (err) => {
                console.warn(`[assets] model ${key} failed, using procedural fallback`, err)
                resolve(null)
              },
            )
          }),
      ),
    )
  }
  return gltfCache.get(key)!
}
