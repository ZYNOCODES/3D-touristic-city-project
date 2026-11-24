// Builds public/models/people/motion.{json,bin}: one compact motion set on the Rocketbox "Bip01" skeleton.
//  · Rocketbox mocap clips (walks, idles, sits…) resampled from public/models/people/anims/*.glb (or assets/cache/anims)
//  · CMU motion capture (mocap.cs.cmu.edu): crawl, breast and back stroke, jump take-off — retargeted
//  · a few authored poses (treading water, floating, lying on a lounger, flight phase of jump and dive)
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import * as THREE from 'three'

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const Q = () => new THREE.Quaternion()

function glb(path) {
  const b = readFileSync(path)
  const l = b.readUInt32LE(12)
  return { json: JSON.parse(b.subarray(20, 20 + l)), bin: b.subarray(28 + l) }
}

// ---------------------------------------------------------------- target skeleton
const tgt = glb(existsSync('assets/cache/anims/skeleton.glb') ? 'assets/cache/anims/skeleton.glb' : 'public/models/people/Male_Adult_01.glb').json
const nodes = new Map()
tgt.nodes.forEach((n) => nodes.set(n.name, { name: n.name, t: V(...(n.translation ?? [0, 0, 0])), q: new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])), s: V(...(n.scale ?? [1, 1, 1])), kids: (n.children ?? []).map((c) => tgt.nodes[c].name) }))
for (const n of nodes.values()) for (const k of n.kids) nodes.get(k).parent = n.name
const worldRest = new Map()
const rest = (name) => {
  if (worldRest.has(name)) return worldRest.get(name)
  const n = nodes.get(name)
  const m = new THREE.Matrix4().compose(n.t, n.q, n.s)
  if (n.parent) m.premultiply(rest(n.parent).m)
  const p = V(), q = Q(), s = V()
  m.decompose(p, q, s)
  const r = { m, p, q }
  worldRest.set(name, r)
  return r
}
const B = (n) => 'Bip01 ' + n
const P0 = (n) => rest(B(n)).p
const R0 = (n) => rest(B(n)).q
const BONES = ['Bip01', ...['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'L Clavicle', 'L UpperArm', 'L Forearm', 'L Hand', 'R Clavicle', 'R UpperArm', 'R Forearm', 'R Hand', 'L Thigh', 'L Calf', 'L Foot', 'R Thigh', 'R Calf', 'R Foot'].map(B)]
const HIP_Y = rest('Bip01').p.y

const basis = (x, y) => {
  // orthonormal frame with exact y, x as close as possible
  const yy = y.clone().normalize()
  const xx = x.clone().addScaledVector(yy, -x.dot(yy)).normalize()
  const zz = xx.clone().cross(yy)
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(xx, yy, zz))
}
const dirBasis = (d, h) => basis(h, d) // y along the bone, x along the hinge
const restPose = {
  hipL: P0('L Thigh'), hipR: P0('R Thigh'), kneeL: P0('L Calf'), kneeR: P0('R Calf'), ankL: P0('L Foot'), ankR: P0('R Foot'), toeL: P0('L Toe0'), toeR: P0('R Toe0'),
  shL: P0('L UpperArm'), shR: P0('R UpperArm'), elL: P0('L Forearm'), elR: P0('R Forearm'), wrL: P0('L Hand'), wrR: P0('R Hand'),
  neck: P0('Neck'), head: P0('Head'), chest: P0('Spine2'), pelvis: P0('Pelvis'),
}
restPose.headTop = restPose.head.clone().add(V(0, 0.12, 0.02))

/** stick figure (joint positions) → local quaternions on the Bip01 skeleton */
function makeSolver() {
  const prev = {}
  const hinge = (key, a, b, fallback) => {
    const h = a.clone().cross(b)
    const k = h.length() / (a.length() * b.length() + 1e-9)
    h.normalize()
    const last = prev[key]
    let out
    if (k < 0.2) {
      const base = (last ?? fallback).clone()
      out = base.addScaledVector(a.clone().normalize(), -base.dot(a.clone().normalize())).normalize()
      if (last && k > 0.06) out.lerp(h, (k - 0.06) / 0.14 * 0.5).normalize()
    } else {
      out = h
      if (last && out.dot(last) < -0.2 && k < 0.5) out = last.clone()
    }
    if (last) out = last.clone().lerp(out, 0.6).normalize()
    prev[key] = out.clone()
    return out
  }
  const d = (p, a, b) => p[b].clone().sub(p[a])
  const restH = {}
  for (const s of ['L', 'R']) {
    restH['arm' + s] = d(restPose, 'sh' + s, 'el' + s).cross(d(restPose, 'el' + s, 'wr' + s)).normalize()
    restH['leg' + s] = V(-1, 0, 0) // knee axis
  }
  const q0 = {
    pelvis: basis(d(restPose, 'hipR', 'hipL'), d(restPose, 'pelvis', 'chest')),
    chest: basis(d(restPose, 'shR', 'shL'), d(restPose, 'chest', 'neck')),
    head: basis(d(restPose, 'shR', 'shL'), d(restPose, 'neck', 'headTop')),
  }
  const apply = (cur, r0, bone) => cur.clone().multiply(r0.clone().invert()).multiply(R0(bone))
  return (p) => {
    const W = new Map()
    const mid = p.hipL.clone().add(p.hipR).multiplyScalar(0.5)
    const pel = basis(d(p, 'hipR', 'hipL'), p.chest.clone().sub(mid))
    const chest = basis(d(p, 'shR', 'shL'), p.neck.clone().sub(p.chest))
    const dp = pel.clone().multiply(q0.pelvis.clone().invert())
    const dc = chest.clone().multiply(q0.chest.clone().invert())
    W.set('Pelvis', dp.clone().multiply(R0('Pelvis')))
    W.set('Spine', dp.clone().slerp(dc, 0.15).multiply(R0('Spine')))
    W.set('Spine1', dp.clone().slerp(dc, 0.55).multiply(R0('Spine1')))
    W.set('Spine2', dc.clone().multiply(R0('Spine2')))
    const hd = basis(d(p, 'shR', 'shL'), p.headTop.clone().sub(p.neck))
    const dh = hd.clone().multiply(q0.head.clone().invert())
    W.set('Neck', dc.clone().slerp(dh, 0.5).multiply(R0('Neck')))
    W.set('Head', dh.clone().multiply(R0('Head')))
    for (const s of ['L', 'R']) {
      W.set(s + ' Clavicle', dc.clone().multiply(R0(s + ' Clavicle')))
      const ua = d(p, 'sh' + s, 'el' + s), fa = d(p, 'el' + s, 'wr' + s)
      const ha = hinge('arm' + s, ua, fa, restH['arm' + s].clone().applyQuaternion(dc))
      W.set(s + ' UpperArm', apply(dirBasis(ua, ha), dirBasis(d(restPose, 'sh' + s, 'el' + s), restH['arm' + s]), s + ' UpperArm'))
      const fw = apply(dirBasis(fa, ha), dirBasis(d(restPose, 'el' + s, 'wr' + s), restH['arm' + s]), s + ' Forearm')
      W.set(s + ' Forearm', fw)
      const df = fw.clone().multiply(R0(s + ' Forearm').clone().invert())
      W.set(s + ' Hand', df.multiply(R0(s + ' Hand')))
      const th = d(p, 'hip' + s, 'knee' + s), sh = d(p, 'knee' + s, 'ank' + s)
      const lat = V(-1, 0, 0).applyQuaternion(dp)
      let hl = hinge('leg' + s, th, sh, lat)
      if (hl.dot(lat) < 0) hl = lat.clone().addScaledVector(th.clone().normalize(), -lat.dot(th.clone().normalize())).normalize()
      W.set(s + ' Thigh', apply(dirBasis(th, hl), dirBasis(d(restPose, 'hip' + s, 'knee' + s), restH['leg' + s]), s + ' Thigh'))
      W.set(s + ' Calf', apply(dirBasis(sh, hl), dirBasis(d(restPose, 'knee' + s, 'ank' + s), restH['leg' + s]), s + ' Calf'))
      W.set(s + ' Foot', apply(dirBasis(d(p, 'ank' + s, 'toe' + s), hl), dirBasis(d(restPose, 'ank' + s, 'toe' + s), restH['leg' + s]), s + ' Foot'))
    }
    const out = []
    for (const b of BONES) {
      if (b === 'Bip01') {
        out.push(nodes.get('Bip01').q.clone())
        continue
      }
      const par = nodes.get(b).parent
      const pw = par === 'Bip01' ? rest('Bip01').q : W.get(par.slice(6))
      out.push(pw.clone().invert().multiply(W.get(b.slice(6))).normalize())
    }
    return { q: out, pos: mid }
  }
}

// ---------------------------------------------------------------- CMU BVH
function bvh(path) {
  const L = readFileSync(path, 'utf8').split(/\r?\n/)
  const joints = []
  const stack = []
  let i = 0
  for (; i < L.length; i++) {
    const t = L[i].trim().split(/\s+/)
    if (t[0] === 'ROOT' || t[0] === 'JOINT') {
      const j = { name: t[1], parent: stack.at(-1) ?? null, off: V(), ch: [] }
      joints.push(j)
      stack.push(j)
    } else if (t[0] === 'End') stack.push({ end: true, parent: stack.at(-1), off: V() })
    else if (t[0] === 'OFFSET') {
      const j = stack.at(-1)
      j.off.set(+t[1], +t[2], +t[3])
      if (j.end) j.parent.endOff = j.off.clone()
    } else if (t[0] === 'CHANNELS') stack.at(-1).ch = t.slice(2)
    else if (t[0] === '}') stack.pop()
    else if (t[0] === 'MOTION') break
  }
  const n = +L[i + 1].split(':')[1]
  const dt = +L[i + 2].split(':')[1]
  const frames = L.slice(i + 3, i + 3 + n).map((x) => x.trim().split(/\s+/).map(Number))
  const K = 0.056444
  const D = Math.PI / 180
  const pose = (f) => {
    const v = frames[f]
    let c = 0
    const out = {}
    for (const j of joints) {
      const p = j.off.clone()
      const q = Q()
      for (const ch of j.ch) {
        const x = v[c++]
        if (ch === 'Xposition') p.x += x
        else if (ch === 'Yposition') p.y += x
        else if (ch === 'Zposition') p.z += x
        else q.multiply(Q().setFromAxisAngle(ch[0] === 'X' ? V(1, 0, 0) : ch[0] === 'Y' ? V(0, 1, 0) : V(0, 0, 1), x * D))
      }
      if (j.parent) {
        const o = out[j.parent.name]
        p.applyQuaternion(o.q).add(o.p)
        q.premultiply(o.q)
      }
      out[j.name] = { p, q }
    }
    const g = (nm) => out[nm].p.clone().multiplyScalar(K)
    const r = {
      hipL: g('LeftUpLeg'), hipR: g('RightUpLeg'), kneeL: g('LeftLeg'), kneeR: g('RightLeg'), ankL: g('LeftFoot'), ankR: g('RightFoot'), toeL: g('LeftToeBase'), toeR: g('RightToeBase'),
      shL: g('LeftArm'), shR: g('RightArm'), elL: g('LeftForeArm'), elR: g('RightForeArm'), wrL: g('LeftHand'), wrR: g('RightHand'), neck: g('Neck'), head: g('Head'), chest: g('Spine1'),
    }
    const hj = joints.find((j) => j.name === 'Head')
    r.headTop = (hj.endOff ?? V(0, 2, 0)).clone().applyQuaternion(out.Head.q).add(out.Head.p).multiplyScalar(K)
    return r
  }
  return { n, dt, pose }
}
const mapPose = (p, f) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, f(v.clone())]))
const pmid = (p) => p.hipL.clone().add(p.hipR).multiplyScalar(0.5)

const clips = {}
function addClip(name, poses, fps, opt = {}) {
  const solve = makeSolver()
  const q = [], pos = []
  // run the first second twice so the hinge memory settles for loops
  if (opt.loop !== false) poses.slice(0, Math.min(poses.length, fps)).forEach(solve)
  for (const p of poses) {
    const s = solve(p)
    q.push(s.q)
    pos.push(s.pos)
  }
  clips[name] = { fps, q, pos, speed: opt.speed ?? 0, loop: opt.loop !== false }
}

/** best looping cycle of a swim take: yaw-aligned, travel removed */
function swim(name, file, { min = 1.0, max = 2.6, from = 0.1, to = 0.9, fps = 24, face = -1 }) {
  const b = bvh(`assets/cache/cmu/${file}.bvh`)
  const step = Math.round(1 / fps / b.dt)
  const P = []
  for (let f = Math.floor(b.n * from); f < b.n * to; f += step) P.push(b.pose(f))
  const mids = P.map(pmid)
  const rel = P.map((p, i) => Object.values(p).flatMap((v) => v.clone().sub(mids[i]).toArray()))
  let best = [1e9]
  for (let i = 0; i < P.length; i++)
    for (let len = Math.round(min * fps); len <= max * fps && i + len + 2 < P.length; len++) {
      let e = 0
      for (let k = 0; k < rel[0].length; k++) e += (rel[i][k] - rel[i + len][k]) ** 2 + 0.6 * (rel[i + 2][k] - rel[i + len + 2][k]) ** 2
      if (e < best[0]) best = [e, i, len]
    }
  const [e, i0, len] = best
  // heading: hips → chest, horizontal
  const dir = V()
  for (let i = i0; i < i0 + len; i++) dir.add(P[i].neck.clone().sub(mids[i]).setY(0).normalize())
  const yaw = Math.atan2(dir.x, dir.z)
  const up = P[i0].neck.clone().sub(mids[i0]).normalize()
  const belly = P[i0].shL.clone().sub(P[i0].shR).cross(up).normalize()
  const travel = mids[i0 + len].clone().sub(mids[i0]).setY(0).length()
  console.log(name, file, 'err', e.toFixed(3), 'cycle', (len / fps).toFixed(2), 's', 'torso up.y', up.y.toFixed(2), 'front.y', belly.y.toFixed(2), 'travel m/s', (travel / (len / fps)).toFixed(2), 'hipY', mids[i0].y.toFixed(2))
  const rot = Q().setFromAxisAngle(V(0, 1, 0), -yaw)
  const y0 = mids.slice(i0, i0 + len).reduce((a, m) => a + m.y, 0) / len
  const poses = []
  for (let k = 0; k < len; k++) {
    // cross-fade the last 20 % into the pose before the start
    const w = THREE.MathUtils.smoothstep(k, len * 0.78, len)
    const a = P[i0 + k], am = mids[i0 + k]
    const prevI = i0 + k - len
    const c = prevI >= 0 ? P[prevI] : null
    const cm = prevI >= 0 ? mids[prevI] : null
    const o = {}
    for (const key of Object.keys(a)) {
      const va = a[key].clone().sub(V(am.x, y0, am.z))
      if (c) va.lerp(c[key].clone().sub(V(cm.x, y0, cm.z)), w)
      o[key] = va.applyQuaternion(rot)
    }
    poses.push(o)
  }
  poses.push(poses[0])
  addClip(name, poses, fps, { speed: Math.min(1.6, travel / (len / fps)) })
}
swim('swim_crawl', '126_10', { min: 1.1, max: 2.4 })
swim('swim_crawl2', '125_06', { min: 1.1, max: 2.4, from: 0.08, to: 0.5 })
swim('swim_breast', '126_03', { min: 1.0, max: 2.4 })
swim('swim_back', '126_01', { min: 1.0, max: 2.6 })

// ---------------------------------------------------------------- authored figures
const len = (a, b) => restPose[a].distanceTo(restPose[b])
const LEN = { thigh: len('hipL', 'kneeL'), shin: len('kneeL', 'ankL'), foot: len('ankL', 'toeL'), ua: len('shL', 'elL'), fa: len('elL', 'wrL'), hipW: len('hipL', 'hipR') / 2, shW: len('shL', 'shR') / 2, low: restPose.chest.y - restPose.hipL.y, up: restPose.neck.y - restPose.chest.y, shDrop: restPose.neck.y - restPose.shL.y }
/** body frame: x left, y up the spine, z front. Directions are given for both sides (x mirrored for the right unless r is given) */
function figure({ rot = Q(), pos = V(), bend = 0, head = V(0, 1, 0.12), ua = V(0.5, -1, 0), fa = V(0.2, -1, 0.3), th = V(0.08, -1, 0), sh = V(0, -1, -0.02), ft = V(0.1, -0.25, 1), r = {} }) {
  const body = (v) => v.clone().applyQuaternion(rot)
  const br = rot.clone().multiply(Q().setFromAxisAngle(V(1, 0, 0), bend))
  const up = (v) => v.clone().applyQuaternion(br)
  const m = (v) => V(-v.x, v.y, v.z)
  const p = {}
  p.hipL = pos.clone().add(body(V(LEN.hipW, 0, 0)))
  p.hipR = pos.clone().add(body(V(-LEN.hipW, 0, 0)))
  p.chest = pos.clone().add(body(V(0, LEN.low * 0.5, 0))).add(up(V(0, LEN.low * 0.5, 0)))
  p.neck = p.chest.clone().add(up(V(0, LEN.up, 0)))
  p.headTop = p.neck.clone().add(up(head.clone().normalize().multiplyScalar(0.22)))
  p.head = p.neck.clone().add(up(V(0, 0.09, 0)))
  for (const [s, k] of [['L', 1], ['R', -1]]) {
    const g = (key, def) => (k === 1 ? def : r[key] ?? m(def)).clone().normalize()
    p['sh' + s] = p.neck.clone().add(up(V(k * LEN.shW, -LEN.shDrop, 0)))
    p['el' + s] = p['sh' + s].clone().add(up(g('ua', ua).multiplyScalar(LEN.ua)))
    p['wr' + s] = p['el' + s].clone().add(up(g('fa', fa).multiplyScalar(LEN.fa)))
    p['knee' + s] = p['hip' + s].clone().add(body(g('th', th).multiplyScalar(LEN.thigh)))
    p['ank' + s] = p['knee' + s].clone().add(body(g('sh', sh).multiplyScalar(LEN.shin)))
    p['toe' + s] = p['ank' + s].clone().add(body(g('ft', ft).multiplyScalar(LEN.foot)))
  }
  return p
}
const X = (a) => Q().setFromAxisAngle(V(1, 0, 0), a)
const cyc = (n, f) => {
  const a = []
  for (let i = 0; i <= n; i++) a.push(f((i / n) * Math.PI * 2))
  return a
}
// treading water: eggbeater legs, sculling arms, head up
addClip('tread', cyc(36, (t) => figure({
  rot: X(-0.12 + 0.03 * Math.sin(t)), pos: V(0, 0.03 * Math.sin(2 * t), 0), bend: 0.12, head: V(0.06 * Math.sin(t), 1, 0.05),
  ua: V(0.85, -0.55, 0.55 + 0.18 * Math.sin(t)), fa: V(0.25 + 0.75 * Math.sin(t), -0.18, 0.95),
  th: V(0.42, -0.62, 0.62 + 0.1 * Math.sin(t)), sh: V(0.1 + 0.42 * Math.sin(t), -0.95, -0.35 + 0.4 * Math.cos(t)), ft: V(0.5, -0.5, 0.7),
  r: { th: V(-0.42, -0.62, 0.62 + 0.1 * Math.sin(t + Math.PI)), sh: V(-0.1 + 0.42 * Math.sin(t), -0.95, -0.35 + 0.4 * Math.cos(t + Math.PI)), fa: V(-0.25 - 0.75 * Math.sin(t + 0.4), -0.18, 0.95) },
})), 24)
// floating on the back
addClip('float', cyc(60, (t) => figure({
  rot: X(-Math.PI / 2 + 0.16 + 0.02 * Math.sin(t)), bend: -0.06, head: V(0, 1, 0.3), ua: V(1, 0.25, -0.12 + 0.05 * Math.sin(t)), fa: V(0.95, 0.35 + 0.1 * Math.sin(t), -0.05),
  th: V(0.17, -1, -0.08 + 0.05 * Math.sin(t)), sh: V(0.1, -1, -0.16), ft: V(0.2, -0.9, 0.5),
})), 15)
// lying on a lounger (back rest 38°): seat level = 0, head towards +z
addClip('lie', cyc(40, (t) => figure({
  rot: Q().setFromAxisAngle(V(0, 1, 0), Math.PI).multiply(X(-Math.PI / 2 + 0.06)), pos: V(0, 0.1, 0.12), bend: 0.58 + 0.012 * Math.sin(t), head: V(0, 1, 0.22 + 0.01 * Math.sin(t)),
  ua: V(0.32, -0.95, 0.02), fa: V(0.1, -0.9, 0.22), th: V(0.1, -1, 0.06), sh: V(0.04, -1, -0.1), ft: V(0.25, -0.55, 0.8),
})), 15)
addClip('lie_read', cyc(40, (t) => figure({
  rot: Q().setFromAxisAngle(V(0, 1, 0), Math.PI).multiply(X(-Math.PI / 2 + 0.06)), pos: V(0, 0.1, 0.12), bend: 0.64, head: V(0, 1, 0.42 + 0.02 * Math.sin(t)),
  ua: V(0.25, -0.72, 0.62), fa: V(-0.42, 0.25, 0.85), th: V(0.1, -0.75, 0.62), sh: V(0.02, -0.72, -0.7), ft: V(0.15, -0.95, 0.1),
  r: { th: V(-0.12, -1, 0.05), sh: V(-0.04, -1, -0.08), ft: V(-0.25, -0.55, 0.8) },
})), 15)
// sitting on a rock edge, hands behind, feet swinging
addClip('sit_edge', cyc(48, (t) => figure({
  rot: X(-0.22), bend: 0.14, head: V(0.12 * Math.sin(t * 0.5), 1, 0.16), ua: V(0.45, -0.88, -0.42), fa: V(0.1, -1, -0.12),
  th: V(0.14, -0.12, 1), sh: V(0.03, -1, 0.12 + 0.16 * Math.sin(t)), ft: V(0.15, -0.6, 0.8),
  r: { sh: V(-0.03, -1, 0.12 + 0.16 * Math.sin(t + 2.2)) },
})), 15)
// stand-up paddling
addClip('paddle', cyc(44, (t) => figure({
  rot: X(0.1 + 0.07 * Math.sin(t)), pos: V(0, 0.82 + 0.015 * Math.sin(t), 0), bend: 0.22 + 0.14 * Math.sin(t), head: V(0, 1, -0.12),
  ua: V(0.35, -0.35 + 0.15 * Math.sin(t), 0.9), fa: V(-0.25, 0.35, 0.75 - 0.3 * Math.sin(t)),
  th: V(0.14, -1, 0.2), sh: V(0.02, -1, -0.24), ft: V(0.12, -0.05, 1),
  r: { ua: V(-0.5, -0.8, 0.45 + 0.35 * Math.sin(t)), fa: V(-0.2, -0.75, 0.6 + 0.3 * Math.sin(t)) },
})), 20)
// balcony rail: leaning on the hand rail, looking out
addClip('lean_rail', cyc(50, (t) => figure({
  rot: X(0.16), pos: V(0, 0.885, 0), bend: 0.26 + 0.01 * Math.sin(t), head: V(0.1 * Math.sin(t), 1, -0.12), ua: V(0.28, -0.8, 0.62), fa: V(-0.2, -0.12, 1),
  th: V(0.1, -1, -0.12), sh: V(0.02, -1, -0.05), ft: V(0.2, -0.03, 1),
})), 12)

// ---------------------------------------------------------------- jump & dive: captured take-off + authored flight
function takeoff(file) {
  const b = bvh(`assets/cache/cmu/${file}.bvh`)
  const fps = 24
  const step = Math.round(1 / fps / b.dt)
  const P = []
  for (let f = 4; f < b.n; f += step) P.push(b.pose(f))
  const feet = P.map((p) => Math.min(p.toeL.y, p.toeR.y, p.ankL.y, p.ankR.y))
  const y = P.map((p) => pmid(p).y)
  let apex = 0
  y.forEach((v, i) => v > y[apex] && (apex = i))
  const ground = Math.min(...feet)
  let off = apex
  while (off > 0 && feet[off] > ground + 0.06) off--
  const start = Math.max(0, off - Math.round(1.15 * fps))
  const m0 = pmid(P[off])
  const fwd = pmid(P[apex]).sub(m0).setY(0).normalize()
  const rot = Q().setFromAxisAngle(V(0, 1, 0), -Math.atan2(fwd.x, fwd.z))
  console.log('takeoff', file, 'frames', P.length, 'start', start, 'off', off, 'apex', apex, 'rise', (y[apex] - y[off]).toFixed(2))
  const seq = P.slice(start, off + 3).map((p) => mapPose(p, (v) => v.sub(V(m0.x, ground, m0.z)).applyQuaternion(rot)))
  return { seq, fps }
}
const tk = takeoff('16_05')
const blend = (a, b, w) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k].clone().lerp(b[k], w)]))
const recenter = (p) => {
  const c = pmid(p)
  return mapPose(p, (v) => v.sub(c))
}
const AIR = {
  reach: figure({ rot: X(0.06), bend: -0.12, head: V(0, 1, 0.1), ua: V(0.75, 0.75, 0.25), fa: V(0.5, 0.85, 0.2), th: V(0.14, -0.9, 0.42), sh: V(0.04, -0.82, -0.55), ft: V(0.1, -0.8, 0.5) }),
  wheel: figure({ rot: X(0.02), bend: -0.05, head: V(0, 1, 0.16), ua: V(1, 0.22, -0.15), fa: V(0.9, 0.35, 0.1), th: V(0.12, -0.95, 0.3), sh: V(0.03, -0.95, -0.22), ft: V(0.1, -0.9, 0.35), r: { th: V(-0.12, -1, 0.02), sh: V(-0.03, -1, -0.12) } }),
  pencil: figure({ rot: X(-0.02), bend: 0.02, head: V(0, 1, 0.12), ua: V(0.2, -1, 0.06), fa: V(0.02, -1, 0.16), th: V(0.0, -1, 0.03), sh: V(0, -1, -0.02), ft: V(0.04, -0.95, 0.25) }),
  tuck: figure({ rot: X(0.25), bend: 0.5, head: V(0, 1, 0.1), ua: V(0.35, -0.55, 0.8), fa: V(-0.1, -0.9, 0.3), th: V(0.16, 0.35, 0.95), sh: V(0, -0.95, -0.25), ft: V(0.1, -0.7, 0.6) }),
  pike: figure({ rot: X(0.5), bend: 0.65, head: V(0, 1, 0.1), ua: V(0.25, 0.95, 0.35), fa: V(-0.05, 1, 0.3), th: V(0.06, -0.92, 0.35), sh: V(0, -1, -0.02), ft: V(0.02, -0.95, 0.3) }),
  stream: figure({ rot: X(0), bend: 0.0, head: V(0, 1, -0.05), ua: V(0.16, 1, 0.1), fa: V(-0.14, 1, 0.05), th: V(0.01, -1, 0.0), sh: V(0, -1, -0.01), ft: V(0.02, -1, 0.12) }),
}
const airClip = (keys, dur, fps = 24) => {
  const out = []
  const n = Math.round(dur * fps)
  for (let i = 0; i <= n; i++) {
    const t = i / n
    let k = 0
    while (k < keys.length - 2 && t > keys[k + 1][0]) k++
    const w = THREE.MathUtils.smootherstep(t, keys[k][0], keys[k + 1][0])
    out.push(blend(keys[k][1], keys[k + 1][1], w))
  }
  return out
}
const last = recenter(tk.seq.at(-1))
addClip('jump_takeoff', tk.seq, tk.fps, { loop: false })
addClip('jump_air', airClip([[0, last], [0.2, AIR.reach], [0.52, AIR.wheel], [0.82, AIR.pencil], [1, AIR.pencil]], 1), 24, { loop: false })
addClip('tuck_air', airClip([[0, last], [0.25, AIR.tuck], [0.7, AIR.tuck], [0.9, AIR.pencil], [1, AIR.pencil]], 1), 24, { loop: false })
addClip('dive_air', airClip([[0, last], [0.22, AIR.reach], [0.45, AIR.pike], [0.72, AIR.stream], [1, AIR.stream]], 1), 24, { loop: false })
addClip('glide', cyc(20, (t) => figure({ rot: X(0), ua: V(0.16, 1, 0.1), fa: V(-0.14, 1, 0.05), th: V(0.03, -1, 0.1 * Math.sin(t)), sh: V(0, -1, -0.1 + 0.12 * Math.sin(t - 0.8)), ft: V(0.02, -1, 0.05), r: { th: V(-0.03, -1, -0.1 * Math.sin(t)), sh: V(0, -1, -0.1 - 0.12 * Math.sin(t - 0.8)) } })), 24)

// ---------------------------------------------------------------- Rocketbox clips (already on this skeleton)
const meta = JSON.parse(readFileSync(existsSync('assets/cache/anims/people.json') ? 'assets/cache/anims/people.json' : 'public/models/people/people.json', 'utf8'))
const dirA = existsSync('assets/cache/anims') ? 'assets/cache/anims/' : 'public/models/people/anims/'
const want = { f_idle_neutral_01: 8, f_idle_look_around_01: 8, f_drink_idle: 8, f_sit_chair_idle_relaxed_01: 8, m_idle_neutral_01: 8, m_idle_look_around_01: 8, m_drink_idle: 8, m_cell_phone_talk_01: 8, m_sit_chair_idle_relaxed_01: 8, m_sit_table_idle_relaxed_01: 8, f_walk_neutral: 9, f_walk_stroll_01: 9, m_walk_neutral: 9, m_walk_stroll_01: 9, f_gestic_talk_neutral_04: 8, m_gestic_talk_neutral_04: 8 }
for (const [name, maxDur] of Object.entries(want)) {
  const c = meta.clips[name]
  if (!c) continue
  const { json, bin } = glb(dirA + c.file.split('/').pop())
  const acc = (i) => {
    const a = json.accessors[i], bv = json.bufferViews[a.bufferView]
    const n = a.count * { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type]
    const o = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const out = new Float32Array(n)
    for (let k = 0; k < n; k++) out[k] = bin.readFloatLE(o + k * 4)
    return out
  }
  const an = json.animations[0]
  const tr = {}
  for (const ch of an.channels) {
    const s = an.samplers[ch.sampler]
    tr[json.nodes[ch.target.node].name + '.' + ch.target.path] = { t: acc(s.input), v: acc(s.output) }
  }
  const dur = Math.min(maxDur, c.duration)
  const fps = /walk/.test(name) ? 24 : 12
  const n = Math.round(dur * fps)
  const q = [], pos = []
  const sample = (key, t, k) => {
    const x = tr[key]
    if (!x) return null
    let i = 0
    while (i < x.t.length - 2 && x.t[i + 1] < t) i++
    if (x.t.length === 1) return Array.from(x.v.slice(0, k))
    const w = Math.min(1, Math.max(0, (t - x.t[i]) / (x.t[i + 1] - x.t[i])))
    if (k === 4) return new THREE.Quaternion(...x.v.slice(i * 4, i * 4 + 4)).slerp(new THREE.Quaternion(...x.v.slice(i * 4 + 4, i * 4 + 8)), w)
    return [0, 1, 2].map((c2) => x.v[i * 3 + c2] * (1 - w) + x.v[i * 3 + 3 + c2] * w)
  }
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * dur + (tr['Bip01.rotation']?.t[0] ?? 0)
    q.push(BONES.map((b) => {
      const s = sample(b + '.rotation', t, 4)
      if (!s) return nodes.get(b).q.clone()
      return s instanceof THREE.Quaternion ? s : new THREE.Quaternion(...s)
    }))
    const p = sample('Bip01.translation', t, 3) ?? [0, c.rootHeight, 0]
    pos.push(V(0, p[1], 0))
  }
  // soften the loop seam of trimmed idles
  if (!/walk/.test(name)) {
    const m = Math.round(fps * 1.2)
    for (let k = 0; k < m; k++) {
      const w = (k + 1) / m
      const i = n - m + 1 + k
      q[i] = q[i].map((a, bi) => a.clone().slerp(q[0][bi], THREE.MathUtils.smoothstep(w, 0, 1)))
      pos[i].lerp(pos[0], THREE.MathUtils.smoothstep(w, 0, 1))
    }
  }
  clips[name] = { fps, q, pos, speed: c.rootSpeed, loop: true, native: true }
}

// ---------------------------------------------------------------- write
const index = { bones: BONES.map((b) => b.replace(/ /g, '_')), hip: HIP_Y, clips: {} }
const chunks = []
let off = 0
for (const [name, c] of Object.entries(clips)) {
  const n = c.q.length
  const a = new Int16Array(n * (BONES.length * 4 + 3))
  let k = 0
  const prev = []
  for (let i = 0; i < n; i++) {
    c.q[i].forEach((q, b) => {
      if (prev[b] && prev[b].dot(q) < 0) q.set(-q.x, -q.y, -q.z, -q.w)
      prev[b] = q
      a[k++] = Math.round(q.x * 32767); a[k++] = Math.round(q.y * 32767); a[k++] = Math.round(q.z * 32767); a[k++] = Math.round(q.w * 32767)
    })
    for (const v of c.pos[i].toArray()) a[k++] = Math.round(v * 8000)
  }
  if (a.some((v) => Number.isNaN(v))) console.log('NaN in', name)
  index.clips[name] = { o: off, n, fps: c.fps, speed: +c.speed.toFixed(3), loop: c.loop, native: !!c.native, hip: +(c.pos[0].y).toFixed(3) }
  chunks.push(Buffer.from(a.buffer))
  off += a.length
}
writeFileSync('public/models/people/motion.bin', Buffer.concat(chunks))
writeFileSync('public/models/people/motion.json', JSON.stringify(index))
console.log(Object.keys(clips).length, 'clips', (Buffer.concat(chunks).length / 1024).toFixed(0), 'KB')
