// Mediterranean planting scheme rendered with photoreal impostors (see impostor.ts).
// Falls back to the procedural vegetation when the baked atlases are missing.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { Vegetation as ProceduralVegetation } from '../masterplan/Vegetation'
import { buildImpostorGroup, type ImpostorMeta } from './impostor'
import { plan } from './plan'

const BASE = import.meta.env.BASE_URL

export function MediterraneanVegetation() {
  const [group, setGroup] = useState<THREE.Group | null | false>(null)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const res = await fetch(BASE + 'models/vegetation/vegetation.json')
        if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error('no vegetation.json')
        const meta = (await res.json()) as Record<string, ImpostorMeta>
        const loader = new THREE.TextureLoader()
        const tex = new Map<string, THREE.Texture>()
        await Promise.all(
          Object.entries(meta).map(
            ([k, m]) =>
              new Promise<void>((ok) =>
                loader.load(BASE + m.atlas, (t) => {
                  t.colorSpace = THREE.SRGBColorSpace
                  t.anisotropy = 8
                  t.generateMipmaps = true
                  tex.set(k, t)
                  ok()
                }, undefined, () => ok()),
              ),
          ),
        )
        const t0 = performance.now()
        const plants = plan(meta)
        const g = new THREE.Group()
        g.name = 'vegetation-impostors'
        let total = 0
        for (const [sp, list] of plants) {
          if (!tex.has(sp) || !list.length) continue
          const small = sp === 'lavender' || sp === 'pampas' || sp.startsWith('shrub')
          g.add(buildImpostorGroup(sp, meta[sp], tex.get(sp)!, list, { shadow: !small, chunk: small ? 120 : 200, tint: sp.startsWith('shrub') ? new THREE.Color(1.7, 1.8, 1.55) : small ? new THREE.Color(1.0, 1.05, 0.95) : new THREE.Color(0.82, 0.88, 0.76) }))
          total += list.length
        }
        console.info(`[vegetation] ${total} photoreal impostor plants (${plants.size} species) in ${(performance.now() - t0).toFixed(0)}ms`)
        if (alive) setGroup(g)
      } catch (e) {
        console.info('[vegetation] impostors unavailable → procedural fallback', e)
        if (alive) setGroup(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])
  if (group === false) return <ProceduralVegetation />
  if (!group) return null
  return <primitive object={group} />
}
