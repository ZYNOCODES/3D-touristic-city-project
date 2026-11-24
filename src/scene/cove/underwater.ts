// Everything below y = 0 is seen through water. Instead of a second (refraction) pass, each material
// shades its own underwater part: simulated caustics, Beer–Lambert absorption along the refracted
// path and turquoise in-scatter. The sea surface then only adds reflection on top, so the whole
// effect costs one pass and works on phones.
import * as THREE from 'three'
import { GLOBAL } from '../shared'
import { coveTex } from './quality'

export const UW = {
  tCaustics: { value: null as THREE.Texture | null },
  tWave: { value: null as THREE.Texture | null },
}
export function uwUniforms() {
  if (!UW.tCaustics.value) {
    const c = coveTex('caustics')
    c.generateMipmaps = false
    c.minFilter = THREE.LinearFilter
    UW.tCaustics.value = c
    UW.tWave.value = coveTex('wave_n', false, 8)
  }
  return { ...UW, uTime: GLOBAL.uTime, uSunDir: GLOBAL.uSunDir, uSunColor: GLOBAL.uSunColor, uNight: GLOBAL.uNight }
}

export const WAVE_GLSL = /* glsl */ `
vec2 waveSlope(vec2 p, float t, float lod){
  vec2 a = texture2D(tWave, p * 0.043 + vec2(0.011, 0.017) * t).rg - 0.5;
  vec2 b = texture2D(tWave, p.yx * 0.017 + vec2(-0.006, 0.008) * t).rg - 0.5;
  vec2 c = texture2D(tWave, p * 0.137 + vec2(-0.031, 0.022) * t).rg - 0.5;
  return (a * 1.0 + b.yx * 0.9) * 0.34 + c * 0.2 * lod;
}`

export const UW_GLSL = /* glsl */ `
uniform sampler2D tCaustics; uniform sampler2D tWave; uniform float uTime, uNight; uniform vec3 uSunDir, uSunColor;
${WAVE_GLSL}
float causticFrame(vec2 p, float f){
  vec2 cell = vec2(mod(f, 8.0), floor(f / 8.0));
  vec2 q = fract(p) * (254.0 / 256.0) + 1.0 / 256.0;
  float v = textureLod(tCaustics, (q + cell) / vec2(8.0, 4.0), 0.0).r;
  return v * v * 6.0;
}
float caustics(vec2 p, float t){
  float f = t * 7.0; float f0 = mod(floor(f), 32.0), f1 = mod(f0 + 1.0, 32.0);
  float a = mix(causticFrame(p, f0), causticFrame(p, f1), fract(f));
  return a;
}
vec2 uwRefract(vec3 wp){
  // apparent lateral shift of the bottom, from the wave slope where the view ray meets the surface
  if (wp.y > -0.05 || cameraPosition.y < 0.05) return vec2(0.0);
  float k = cameraPosition.y / (cameraPosition.y - wp.y);
  vec2 q = cameraPosition.xz + (wp.xz - cameraPosition.xz) * k;
  return waveSlope(q, uTime, 1.0) * min(-wp.y, 5.0) * 0.55;
}
vec3 underwater(vec3 col, vec3 direct, vec3 wp, float body){
  float d = -wp.y;
  if (d < 0.0) return col;
  vec2 r = uwRefract(wp);
  vec2 sp = wp.xz + r + uSunDir.xz / max(uSunDir.y, 0.25) * d * 0.7;
  float c1 = caustics(sp * 0.155, uTime);
  float ck = c1 * (0.65 + 0.7 * caustics(sp * 0.052 + 0.37, uTime * 0.6));
  float focus = smoothstep(0.0, 1.4, d) * exp(-d * 0.075);
  col += direct * (ck - 1.0) * focus * 0.85 * (1.0 - uNight);
  vec3 V = normalize(wp - cameraPosition);
  float cosR = sqrt(1.0 - (1.0 - V.y * V.y) * 0.5653);
  float path = d * (1.0 / cosR + 0.55 / max(uSunDir.y, 0.3));
  vec3 T = exp(-vec3(0.205, 0.034, 0.031) * path);
  float sun = mix(dot(uSunColor, vec3(0.33)) * smoothstep(-0.05, 0.6, uSunDir.y), 0.045, uNight);
  vec3 scat = vec3(0.004, 0.265, 0.335) * sun * 0.85;
  vec3 deep = vec3(0.0, 0.075, 0.15) * sun;
  scat = mix(scat, deep, smoothstep(4.0, 24.0, d));
  return col * mix(vec3(1.0), T, body) + scat * (1.0 - exp(-0.072 * path)) * body;
}`

/** Adds the underwater optics to a built-in lit material (chains any existing onBeforeCompile). */
export function patchUnderwater<M extends THREE.Material>(mat: M, key = ''): M {
  if (mat.userData.uw) return mat
  mat.userData.uw = true
  const prev = mat.onBeforeCompile
  const prevKey = mat.customProgramCacheKey
  mat.onBeforeCompile = (s, r) => {
    prev?.call(mat, s, r)
    Object.assign(s.uniforms, uwUniforms())
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vUwPos;')
      .replace('#include <project_vertex>', `#include <project_vertex>
      { vec4 uwp = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        uwp = instanceMatrix * uwp;
      #endif
      vUwPos = (modelMatrix * uwp).xyz; }`)
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vUwPos;\n${UW_GLSL}`)
      .replace('#include <opaque_fragment>', 'outgoingLight = underwater(outgoingLight, reflectedLight.directDiffuse, vUwPos, 1.0);\n#include <opaque_fragment>')
  }
  mat.customProgramCacheKey = () => (prevKey ? prevKey.call(mat) : '') + '|uw' + key
  return mat
}
