// Sea surface: rippled reflection (mirrored pass or static probe + sky), sun glitter and shoreline foam.
// Alpha-blended over the self-shaded underwater world (see underwater.ts), so the bottom stays visible.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLOBAL, GLSL_NOISE } from '../shared'
import { SKY } from '../env/SkySystem'
import { onQuality, quality } from './quality'
import { WAVE_GLSL, uwUniforms } from './underwater'

export const REFLECT_LAYER_HIDE = 5 // objects on this layer only are skipped by the mirror pass

const BED = { x0: -300, x1: 300, z0: -120, z1: 290, range: 44, bias: 4 }

const vert = /* glsl */ `
uniform float uTime; uniform mat4 uMirror;
varying vec3 vW; varying vec4 vM;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  float near = exp(-distance(w.xyz, cameraPosition) * 0.012);
  w.y += near * (sin(w.x * 0.33 + uTime * 0.9) * 0.05 + sin(w.z * 0.27 - uTime * 0.75 + w.x * 0.12) * 0.06 + sin((w.x + w.z) * 0.62 + uTime * 1.5) * 0.022);
  vW = w.xyz;
  vM = uMirror * vec4(w.x, 0.0, w.z, 1.0);
  gl_Position = projectionMatrix * viewMatrix * w;
}`
const frag = /* glsl */ `
uniform sampler2D tWave, tBed, tMirror; uniform samplerCube tProbe;
uniform float uTime, uNight, uHasMirror, uFogD; uniform vec3 uSunDir, uSunColor, uFog; uniform vec4 uBed;
varying vec3 vW; varying vec4 vM;
${WAVE_GLSL}
${GLSL_NOISE}
${'' /* sky lookup shared with the dome */}
__SKY__
void main(){
  vec3 toCam = cameraPosition - vW; float dist = length(toCam); vec3 V = toCam / dist;
  float lod = exp(-dist * 0.012);
  vec2 s = waveSlope(vW.xz, uTime, lod);
  // gentle cat's paws: calmer and rougher patches
  float gust = 0.55 + 0.9 * vfbm(vW.xz * 0.018 + uTime * 0.01);
  s *= gust * mix(0.55, 1.0, lod);
  vec3 N = normalize(vec3(-s.x, 1.0, -s.y));
  float nv = max(dot(N, V), 0.0);
  nv = max(nv, 0.04);
  float F = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  F = min(F, mix(0.55, 0.9, lod));
  vec3 R = reflect(-V, N); R.y = abs(R.y) + 0.005 + (1.0 - lod) * 0.22; R = normalize(R);
  vec3 refl = skyColor(R);
  if (uHasMirror > 0.5) {
    vec2 uv = vM.xy / vM.w;
    uv += s * vec2(0.16, 0.30) / (1.0 + dist * 0.004);
    vec4 m = texture2D(tMirror, clamp(uv, 0.002, 0.998));
    refl = mix(refl, m.rgb / max(m.a, 0.001), m.a);
  } else {
    vec4 pr = textureCube(tProbe, R);
    refl = pr.rgb;
  }
  // sun glitter
  vec3 H = normalize(V + uSunDir);
  vec2 s2 = s + (texture2D(tWave, vW.xz * 0.61 + uTime * 0.04).rg - 0.5) * 0.35 * lod;
  vec3 Ns = normalize(vec3(-s2.x, 1.0, -s2.y));
  float spec = pow(max(dot(Ns, H), 0.0), mix(420.0, 1500.0, lod)) * mix(1.6, 22.0, lod);
  vec3 glit = uSunColor * spec * smoothstep(0.0, 0.1, uSunDir.y) * (1.0 - uNight * 0.75);
  // shoreline foam: thin broken lace where the bottom rises
  vec2 buv = (vW.xz - uBed.xy) / (uBed.zw - uBed.xy);
  float depth = 25.0;
  if (buv.x > 0.0 && buv.y > 0.0 && buv.x < 1.0 && buv.y < 1.0) depth = texture2D(tBed, buv).r * 44.0 - 4.0;
  float swash = sin(uTime * 0.7 + vnoise(vW.xz * 0.12) * 12.0) * 0.16;
  float lace = vnoise(vW.xz * 2.3 + s * 3.0 + uTime * 0.12) * vnoise(vW.xz * 5.1 - uTime * 0.2);
  float foam = smoothstep(0.9 + swash, -0.1, depth) * smoothstep(0.24, 0.5, lace) * 0.55 * exp(-dist * 0.012);
  vec3 foamC = vec3(0.86, 0.9, 0.9) * (dot(uSunColor, vec3(0.3)) * max(uSunDir.y, 0.12) * 1.1 + 0.15) * (1.0 - uNight * 0.9);
  vec3 rgb = refl * F + glit;
  float a = F;
  rgb = mix(rgb, foamC, foam); a = mix(a, 1.0, foam);
  float fog = 1.0 - exp(-uFogD * uFogD * dist * dist);
  rgb = mix(rgb, uFog, fog); a = mix(a, 1.0, fog);
  gl_FragColor = vec4(rgb, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`

export function Sea() {
  const { gl, scene, camera, size } = useThree()
  const ref = useRef<THREE.Mesh>(null)
  const mirrorCam = useMemo(() => new THREE.PerspectiveCamera(), [])
  const rt = useMemo(() => new THREE.WebGLRenderTarget(256, 256, { type: THREE.HalfFloatType, samples: 0 }), [])
  const probe = useMemo(() => {
    const t = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })
    return { t, cam: new THREE.CubeCamera(1, 6000, t), last: -99, n: 0 }
  }, [])
  const bed = useMemo(() => {
    const t = new THREE.TextureLoader().load(import.meta.env.BASE_URL + 'models/cove_seabed.png')
    t.flipY = false
    t.colorSpace = THREE.NoColorSpace
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping
    return t
  }, [])
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag.replace('__SKY__', SKY.glsl),
        transparent: true,
        premultipliedAlpha: true,
        blending: THREE.CustomBlending,
        blendSrc: THREE.OneFactor,
        blendDst: THREE.OneMinusSrcAlphaFactor,
        depthWrite: false,
        uniforms: {
          ...uwUniforms(),
          ...SKY.uniforms,
          tBed: { value: bed },
          tMirror: { value: rt.texture },
          tProbe: { value: probe.t.texture },
          uMirror: { value: new THREE.Matrix4() },
          uHasMirror: { value: 1 },
          uBed: { value: new THREE.Vector4(BED.x0, BED.z0, BED.x1, BED.z1) },
          uFog: { value: new THREE.Color() },
          uFogD: { value: 0.0003 },
        },
      }),
    [bed, rt, probe],
  )
  const geo = useMemo(() => {
    // dense near the cove, stretching to the horizon
    const n = 150
    const g = new THREE.PlaneGeometry(2, 2, n, n)
    g.rotateX(-Math.PI / 2)
    const p = g.attributes.position as THREE.BufferAttribute
    const f = (v: number) => Math.sign(v) * (Math.abs(v) * 150 + Math.pow(Math.abs(v), 6) * 9000)
    for (let i = 0; i < p.count; i++) p.setXYZ(i, f(p.getX(i)), 0, f(p.getZ(i)) + 40)
    g.computeBoundingSphere()
    return g
  }, [])
  useEffect(() => {
    const apply = () => {
      const k = quality.planar
      mat.uniforms.uHasMirror.value = k > 0 ? 1 : 0
      if (k > 0) rt.setSize(Math.round(size.width * k * quality.dpr * 0.8), Math.round(size.height * k * quality.dpr * 0.8))
      probe.n = 0
    }
    apply()
    return onQuality(apply)
  }, [size, rt, mat, probe])

  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), plane: new THREE.Plane(), v: new THREE.Vector4(), q: new THREE.Vector4(), n: new THREE.Vector3() }), [])
  const frame = useRef(0)
  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const fog = scene.fog as THREE.FogExp2 | null
    if (fog) {
      mat.uniforms.uFog.value.copy(fog.color)
      mat.uniforms.uFogD.value = fog.density
    }
    frame.current++
    const cam = camera as THREE.PerspectiveCamera
    const oldRT = gl.getRenderTarget()
    const oldShadow = gl.shadowMap.autoUpdate
    const oldAlpha = gl.getClearAlpha()
    if (quality.planar > 0) {
      // mirror camera about y = 0
      mirrorCam.projectionMatrix.copy(cam.projectionMatrix)
      const M = tmp.m.set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
      mirrorCam.matrixAutoUpdate = false
      // world = reflect(camWorld) with x flipped to keep the winding right-handed
      const flip = new THREE.Matrix4().makeScale(1, -1, 1)
      mirrorCam.matrixWorld.multiplyMatrices(M, cam.matrixWorld).multiply(flip)
      mirrorCam.matrixWorldInverse.copy(mirrorCam.matrixWorld).invert()
      mirrorCam.matrix.copy(mirrorCam.matrixWorld)
      // oblique near plane so nothing below the sea is mirrored
      tmp.plane.set(tmp.n.set(0, 1, 0), 0.05).applyMatrix4(mirrorCam.matrixWorldInverse)
      const cp = tmp.v.set(tmp.plane.normal.x, tmp.plane.normal.y, tmp.plane.normal.z, tmp.plane.constant)
      const P = mirrorCam.projectionMatrix
      const e = P.elements
      tmp.q.set((Math.sign(cp.x) + e[8]) / e[0], (Math.sign(cp.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14])
      cp.multiplyScalar(2 / cp.dot(tmp.q))
      e[2] = cp.x
      e[6] = cp.y
      e[10] = cp.z + 1
      e[14] = cp.w
      mirrorCam.projectionMatrixInverse.copy(P).invert()
      mat.uniforms.uMirror.value
        .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
        .multiply(cam.projectionMatrix)
        .multiply(mirrorCam.matrixWorldInverse)
      const skip = SKY.hideInMirror
      const was = skip.map((o) => o.visible)
      skip.forEach((o) => (o.visible = false))
      mesh.visible = false
      gl.shadowMap.autoUpdate = false
      gl.setRenderTarget(rt)
      gl.setClearAlpha(0)
      gl.clear()
      gl.render(scene, mirrorCam)
      gl.setRenderTarget(oldRT)
      gl.setClearAlpha(oldAlpha)
      mesh.visible = true
      skip.forEach((o, i) => (o.visible = was[i]))
      gl.shadowMap.autoUpdate = oldShadow
    } else {
      // static probe, refreshed a few times while assets stream in and when the light changes
      const key = Math.round(GLOBAL.uSunDir.value.y * 12)
      if ((probe.n < 4 && frame.current % 90 === 60) || key !== probe.last) {
        probe.last = key
        probe.n++
        mesh.visible = false
        probe.cam.position.set(0, 3, -10)
        gl.shadowMap.autoUpdate = false
        probe.cam.update(gl, scene)
        gl.shadowMap.autoUpdate = oldShadow
        mesh.visible = true
      }
    }
  }, 0.5)
  return (
    <>
      <mesh ref={ref} name="sea" geometry={geo} material={mat} renderOrder={4} frustumCulled={false} />
      <mesh name="abyss" rotation-x={-Math.PI / 2} position={[0, -26, 4000]}>
        <planeGeometry args={[24000, 24000]} />
        <AbyssMaterial />
      </mesh>
    </>
  )
}

function AbyssMaterial() {
  const m = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.06, 0.115) }), [])
  useFrame(() => {
    const k = (1 - GLOBAL.uNight.value * 0.96) * (0.35 + 0.65 * Math.min(1, GLOBAL.uSunDir.value.y * 1.6))
    m.color.setRGB(0.002 * k, 0.07 * k, 0.135 * k)
  })
  return <primitive object={m} attach="material" />
}
