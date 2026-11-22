// Realistic animated residents: Microsoft Rocketbox avatars (MIT) with motion-capture
// clips, driven by AnimationMixer. Clips live in one shared GLB and are retargeted
// to every avatar by bone name; walking speed is synced to each clip's measured
// root speed so feet do not slide. Falls back to the procedural people if the
// pipeline has not produced the avatars.
import { useEffect, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import layout from '../../data/layout.json'
import { ANCHORS, BENCHES, LOUNGERS } from '../../data/amenityProps'
import { RESIDENCE_SPEC } from '../../data/residenceSpec'
import { loadGLTFUrl } from '../../lib/assets'
import { height, padHeight, shoreZ } from '../../lib/heightfield'
import { useStore } from '../../store'
import { pathCurve } from '../masterplan/Paths'
import { People as ProceduralPeople } from './People'

interface Meta {
  avatars: { id: string; file: string; child: boolean; female: boolean; height: number }[]
  clips: Record<string, { file: string; duration: number; rootSpeed: number; rootHeight: number; inPlace: boolean }>
}

const BASE = import.meta.env.BASE_URL
const A = layout.amenities

function prng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

interface Person {
  obj: THREE.Object3D
  mixer: THREE.AnimationMixer
  play: (clip: string, timeScale?: number) => void
  update: (t: number, dt: number) => void
  root: THREE.Object3D | null
}

/**
 * Retarget a mocap clip to one avatar.
 * - bone translations are dropped (they encode the mocap actor's proportions): rotations only;
 * - the root (Bip01) keeps only its vertical motion, scaled by avatarHip / mocapStandingHip,
 *   so sitting / crouching clips lower each body correctly (adults, children alike);
 * - walking clips lose the root motion entirely — the behaviour moves the person at the
 *   clip's measured speed instead (no foot sliding).
 */
function retarget(clip: THREE.AnimationClip, meta: Meta['clips'][string] | undefined, restRoot: THREE.Vector3 | null, standingHip: number) {
  const c = clip.clone()
  c.tracks = c.tracks.filter((tr) => {
    if (!tr.name.endsWith('.position')) return !tr.name.endsWith('.scale')
    if (tr.name !== 'Bip01.position') return false
    if (!restRoot || !meta || meta.rootSpeed > 0) return false
    const v = tr.values
    const ratio = restRoot.y / standingHip
    for (let i = 0; i < v.length; i += 3) {
      v[i] = restRoot.x
      v[i + 1] = v[i + 1] * ratio
      v[i + 2] = restRoot.z
    }
    return true
  })
  return c
}

export function RealPeople() {
  const [assets, setAssets] = useState<{ meta: Meta; avatars: Map<string, GLTF>; clips: THREE.AnimationClip[] } | null | false>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const r = await fetch(BASE + 'models/people/people.json')
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('no people.json')
        const meta = (await r.json()) as Meta
        if (!meta.avatars.length) throw new Error('no avatars')
        const clipNames = Object.keys(meta.clips)
        const [clipFiles, av] = await Promise.all([
          Promise.all(clipNames.map((n) => loadGLTFUrl(meta.clips[n].file))),
          Promise.all(meta.avatars.map((a) => loadGLTFUrl(a.file))),
        ])
        const clips: THREE.AnimationClip[] = []
        clipFiles.forEach((g, i) => {
          const c = g?.animations[0]
          if (!c) return
          c.name = clipNames[i]
          clips.push(c)
        })
        if (!clips.length) throw new Error('no clips')
        const avatars = new Map<string, GLTF>()
        meta.avatars.forEach((a, i) => av[i] && avatars.set(a.id, av[i]!))
        for (const g of avatars.values()) {
          g.scene.traverse((o) => {
            const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined
            if (!m) return
            ;(o as THREE.Mesh).castShadow = true
            ;(o as THREE.Mesh).frustumCulled = false
            m.envMapIntensity = 0.7
            if (/opacity/i.test(m.name)) {
              m.transparent = false
              m.alphaTest = 0.45
              m.side = THREE.DoubleSide
              m.depthWrite = true
            }
          })
        }
        console.info(`[people] ${avatars.size} Rocketbox avatars, ${clips.length} mocap clips`)
        if (alive) setAssets({ meta, avatars, clips })
      } catch (e) {
        console.info('[people] realistic avatars unavailable → procedural fallback', e)
        if (alive) setAssets(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const world = useMemo(() => (assets ? createPopulation(assets) : null), [assets])

  useFrame(({ camera, clock }, dtRaw) => {
    if (!world) return
    const st = useStore.getState()
    world.group.visible = st.showPeople
    if (!st.showPeople) return
    const dt = Math.min(dtRaw, 0.1)
    const t = clock.elapsedTime
    for (const p of world.people) {
      p.update(t, dt)
      const d = p.obj.position.distanceTo(camera.position)
      p.obj.visible = d < 320
      // animate far people at a lower rate
      if (p.obj.visible) p.mixer.update(d > 140 ? dt * ((Math.floor(t * 20) % 3 === 0) ? 3 : 0) : dt)
    }
  })

  if (assets === false) return <ProceduralPeople />
  if (!world) return null
  return <primitive object={world.group} />
}

function createPopulation(assets: { meta: Meta; avatars: Map<string, GLTF>; clips: THREE.AnimationClip[] }) {
  const { meta, avatars } = assets
  const r = prng(2024)
  const group = new THREE.Group()
  group.name = 'people-real'
  const people: Person[] = []
  const adultsF = meta.avatars.filter((a) => !a.child && a.female && avatars.has(a.id))
  const adultsM = meta.avatars.filter((a) => !a.child && !a.female && avatars.has(a.id))
  const kids = meta.avatars.filter((a) => a.child && avatars.has(a.id))
  const counters = { f: 0, m: 0, k: 0 }
  const clipByName = new Map(assets.clips.map((c) => [c.name, c]))
  // standing hip height of the mocap actors (first frame of their neutral idles)
  const hipOf = (name: string) => {
    const tr = clipByName.get(name)?.tracks.find((t) => t.name === 'Bip01.position')
    return tr ? tr.values[1] : 0.92
  }
  const standing = { f: hipOf('f_idle_neutral_01'), m: hipOf('m_idle_neutral_01') }

  const spawn = (kind: 'adult' | 'kid' | 'f' | 'm') => {
    let pick
    if (kind === 'kid') pick = kids[counters.k++ % kids.length]
    else {
      const female = kind === 'f' ? true : kind === 'm' ? false : r() < 0.5
      const list = female ? adultsF : adultsM
      pick = list[(female ? counters.f++ : counters.m++) % list.length]
    }
    const obj = cloneSkinned(avatars.get(pick.id)!.scene)
    obj.scale.setScalar(0.96 + r() * 0.08)
    group.add(obj)
    const rootNode = obj.getObjectByName('Bip01') ?? null
    const rest = rootNode ? rootNode.position.clone() : null
    const mixer = new THREE.AnimationMixer(obj)
    const sex = pick.female ? 'f' : 'm'
    let current: THREE.AnimationAction | null = null
    let currentName = ''
    const cache = new Map<string, THREE.AnimationAction>()
    const play = (base: string, timeScale = 1) => {
      // "walk_neutral" → f_walk_neutral / m_walk_neutral, falling back to the other sex
      const name = clipByName.has(`${sex}_${base}`) ? `${sex}_${base}` : clipByName.has(`${sex === 'f' ? 'm' : 'f'}_${base}`) ? `${sex === 'f' ? 'm' : 'f'}_${base}` : base
      if (name !== currentName) {
        let a = cache.get(name)
        if (!a) {
          const src = clipByName.get(name)
          if (!src) return
          a = mixer.clipAction(retarget(src, meta.clips[name], rest, name.startsWith('f_') ? standing.f : standing.m))
          cache.set(name, a)
        }
        a.reset().fadeIn(0.35).play()
        a.time = r() * (meta.clips[name]?.duration ?? 1)
        current?.fadeOut(0.35)
        current = a
        currentName = name
      }
      if (current) current.timeScale = timeScale
    }
    const person: Person = { obj, mixer, play, update: () => {}, root: rootNode }
    people.push(person)
    return { person, speedOf: (base: string) => meta.clips[`${sex}_${base}`]?.rootSpeed || meta.clips[`m_${base}`]?.rootSpeed || 1.3 }
  }

  const face = (o: THREE.Object3D, yaw: number, dt: number) => {
    let d = yaw - o.rotation.y
    d = Math.atan2(Math.sin(d), Math.cos(d))
    o.rotation.y += d * Math.min(1, dt * 5)
  }

  // ---- strollers on the path network ------------------------------------------------
  const curves = layout.paths.map((p) => ({ c: pathCurve(p.points), w: p.width }))
  for (let i = 0; i < 18; i++) {
    const { person, speedOf } = spawn('adult')
    const path = curves[i % curves.length]
    const len = path.c.getLength()
    const style = i % 4 === 0 ? 'walk_stroll_01' : i % 5 === 0 ? 'walk_fast_01' : 'walk_neutral'
    const speed = style === 'walk_stroll_01' ? 0.9 : style === 'walk_fast_01' ? 1.5 : 1.25
    let u = r()
    let dir = r() < 0.5 ? 1 : -1
    const side = (r() - 0.5) * path.w * 0.55
    const p = new THREE.Vector3()
    const tg = new THREE.Vector3()
    person.play(style, speed / speedOf(style))
    person.update = (_, dt) => {
      u += (dir * speed * dt) / len
      if (u > 0.995 || u < 0.005) {
        dir *= -1
        u = THREE.MathUtils.clamp(u, 0.005, 0.995)
      }
      path.c.getPointAt(u, p)
      path.c.getTangentAt(u, tg)
      const x = p.x - tg.z * side
      const z = p.z + tg.x * side
      person.obj.position.set(x, height(x, z) + 0.12, z)
      face(person.obj, Math.atan2(tg.x * dir, tg.z * dir), dt)
    }
  }
  // a couple walking together + a parent with a child
  {
    const path = curves[0]
    const len = path.c.getLength()
    const pair = [spawn('f'), spawn('m'), spawn('adult'), spawn('kid')]
    let u = 0.3
    const p = new THREE.Vector3()
    const tg = new THREE.Vector3()
    pair.forEach(({ person, speedOf }, k) => person.play('walk_stroll_01', 0.85 / speedOf('walk_stroll_01')))
    pair[0].person.update = (_, dt) => {
      u = (u + (0.85 * dt) / len) % 1
      pair.forEach(({ person }, k) => {
        const uu = (u + (k >= 2 ? 0.02 : 0)) % 1
        path.c.getPointAt(uu, p)
        path.c.getTangentAt(uu, tg)
        const off = k % 2 === 0 ? 0.45 : -0.45
        const x = p.x - tg.z * off
        const z = p.z + tg.x * off
        person.obj.position.set(x, height(x, z) + 0.12, z)
        face(person.obj, Math.atan2(tg.x, tg.z), dt)
      })
    }
  }

  // ---- pool: people standing in the water, sitting on loungers, at the bar ---------------
  const pw = ANCHORS.poolWater
  for (let i = 0; i < 5; i++) {
    const { person } = spawn(i === 4 ? 'kid' : 'adult')
    const x = pw.x - pw.w / 2 + 2.5 + (i % 3) * 1.1 + (i >= 3 ? 8 : 0)
    const z = pw.z - 2 + (i % 2) * 2.2
    person.obj.position.set(x, pw.y - 1.05, z)
    person.obj.rotation.y = i * 1.9
    person.play(i % 2 ? 'gestic_talk_neutral_04' : 'idle_neutral_01')
  }
  const loungerIdx = [0, 3, 5, 8, 12, 17, 20, 26, 31, 36]
  loungerIdx.forEach((li, k) => {
    const L = LOUNGERS[li]
    if (!L) return
    const { person } = spawn('adult')
    const c = Math.cos(L.rot)
    const s = Math.sin(L.rot)
    // sit near the raised back-rest, facing along the lounger
    person.obj.position.set(L.x + s * 0.35, L.y + 0.02, L.z + c * 0.35)
    person.obj.rotation.y = L.rot + Math.PI
    person.play(k % 2 ? 'sit_chair_idle_relaxed_01' : 'sit_table_idle_relaxed_01')
  })
  const barX = A.pool.x - A.pool.deckW / 2 + 5 + 1.6
  for (let i = 0; i < 3; i++) {
    const { person } = spawn(i === 1 ? 'm' : 'f')
    person.obj.position.set(barX + 0.4, pw.y + 0.22, A.pool.z - 2 + i * 1.6)
    person.obj.rotation.y = -Math.PI / 2 + (i - 1) * 0.4
    person.play(i === 0 ? 'drink_idle' : i === 1 ? 'cell_phone_talk_01' : 'gestic_talk_neutral_04')
  }

  // ---- sports court: players moving and passing ------------------------------------
  const C = ANCHORS.court
  for (let i = 0; i < 5; i++) {
    const { person, speedOf } = spawn(i === 4 ? 'kid' : 'm')
    const target = new THREE.Vector3()
    const pos = new THREE.Vector3(C.x + (r() - 0.5) * C.w * 0.7, C.y, C.z + (r() - 0.5) * C.l * 0.7)
    let wait = r() * 2
    person.update = (_, dt) => {
      if (wait > 0) {
        wait -= dt
        person.play('idle_look_around_01')
        if (wait <= 0) target.set(C.x + (r() - 0.5) * C.w * 0.8, C.y, C.z + (r() - 0.5) * C.l * 0.8)
      } else {
        const d = target.clone().sub(pos)
        if (d.length() < 0.3) {
          wait = 1 + r() * 3
        } else {
          pos.addScaledVector(d.normalize(), Math.min(d.length(), 1.5 * dt))
          face(person.obj, Math.atan2(d.x, d.z), dt)
          person.play('walk_fast_01', 1.5 / speedOf('walk_fast_01'))
        }
      }
      person.obj.position.copy(pos)
    }
  }

  // ---- playground: kids on swings, running, crouching; parents on benches --------------
  const P = ANCHORS.playground
  ANCHORS.swings.slice(0, 2).forEach((pivot, i) => {
    const { person } = spawn('kid')
    person.play('sit_chair_idle_relaxed_01')
    person.update = (t) => {
      const th = Math.sin(t * 1.9 + i * 1.7) * (0.45 + 0.15 * i)
      const seat = new THREE.Vector3(0, -1.8, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), th).add(pivot)
      person.obj.position.copy(seat).add(new THREE.Vector3(0, -0.42, -0.05))
      person.obj.rotation.set(th, 0, 0)
    }
  })
  for (let i = 0; i < 2; i++) {
    const { person, speedOf } = spawn('kid')
    let a = i * 3
    person.play('walk_fast_01', 2.2 / speedOf('walk_fast_01'))
    person.update = (t, dt) => {
      a += dt * (2.2 / 9)
      const x = P.x + Math.cos(a) * 9
      const z = P.z + Math.sin(a) * 9
      person.obj.position.set(x, P.y, z)
      person.obj.rotation.y = -a
    }
  }
  {
    const { person } = spawn('kid')
    person.obj.position.set(P.x + 2, P.y, P.z + 7)
    person.obj.rotation.y = 2.4
    person.play('crouch_idle')
  }
  BENCHES.slice(-5, -3).forEach((bn, i) => {
    const { person } = spawn(i ? 'f' : 'm')
    person.obj.position.set(bn.x - Math.sin(bn.rot) * 0.05, bn.y, bn.z - Math.cos(bn.rot) * 0.05)
    person.obj.rotation.y = bn.rot + Math.PI
    person.play('sit_chair_idle_relaxed_01')
  })

  // ---- social lounge: friends on the sofas ---------------------------------------------
  const Lg = ANCHORS.lounge
  const seats: [number, number, number][] = [
    [-1.2, -2.75, 0], [1.1, -2.75, 0], [0.4, 2.75, Math.PI], [-4.05, 0.6, Math.PI / 2],
  ]
  seats.forEach(([sx, sz, rot], i) => {
    const { person } = spawn('adult')
    person.obj.position.set(Lg.x + sx, Lg.y + 0.18, Lg.z + sz)
    person.obj.rotation.y = rot
    person.play(i % 2 ? 'sit_table_idle_relaxed_01' : 'sit_chair_idle_relaxed_01')
  })

  // ---- residence forecourt: arrivals and a conversation at the entrance ------------------
  {
    const ry = padHeight(layout.pads.length - 1)
    const ox = layout.residence.x
    const oz = layout.residence.z
    const spots: [number, number, number, string][] = [
      [-3, 12, 0.4, 'gestic_talk_neutral_04'], [-2, 13.1, -2.6, 'idle_neutral_01'], [4, 11.5, 3.6, 'cell_phone_talk_01'],
    ]
    for (const [x, z, rot, clip] of spots) {
      const { person } = spawn('adult')
      person.obj.position.set(ox + x, ry + 0.06, oz + z)
      person.obj.rotation.y = rot
      person.play(clip)
    }
    for (let i = 0; i < 3; i++) {
      const { person, speedOf } = spawn('adult')
      let x = -30 + i * 22
      const z = oz + 14.2 + i * 0.6
      let dir = i % 2 ? 1 : -1
      person.play('walk_neutral', 1.2 / speedOf('walk_neutral'))
      person.update = (_, dt) => {
        x += dir * 1.2 * dt
        if (x > 60 || x < -60) dir *= -1
        person.obj.position.set(ox + x, ry + 0.06, z)
        face(person.obj, dir > 0 ? Math.PI / 2 : -Math.PI / 2, dt)
      }
    }
    void RESIDENCE_SPEC
  }

  // ---- beach: strollers along the waterline, people in the shallows ----------------------
  for (let i = 0; i < 6; i++) {
    const { person, speedOf } = spawn(i === 5 ? 'kid' : 'adult')
    let x = -250 + r() * 380
    let dir = r() < 0.5 ? 1 : -1
    const off = 4 + r() * 6
    person.play('walk_stroll_01', 0.9 / speedOf('walk_stroll_01'))
    person.update = (_, dt) => {
      x += dir * 0.9 * dt
      if (x > 180 || x < -260) dir *= -1
      const z = shoreZ(x) - off
      person.obj.position.set(x, Math.max(height(x, z), -0.2), z)
      const z2 = shoreZ(x + dir) - off
      face(person.obj, Math.atan2(dir, z2 - z), dt)
    }
  }
  for (let i = 0; i < 3; i++) {
    const { person } = spawn(i === 2 ? 'kid' : 'adult')
    const x = A.beachClub.x + 10 + i * 3.5
    const z = shoreZ(x) + 5 + i
    person.obj.position.set(x, -0.75, z)
    person.obj.rotation.y = Math.PI + i * 0.6
    person.play(i === 1 ? 'gestic_talk_neutral_04' : 'idle_look_around_01')
  }
  return { group, people }
}
