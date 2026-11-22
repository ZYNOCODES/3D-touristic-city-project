import * as THREE from 'three'

/** Uniforms shared by every custom shader in the experience. */
export const GLOBAL = {
  uTime: { value: 0 },
  /** 0 = full daylight, 1 = full night (drives emissive windows, lamps, pool lights) */
  uNight: { value: 0 },
  /** 0..1, golden-hour warmth used for subtle grading */
  uGolden: { value: 0 },
  uWind: { value: 1 },
  uSunDir: { value: new THREE.Vector3(0.3, 0.6, 0.5).normalize() },
  uSunColor: { value: new THREE.Color(1, 1, 1) },
  /** availability overlay strength (animated 0..1) */
  uAvail: { value: 0 },
}

/** Live sun info consumed by the light/shadow rig. */
export const SUN = {
  dir: new THREE.Vector3(0.3, 0.6, 0.5).normalize(),
  color: new THREE.Color(1, 1, 1),
  intensity: 3,
  ambient: 0.4,
  envIntensity: 1,
  fog: new THREE.Color('#b9c9d6'),
  fogDensity: 0.00028,
  exposure: 1,
}

/** Small GLSL helpers injected into onBeforeCompile patches. */
export const GLSL_NOISE = /* glsl */ `
float vhash(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(vhash(i), vhash(i+vec2(1,0)), u.x), mix(vhash(i+vec2(0,1)), vhash(i+vec2(1,1)), u.x), u.y);
}
float vfbm(vec2 p){ float s=0.0; float a=0.5; for(int i=0;i<5;i++){ s+=a*vnoise(p); p*=2.03; a*=0.5;} return s; }
`

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt))
