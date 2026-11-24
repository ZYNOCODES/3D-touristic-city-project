// Photogrammetry rock kit (Poly Haven scans) recoloured to the cove's limestone, instanced on the walls and the seabed.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { loadGLTFUrl } from '../../lib/assets'
import placed from '../../data/generated/rocks.json'
import { GLSL_NOISE } from '../shared'
import { quality } from './quality'
import { patchUnderwater } from './underwater'

type Row = [string, number, number, number, number, number, number]

function rockMaterial(src: THREE.MeshStandardMaterial) {
  const m = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughness: 0.92, metalness: 0, envMapIntensity: 1.25 })
  m.normalScale.set(1.15, 1.15)
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRp; varying vec3 vRn;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n{ vec4 rp = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nrp = instanceMatrix * rp; vRn = normalize(mat3(instanceMatrix) * objectNormal);\n#else\nvRn = objectNormal;\n#endif\nvRp = (modelMatrix * rp).xyz; }')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vRp; varying vec3 vRn;\n${GLSL_NOISE}`)
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec3 t = texture2D(map, vMapUv).rgb;
        float l = dot(t, vec3(0.299, 0.587, 0.114));
        // scan albedo → bleached limestone, keeping every crack and stain of the scan
        float k = pow(clamp(l * 2.6, 0.0, 1.4), 0.72);
        vec3 c = mix(vec3(k), t / max(l, 0.02) * k, 0.1) * vec3(0.63, 0.6, 0.55);
        float s2 = vnoise(vec2((vRp.x - vRp.z) * 0.21 + 7.0, vRp.y * 0.03));
        c = mix(c, c * vec3(1.16, 0.84, 0.58), smoothstep(0.55, 0.85, s2) * 0.6);
        float lip = vRp.y + (vnoise(vRp.xz * 0.7) - 0.5) * 0.7;
        c *= mix(vec3(1.0), vec3(0.46, 0.42, 0.36), smoothstep(1.35, 0.75, lip) * smoothstep(-0.2, 0.25, lip));
        c = mix(c, c * vec3(0.62, 0.6, 0.42), smoothstep(0.1, -0.8, vRp.y));
        c = mix(c, c * vec3(0.5, 0.56, 0.3), smoothstep(-0.4, -1.5, vRp.y) * smoothstep(0.45, 0.7, vnoise(vRp.xz * 1.3)) * step(0.3, vRn.y));
        diffuseColor.rgb = c;`,
      )
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= vec3(1.12, 1.0, 0.86) * mix(0.6, 1.0, smoothstep(-0.8, 0.5, vRn.y));')
  }
  m.customProgramCacheKey = () => 'rock-kit'
  return patchUnderwater(m)
}

export function Rocks() {
  const [group, setGroup] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let on = true
    loadGLTFUrl('models/rocks.glb').then((g) => {
      if (!g || !on) return
      const out = new THREE.Group()
      out.name = 'rocks'
      const rows = (placed as unknown as Row[]).filter((_, i) => quality.tier !== 'low' || i % 2 === 0)
      const m4 = new THREE.Matrix4()
      const q = new THREE.Quaternion()
      const e = new THREE.Euler()
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const list = rows.filter((r) => m.name.startsWith(r[0]) || m.parent?.name === r[0])
        if (!list.length) return
        const mat = rockMaterial(m.material as THREE.MeshStandardMaterial)
        // two spatial chunks (west / east) keep culling useful
        for (const part of [list.filter((r) => r[1] < 0), list.filter((r) => r[1] >= 0)]) {
          if (!part.length) continue
          const im = new THREE.InstancedMesh(m.geometry, mat, part.length)
          part.forEach((r, i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(r[1], r[2], r[3]), q.setFromEuler(e.set(r[5], r[4], 0, 'YXZ')), new THREE.Vector3(r[6], r[6], r[6]))))
          im.computeBoundingSphere()
          im.castShadow = quality.tier !== 'low'
          im.receiveShadow = true
          out.add(im)
        }
      })
      setGroup(out)
    })
    return () => {
      on = false
    }
  }, [])
  return group ? <primitive object={group} /> : null
}
