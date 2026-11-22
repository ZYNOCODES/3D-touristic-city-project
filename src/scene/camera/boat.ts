// Shared motion of the yacht for the "From the Bay" view: the camera and the visible
// foredeck use the same heave / pitch / roll so they move as one rigid boat.
import * as THREE from 'three'

export const BOAT = {
  active: false,
  t0: 0,
  /** user look offsets (drag to look around), radians */
  yaw: 0,
  pitch: 0,
  yawT: 0,
  pitchT: 0,
}

export interface BoatPose {
  offset: THREE.Vector3 // drift + heave added to the anchored eye position
  pitch: number
  roll: number
  heading: number // slow swing on the anchor chain (radians, about +y)
}

/** Gentle swell: a few superposed sines (period 5–9 s), plus a slow drift on the anchor. */
export function boatPose(t: number, out: BoatPose = { offset: new THREE.Vector3(), pitch: 0, roll: 0, heading: 0 }) {
  const heave = Math.sin(t * 0.72) * 0.16 + Math.sin(t * 1.31 + 1.2) * 0.07 + Math.sin(t * 0.37 + 2.0) * 0.05
  out.pitch = Math.sin(t * 0.81 + 0.6) * 0.022 + Math.sin(t * 1.53) * 0.008
  out.roll = Math.sin(t * 0.64 + 1.7) * 0.03 + Math.sin(t * 1.17 + 0.3) * 0.01
  out.heading = Math.sin(t * 0.045) * 0.12
  out.offset.set(Math.sin(t * 0.03) * 14, heave, Math.sin(t * 0.021 + 1) * 6)
  return out
}
