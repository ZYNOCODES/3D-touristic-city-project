// Pure function mapping the 0..1 time-of-day scrubber to lighting parameters.
import * as THREE from 'three'
import { lerp, smooth } from '../shared'

interface Key {
  t: number
  elev: number // degrees
  azim: number // degrees, 0 = towards +z (ocean), 90 = towards +x
  sun: [number, number, number]
  intensity: number
  ambient: number
  env: number
  fog: [number, number, number]
  fogDensity: number
  exposure: number
}

// Sun sets over the ocean (+z) so the masterplan (looking inland) is front-lit.
const KEYS: Key[] = [
  { t: 0.0, elev: 22, azim: 95, sun: [1.0, 0.86, 0.72], intensity: 2.6, ambient: 0.35, env: 0.9, fog: [0.72, 0.8, 0.88], fogDensity: 0.00032, exposure: 1.0 },
  { t: 0.3, elev: 52, azim: 62, sun: [1.0, 0.96, 0.9], intensity: 3.4, ambient: 0.4, env: 1.0, fog: [0.7, 0.8, 0.9], fogDensity: 0.00026, exposure: 0.95 },
  { t: 0.5, elev: 24, azim: 38, sun: [1.0, 0.85, 0.66], intensity: 3.0, ambient: 0.36, env: 0.95, fog: [0.82, 0.78, 0.74], fogDensity: 0.0003, exposure: 1.0 },
  { t: 0.62, elev: 6, azim: 22, sun: [1.0, 0.6, 0.32], intensity: 2.6, ambient: 0.3, env: 1.0, fog: [0.86, 0.62, 0.48], fogDensity: 0.00036, exposure: 1.1 },
  { t: 0.72, elev: -2, azim: 14, sun: [0.95, 0.42, 0.26], intensity: 0.6, ambient: 0.22, env: 0.9, fog: [0.42, 0.36, 0.42], fogDensity: 0.00034, exposure: 1.25 },
  { t: 0.82, elev: 30, azim: -40, sun: [0.55, 0.66, 1.0], intensity: 0.32, ambient: 0.12, env: 0.9, fog: [0.07, 0.09, 0.14], fogDensity: 0.0003, exposure: 1.5 },
  { t: 1.0, elev: 34, azim: -45, sun: [0.55, 0.66, 1.0], intensity: 0.3, ambient: 0.1, env: 0.9, fog: [0.05, 0.07, 0.11], fogDensity: 0.0003, exposure: 1.5 },
]

export interface Lighting {
  sunDir: THREE.Vector3
  sunColor: THREE.Color
  intensity: number
  ambient: number
  env: number
  fog: THREE.Color
  fogDensity: number
  exposure: number
  night: number
  golden: number
  /** blend weights for the day / golden / night HDRIs */
  weights: [number, number, number]
  isMoon: boolean
}

export function lightingAt(t: number): Lighting {
  t = Math.min(1, Math.max(0, t))
  let i = 0
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++
  const a = KEYS[i]
  const b = KEYS[i + 1]
  const k = smooth(0, 1, (t - a.t) / (b.t - a.t))
  // the moon takes over from the sun after dusk: don't interpolate azimuth across the swap
  const swap = a.t === 0.72
  const elev = swap ? (k < 0.5 ? lerp(a.elev, -8, k * 2) : lerp(-8, b.elev, (k - 0.5) * 2)) : lerp(a.elev, b.elev, k)
  const azim = swap ? (k < 0.5 ? a.azim : b.azim) : lerp(a.azim, b.azim, k)
  const e = THREE.MathUtils.degToRad(Math.max(elev, 2))
  const z = THREE.MathUtils.degToRad(azim)
  const sunDir = new THREE.Vector3(Math.sin(z) * Math.cos(e), Math.sin(e), Math.cos(z) * Math.cos(e)).normalize()
  const intensity = swap ? lerp(a.intensity, b.intensity, k) * (elev < 0 ? 0.25 : 1) : lerp(a.intensity, b.intensity, k)
  const night = smooth(0.66, 0.8, t)
  const golden = smooth(0.42, 0.6, t) * (1 - smooth(0.7, 0.8, t))
  const wDay = 1 - smooth(0.42, 0.6, t)
  const wNight = smooth(0.7, 0.84, t)
  const wGold = Math.max(0, 1 - wDay - wNight)
  return {
    sunDir,
    sunColor: new THREE.Color(lerp(a.sun[0], b.sun[0], k), lerp(a.sun[1], b.sun[1], k), lerp(a.sun[2], b.sun[2], k)),
    intensity,
    ambient: lerp(a.ambient, b.ambient, k),
    env: lerp(a.env, b.env, k),
    fog: new THREE.Color(lerp(a.fog[0], b.fog[0], k), lerp(a.fog[1], b.fog[1], k), lerp(a.fog[2], b.fog[2], k)),
    fogDensity: lerp(a.fogDensity, b.fogDensity, k),
    exposure: lerp(a.exposure, b.exposure, k),
    night,
    golden,
    weights: [wDay, wGold, wNight],
    isMoon: t > 0.77,
  }
}

/** Preset azimuth (deg) used to rotate each HDRI so its sun matches our light. */
export const HDRI_TARGET = {
  day: lightingAt(0.3),
  golden: lightingAt(0.62),
  night: lightingAt(0.92),
}
