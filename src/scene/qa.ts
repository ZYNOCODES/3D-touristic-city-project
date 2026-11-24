// dev-only: __shot(name, [eye], [target], fov) renders one full frame (with post) and stores it in docs/qa/after/web
import * as THREE from "three"
export function installQa() {
  const w = window as unknown as Record<string, any>
  w.__shot = async (name: string, eye?: number[], target?: number[], fov = 40, width = 1280) => {
    const st = w.__scene.__r3f.root.getState()
    const cam = w.__camera as THREE.PerspectiveCamera
    const c = w.__controls?.current
    if (eye && target) {
      if (c) { c.minAzimuthAngle = -Infinity; c.maxAzimuthAngle = Infinity; c.minPolarAngle = 0; c.maxPolarAngle = Math.PI; c.minDistance = 0; c.maxDistance = 1e5; c.target.set(target[0], target[1], target[2]); c.enableDamping = false }
      cam.position.set(eye[0], eye[1], eye[2]); cam.fov = fov; cam.updateProjectionMatrix(); cam.lookAt(target[0], target[1], target[2])
    }
    for (let i = 0; i < 3; i++) { w.__gl.shadowMap.needsUpdate = true; st.advance(st.clock.elapsedTime + 0.016) }
    const src = w.__gl.domElement as HTMLCanvasElement
    const k = Math.min(1, width / src.width)
    const cv = document.createElement("canvas"); cv.width = src.width * k; cv.height = src.height * k
    cv.getContext("2d")!.drawImage(src, 0, 0, cv.width, cv.height)
    const r = await fetch("/__qa/save?name=" + name, { method: "POST", body: cv.toDataURL("image/png") })
    return r.text()
  }
}
