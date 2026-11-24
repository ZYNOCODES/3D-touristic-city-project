// The tower, terrace and sea deck (blender/hotel.py) + instanced room glazing with interior mapping.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { loadGLTFUrl } from '../../lib/assets'
import { useStore } from '../../store'
import { HOTEL, ROOMS, ROOM_BY_ID, STATUS_META, roomFrame } from '../../data/rooms'
import { getMaterial } from '../materials/library'
import { GLOBAL, GLSL_NOISE, damp } from '../shared'
import { SKY } from '../env/SkySystem'
import { applyPBR } from '../../lib/assets'
import { coveTex } from '../cove/quality'
import { WAVE_GLSL, patchUnderwater, uwUniforms } from '../cove/underwater'

const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p)

/** cut-away shared with RoomInterior: pixels inside this box (room space) are discarded */
export const CUT = {
  uCutOn: { value: 0 }, uCutInv: { value: new THREE.Matrix4() }, uCutMin: { value: new THREE.Vector3() }, uCutMax: { value: new THREE.Vector3() },
}
function patchCut<M extends THREE.Material>(m: M): M {
  const prev = m.onBeforeCompile
  const key = m.customProgramCacheKey.bind(m)
  m.onBeforeCompile = (s, r) => {
    prev?.call(m, s, r)
    Object.assign(s.uniforms, CUT)
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nuniform mat4 uCutInv; varying vec3 vCut;').replace('#include <project_vertex>', '#include <project_vertex>\nvCut = (uCutInv * modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCutOn; uniform vec3 uCutMin, uCutMax; varying vec3 vCut;')
      .replace('#include <clipping_planes_fragment>', 'if (uCutOn > 0.5 && all(greaterThan(vCut, uCutMin)) && all(lessThan(vCut, uCutMax))) discard;\n#include <clipping_planes_fragment>')
  }
  m.customProgramCacheKey = () => key() + '|cut'
  return m
}

/** world-space weathering so the big white slabs do not look like plain CG plaster */
function plaster() {
  const m = std({ color: '#e6e1d8', roughness: 0.78, envMapIntensity: 1 })
  const n = coveTex('ground_rocky_nor_gl')
  m.onBeforeCompile = (s) => {
    s.uniforms.tN = { value: n }
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position,1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWp;\n${GLSL_NOISE}`)
      .replace('#include <map_fragment>', `
        float st = vfbm(vec2(vWp.x * 0.9 + vWp.z * 0.7, vWp.y * 0.25));
        float fine = vnoise(vWp.xy * 23.0 + vWp.z * 17.0);
        diffuseColor.rgb *= mix(0.93, 1.015, st) * mix(0.985, 1.01, fine);`)
  }
  m.customProgramCacheKey = () => 'hotel-white'
  return m
}

function stoneTiles(scale: number, tint: string, rough: number) {
  const m = std({ color: tint, roughness: rough })
  applyPBR(m, 'travertine', 0.35, 0.5)
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position,1.0)).xyz; vWn = normal;')
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vWp; varying vec3 vWn;\n${GLSL_NOISE}`).replace('#include <color_fragment>', `#include <color_fragment>
      if (abs(vWn.y) > 0.6) {
        vec2 q = vWp.xz / vec2(${(scale * 1.5).toFixed(2)}, ${scale.toFixed(2)});
        q.x += 0.5 * mod(floor(q.y), 2.0);
        vec2 id = floor(q); vec2 f = fract(q);
        float w = 0.006;
        float j = max(smoothstep(w, 0.0, min(f.x, 1.0 - f.x) * 1.5), smoothstep(w, 0.0, min(f.y, 1.0 - f.y)));
        float far = smoothstep(90.0, 25.0, distance(cameraPosition, vWp));
        diffuseColor.rgb *= mix(0.95, 1.04, vhash(id)) * (1.0 - 0.45 * j * far);
        diffuseColor.rgb *= mix(0.9, 1.04, vfbm(vWp.xz * 0.35));
      }`)
  }
  m.customProgramCacheKey = () => 'stone-tiles' + scale + tint
  return m
}

let mats: Record<string, THREE.Material> | null = null
export function hotelMaterial(name: string): THREE.Material {
  mats ??= {
    hotel_white: plaster(),
    bronze: std({ color: '#3a2a1d', roughness: 0.42, metalness: 0.75, envMapIntensity: 1.1 }),
    dark_glass: new THREE.MeshPhysicalMaterial({ color: '#10181b', roughness: 0.06, metalness: 0.1, envMapIntensity: 1.6, transparent: true, opacity: 0.82 }),
    glass_rail: new THREE.MeshPhysicalMaterial({ color: '#cfe6e4', roughness: 0.03, metalness: 0, transparent: true, opacity: 0.16, envMapIntensity: 1.3, depthWrite: false, side: THREE.DoubleSide }),
    terrace: stoneTiles(0.6, '#cdbfa9', 0.72),
    travertine: stoneTiles(0.6, '#d8cbb8', 0.6),
    stone_wall: (() => {
      const m = std({ roughness: 0.95 })
      applyPBR(m, 'stone_wall', 0.3, 1)
      m.envMapIntensity = 1
      m.onBeforeCompile = (s) => {
        s.fragmentShader = s.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat lw = dot(diffuseColor.rgb, vec3(0.333)); diffuseColor.rgb = pow(mix(vec3(lw), diffuseColor.rgb, 0.35), vec3(0.62)) * vec3(0.98, 0.94, 0.87);')
      }
      m.customProgramCacheKey = () => 'retain'
      return m
    })(),
    cladding: (() => {
      const m = std({ roughness: 0.6, envMapIntensity: 0.9 })
      m.color.setRGB(3.1, 2.35, 1.6)
      applyPBR(m, 'cladding', 0.5, 0.6)
      return m
    })(),
    lamp: new THREE.MeshStandardMaterial({ color: '#fff4e2', emissive: '#ffd9a0', emissiveIntensity: 0.4 }),
    towel: std({ color: '#c9774e', roughness: 1 }),
    pile: patchUnderwater(std({ color: '#6d6152', roughness: 0.95 }), 'pile'),
    soil: std({ color: '#33261a', roughness: 1 }),
    pooltile: poolTile(),
    deck: deckWood(),
  }
  if (mats[name]) return mats[name]
  const m = getMaterial(name)
  if (name === 'concrete') return (mats[name] = patchUnderwater((m as THREE.MeshStandardMaterial).clone(), name))
  if (name === 'metal') return (mats[name] = patchUnderwater((m as THREE.MeshStandardMaterial).clone(), name))
  return m
}

/** silvered teak boards: photographed planks, per-board tone, dark gaps */
function deckWood() {
  const m = std({ roughness: 0.82, envMapIntensity: 0.8 })
  const u = { tD: { value: coveTex('deck_grey_diff', true, 8) } }
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position,1.0)).xyz; vWn = normal;')
    s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\nuniform sampler2D tD; varying vec3 vWp; varying vec3 vWn;\n${GLSL_NOISE}`).replace('#include <map_fragment>', `
      vec3 c = texture2D(tD, vWp.zx * 0.36).rgb;
      c = mix(vec3(dot(c, vec3(0.333))), c, 0.8);
      c = pow(c * 1.5, vec3(0.85)) * vec3(1.0, 0.86, 0.7);
      c *= mix(0.86, 1.08, vfbm(vWp.xz * 0.4));
      diffuseColor.rgb = abs(vWn.y) > 0.5 ? c : c * 0.75;`)
  }
  m.customProgramCacheKey = () => 'teak'
  return patchUnderwater(m, 'teak')
}

function poolTile() {
  const m = std({ color: '#bfe3e6', roughness: 0.35 })
  const u = { ...uwUniforms(), uLvl: { value: HOTEL.pool.y } }
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWp; varying vec3 vWn;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(position,1.0)).xyz; vWn = normal;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tCaustics, tWave; uniform float uTime, uNight, uLvl; uniform vec3 uSunDir, uSunColor; varying vec3 vWp; varying vec3 vWn;
${WAVE_GLSL}
${GLSL_NOISE}
float cf(vec2 p, float f){ vec2 c = vec2(mod(f, 8.0), floor(f / 8.0)); float v = textureLod(tCaustics, (fract(p) * 0.9922 + 0.0039 + c) / vec2(8.0, 4.0), 0.0).r; return v * v * 6.0; }`)
      .replace('#include <map_fragment>', `
        vec2 off = vec2(0.0);
        if (cameraPosition.y > uLvl) { float k = (cameraPosition.y - uLvl) / max(cameraPosition.y - vWp.y, 0.01); off = waveSlope((cameraPosition.xz + (vWp.xz - cameraPosition.xz) * k) * 1.8, uTime * 1.2, 1.0) * max(uLvl - vWp.y, 0.0) * 0.5; }
        vec2 tuv = (abs(vWn.y) > 0.5 ? vWp.xz + off : (abs(vWn.x) > abs(vWn.z) ? vWp.zy : vWp.xy)) / 0.055;
        vec2 id = floor(tuv); vec2 f = fract(tuv);
        float far = smoothstep(26.0, 6.0, distance(cameraPosition, vWp));
        float g = smoothstep(0.0, 0.1, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
        vec3 tile = mix(vec3(0.46, 0.76, 0.8), vec3(0.62, 0.86, 0.86), mix(0.5, vhash(id), far));
        diffuseColor.rgb = mix(tile, mix(vec3(0.8, 0.88, 0.86), tile, g), far);`)
      .replace('#include <opaque_fragment>', `
        float d = max(uLvl - vWp.y, 0.0);
        vec2 sp = vWp.xz + off + uSunDir.xz / max(uSunDir.y, 0.3) * d;
        float ff = uTime * 6.0; float f0 = mod(floor(ff), 32.0), f1 = mod(f0 + 1.0, 32.0);
        float ca = mix(cf(sp * 0.24, f0), cf(sp * 0.24, f1), fract(ff));
        outgoingLight += reflectedLight.directDiffuse * (ca - 1.0) * 0.6 * smoothstep(0.02, 0.5, d) * (1.0 - uNight);
        float sunl = dot(uSunColor, vec3(0.33)) * smoothstep(-0.05, 0.6, uSunDir.y) * (1.0 - uNight);
        outgoingLight = outgoingLight * exp(-vec3(0.3, 0.05, 0.035) * d * 1.9) + vec3(0.0, 0.16, 0.19) * sunl * (1.0 - exp(-0.35 * d)) + vec3(0.02, 0.3, 0.36) * uNight * smoothstep(0.0, 0.3, d) * 0.9;
        #include <opaque_fragment>`)
  }
  m.customProgramCacheKey = () => 'pool-tile'
  return m
}

function poolWater() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { ...uwUniforms(), ...SKY.uniforms },
    vertexShader: 'varying vec3 vW; varying vec3 vNn; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vNn = normal; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform sampler2D tWave; uniform float uTime, uNight; uniform vec3 uSunDir, uSunColor; varying vec3 vW; varying vec3 vNn;
${WAVE_GLSL}
${SKY.glsl}
void main(){
  vec3 V = normalize(cameraPosition - vW);
  vec2 s = waveSlope(vW.xz * 1.8, uTime * 1.2, 1.0) * 0.55;
  if (vNn.y < 0.6) s = waveSlope(vec2(vW.x * 1.5, vW.y * 0.6 + uTime * 1.6) * 2.0, 0.0, 1.0) * 1.5;
  vec3 N = normalize(normalize(vNn) + vec3(-s.x, 0.0, -s.y));
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.03), 5.0);
  vec3 R = reflect(-V, N); R.y = abs(R.y);
  float spec = pow(max(dot(N, normalize(V + uSunDir)), 0.0), 900.0) * 16.0 * (1.0 - uNight);
  vec3 c = skyColor(R) * F + uSunColor * spec;
  if (vNn.y < 0.6) { c += vec3(0.12, 0.2, 0.2) * (0.3 + s.x) * (1.0 - uNight * 0.9); F = max(F, 0.25); }
  gl_FragColor = vec4(c, F);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  })
}

/** Glass of every room: interior mapping (a real-depth room box shaded in the shader), curtains, lamps at night, reflections. */
function glassMaterial() {
  const m = new THREE.MeshPhysicalMaterial({ color: '#0c1114', roughness: 0.04, metalness: 0, envMapIntensity: 1.5 })
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uNight: GLOBAL.uNight, uAvail: GLOBAL.uAvail, uGolden: GLOBAL.uGolden, uSunDir: GLOBAL.uSunDir, uSunColor: GLOBAL.uSunColor })
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRoom; attribute vec3 aTint; varying vec3 vL; varying vec3 vE; varying vec4 vRoom; varying vec3 vTint;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vRoom = aRoom; vTint = aTint; vL = position;
        vec3 wp = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        mat3 rot = mat3(instanceMatrix);
        vE = transpose(rot) * (cameraPosition - wp);`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float uNight, uAvail, uGolden; uniform vec3 uSunDir, uSunColor; varying vec3 vL; varying vec3 vE; varying vec4 vRoom; varying vec3 vTint;
float rh(float n){ return fract(sin(n) * 43758.5453); }
float boxm(vec2 p, vec2 a, vec2 b, float e){ vec2 q = smoothstep(a - e, a + e, p) * (1.0 - smoothstep(b - e, b + e, p)); return q.x * q.y; }
vec3 roomView(vec3 p, vec3 d, float seed, out float lit){
  // room: x ±2.95, y 0..2.85, z 0..-8 (p on the glass plane, d looking in)
  vec3 bmin = vec3(-2.95, 0.0, -8.0), bmax = vec3(2.95, 2.85, 0.02);
  vec3 t = (mix(bmin, bmax, step(0.0, d)) - p) / d;
  float tm = min(t.x, min(t.y, t.z)); vec3 h = p + d * tm;
  float pal = floor(rh(seed * 3.1) * 3.0);
  vec3 wall = pal < 0.5 ? vec3(0.80, 0.76, 0.69) : pal < 1.5 ? vec3(0.82, 0.74, 0.64) : vec3(0.55, 0.5, 0.45);
  vec3 wood = pal < 0.5 ? vec3(0.5, 0.36, 0.23) : pal < 1.5 ? vec3(0.55, 0.36, 0.22) : vec3(0.22, 0.13, 0.08);
  vec3 c = wall;
  if (tm == t.y) c = d.y < 0.0 ? wood * (0.85 + 0.2 * rh(floor(h.x * 6.0))) : vec3(0.86);
  else if (tm == t.z) {
    c = mix(wall, wood, boxm(h.xy, vec2(-2.95, 0.0), vec2(0.4, 2.85), 0.02));
    c = mix(c, vec3(0.2, 0.17, 0.15), boxm(h.xy, vec2(1.1, 0.0), vec2(2.1, 2.2), 0.02));
  } else {
    c = mix(wall, wood * 1.1, boxm(vec2(h.z, h.y), vec2(-6.4, 0.0), vec2(-2.4, 1.25), 0.02) * step(h.x, 0.0));
    c = mix(c, vec3(0.3, 0.42, 0.45) * (0.7 + 0.6 * rh(seed)), boxm(vec2(h.z, h.y), vec2(-5.2, 1.5), vec2(-3.6, 2.35), 0.02));
  }
  // bed + bench as boxes hit on the way
  vec3 b0 = vec3(-2.9, 0.0, -5.5), b1 = vec3(-0.75, 0.62, -3.4);
  vec3 ta = (b0 - p) / d, tb = (b1 - p) / d; vec3 tn = min(ta, tb), tf = max(ta, tb);
  float n0 = max(tn.x, max(tn.y, tn.z)), f0 = min(tf.x, min(tf.y, tf.z));
  if (n0 < f0 && n0 > 0.0 && n0 < tm) { h = p + d * n0; c = h.y > 0.3 ? vec3(0.88, 0.86, 0.82) : wood; if (h.y > 0.5 && h.x > -1.5) c = mix(vec3(0.45, 0.36, 0.28), vec3(0.3, 0.4, 0.42), step(0.5, rh(seed * 7.0))); }
  b0 = vec3(1.2, 0.0, -2.6); b1 = vec3(2.5, 0.72, -1.7);
  ta = (b0 - p) / d; tb = (b1 - p) / d; tn = min(ta, tb); tf = max(ta, tb); n0 = max(tn.x, max(tn.y, tn.z)); f0 = min(tf.x, min(tf.y, tf.z));
  if (n0 < f0 && n0 > 0.0 && n0 < tm) { h = p + d * n0; c = pal < 1.5 ? vec3(0.62, 0.55, 0.46) : vec3(0.36, 0.24, 0.18); }
  float depth = -h.z;
  float day = exp(-depth * 0.28) * 0.85 + 0.07;
  float ao = smoothstep(0.0, 0.5, h.y) * 0.25 + 0.75;
  lit = step(0.35, rh(seed * 11.7));
  float lamp = exp(-length(h - vec3(-2.4, 0.9, -5.6)) * 0.45) * 2.2 + exp(-length(h - vec3(2.2, 1.6, -2.2)) * 0.5) * 1.4 + 0.22;
  float sunl = dot(uSunColor, vec3(0.33)) * (0.25 + 0.75 * smoothstep(0.0, 0.5, uSunDir.y));
  return c * ao * (vec3(0.95, 0.98, 1.0) * day * sunl * (1.0 - uNight) * 0.4 + vec3(1.0, 0.68, 0.38) * lamp * lit * max(uNight, 0.06));
}`)
      .replace('#include <emissivemap_fragment>', `
        vec3 dir = normalize(vec3(vL.x, vL.y, 0.0) - vE);
        vec3 p = vec3(vL.x, vL.y + 1.375, 0.0);
        float lit; vec3 rv = roomView(p, dir, vRoom.x, lit);
        // sheer curtains gathered at the sides, some half drawn
        float open = mix(0.55, 0.98, rh(vRoom.x * 5.3)); float side = abs(vL.x) / 2.95;
        float cur = smoothstep(open - 0.015, open + 0.015, side);
        float fold = 0.5 + 0.5 * sin(vL.x * 34.0 + sin(vL.y * 2.0 + vRoom.x * 9.0) * 0.6);
        float sunc = dot(uSunColor, vec3(0.33)) * (1.0 - uNight);
        vec3 curtain = vec3(0.86, 0.84, 0.79) * (0.34 + 0.3 * fold) * (sunc * 0.5 + lit * uNight * vec3(1.0, 0.7, 0.42) * 0.9);
        rv = mix(rv, curtain, cur * 0.92);
        totalEmissiveRadiance = rv;
        vec3 av = vTint * (0.35 + 0.25 * uNight);
        totalEmissiveRadiance = mix(totalEmissiveRadiance, av * 1.6, uAvail * 0.72);
        totalEmissiveRadiance += vRoom.y * vec3(0.25, 0.85, 1.0) * 0.55;`)
  }
  m.customProgramCacheKey = () => 'room-glass'
  return m
}

function RoomGlass() {
  const ref = useRef<THREE.InstancedMesh>(null)
  const mat = useMemo(() => glassMaterial(), [])
  const { geo, mats4 } = useMemo(() => {
    const g = new THREE.PlaneGeometry(HOTEL.bw - 0.32, 2.75)
    const room = new Float32Array(ROOMS.length * 4)
    const tint = new Float32Array(ROOMS.length * 3)
    const c = new THREE.Color()
    const list = ROOMS.map((u, i) => {
      const f = roomFrame(u)
      room[i * 4] = (i * 0.61803) % 1 + 0.01 * u.floor + 1
      c.set(STATUS_META[u.status].color)
      tint.set([c.r, c.g, c.b], i * 3)
      return new THREE.Matrix4().makeRotationY(f.theta).setPosition(f.origin.clone().addScaledVector(f.out, -0.02).add(new THREE.Vector3(0, 1.375, 0)))
    })
    g.setAttribute('aRoom', new THREE.InstancedBufferAttribute(room, 4))
    g.setAttribute('aTint', new THREE.InstancedBufferAttribute(tint, 3))
    return { geo: g, mats4: list }
  }, [])
  // invisible, deeper pick volumes cover the whole terrace so a tap on a balcony works too
  const pick = useMemo(() => new THREE.BoxGeometry(HOTEL.bw - 0.3, 3.1, 2.6), [])
  const pickRef = useRef<THREE.InstancedMesh>(null)
  const pickMat = useMemo(() => new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }), [])
  useEffect(() => {
    mats4.forEach((m, i) => ref.current?.setMatrixAt(i, m))
    ROOMS.forEach((u, i) => {
      const f = roomFrame(u)
      pickRef.current?.setMatrixAt(i, new THREE.Matrix4().makeRotationY(f.theta).setPosition(f.center.clone().addScaledVector(f.out, 1.2)))
    })
    for (const r of [ref.current, pickRef.current]) {
      if (!r) continue
      r.instanceMatrix.needsUpdate = true
      r.computeBoundingSphere()
    }
  }, [mats4])
  useFrame((_, dt) => {
    const st = useStore.getState()
    const a = geo.attributes.aRoom as THREE.InstancedBufferAttribute
    const hi = st.hoveredUnit ? ROOM_BY_ID.get(st.hoveredUnit)?.index : -1
    let dirty = false
    for (let i = 0; i < ROOMS.length; i++) {
      const cur = a.getY(i)
      const v = damp(cur, i === hi ? 1 : 0, 10, dt)
      if (Math.abs(v - cur) > 0.002) {
        a.setY(i, v)
        dirty = true
      }
    }
    if (dirty) a.needsUpdate = true
    // the glass of the opened room disappears
    const open = st.selectedUnit ?? st.interiorUnit
    const oi = open ? ROOM_BY_ID.get(open)!.index : -1
    if (ref.current && ref.current.userData.open !== oi) {
      const prev = ref.current.userData.open ?? -1
      if (prev >= 0) ref.current.setMatrixAt(prev, mats4[prev])
      if (oi >= 0) ref.current.setMatrixAt(oi, new THREE.Matrix4().makeScale(0, 0, 0).setPosition(0, -200, 0))
      ref.current.userData.open = oi
      ref.current.instanceMatrix.needsUpdate = true
    }
  })
  const inView = () => useStore.getState().mode === 'masterplan'
  return (
    <>
      <instancedMesh ref={ref} args={[geo, mat, ROOMS.length]} receiveShadow frustumCulled={false} />
      <instancedMesh
        ref={pickRef}
        args={[pick, pickMat, ROOMS.length]}
        frustumCulled={false}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          if (!inView() || e.pointerType === 'touch') return
          e.stopPropagation()
          const id = ROOMS[e.instanceId!].id
          if (useStore.getState().hoveredUnit !== id) useStore.setState({ hoveredUnit: id })
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          useStore.setState({ hoveredUnit: null })
          document.body.style.cursor = ''
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          if (!inView() || e.delta > 6) return
          e.stopPropagation()
          useStore.setState({ hoveredUnit: null })
          useStore.getState().selectUnit(ROOMS[e.instanceId!].id)
        }}
      />
    </>
  )
}

export function Hotel() {
  const [scene, setScene] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let on = true
    loadGLTFUrl('models/hotel.glb').then((g) => {
      if (!g || !on) return
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const name = ((m.material as THREE.Material).name || m.name).replace(/\.\d+$/, '')
        if (name === 'water') {
          m.material = poolWater()
          m.renderOrder = 5
          return
        }
        const mat = hotelMaterial(name)
        if (['hotel_white', 'bronze', 'cladding', 'lamp', 'travertine'].includes(name) && !mat.userData.cut) {
          mat.userData.cut = true
          patchCut(mat)
        }
        m.material = mat
        m.castShadow = !mat.transparent
        m.receiveShadow = true
        if (mat.transparent) m.renderOrder = 6
      })
      g.scene.name = 'hotel'
      setScene(g.scene)
    })
    return () => {
      on = false
    }
  }, [])
  if (!scene) return null
  return (
    <>
      <primitive object={scene} />
      <RoomGlass />
    </>
  )
}
