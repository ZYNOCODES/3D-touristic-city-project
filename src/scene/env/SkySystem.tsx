// Time-of-day system: blends three Poly Haven HDRIs (day / golden hour / night) on a
// sky dome, re-generates the PMREM environment as the blend changes, drives the sun
// (or moon) directional light with camera-following shadows, fog and exposure.
// Falls back to an analytic sky when the HDRIs are not available.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { DataUtils } from 'three'
import { loadAssetsManifest, loadHDRI } from '../../lib/assets'
import { useStore } from '../../store'
import { GLOBAL, SUN, damp } from '../shared'
import { HDRI_TARGET, lightingAt } from './timeOfDay'
import { onQuality, quality } from '../cove/quality'

const KEYS = ['day', 'golden', 'night'] as const
// target mean sky luminance of each HDRI after normalisation
const TARGET_LUM = { day: 0.62, golden: 0.6, night: 0.045 }

interface HdriInfo {
  tex: THREE.DataTexture
  gain: number
  delta: number
  horizon: THREE.Color
}

function analyse(tex: THREE.DataTexture) {
  const { width: w, height: h, data } = tex.image as { width: number; height: number; data: Uint16Array }
  const stride = data.length / (w * h)
  let sum = 0
  let n = 0
  const hz = new THREE.Color(0, 0, 0)
  let hn = 0
  const read = (i: number) => DataUtils.fromHalfFloat(data[i])
  for (let y = 0; y < h / 2; y += 4) {
    const elev = (0.5 - (y + 0.5) / h) * Math.PI
    const wgt = Math.cos(elev)
    for (let x = 0; x < w; x += 8) {
      const i = (y * w + x) * stride
      const r = Math.min(read(i), 50)
      const g = Math.min(read(i + 1), 50)
      const b = Math.min(read(i + 2), 50)
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b
      sum += l * wgt
      n += wgt
      if (elev > 0.02 && elev < 0.12) {
        hz.r += r
        hz.g += g
        hz.b += b
        hn++
      }
    }
  }
  if (hn) hz.multiplyScalar(1 / hn)
  return { mean: sum / Math.max(n, 1e-6), horizon: hz }
}

const vert = /* glsl */ `
varying vec3 vDir;
void main(){
  vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz);
  vec4 p = projectionMatrix * viewMatrix * vec4((modelMatrix * vec4(position,1.0)).xyz, 1.0);
  gl_Position = p.xyww; // push to far plane
}`

const SKY_GLSL = /* glsl */ `
uniform sampler2D tDay; uniform sampler2D tGold; uniform sampler2D tNight;
uniform vec3 uW; uniform vec3 uGain; uniform vec3 uDelta; uniform float uHasHdri; uniform float uNightF; uniform float uClamp;
vec3 sampleEq(sampler2D t, vec3 d, float delta){
  float phi = atan(d.z, d.x) - delta;
  float u = fract(phi / 6.283185307 + 0.5);
  float v = asin(clamp(d.y, -1.0, 1.0)) / 3.141592654 + 0.5;
  return textureLod(t, vec2(u, v), 0.0).rgb;
}
vec3 analytic(vec3 d){
  float y = max(d.y, 0.0);
  vec3 zenith = mix(vec3(0.16,0.36,0.78), vec3(0.01,0.015,0.04), uNightF);
  vec3 horizon = mix(mix(vec3(0.62,0.78,0.95), vec3(1.0,0.62,0.4), smoothstep(0.35,0.0,uSunDir.y)), vec3(0.04,0.05,0.09), uNightF);
  vec3 c = mix(horizon, zenith, pow(y, 0.45));
  float s = max(dot(d, uSunDir), 0.0);
  return c + uSunColor * (pow(s, 900.0) * 40.0 + pow(s, 12.0) * 0.35) * (1.0 - uNightF*0.9);
}
vec3 skyColor(vec3 d){
  vec3 dd = d; dd.y = max(dd.y, 0.004); dd = normalize(dd);
  if (uHasHdri < 0.5) return analytic(dd);
  vec3 col = vec3(0.0);
  if (uW.x > 0.001) {
    // clear Mediterranean day: the HDRI keeps its sun and haze structure, graded towards a deep cobalt zenith
    vec3 c = min(sampleEq(tDay, dd, uDelta.x), vec3(uClamp)) * uGain.x;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float y = clamp(dd.y, 0.0, 1.0);
    vec3 grad = mix(vec3(0.40, 0.62, 0.86), vec3(0.055, 0.20, 0.56), pow(y, 0.42));
    vec3 soft = c / (1.0 + max(l - 0.35, 0.0) * 0.9);
    soft = max(mix(vec3(dot(soft, vec3(0.2126, 0.7152, 0.0722))), soft, 1.5), 0.0);
    vec3 dayc = mix(soft, grad * (0.8 + 0.35 * min(l, 1.6)), 0.6);
    dayc += max(c - 6.0, 0.0);
    col += dayc * uW.x;
  }
  if (uW.y > 0.001) col += min(sampleEq(tGold, dd, uDelta.y), vec3(uClamp)) * uGain.y * uW.y;
  if (uW.z > 0.001) col += min(sampleEq(tNight, dd, uDelta.z), vec3(uClamp)) * uGain.z * uW.z;
  return col;
}`
const frag = /* glsl */ `
uniform vec3 uSunDir; uniform vec3 uSunColor;
varying vec3 vDir;
${SKY_GLSL}
void main(){
  gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

/** Sky lookup shared with the sea (declares its own uniforms except uSunDir / uSunColor). */
export const SKY = {
  glsl: SKY_GLSL,
  uniforms: {
    tDay: { value: null as THREE.Texture | null }, tGold: { value: null as THREE.Texture | null }, tNight: { value: null as THREE.Texture | null },
    uW: { value: new THREE.Vector3(1, 0, 0) }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uDelta: { value: new THREE.Vector3() },
    uHasHdri: { value: 0 }, uNightF: GLOBAL.uNight, uClamp: { value: 40 },
  },
  hideInMirror: [] as THREE.Object3D[],
}

export function makeSkyMaterial() {
  const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1)
  blank.needsUpdate = true
  SKY.uniforms.tDay.value ??= blank
  SKY.uniforms.tGold.value ??= blank
  SKY.uniforms.tNight.value ??= blank
  return new THREE.ShaderMaterial({
    vertexShader: vert,
    fragmentShader: frag,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      tDay: SKY.uniforms.tDay,
      tGold: SKY.uniforms.tGold,
      tNight: SKY.uniforms.tNight,
      uW: SKY.uniforms.uW,
      uGain: SKY.uniforms.uGain,
      uDelta: SKY.uniforms.uDelta,
      uHasHdri: SKY.uniforms.uHasHdri,
      uSunDir: GLOBAL.uSunDir,
      uSunColor: GLOBAL.uSunColor,
      uNightF: GLOBAL.uNight,
      uClamp: { value: 1e4 },
    },
  })
}

export function SkySystem({ shadowFocus }: { shadowFocus: React.MutableRefObject<THREE.Vector3> }) {
  const { gl, scene, camera } = useThree()
  const [hdris, setHdris] = useState<Partial<Record<(typeof KEYS)[number], HdriInfo>>>({})

  // visible dome + a small copy rendered into the PMREM environment
  const skyMat = useMemo(() => makeSkyMaterial(), [])
  const envMat = useMemo(() => {
    const m = makeSkyMaterial()
    m.uniforms = { ...skyMat.uniforms, uClamp: { value: 64 } } // tame the sun inside the env (avoid double sun)
    m.fragmentShader = m.fragmentShader.replace('#include <tonemapping_fragment>', '').replace('#include <colorspace_fragment>', '')
    return m
  }, [skyMat])
  const dome = useMemo(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), skyMat)
    m.frustumCulled = false
    m.renderOrder = -1000
    m.scale.setScalar(20000)
    SKY.hideInMirror.push(m)
    return m
  }, [skyMat])
  const envScene = useMemo(() => {
    const s = new THREE.Scene()
    s.add(new THREE.Mesh(new THREE.SphereGeometry(100, 64, 32), envMat))
    return s
  }, [envMat])
  const pmrem = useMemo(() => new THREE.PMREMGenerator(gl), [gl])
  const envRT = useRef<THREE.WebGLRenderTarget | null>(null)
  const frameN = useRef(0)
  const lastEnv = useRef({ key: '', time: 0 })

  useEffect(() => {
    let alive = true
    loadAssetsManifest().then(async (m) => {
      const out: Partial<Record<(typeof KEYS)[number], HdriInfo>> = {}
      const order = lightingAt(useStore.getState().timeOfDay).weights
      const first = KEYS[order.indexOf(Math.max(...order))]
      await Promise.all(
        [first, ...KEYS.filter((k) => k !== first)].map(async (k, i) => {
          if (i > 0) await new Promise((r) => setTimeout(r, 4000))
          const tex = await loadHDRI(k)
          if (!tex) return
          const { mean, horizon } = analyse(tex)
          const sun = m.hdri?.[k]?.sun
          const target = HDRI_TARGET[k].sunDir
          const phiTarget = Math.atan2(target.z, target.x)
          const delta = sun ? phiTarget - sun.azimuth : 0
          const gain = TARGET_LUM[k] / Math.max(mean, 1e-4)
          out[k] = { tex, gain, delta, horizon: horizon.multiplyScalar(gain) }
          if (alive) setHdris({ ...out })
        }),
      )
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const u = skyMat.uniforms
    const any = hdris.day ?? hdris.golden ?? hdris.night
    u.uHasHdri.value = any ? 1 : 0
    if (any) {
      const d = hdris.day ?? any
      const g = hdris.golden ?? any
      const n = hdris.night ?? any
      u.tDay.value = d.tex
      u.tGold.value = g.tex
      u.tNight.value = n.tex
      u.uGain.value.set(d.gain, g.gain * (hdris.golden ? 1 : 0.8), n.gain * (hdris.night ? 1 : 0.045))
      u.uDelta.value.set(d.delta, g.delta, n.delta)
    }
    lastEnv.current.key = ''
  }, [hdris, skyMat])

  useEffect(() => {
    scene.add(dome)
    scene.fog = new THREE.FogExp2(SUN.fog.getHex(), SUN.fogDensity)
    return () => {
      scene.remove(dome)
    }
  }, [scene, dome])

  // lights
  const sun = useMemo(() => {
    const l = new THREE.DirectionalLight(0xffffff, 3)
    l.castShadow = true
    l.shadow.mapSize.set(quality.shadow, quality.shadow)
    l.shadow.bias = -0.00025
    l.shadow.normalBias = 0.04
    l.shadow.radius = 3
    l.shadow.camera.near = 1
    l.shadow.camera.far = 3000
    return l
  }, [])
  useEffect(
    () =>
      onQuality(() => {
        sun.shadow.mapSize.set(quality.shadow, quality.shadow)
        sun.shadow.map?.dispose()
        sun.shadow.map = null as unknown as THREE.WebGLRenderTarget
        shadowKey.current = ''
      }),
    [sun],
  )
  const shadowKey = useRef('')
  const hemi = useMemo(() => new THREE.HemisphereLight(0xdfeaff, 0x3b3a2a, 0.3), [])
  useEffect(() => {
    scene.add(sun, sun.target, hemi)
    return () => {
      scene.remove(sun, sun.target, hemi)
    }
  }, [scene, sun, hemi])

  const fogHorizon = useMemo(() => new THREE.Color(), [])
  const tmpC = useMemo(() => new THREE.Color(), [])
  const white = useMemo(() => new THREE.Color(1, 1, 1), [])
  useFrame((state, dt) => {
    const st = useStore.getState()
    // animate the time of day towards the requested target
    const tod = Math.abs(st.timeOfDay - st.timeTarget) < 0.0005 ? st.timeTarget : damp(st.timeOfDay, st.timeTarget, 1.6, Math.min(dt, 0.05))
    if (tod !== st.timeOfDay) useStore.setState({ timeOfDay: tod })
    const L = lightingAt(tod)

    GLOBAL.uTime.value = state.clock.elapsedTime
    GLOBAL.uNight.value = L.night
    GLOBAL.uGolden.value = L.golden
    GLOBAL.uSunDir.value.copy(L.sunDir)
    GLOBAL.uSunColor.value.copy(L.sunColor)
    SUN.dir.copy(L.sunDir)
    SUN.color.copy(L.sunColor)
    SUN.intensity = L.intensity

    const u = skyMat.uniforms
    u.uW.value.set(L.weights[0], L.weights[1], L.weights[2])

    // fog colour: from HDRI horizons when present
    const anyH = hdris.day ?? hdris.golden ?? hdris.night
    if (anyH) {
      fogHorizon.setRGB(0, 0, 0)
      fogHorizon.add(tmpC.copy((hdris.day ?? anyH).horizon).multiplyScalar(L.weights[0]))
      fogHorizon.add(tmpC.copy((hdris.golden ?? anyH).horizon).multiplyScalar(L.weights[1]))
      fogHorizon.add(tmpC.copy((hdris.night ?? anyH).horizon).multiplyScalar(L.weights[2] * (hdris.night ? 1 : 0.045)))
      fogHorizon.lerp(L.fog, 0.35)
      // keep the haze from washing the image out: clamp its luminance
      const lum = 0.2126 * fogHorizon.r + 0.7152 * fogHorizon.g + 0.0722 * fogHorizon.b
      const maxLum = 0.55 * (1 - L.night) + 0.04 * L.night
      if (lum > maxLum) fogHorizon.multiplyScalar(maxLum / lum)
    } else fogHorizon.copy(L.fog)
    const fog = scene.fog as THREE.FogExp2
    if (fog) {
      fog.color.copy(fogHorizon)
      fog.density = L.fogDensity
    }
    gl.toneMappingExposure = L.exposure
    scene.environmentIntensity = L.env

    // sun / moon light with shadows that follow the area of interest
    const focus = shadowFocus.current
    const dist = camera.position.distanceTo(focus)
    const half = THREE.MathUtils.clamp(dist * 0.62, 26, 150)
    const cam = sun.shadow.camera
    if (Math.abs(cam.right - half) > half * 0.05) {
      cam.left = -half
      cam.right = half
      cam.top = half
      cam.bottom = -half
      cam.updateProjectionMatrix()
    }
    // texel snapping to avoid shimmering while the camera moves
    const texel = (half * 2) / sun.shadow.mapSize.x
    const fx = Math.round(focus.x / texel) * texel
    const fz = Math.round(focus.z / texel) * texel
    sun.target.position.set(fx, focus.y, fz)
    sun.position.set(fx, focus.y, fz).addScaledVector(L.sunDir, 1200)
    sun.target.updateMatrixWorld()
    sun.color.copy(L.sunColor)
    sun.intensity = L.intensity
    sun.shadow.normalBias = 0.02 + half * 0.0006
    hemi.intensity = L.ambient * 0.5
    hemi.color.copy(fogHorizon).lerp(white, 0.4)

    dome.position.copy(camera.position)
    // low: redraw the shadow map only when the light or the framed area changes; otherwise every 2nd frame
    const sk = `${fx.toFixed(0)},${fz.toFixed(0)},${half.toFixed(0)},${L.sunDir.y.toFixed(3)},${scene.children.length}`
    frameN.current++
    gl.shadowMap.autoUpdate = false
    if (sk !== shadowKey.current || quality.tier === 'high' || frameN.current % (quality.tier === 'medium' ? 2 : 45) === 0) {
      shadowKey.current = sk
      gl.shadowMap.needsUpdate = true
    }

    // regenerate the environment when the blend changed noticeably
    const key = L.weights.map((w) => w.toFixed(2)).join(',') + (u.uHasHdri.value ? 'h' : `a${L.sunDir.y.toFixed(2)}`)
    const now = state.clock.elapsedTime
    if (key !== lastEnv.current.key && now - lastEnv.current.time > 0.12) {
      lastEnv.current = { key, time: now }
      const rt = pmrem.fromScene(envScene, 0, 0.1, 1000)
      const old = envRT.current
      envRT.current = rt
      scene.environment = rt.texture
      old?.dispose()
    }
  })

  return null
}
