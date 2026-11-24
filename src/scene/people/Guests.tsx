// Hotel guests: Rocketbox avatars (MIT) driven by one compact motion file (scripts/build-motion.mjs) holding
// real motion capture — walking, sitting, talking, crawl / breast / back stroke, jump take-off — on one skeleton.
// Each person gets one sampled pose per update (no AnimationMixer), and distant people update less often.
import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { HOTEL, ROOMS, roomFrame } from '../../data/rooms'
import jump from '../../data/generated/jump.json'
import { loadGLTFUrl } from '../../lib/assets'
import { useStore } from '../../store'
import { GLOBAL, GLSL_NOISE } from '../shared'
import { coveTex, quality } from '../cove/quality'
import { patchUnderwater } from '../cove/underwater'

const BASE = import.meta.env.BASE_URL
const SCALE = 1 / 8000

interface ClipIdx { o: number; n: number; fps: number; speed: number; loop: boolean; native: boolean; hip: number }
interface Motion { bones: string[]; hip: number; clips: Record<string, ClipIdx>; data: Int16Array; stride: number }
interface Guest { id: string; female: boolean; swim: boolean }

const _qa = new THREE.Quaternion()
const _qb = new THREE.Quaternion()
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)

class Person {
  root = new THREE.Group()
  bones: (THREE.Bone | undefined)[]
  rootBone: THREE.Object3D
  hip: number
  clip = ''
  t = 0
  speed = 1
  private prev = ''
  private prevT = 0
  private w = 1
  private fade = 0.3
  once = false
  vis = 90
  update: (dt: number, t: number) => void = () => {}
  acc = 0
  constructor(public m: Motion, scene: THREE.Object3D, public female: boolean, scale = 1) {
    const o = cloneSkinned(scene)
    this.root.add(o)
    this.root.scale.setScalar(scale)
    const map = new Map<string, THREE.Bone>()
    o.traverse((b) => map.set(b.name, b as THREE.Bone))
    this.bones = m.bones.map((b) => map.get(b))
    this.rootBone = map.get('Bip01')!
    this.hip = this.rootBone.position.y || m.hip
  }
  play(base: string, speed = 1, fade = 0.3, once = false) {
    const c = this.m.clips
    const sex = this.female ? 'f_' : 'm_'
    const name = c[base] ? base : c[sex + base] ? sex + base : c['m_' + base] ? 'm_' + base : 'f_' + base
    this.speed = speed
    if (name === this.clip) return this
    this.prev = this.clip
    this.prevT = this.t
    this.clip = name
    this.w = this.prev ? 0 : 1
    this.fade = fade
    this.t = once ? 0 : Math.random() * (c[name].n / c[name].fps)
    this.once = once
    return this
  }
  get duration() {
    const c = this.m.clips[this.clip]
    return (c.n - 1) / c.fps
  }
  private sample(name: string, t: number, w: number) {
    const c = this.m.clips[name]
    const last = c.n - 1
    let f = t * c.fps
    f = c.loop ? f % last : Math.min(f, last - 0.001)
    const i = Math.floor(f)
    const k = f - i
    const d = this.m.data
    const st = this.m.stride
    const a = c.o + i * st
    const b = c.o + Math.min(i + 1, last) * st
    for (let j = 0; j < this.bones.length; j++) {
      const bone = this.bones[j]
      if (!bone) continue
      const p = j * 4
      _qa.set(d[a + p], d[a + p + 1], d[a + p + 2], d[a + p + 3])
      _qb.set(d[b + p], d[b + p + 1], d[b + p + 2], d[b + p + 3])
      _qa.normalize().slerp(_qb.normalize(), k)
      if (w >= 1) bone.quaternion.copy(_qa)
      else bone.quaternion.slerp(_qa, w)
    }
    const q = this.bones.length * 4
    const s = this.hip / (c.native ? 0.91 : this.m.hip)
    const y = (d[a + q + 1] * (1 - k) + d[b + q + 1] * k) * SCALE * s
    const x = (d[a + q] * (1 - k) + d[b + q] * k) * SCALE * s
    const z = (d[a + q + 2] * (1 - k) + d[b + q + 2] * k) * SCALE * s
    if (w >= 1) this.rootBone.position.set(x, y, z)
    else this.rootBone.position.lerp(V(x, y, z), w)
  }
  pose(dt: number) {
    this.t += dt * this.speed
    if (this.w < 1) {
      this.w = Math.min(1, this.w + dt / this.fade)
      this.prevT += dt
      this.sample(this.prev, this.prevT, 1)
      this.sample(this.clip, this.t, THREE.MathUtils.smoothstep(this.w, 0, 1))
    } else this.sample(this.clip, this.t, 1)
  }
}

/** splash: ring of droplets + foam disc, pooled */
function makeSplashes() {
  const N = 4
  const geo = new THREE.BufferGeometry()
  const K = 90
  const dir = new Float32Array(K * 3)
  for (let i = 0; i < K; i++) {
    const a = Math.random() * 6.283
    const r = Math.pow(Math.random(), 0.6)
    dir.set([Math.cos(a) * r * 1.7, 2.2 + Math.random() * 3.4 * (1 - r * 0.5), Math.sin(a) * r * 1.7], i * 3)
  }
  geo.setAttribute('position', new THREE.BufferAttribute(dir, 3))
  geo.boundingSphere = new THREE.Sphere(V(), 8)
  const list = Array.from({ length: N }, () => {
    const u = { uT: { value: 9 }, uP: { value: 900 }, uNight: GLOBAL.uNight, uSunColor: GLOBAL.uSunColor }
    const drops = new THREE.Points(
      geo,
      new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false,
        vertexShader: 'uniform float uT, uP; varying float vA; void main(){ float t = uT; vec3 p = position * t; p.y -= 4.9 * t * t; vA = smoothstep(1.3, 0.2, t) * step(-0.05, p.y); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uP * (0.035 + 0.05 * fract(position.x * 13.7)) * (1.0 + t) / -mv.z; }',
        fragmentShader: 'uniform float uNight; uniform vec3 uSunColor; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.1, d) * vA * 0.75; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.82, 0.92, 0.95) * mix(uSunColor * 0.9, vec3(0.06), uNight), a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
      }),
    )
    const foam = new THREE.Mesh(
      new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({
        uniforms: u, transparent: true, depthWrite: false,
        vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform float uT, uNight; uniform vec3 uSunColor; varying vec2 vP;\n${GLSL_NOISE}\nvoid main(){ float r = length(vP); float a = atan(vP.y, vP.x); float n = vfbm(vP * 6.0 + vec2(uT * 0.3)); float ring = smoothstep(0.1, 0.0, abs(r - min(0.95, 0.15 + uT * 0.28)) - 0.04 * n); float core = smoothstep(0.75, 0.1, r + n * 0.5) * smoothstep(4.0, 0.2, uT); float al = (ring * 0.35 * smoothstep(3.5, 0.5, uT) + core * 0.8) * smoothstep(0.25, 0.55, n + 0.2); gl_FragColor = vec4(vec3(0.85, 0.94, 0.95) * mix(uSunColor * 0.85, vec3(0.05), uNight), al * (1.0 - smoothstep(0.85, 1.0, r)));\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
      }),
    )
    foam.scale.setScalar(2.6)
    foam.renderOrder = 6
    drops.renderOrder = 7
    const g = new THREE.Group()
    g.add(drops, foam)
    g.visible = false
    return { g, u, t: 99 }
  })
  let k = 0
  return {
    list,
    fire(x: number, z: number) {
      const s = list[k++ % N]
      s.g.position.set(x, 0.03, z)
      s.t = 0
    },
    tick(dt: number) {
      for (const s of list) {
        s.t += dt
        s.u.uT.value = s.t
        s.g.visible = s.t < 4
      }
    },
  }
}

/** foam ring / wake that keeps swimmers visually attached to the surface */
function wakeMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: GLOBAL.uTime, uNight: GLOBAL.uNight, uSunColor: GLOBAL.uSunColor, tWave: { value: coveTex('wave_n', false, 8) } },
    vertexShader: 'varying vec2 vP; varying vec2 vW; void main(){ vP = position.xz; vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime, uNight; uniform vec3 uSunColor; varying vec2 vP; varying vec2 vW;\n${GLSL_NOISE}\nvoid main(){ float r = length(vP); float n = vnoise(vW * 5.0 + uTime * 0.25) * 0.6 + vnoise(vW * 11.0 - uTime * 0.3) * 0.4; float body = smoothstep(0.62, 0.3, length(vP * vec2(1.5, 0.75))) ; float ripple = 0.5 + 0.5 * sin(r * 26.0 - uTime * 3.2); float a = body * smoothstep(0.42, 0.66, n) * 0.42 + ripple * smoothstep(1.0, 0.45, r) * 0.05; gl_FragColor = vec4(vec3(0.85, 0.94, 0.95) * mix(uSunColor * 0.85, vec3(0.05), uNight), a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}`,
  })
}

function boardGeo() {
  const s = new THREE.Shape()
  const L = 1.65
  const W = 0.4
  s.moveTo(0, -L)
  s.bezierCurveTo(W * 0.9, -L, W, -L * 0.6, W, 0)
  s.bezierCurveTo(W, L * 0.6, W * 0.7, L * 0.95, 0, L)
  s.bezierCurveTo(-W * 0.7, L * 0.95, -W, L * 0.6, -W, 0)
  s.bezierCurveTo(-W, -L * 0.6, -W * 0.9, -L, 0, -L)
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.035, bevelSegments: 3, curveSegments: 16 })
  g.rotateX(Math.PI / 2)
  return g
}

type Assets = { motion: Motion; guests: (Guest & { scene: THREE.Object3D })[] }

async function loadGuests(list: Guest[], motion: Motion) {
  const out: Assets['guests'] = []
  await Promise.all(
    list.map(async (g) => {
      const f = await loadGLTFUrl(`models/people/${g.id}.glb`)
      if (!f) return
      f.scene.traverse((o) => {
        const m = o as THREE.SkinnedMesh
        if (!m.isMesh) return
        m.castShadow = true
        m.receiveShadow = true
        m.frustumCulled = false
        const mat = m.material as THREE.MeshStandardMaterial
        mat.envMapIntensity = 0.8
        mat.roughness = mat.name === 'head' ? 0.55 : 0.62
        if (mat.name === 'opacity') {
          mat.transparent = false
          mat.alphaTest = 0.4
          mat.side = THREE.DoubleSide
          mat.depthWrite = true
        }
        if (quality.texture < 512 && mat.normalMap) mat.normalMap = null
        if (g.swim) patchUnderwater(mat, mat.name)
      })
      out.push({ ...g, scene: f.scene })
    }),
  )
  void motion
  return list.map((g) => out.find((o) => o.id === g.id)!).filter(Boolean)
}

function populate({ motion, guests }: Assets) {
  const group = new THREE.Group()
  group.name = 'guests'
  const people: Person[] = []
  const swimM = guests.filter((g) => g.swim && !g.female)
  const swimF = guests.filter((g) => g.swim && g.female)
  const dry = guests.filter((g) => !g.swim)
  const n = { m: 0, f: 0, d: 0 }
  let seed = 7
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
  const spawn = (k: 'm' | 'f' | 'dry', vis = 110) => {
    const src = k === 'm' ? swimM[n.m++ % swimM.length] : k === 'f' ? swimF[n.f++ % swimF.length] : dry[n.d++ % dry.length]
    const p = new Person(motion, src.scene, src.female, 0.97 + rnd() * 0.06)
    p.vis = vis
    group.add(p.root)
    people.push(p)
    return p
  }
  const splashes = makeSplashes()
  splashes.list.forEach((s) => group.add(s.g))
  const wakes: { p: Person; s: number }[] = []
  const low = quality.people < 0.7

  // ------------------------------------------------------------------ jumpers
  const jumps = jump as unknown as { h: number; path: number[][]; dir: number[]; edge: number[]; land: number[]; depth: number; spect: number[][] }[]
  jumps.forEach((J, ji) => {
    const crew = ji === 0 ? 2 : 1
    for (let c = 0; c < crew; c++) {
      const p = spawn((ji + c) % 2 ? 'f' : 'm', 160)
      const dir = V(J.dir[0], 0, J.dir[1])
      const yaw = Math.atan2(dir.x, dir.z)
      const path = J.path.map((q) => V(q[0], q[1], q[2]))
      const L = path.slice(1).reduce((a, q, i) => a + q.distanceTo(path[i]), 0)
      const edge = path.at(-1)!
      const style = (ji + c) % 3 === 1 ? 'dive_air' : (ji + c) % 3 === 2 ? 'tuck_air' : 'jump_air'
      const g = 9.81
      const v0 = V(dir.x * (1.7 + J.h * 0.06), 2.5, dir.z * (1.7 + J.h * 0.06))
      let phase: 'walk' | 'ready' | 'take' | 'air' | 'sink' | 'rise' | 'tread' | 'swim' | 'under' = 'walk'
      let s = -rnd() * 6 - c * 7 - ji * 3
      let t0 = 0
      const pos = edge.clone()
      const vel = V()
      const start = V()
      let swimTo = V()
      p.play('walk_stroll_01', 0.95)
      p.update = (dt) => {
        const r = p.root
        t0 += dt
        if (phase === 'walk') {
          s += dt * 0.95
          const u = THREE.MathUtils.clamp(s / L, 0, 1) * (path.length - 1)
          const i = Math.min(path.length - 2, Math.floor(u))
          r.position.lerpVectors(path[i], path[i + 1], u - i)
          r.rotation.set(0, yaw, 0)
          r.visible = s > 0
          if (s >= L - 0.35) {
            phase = 'ready'
            t0 = 0
            p.play('idle_look_around_01', 1, 0.4)
          }
        } else if (phase === 'ready') {
          if (t0 > 2.6 + c) {
            phase = 'take'
            t0 = 0
            p.play('jump_takeoff', 1, 0.35, true)
            start.copy(r.position)
          }
        } else if (phase === 'take') {
          if (t0 >= p.duration - 0.06) {
            phase = 'air'
            t0 = 0
            // the capture leaves the ground with the hips above the toes: continue from there
            const hipY = p.rootBone.position.y
            pos.copy(r.position).add(V(dir.x * p.rootBone.position.z, hipY, dir.z * p.rootBone.position.z))
            vel.copy(v0)
            const T = (vel.y + Math.sqrt(vel.y * vel.y + 2 * g * Math.max(0.5, pos.y - 0.3))) / g
            p.play(style, 1 / T, 0.16, true)
          }
        } else if (phase === 'air') {
          vel.y -= g * dt
          pos.addScaledVector(vel, dt)
          r.position.copy(pos)
          if (style === 'dive_air') {
            // body follows the flight path: from upright to head-first
            const k = THREE.MathUtils.smootherstep(p.t, 0.35, 0.95)
            r.rotation.set(0, yaw, 0)
            r.rotateX(k * (Math.PI * 0.88))
          } else {
            r.rotation.set(0, yaw, 0)
            if (style === 'tuck_air') r.rotateX(Math.sin(THREE.MathUtils.clamp(p.t, 0, 1) * Math.PI) * 0.35)
          }
          const reach = style === 'dive_air' ? 0.9 : 0.85
          if (pos.y < reach && vel.y < 0 && t0 > 0.2) {
            splashes.fire(pos.x, pos.z)
            phase = 'sink'
            t0 = 0
          }
        } else if (phase === 'sink') {
          vel.multiplyScalar(Math.exp(-dt * (pos.y < 0 ? 2.6 : 0.8)))
          if (style === 'dive_air') vel.addScaledVector(dir, dt * 1.2)
          pos.addScaledVector(vel, dt)
          r.position.copy(pos)
          if (style === 'dive_air') {
            r.rotation.set(0, yaw, 0)
            r.rotateX(THREE.MathUtils.lerp(Math.PI * 0.88, Math.PI * 0.5, THREE.MathUtils.smoothstep(t0, 0.2, 1.3)))
            if (t0 > 0.5) p.play('glide', 1.4, 0.5)
          } else if (t0 > 0.7) {
            p.play('tread', 1.2, 0.6)
          }
          if (t0 > 1.5) {
            phase = 'rise'
            t0 = 0
          }
        } else if (phase === 'rise') {
          p.play('tread', 1.2, 0.6)
          r.rotation.x = THREE.MathUtils.damp(r.rotation.x, 0, 3, dt)
          r.rotation.z = 0
          pos.y = THREE.MathUtils.damp(pos.y, -0.57, 1.9, dt)
          r.position.copy(pos)
          if (t0 > 2.4) {
            phase = 'tread'
            t0 = 0
          }
        } else if (phase === 'tread') {
          r.rotation.set(0, yaw + Math.sin(t0 * 0.6) * 0.8, 0)
          pos.y = -0.57 + Math.sin(t0 * 1.4) * 0.03
          r.position.copy(pos)
          if (t0 > 3 + c * 2) {
            phase = 'swim'
            t0 = 0
            // back towards the foot of the rocks, along the wall
            swimTo = V(J.land[0] + 6 + ji * 2, 0, J.land[1] + (c ? 12 : -9))
            p.play(p.female ? 'swim_breast' : 'swim_crawl', 1, 0.8)
          }
        } else if (phase === 'swim') {
          const d = swimTo.clone().sub(pos).setY(0)
          const target = Math.atan2(d.x, d.z)
          let a = target - r.rotation.y
          a = Math.atan2(Math.sin(a), Math.cos(a))
          r.rotation.y += a * Math.min(1, dt * 1.6)
          pos.addScaledVector(V(Math.sin(r.rotation.y), 0, Math.cos(r.rotation.y)), dt * 0.85)
          pos.y = THREE.MathUtils.damp(pos.y, -0.14, 2, dt)
          r.position.copy(pos)
          if (d.length() < 1.2 || t0 > 18) {
            phase = 'under'
            t0 = 0
            p.play('glide', 1, 0.7)
          }
        } else {
          // duck-dive out of sight, then come back along the trail
          r.rotation.x = THREE.MathUtils.damp(r.rotation.x, 0.7, 2, dt)
          pos.addScaledVector(V(Math.sin(r.rotation.y), -0.75, Math.cos(r.rotation.y)), dt * 1.1)
          r.position.copy(pos)
          if (t0 > 5.5) {
            phase = 'walk'
            s = -2 - rnd() * 4
            r.visible = false
            p.play('walk_stroll_01', 0.95, 0.01)
          }
        }
      }
      wakes.push({ p, s: 1 })
    }
    J.spect.slice(0, low ? 1 : 2).forEach((q, i) => {
      const p = spawn((i + ji) % 2 ? 'm' : 'f')
      p.root.position.set(q[0], q[1], q[2])
      p.root.rotation.y = q[3] + (i - 0.5) * 0.6
      p.play(i % 2 ? 'gestic_talk_neutral_04' : 'idle_look_around_01')
    })
  })

  // ------------------------------------------------------------------ swimmers in the cove
  const swimmer = (clip: string, cx: number, cz: number, rx: number, rz: number, sp: number, k: 'm' | 'f', ph: number, y = -0.13) => {
    const p = spawn(k, 130)
    p.play(clip, sp / 0.95)
    let a = ph
    p.update = (dt, t) => {
      const spd = sp * (0.9 + 0.1 * Math.sin(t))
      const dx = -Math.sin(a) * rx
      const dz = Math.cos(a) * rz
      a += (spd * dt) / Math.max(1, Math.hypot(dx, dz))
      p.root.position.set(cx + Math.cos(a) * rx, y + Math.sin(t * 0.9 + ph) * 0.03, cz + Math.sin(a) * rz)
      p.root.rotation.y = Math.atan2(dx, dz)
    }
    wakes.push({ p, s: 1.15 })
  }
  swimmer('swim_crawl', -2, 8, 15, 12, 1.05, 'm', 0.4)
  swimmer('swim_breast', 6, 22, 9, 7, 0.75, 'f', 2.2)
  swimmer('swim_back', -10, -16, 8, 5, 0.7, 'm', 4.1, -0.2)
  if (!low) {
    swimmer('swim_crawl2', 14, -14, 13, 9, 1.0, 'm', 5.2)
    swimmer('swim_breast', 4, 44, 14, 9, 0.8, 'f', 0.9)
    swimmer('swim_crawl', 20, 30, 9, 16, 1.1, 'm', 3.3)
  }
  const floaters: [string, number, number, number, 'm' | 'f'][] = [
    ['tread', -19, -1, 1.2, 'f'], ['tread', -17.4, 0.4, 4.0, 'm'], ['tread', 5.5, 17.5, 2.4, 'f'], ['float', 12, 4, 0.8, 'f'], ['tread', 8.5, -34.5, 0.3, 'm'], ['float', -8, 26, 2.2, 'm'], ['tread', 2, 25.5, 5.4, 'm'],
  ]
  floaters.slice(0, low ? 4 : 7).forEach(([clip, x, z, ry, k], i) => {
    const p = spawn(k, 120)
    p.play(clip, 0.9 + rnd() * 0.2)
    p.update = (_, t) => {
      p.root.position.set(x + Math.sin(t * 0.21 + i) * 0.4, (clip === 'float' ? -0.12 : -0.57) + Math.sin(t * 1.3 + i * 2) * 0.035, z + Math.cos(t * 0.17 + i) * 0.4)
      p.root.rotation.y = ry + Math.sin(t * 0.2 + i) * 0.5
    }
    wakes.push({ p, s: 0.95 })
  })

  // ------------------------------------------------------------------ paddle boards
  const bg = boardGeo()
  const colors = ['#f3efe6', '#e2603c', '#f2c14e']
  const sup = (x: number, z: number, rx: number, rz: number, sp: number, k: 'm' | 'f', clip: string, ph: number, ci: number) => {
    const p = spawn(k, 140)
    const board = new THREE.Mesh(bg, new THREE.MeshPhysicalMaterial({ color: colors[ci], roughness: 0.35, clearcoat: 0.6 }))
    board.castShadow = true
    group.add(board)
    let paddle: THREE.Mesh | null = null
    if (clip === 'paddle') {
      const pg = new THREE.CylinderGeometry(0.014, 0.014, 1.75, 8)
      paddle = new THREE.Mesh(pg, new THREE.MeshStandardMaterial({ color: '#20242a', roughness: 0.4 }))
      const blade = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8).scale(0.95, 1.9, 0.12), paddle.material as THREE.Material)
      blade.position.y = -0.98
      paddle.add(blade)
      group.add(paddle)
    }
    p.play(clip, 0.8)
    let a = ph
    const hL = p.bones[p.m.bones.indexOf('Bip01_L_Hand')]
    const hR = p.bones[p.m.bones.indexOf('Bip01_R_Hand')]
    const va = V()
    const vb = V()
    p.update = (dt, t) => {
      const dx = -Math.sin(a) * rx
      const dz = Math.cos(a) * rz
      a += (sp * dt) / Math.max(1, Math.hypot(dx, dz))
      const px = x + Math.cos(a) * rx
      const pz = z + Math.sin(a) * rz
      const yaw = Math.atan2(dx, dz)
      const bob = Math.sin(t * 1.1 + ph) * 0.025
      board.position.set(px, 0.1 + bob, pz)
      board.rotation.set(Math.sin(t * 0.9 + ph) * 0.02, yaw, Math.sin(t * 1.3 + ph) * 0.03)
      p.root.position.set(px, 0.14 + bob, pz)
      p.root.rotation.set(0, yaw, Math.sin(t * 1.3 + ph) * 0.02)
      board.visible = p.root.visible
      if (paddle && hL && hR) {
        paddle.visible = p.root.visible
        hL.getWorldPosition(va)
        hR.getWorldPosition(vb)
        const d = va.clone().sub(vb).normalize()
        paddle.quaternion.setFromUnitVectors(V(0, 1, 0), d)
        paddle.position.copy(va).addScaledVector(d, -0.78)
      }
    }
  }
  sup(16, 14, 7, 12, 0.55, 'm', 'paddle', 1.0, 0)
  if (!low) sup(-12, 34, 8, 10, 0.5, 'f', 'paddle', 3.4, 1)

  // ------------------------------------------------------------------ loungers: lying, reading
  const PPL = HOTEL.people
  const lie = (list: number[][], idx: number[], k0: number) =>
    idx.forEach((i, j) => {
      const L = list[i]
      if (!L) return
      const p = spawn((j + k0) % 2 ? 'f' : 'm', 80)
      p.root.position.set(L[0], L[1] + 0.36, L[2])
      p.root.rotation.y = L[3]
      p.play(j % 3 === 1 ? 'lie_read' : 'lie', 0.8 + rnd() * 0.3)
    })
  lie(PPL.pool_loungers, low ? [1, 9] : [1, 2, 6, 9, 13, 16], 0)
  lie(PPL.deck_loungers, low ? [2] : [0, 3, 5], 1)

  // ------------------------------------------------------------------ pool
  const pool = HOTEL.pool
  ;(low ? [0, 1] : [0, 1, 2, 3]).forEach((i) => {
    const p = spawn(i % 2 ? 'f' : 'm', 80)
    const x = pool.x0 + 6 + i * 7.2
    const z = pool.z1 - 1.3 - (i % 2) * 2.4
    p.root.position.set(x, pool.y - 1.36, z)
    p.root.rotation.y = i === 1 ? 0.2 : i === 2 ? -0.6 : 0.1 + i
    p.play(i % 2 ? 'gestic_talk_neutral_04' : 'idle_neutral_01')
  })
  {
    const p = spawn('m', 80)
    let dir = 1
    let x = pool.x0 + 4
    p.play('swim_crawl2', 0.95)
    p.update = (dt) => {
      x += dir * dt * 0.9
      if (x > pool.x1 - 3) dir = -1
      if (x < pool.x0 + 3) dir = 1
      p.root.position.set(x, pool.y - 0.14, pool.z0 + 4.4)
      p.root.rotation.y = THREE.MathUtils.damp(p.root.rotation.y, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 3, dt)
    }
  }

  // ------------------------------------------------------------------ terrace: strollers, bar, conversations
  const stroll = (x0: number, x1: number, z: number, y: number, sp: number) => {
    const p = spawn('dry', 120)
    let x = x0 + rnd() * (x1 - x0)
    let d = rnd() < 0.5 ? 1 : -1
    const clip = sp < 1 ? 'walk_stroll_01' : 'walk_neutral'
    const real = motion.clips[(p.female ? 'f_' : 'm_') + clip]?.speed || 1.2
    p.play(clip, sp / real)
    p.update = (dt, t) => {
      x += d * sp * dt
      if (x > x1) d = -1
      if (x < x0) d = 1
      p.root.position.set(x, y, z + Math.sin(t * 0.15 + z) * 0.5)
      p.root.rotation.y = THREE.MathUtils.damp(p.root.rotation.y, (d * Math.PI) / 2, 4, dt)
    }
  }
  const TY = HOTEL.terraceY
  stroll(-30, 24, -74, TY, 1.15)
  stroll(-26, 30, -78.5, TY, 0.85)
  if (!low) {
    stroll(16, 30, -59.5, TY, 0.85)
    stroll(-38, -22, -58.5, TY, 0.9)
  }
  PPL.bar.slice(0, low ? 2 : 4).forEach((b, i) => {
    const p = spawn('dry', 90)
    p.root.position.set(b[0], b[1], b[2] + 0.25)
    p.root.rotation.y = b[3] + (i % 2 ? 0.7 : -0.5)
    p.play(i % 2 ? 'gestic_talk_neutral_04' : 'drink_idle')
  })
  ;[[-6, -72.2, 0.3], [-5.1, -71.3, -2.6], [18.5, -70, 1.4]].slice(0, low ? 2 : 3).forEach(([x, z, r], i) => {
    const p = spawn('dry', 100)
    p.root.position.set(x, TY, z)
    p.root.rotation.y = r
    p.play(i === 2 ? 'cell_phone_talk_01' : 'gestic_talk_neutral_04')
  })
  // sea deck: about to swim, watching, sitting on the edge
  ;([['sit_edge', 6.5, -38.98, 0], ['sit_edge', 7.4, -38.95, 0.15], ['idle_look_around_01', 13.2, -42.5, 0.4], ['gestic_talk_neutral_04', 0.2, -43, 1.2], ['idle_neutral_01', 1.2, -42.4, -2.2]] as [string, number, number, number][]).slice(0, low ? 3 : 5).forEach(([c, x, z, r], i) => {
    const p = spawn(i % 2 ? 'm' : 'f', 110)
    p.root.position.set(x, HOTEL.deckY + (c === 'sit_edge' ? 0.11 : 0), z)
    p.root.rotation.y = r
    p.play(c)
  })
  // sky bar
  PPL.sky.slice(0, low ? 2 : 4).forEach((q, i) => {
    const p = spawn('dry', 60)
    p.root.position.set(q[0], q[1] - 0.46, q[2])
    p.root.rotation.y = q[3] + (i % 2 ? 0.25 : -0.2)
    p.play('sit_chair_idle_relaxed_01')
  })
  // balconies
  const bal = [3, 12, 19, 27, 38, 44, 57, 66, 78, 91, 104]
  bal.slice(0, low ? 5 : 11).forEach((i, j) => {
    const f = roomFrame(ROOMS[i])
    const p = spawn('dry', 95)
    const pos = f.origin.clone().addScaledVector(f.out, 0.95).addScaledVector(f.right, j % 2 ? 1.6 : 0.9)
    p.root.position.copy(pos)
    p.root.rotation.y = f.theta + (rnd() - 0.5) * 0.7
    p.play(j % 3 === 0 ? 'drink_idle' : j % 3 === 1 ? 'idle_neutral_01' : 'cell_phone_talk_01')
  })

  const wake = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), wakeMaterial(), wakes.length)
  wake.frustumCulled = false
  wake.renderOrder = 6
  group.add(wake)
  return { group, people, wakes, wake, splashes }
}

export function Guests() {
  const [assets, setAssets] = useState<Assets | null>(null)
  useEffect(() => {
    let on = true
    ;(async () => {
      const [idx, bin, list] = await Promise.all([
        fetch(BASE + 'models/people/motion.json').then((r) => r.json()),
        fetch(BASE + 'models/people/motion.bin').then((r) => r.arrayBuffer()),
        fetch(BASE + 'models/people/guests.json').then((r) => r.json() as Promise<Guest[]>),
      ])
      const motion: Motion = { ...idx, data: new Int16Array(bin), stride: idx.bones.length * 4 + 3 }
      // weak devices: fewer different bodies (textures) as well as fewer people
      const use = quality.people < 0.7 ? list.filter((g) => ['swim_m1', 'swim_m2', 'swim_f1', 'swim_f2', 'f_a', 'f_b', 'm_a', 'm_b'].includes(g.id)) : list
      const guests = await loadGuests(use, motion)
      if (on) setAssets({ motion, guests })
    })().catch((e) => console.warn('[guests]', e))
    return () => {
      on = false
    }
  }, [])
  const world = useMemo(() => (assets ? populate(assets) : null), [assets])
  const camera = useThree((s) => s.camera)
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const frustum = useMemo(() => new THREE.Frustum(), [])
  const sph = useMemo(() => new THREE.Sphere(V(), 1.6), [])
  useFrame((_, dtRaw) => {
    if (!world) return
    const st = useStore.getState()
    world.group.visible = st.showPeople
    if (!st.showPeople) return
    const dt = Number.isFinite(dtRaw) ? Math.min(Math.max(dtRaw, 0), 0.1) : 0.016
    const t = GLOBAL.uTime.value
    frustum.setFromProjectionMatrix(m4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    for (const p of world.people) {
      p.root.visible = true
      p.update(dt, t)
      const d = p.root.position.distanceTo(camera.position)
      sph.center.copy(p.root.position).y += 0.9
      const seen = p.root.visible && d < p.vis && frustum.intersectsSphere(sph)
      p.root.visible = seen
      p.acc += dt
      if (!seen) {
        if (p.once) p.t += dt * p.speed
        continue
      }
      // 60 Hz near, ~20 Hz beyond 45 m, ~12 Hz beyond 80 m
      const every = d > 80 ? 0.08 : d > 45 ? 0.05 : quality.tier === 'low' ? 0.04 : 0
      if (p.acc >= every) {
        p.pose(p.acc)
        p.acc = 0
      }
    }
    world.wakes.forEach(({ p, s }, i) => {
      const y = p.root.position.y
      const on = p.root.visible && y < 0.2 && y > -0.75
      m4.makeRotationY(p.root.rotation.y)
      m4.scale(V(on ? s : 0, 1, on ? s * 1.15 : 0))
      m4.setPosition(p.root.position.x, 0.035, p.root.position.z)
      world.wake.setMatrixAt(i, m4)
    })
    world.wake.instanceMatrix.needsUpdate = true
    world.splashes.tick(dt)
  })
  if (!world) return null
  return <primitive object={world.group} />
}
