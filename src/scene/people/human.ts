// Procedural articulated human: capsule body parts rigidly skinned to a 20-bone
// skeleton → one SkinnedMesh (one draw call) per person. Poses are applied by
// setting bone rotations every frame (see poses below).
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

export const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  shL: 6, uaL: 7, faL: 8, handL: 9, shR: 10, uaR: 11, faR: 12, handR: 13,
  thL: 14, shinL: 15, footL: 16, thR: 17, shinR: 18, footR: 19,
} as const

const REST: [number, number, number, number][] = [
  // parent, x, y, z
  [-1, 0, 0, 0],
  [0, 0, 0.95, 0],
  [1, 0, 0.1, 0],
  [2, 0, 0.22, 0],
  [3, 0, 0.2, 0],
  [4, 0, 0.08, 0],
  [3, 0.15, 0.17, 0],
  [6, 0.05, 0, 0],
  [7, 0, -0.28, 0],
  [8, 0, -0.25, 0],
  [3, -0.15, 0.17, 0],
  [10, -0.05, 0, 0],
  [11, 0, -0.28, 0],
  [12, 0, -0.25, 0],
  [1, 0.09, -0.04, 0],
  [14, 0, -0.43, 0],
  [15, 0, -0.42, 0],
  [1, -0.09, -0.04, 0],
  [17, 0, -0.43, 0],
  [18, 0, -0.42, 0],
]

export interface Look {
  skin: THREE.Color
  hair: THREE.Color
  top: THREE.Color
  bottom: THREE.Color
  shoes: THREE.Color
  sleeves: boolean
  longPants: boolean
  dress: boolean
  longHair: boolean
  swim: boolean
  build: number // 0.9 slim .. 1.15 broad
}

const rnd = (s: number) => {
  let x = s >>> 0
  return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296)
}
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)]

const SKIN = ['#f1c7a5', '#e0ac85', '#c68863', '#a26a46', '#7a4c31', '#5a3824', '#f6d5bd']
const HAIR = ['#1d1612', '#3a2618', '#5b3a22', '#8a6038', '#c9a46a', '#9a9a96', '#2a1b14']
const TOPS = ['#f4f2ec', '#1f2d44', '#e6d8c2', '#e7735f', '#8fb7d6', '#6f7a4a', '#222222', '#f2c14e', '#c9d8cf', '#b65a6b']
const BOTTOMS = ['#cbb894', '#1f2a3a', '#f0ede4', '#4f6c8f', '#2a2a2a', '#8a7a5a']
const SWIM = ['#1e5f8c', '#e0483a', '#f2b53a', '#2fa59a', '#141414', '#d94c8a']

export function randomLook(seed: number, opts: { swim?: boolean; kid?: boolean } = {}): Look {
  const r = rnd(seed * 7919 + 13)
  const female = r() < 0.5
  return {
    skin: new THREE.Color(pick(r, SKIN)),
    hair: new THREE.Color(pick(r, HAIR)),
    top: new THREE.Color(opts.swim ? pick(r, SWIM) : pick(r, TOPS)),
    bottom: new THREE.Color(opts.swim ? pick(r, SWIM) : pick(r, BOTTOMS)),
    shoes: new THREE.Color(pick(r, ['#f2f2f2', '#2a2a2a', '#8a6a4a', '#d9d2c4'])),
    sleeves: !opts.swim && r() < 0.35,
    longPants: !opts.swim && !opts.kid && r() < 0.4,
    dress: !opts.swim && female && !opts.kid && r() < 0.35,
    longHair: female && r() < 0.8,
    swim: !!opts.swim,
    build: female ? 0.9 + r() * 0.08 : 1.0 + r() * 0.14,
  }
}

function part(geo: THREE.BufferGeometry, bone: number, color: THREE.Color, at: THREE.Vector3) {
  geo.translate(at.x, at.y, at.z)
  const g = geo.index ? geo.toNonIndexed() : geo
  g.deleteAttribute('uv')
  const n = g.attributes.position.count
  const si = new Uint16Array(n * 4)
  const sw = new Float32Array(n * 4)
  const col = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    si[i * 4] = bone
    sw[i * 4] = 1
    col[i * 3] = color.r
    col[i * 3 + 1] = color.g
    col[i * 3 + 2] = color.b
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4))
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4))
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  return g
}
const cap = (r: number, len: number, rs = 8) => new THREE.CapsuleGeometry(r, len, 3, rs)

export function buildHuman(look: Look, opts: { kid?: boolean } = {}) {
  const bones: THREE.Bone[] = REST.map(() => new THREE.Bone())
  REST.forEach(([p, x, y, z], i) => {
    bones[i].position.set(x * (i === B.shL || i === B.shR ? look.build : 1), y, z)
    if (p >= 0) bones[p].add(bones[i])
  })
  bones[0].updateMatrixWorld(true)
  const wp = (i: number) => new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld)
  const bw = look.build
  const parts: THREE.BufferGeometry[] = []
  const top = look.top
  const bot = look.bottom
  const skin = look.skin
  // pelvis & torso
  const pelvis = cap(0.135 * bw, 0.1, 10)
  pelvis.scale(1.05, 1, 0.75)
  parts.push(part(pelvis, B.hips, look.swim ? bot : bot, wp(B.hips).add(new THREE.Vector3(0, 0.02, 0))))
  const torso = cap(0.15 * bw, 0.26, 10)
  torso.scale(1.08, 1, 0.68)
  parts.push(part(torso, B.spine, look.swim && !look.dress ? skin : top, wp(B.spine).add(new THREE.Vector3(0, 0.17, 0))))
  if (look.swim && look.longHair) {
    const bra = cap(0.152 * bw, 0.05, 10)
    bra.scale(1.08, 1, 0.7)
    parts.push(part(bra, B.chest, top, wp(B.chest).add(new THREE.Vector3(0, 0.04, 0.005))))
  }
  if (look.dress) {
    const skirt = new THREE.CylinderGeometry(0.15, 0.27, 0.55, 12, 1, true)
    parts.push(part(skirt, B.hips, top, wp(B.hips).add(new THREE.Vector3(0, -0.22, 0))))
  }
  // neck & head
  parts.push(part(cap(0.05, 0.06, 6), B.neck, skin, wp(B.neck).add(new THREE.Vector3(0, 0.03, 0))))
  const head = new THREE.SphereGeometry(0.105, 14, 10)
  head.scale(0.92, 1.12, 1)
  parts.push(part(head, B.head, skin, wp(B.head).add(new THREE.Vector3(0, 0.1, 0.01))))
  const hair = new THREE.SphereGeometry(0.112, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.55)
  hair.scale(0.95, 1.1, 1.04)
  parts.push(part(hair, B.head, look.hair, wp(B.head).add(new THREE.Vector3(0, 0.115, -0.005))))
  if (look.longHair) {
    const lh = cap(0.085, 0.14, 8)
    lh.scale(1.2, 1, 0.6)
    parts.push(part(lh, B.head, look.hair, wp(B.head).add(new THREE.Vector3(0, 0.02, -0.06))))
  }
  // nose hint so facing direction reads at a distance
  const nose = new THREE.SphereGeometry(0.02, 6, 4)
  parts.push(part(nose, B.head, skin, wp(B.head).add(new THREE.Vector3(0, 0.09, 0.1))))
  // arms
  for (const [ua, fa, hand] of [[B.uaL, B.faL, B.handL], [B.uaR, B.faR, B.handR]]) {
    parts.push(part(cap(0.048 * bw, 0.2, 7), ua, look.sleeves ? top : look.swim ? skin : top, wp(ua).add(new THREE.Vector3(0, -0.14, 0))))
    parts.push(part(cap(0.04, 0.2, 7), fa, look.sleeves ? top : skin, wp(fa).add(new THREE.Vector3(0, -0.12, 0))))
    parts.push(part(cap(0.035, 0.06, 6), hand, skin, wp(hand).add(new THREE.Vector3(0, -0.05, 0))))
  }
  // legs
  for (const [th, sh, ft] of [[B.thL, B.shinL, B.footL], [B.thR, B.shinR, B.footR]]) {
    const thighCol = look.dress ? skin : bot
    parts.push(part(cap(0.072 * bw, 0.3, 8), th, thighCol, wp(th).add(new THREE.Vector3(0, -0.21, 0))))
    parts.push(part(cap(0.054, 0.32, 8), sh, look.longPants ? bot : skin, wp(sh).add(new THREE.Vector3(0, -0.21, 0))))
    const foot = new THREE.BoxGeometry(0.085, 0.06, 0.22)
    parts.push(part(foot, ft, look.swim ? skin : look.shoes, wp(ft).add(new THREE.Vector3(0, -0.02, 0.05))))
  }
  const geo = mergeGeometries(parts)!
  geo.computeVertexNormals()
  geo.computeBoundingSphere()
  geo.boundingSphere!.radius = 2.2
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })
  const mesh = new THREE.SkinnedMesh(geo, mat)
  mesh.add(bones[0])
  mesh.bind(new THREE.Skeleton(bones))
  mesh.castShadow = true
  mesh.receiveShadow = true
  mesh.frustumCulled = true
  if (opts.kid) {
    mesh.scale.setScalar(0.62)
    bones[B.head].scale.setScalar(1.22)
  }
  return { mesh, bones }
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------
export function resetPose(b: THREE.Bone[]) {
  for (const bone of b) bone.rotation.set(0, 0, 0)
  b[B.root].position.set(0, 0, 0)
  b[B.hips].position.set(0, 0.95, 0)
  // relaxed arms
  b[B.uaL].rotation.z = 0.08
  b[B.uaR].rotation.z = -0.08
}

export function poseWalk(b: THREE.Bone[], phase: number, amp = 1) {
  resetPose(b)
  const s = Math.sin(phase)
  const c = Math.cos(phase)
  b[B.thL].rotation.x = -0.42 * s * amp
  b[B.thR].rotation.x = 0.42 * s * amp
  b[B.shinL].rotation.x = Math.max(0, -c) * 0.75 * amp + 0.05
  b[B.shinR].rotation.x = Math.max(0, c) * 0.75 * amp + 0.05
  b[B.footL].rotation.x = -0.15 * s * amp
  b[B.footR].rotation.x = 0.15 * s * amp
  b[B.uaL].rotation.x = 0.32 * s * amp
  b[B.uaR].rotation.x = -0.32 * s * amp
  b[B.faL].rotation.x = -0.25 - 0.15 * amp
  b[B.faR].rotation.x = -0.25 - 0.15 * amp
  b[B.hips].position.y = 0.95 - 0.025 * amp + Math.abs(c) * 0.03 * amp
  b[B.hips].rotation.y = 0.08 * s * amp
  b[B.chest].rotation.y = -0.12 * s * amp
  b[B.spine].rotation.x = 0.03 * amp
}

export function poseRun(b: THREE.Bone[], phase: number) {
  poseWalk(b, phase, 1.7)
  b[B.spine].rotation.x = 0.18
  b[B.faL].rotation.x = -1.3
  b[B.faR].rotation.x = -1.3
  b[B.hips].position.y = 0.9 + Math.abs(Math.sin(phase)) * 0.07
}

export function poseIdle(b: THREE.Bone[], t: number, gesture = 0) {
  resetPose(b)
  const br = Math.sin(t * 1.6) * 0.015
  b[B.chest].rotation.x = br
  b[B.hips].rotation.z = Math.sin(t * 0.4) * 0.03
  b[B.thL].rotation.z = 0.04
  b[B.thR].rotation.z = -0.04
  b[B.head].rotation.y = Math.sin(t * 0.5) * 0.25
  if (gesture > 0) {
    b[B.uaR].rotation.x = -0.5 - Math.sin(t * 2.3) * 0.25
    b[B.faR].rotation.x = -1.2 + Math.sin(t * 3.1) * 0.3
    b[B.uaL].rotation.x = -0.2
    b[B.faL].rotation.x = -0.9
  }
}

export function poseSit(b: THREE.Bone[], t: number, seatH = 0.45, talk = 0) {
  resetPose(b)
  b[B.hips].position.y = seatH + 0.08
  b[B.thL].rotation.x = -1.5
  b[B.thR].rotation.x = -1.5
  b[B.thL].rotation.z = 0.08
  b[B.thR].rotation.z = -0.08
  b[B.shinL].rotation.x = 1.45
  b[B.shinR].rotation.x = 1.45
  b[B.spine].rotation.x = -0.08
  b[B.uaL].rotation.x = -0.45
  b[B.uaR].rotation.x = -0.45
  b[B.faL].rotation.x = -0.6
  b[B.faR].rotation.x = -0.6
  b[B.head].rotation.y = Math.sin(t * 0.6) * 0.4
  if (talk) {
    b[B.uaR].rotation.x = -0.7 - Math.sin(t * 2.2) * 0.2
    b[B.faR].rotation.x = -1.3 + Math.sin(t * 2.9) * 0.3
  }
}

export function poseLie(b: THREE.Bone[], t: number) {
  resetPose(b)
  b[B.hips].position.y = 0.12
  b[B.root].rotation.set(1.32, Math.PI, 0)
  b[B.spine].rotation.x = 0.25
  b[B.head].rotation.x = 0.3
  b[B.thL].rotation.x = -0.1
  b[B.thR].rotation.x = -0.35
  b[B.shinR].rotation.x = 0.6
  b[B.uaL].rotation.z = 0.25
  b[B.uaR].rotation.x = Math.PI - 0.4
  b[B.faR].rotation.x = -1.6
  b[B.chest].rotation.x = Math.sin(t * 1.2) * 0.012
}

export function poseSwim(b: THREE.Bone[], phase: number) {
  resetPose(b)
  b[B.root].rotation.x = Math.PI / 2 - 0.12
  b[B.hips].position.y = 0.95
  b[B.uaL].rotation.x = phase
  b[B.uaR].rotation.x = phase + Math.PI
  b[B.faL].rotation.x = -0.2
  b[B.faR].rotation.x = -0.2
  b[B.thL].rotation.x = Math.sin(phase * 3) * 0.25
  b[B.thR].rotation.x = -Math.sin(phase * 3) * 0.25
  b[B.chest].rotation.y = Math.sin(phase) * 0.35
  b[B.head].rotation.y = Math.sin(phase) * 0.5
  b[B.head].rotation.x = -0.4
}

export function poseSwing(b: THREE.Bone[], t: number, phase: number) {
  poseSit(b, t, 0.0)
  b[B.hips].position.y = 0.08
  const k = Math.sin(phase)
  b[B.shinL].rotation.x = 1.0 - k * 0.7
  b[B.shinR].rotation.x = 1.0 - k * 0.7
  b[B.spine].rotation.x = k * 0.3
  b[B.uaL].rotation.x = -Math.PI + 0.25
  b[B.uaR].rotation.x = -Math.PI + 0.25
  b[B.faL].rotation.x = 0
  b[B.faR].rotation.x = 0
}

export function poseClimb(b: THREE.Bone[], phase: number) {
  resetPose(b)
  const s = Math.sin(phase)
  b[B.thL].rotation.x = -0.9 - s * 0.5
  b[B.thR].rotation.x = -0.9 + s * 0.5
  b[B.shinL].rotation.x = 1.2 + s * 0.4
  b[B.shinR].rotation.x = 1.2 - s * 0.4
  b[B.uaL].rotation.x = -2.4 + s * 0.4
  b[B.uaR].rotation.x = -2.4 - s * 0.4
}

export function poseDribble(b: THREE.Bone[], phase: number, bounce: number) {
  poseRun(b, phase)
  b[B.uaR].rotation.x = -0.6
  b[B.uaR].rotation.z = -0.25
  b[B.faR].rotation.x = -0.4 - bounce * 0.5
}
