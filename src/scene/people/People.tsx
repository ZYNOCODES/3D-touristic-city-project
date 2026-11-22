// Populates the community with ~70 animated people driven by simple behaviours.
import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import layout from '../../data/layout.json'
import { ANCHORS, BENCHES, LOUNGERS } from '../../data/amenityProps'
import { height, shoreZ } from '../../lib/heightfield'
import { useStore } from '../../store'
import { pathCurve } from '../masterplan/Paths'
import { getMaterial } from '../materials/library'
import {
  B, buildHuman, poseClimb, poseDribble, poseIdle, poseLie, poseRun, poseSit, poseSwim, poseSwing, poseWalk, randomLook,
} from './human'

interface Agent {
  mesh: THREE.SkinnedMesh
  bones: THREE.Bone[]
  update: (t: number, dt: number) => void
}

const A = layout.amenities
let seedCounter = 1
const mk = (opts: { swim?: boolean; kid?: boolean } = {}) => buildHuman(randomLook(seedCounter++, opts), { kid: opts.kid })

function headingTo(mesh: THREE.Object3D, target: number, dt: number) {
  let d = target - mesh.rotation.y
  d = Math.atan2(Math.sin(d), Math.cos(d))
  mesh.rotation.y += d * Math.min(1, dt * 6)
}

function prng(seed: number) {
  let s = seed >>> 0
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
}

function createAgents(ball: THREE.Mesh): Agent[] {
  const r = prng(99)
  const agents: Agent[] = []

  // --- walkers on the path network --------------------------------------------
  const curves = layout.paths.map((p) => ({ c: pathCurve(p.points), w: p.width, kind: p.kind }))
  for (let i = 0; i < 20; i++) {
    const path = curves[i % curves.length]
    const len = path.c.getLength()
    const h = mk()
    let u = r()
    let dir = r() < 0.5 ? 1 : -1
    const speed = (i % 7 === 0 ? 2.6 : 1.15 + r() * 0.35) / len
    const side = (r() - 0.5) * (path.w * 0.6)
    const jog = i % 7 === 0
    const p = new THREE.Vector3()
    const tg = new THREE.Vector3()
    let phase = r() * 10
    agents.push({
      ...h,
      update: (t, dt) => {
        u += dir * speed * dt
        if (u > 0.999 || u < 0.001) {
          dir *= -1
          u = THREE.MathUtils.clamp(u, 0.001, 0.999)
        }
        path.c.getPointAt(u, p)
        path.c.getTangentAt(u, tg)
        const x = p.x - tg.z * side
        const z = p.z + tg.x * side
        h.mesh.position.set(x, height(x, z) + 0.13, z)
        headingTo(h.mesh, Math.atan2(tg.x * dir, tg.z * dir), dt)
        phase += dt * (jog ? 9.5 : 6.2)
        if (jog) poseRun(h.bones, phase)
        else poseWalk(h.bones, phase)
      },
    })
  }

  // --- swimmers ----------------------------------------------------------------
  const pw = ANCHORS.poolWater
  for (let i = 0; i < 5; i++) {
    const h = mk({ swim: true })
    const lane = pw.z - pw.l / 2 + 1.6 + i * ((pw.l - 3) / 4)
    let x = pw.x - pw.w / 2 + 4 + r() * (pw.w - 8)
    let dir = r() < 0.5 ? 1 : -1
    const sp = 0.8 + r() * 0.4
    let ph = r() * 6
    agents.push({
      ...h,
      update: (t, dt) => {
        x += dir * sp * dt
        if (x > pw.x + pw.w / 2 - 2.2 || x < pw.x - pw.w / 2 + 6.5) dir *= -1
        h.mesh.position.set(x - dir * 0.9, pw.y - 0.32 + Math.sin(t * 2 + i) * 0.03, lane)
        headingTo(h.mesh, dir > 0 ? Math.PI / 2 : -Math.PI / 2, dt)
        ph += dt * 3.2 * sp
        poseSwim(h.bones, ph)
      },
    })
  }
  // two people relaxing in the shallow ledge
  for (let i = 0; i < 2; i++) {
    const h = mk({ swim: true })
    const x = pw.x - pw.w / 2 + 3 + i * 1.4
    const z = pw.z + (i ? 2 : -1.5)
    agents.push({
      ...h,
      update: (t) => {
        h.mesh.position.set(x, pw.y - 1.0 + 0.6, z)
        h.mesh.rotation.y = i ? Math.PI * 0.8 : -0.2
        poseIdle(h.bones, t + i * 3, i)
      },
    })
  }

  // --- sunbathers on loungers (pool + beach) -------------------------------------
  const lying = [0, 3, 5, 8, 11, 15, 19, 26, 29, 33, 38, 41]
  for (const li of lying) {
    const L = LOUNGERS[li]
    if (!L) continue
    const h = mk({ swim: true })
    const c = Math.cos(L.rot)
    const s = Math.sin(L.rot)
    const lz = -0.85
    h.mesh.position.set(L.x + s * lz, L.y + 0.42, L.z + c * lz)
    h.mesh.rotation.y = L.rot
    agents.push({ ...h, update: (t) => poseLie(h.bones, t + li) })
  }

  // --- pool bar chat & deck strollers --------------------------------------------
  const barX = A.pool.x - A.pool.deckW / 2 + 5 + 1.6
  for (let i = 0; i < 3; i++) {
    const h = mk()
    const z = A.pool.z - 2 + i * 1.8
    agents.push({
      ...h,
      update: (t) => {
        h.mesh.position.set(barX + (i === 1 ? 0.5 : 0), ANCHORS.poolWater.y + 0.22, z)
        h.mesh.rotation.y = -Math.PI / 2 + (i - 1) * 0.5
        poseIdle(h.bones, t + i * 2, i % 2)
      },
    })
  }
  for (let i = 0; i < 3; i++) {
    const h = mk({ swim: i === 0 })
    const rx = A.pool.w / 2 + 2.5
    const rz = A.pool.l / 2 + 2.2
    let a = r() * Math.PI * 2
    let ph = 0
    agents.push({
      ...h,
      update: (t, dt) => {
        a += dt * 0.045 * (i % 2 ? 1 : -1)
        const x = A.pool.x + Math.cos(a) * rx
        const z = A.pool.z + Math.sin(a) * rz
        const nx = A.pool.x + Math.cos(a + 0.01 * (i % 2 ? 1 : -1)) * rx
        const nz = A.pool.z + Math.sin(a + 0.01 * (i % 2 ? 1 : -1)) * rz
        h.mesh.position.set(x, ANCHORS.poolWater.y + 0.22, z)
        headingTo(h.mesh, Math.atan2(nx - x, nz - z), dt)
        ph += dt * 6
        poseWalk(h.bones, ph)
      },
    })
  }

  // --- basketball ----------------------------------------------------------------
  const C = ANCHORS.court
  const players: { h: ReturnType<typeof mk>; pos: THREE.Vector3; target: THREE.Vector3; ph: number }[] = []
  for (let i = 0; i < 6; i++) {
    const h = mk()
    const pos = new THREE.Vector3(C.x + (r() - 0.5) * C.w * 0.7, C.y, C.z + (r() - 0.5) * C.l * 0.7)
    players.push({ h, pos, target: pos.clone(), ph: r() * 6 })
  }
  const hoops = [new THREE.Vector3(C.x - C.w / 2 + 0.4, C.y + 3.05, C.z), new THREE.Vector3(C.x + C.w / 2 - 0.4, C.y + 3.05, C.z)]
  const game = { holder: 0, flight: null as null | { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; next: number; shot: boolean }, timer: 2 }
  players.forEach((pl, i) => {
    agents.push({
      ...pl.h,
      update: (t, dt) => {
        if (i === 0) {
          // game director runs once per frame on the first player
          game.timer -= dt
          if (!game.flight && game.timer <= 0) {
            const shot = r() < 0.3
            const from = players[game.holder].pos.clone().setY(C.y + 1.6)
            const next = shot ? Math.floor(r() * 6) : (game.holder + 1 + Math.floor(r() * 5)) % 6
            const to = shot ? hoops[players[game.holder].pos.x < C.x ? 0 : 1].clone() : players[next].pos.clone().setY(C.y + 1.2)
            game.flight = { from, to, t: 0, dur: shot ? 1.1 : 0.7, next, shot }
            game.holder = -1
          }
          if (game.flight) {
            const f = game.flight
            f.t += dt / f.dur
            const k = Math.min(1, f.t)
            ball.position.lerpVectors(f.from, f.to, k)
            ball.position.y += Math.sin(k * Math.PI) * (f.shot ? 2.2 : 0.8)
            if (k >= 1) {
              game.holder = f.next
              game.flight = null
              game.timer = 2 + r() * 2.5
            }
          }
        }
        const isHolder = game.holder === i
        // choose new spots now and then
        if (pl.pos.distanceTo(pl.target) < 0.4 || r() < dt * 0.15) {
          pl.target.set(C.x + (r() - 0.5) * C.w * 0.8, C.y, C.z + (r() - 0.5) * C.l * 0.8)
        }
        const to = pl.target.clone().sub(pl.pos)
        const dist = to.length()
        const speed = isHolder ? 2.6 : 2.0
        const moving = dist > 0.4
        if (moving) pl.pos.addScaledVector(to.normalize(), Math.min(dist, speed * dt))
        pl.h.mesh.position.copy(pl.pos)
        const look = isHolder || !game.flight ? pl.target : ball.position
        headingTo(pl.h.mesh, Math.atan2(look.x - pl.pos.x, look.z - pl.pos.z), dt)
        pl.ph += dt * (moving ? 9 : 2)
        if (isHolder) {
          const bounce = Math.abs(Math.sin(t * 6))
          poseDribble(pl.h.bones, pl.ph, bounce)
          const fwd = new THREE.Vector3(Math.sin(pl.h.mesh.rotation.y), 0, Math.cos(pl.h.mesh.rotation.y))
          const right = new THREE.Vector3(fwd.z, 0, -fwd.x)
          ball.position.copy(pl.pos).addScaledVector(fwd, 0.35).addScaledVector(right, -0.3)
          ball.position.y = C.y + 0.13 + bounce * 0.75
        } else if (moving) poseRun(pl.h.bones, pl.ph)
        else poseIdle(pl.h.bones, t + i, 0)
      },
    })
  })

  // --- playground ----------------------------------------------------------------
  const P = ANCHORS.playground
  ANCHORS.swings.slice(0, 2).forEach((pivot, i) => {
    const h = mk({ kid: true })
    agents.push({
      ...h,
      update: (t) => {
        const th = Math.sin(t * 1.9 + i * 1.7) * (0.45 + 0.15 * i)
        const seat = new THREE.Vector3(0, -1.8, 0).applyAxisAngle(new THREE.Vector3(1, 0, 0), th).add(pivot)
        h.mesh.position.copy(seat).add(new THREE.Vector3(0, 0.02, 0))
        h.mesh.rotation.set(th, 0, 0)
        poseSwing(h.bones, t, t * 1.9 + i * 1.7)
      },
    })
  })
  {
    const h = mk({ kid: true })
    const top = ANCHORS.slideTop
    const bot = ANCHORS.slideBottom
    const ladder = new THREE.Vector3(top.x, P.y, top.z - 2.4)
    let state = 0
    let k = 0
    let ph = 0
    agents.push({
      ...h,
      update: (t, dt) => {
        if (state === 0) {
          // walk from slide bottom round to the ladder
          k += dt / 4.5
          const a = bot.clone().setY(P.y)
          const mid = new THREE.Vector3(top.x + 2.4, P.y, (bot.z + ladder.z) / 2)
          const pos = k < 0.5 ? a.lerp(mid, k * 2) : mid.lerp(ladder, (k - 0.5) * 2)
          h.mesh.position.copy(pos)
          const dirTo = k < 0.5 ? mid.clone().sub(bot) : ladder.clone().sub(mid)
          headingTo(h.mesh, Math.atan2(dirTo.x, dirTo.z), dt)
          ph += dt * 10
          poseRun(h.bones, ph)
          if (k >= 1) (state = 1), (k = 0)
        } else if (state === 1) {
          k += dt / 1.6
          h.mesh.position.set(ladder.x, P.y + k * (top.y - P.y - 0.05), ladder.z + 0.3)
          h.mesh.rotation.y = 0
          ph += dt * 6
          poseClimb(h.bones, ph)
          if (k >= 1) (state = 2), (k = 0)
        } else if (state === 2) {
          k += dt / 0.8
          h.mesh.position.set(top.x, top.y - 0.05, THREE.MathUtils.lerp(ladder.z + 0.3, top.z - 0.2, k))
          poseIdle(h.bones, t)
          if (k >= 1) (state = 3), (k = 0)
        } else {
          k += dt / 1.3
          const e = k * k
          h.mesh.position.lerpVectors(top, bot, e).y -= 0.18
          h.mesh.rotation.set(0.36 * (1 - e * 0.3), 0, 0)
          poseSit(h.bones, t, 0.05)
          h.bones[B.uaL].rotation.x = -1.8
          h.bones[B.uaR].rotation.x = -1.8
          if (k >= 1) {
            state = 0
            k = 0
            h.mesh.rotation.set(0, 0, 0)
          }
        }
      },
    })
  }
  for (let i = 0; i < 3; i++) {
    const h = mk({ kid: true })
    let a = i * 2.1
    let ph = 0
    agents.push({
      ...h,
      update: (t, dt) => {
        const sp = 0.32 + 0.06 * Math.sin(t * 0.7 + i)
        a += dt * sp
        const rad = 9 + Math.sin(t * 0.5 + i) * 1.5
        const x = P.x + Math.cos(a) * rad
        const z = P.z + Math.sin(a) * rad
        h.mesh.position.set(x, P.y, z)
        h.mesh.rotation.y = -a
        ph += dt * 11
        poseRun(h.bones, ph)
      },
    })
  }
  BENCHES.slice(-5, -3).forEach((bn, i) => {
    const h = mk()
    agents.push({
      ...h,
      update: (t) => {
        h.mesh.position.set(bn.x + Math.sin(bn.rot) * 0.15, bn.y, bn.z + Math.cos(bn.rot) * 0.15)
        h.mesh.rotation.y = bn.rot + Math.PI
        poseSit(h.bones, t + i, 0.42, i)
      },
    })
  })

  // --- social lounge -------------------------------------------------------------
  const Lg = ANCHORS.lounge
  const seats: [number, number, number][] = [
    [-1.2, -2.7, 0], [1.0, -2.7, 0], [0.4, 2.7, Math.PI], [-4.0, 0.6, Math.PI / 2],
  ]
  seats.forEach(([sx, sz, rot], i) => {
    const h = mk()
    agents.push({
      ...h,
      update: (t) => {
        h.mesh.position.set(Lg.x + sx, Lg.y, Lg.z + sz)
        h.mesh.rotation.y = rot
        poseSit(h.bones, t + i * 1.3, 0.5, i % 2)
      },
    })
  })

  // --- beach ---------------------------------------------------------------------
  for (let i = 0; i < 6; i++) {
    const h = mk({ swim: i % 2 === 0 })
    let x = -260 + r() * 420
    let dir = r() < 0.5 ? 1 : -1
    let ph = r() * 5
    const off = 3 + r() * 6
    agents.push({
      ...h,
      update: (t, dt) => {
        x += dir * 1.2 * dt
        if (x > 200 || x < -280) dir *= -1
        const z = shoreZ(x) - off
        h.mesh.position.set(x, Math.max(height(x, z), -0.3) + 0.02, z)
        const z2 = shoreZ(x + dir) - off
        headingTo(h.mesh, Math.atan2(dir, z2 - z), dt)
        ph += dt * 6.2
        poseWalk(h.bones, ph)
      },
    })
  }
  for (let i = 0; i < 3; i++) {
    const h = mk({ swim: true })
    const x = A.beachClub.x + 10 + i * 4
    const z = shoreZ(x) + 6 + i
    agents.push({
      ...h,
      update: (t) => {
        h.mesh.position.set(x, -0.55 + Math.sin(t * 1.3 + i) * 0.08, z)
        h.mesh.rotation.y = Math.PI + i
        poseIdle(h.bones, t + i, i % 2)
      },
    })
  }
  return agents
}

export function People() {
  const ball = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), new THREE.MeshStandardMaterial({ color: '#d9692a', roughness: 0.6 }))
    m.castShadow = true
    void getMaterial
    return m
  }, [])
  const { agents, group } = useMemo(() => {
    const agents = createAgents(ball)
    const group = new THREE.Group()
    group.name = 'people'
    agents.forEach((a) => group.add(a.mesh))
    group.add(ball)
    return { agents, group }
  }, [ball])

  useEffect(() => () => agents.forEach((a) => a.mesh.geometry.dispose()), [agents])

  useFrame(({ clock, camera }, dt) => {
    const st = useStore.getState()
    group.visible = st.showPeople
    if (!group.visible) return
    // skip the animation work when the camera is far away (people are sub-pixel)
    const far = camera.position.y > 420
    if (far && Math.floor(clock.elapsedTime * 10) % 3 !== 0) return
    const t = clock.elapsedTime
    const d = Math.min(dt, 0.05) * (far ? 3 : 1)
    for (const a of agents) a.update(t, d)
  })
  return <primitive object={group} />
}
