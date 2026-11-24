// The calanque: limestone cliffs, garrigue plateau and seabed (blender/cove_terrain.py),
// shaded with photographed limestone using biplanar mapping aligned to the sculpted relief.
import { useEffect, useState } from 'react'
import * as THREE from 'three'
import { loadGLTFUrl } from '../../lib/assets'
import { GLSL_NOISE } from '../shared'
import { coveTex, quality } from './quality'
import { patchUnderwater } from './underwater'

const FRAG = /* glsl */ `
uniform sampler2D tA, tAn, tB, tC, tG, tGn, tSand;
varying vec3 vP; varying vec3 vN; varying float vAo;
${GLSL_NOISE}
vec3 gNrm; float gWet;
vec3 limestone(vec3 p, vec3 n, out vec3 nOut){
  vec3 a = abs(n);
  a = max(a - 0.25, 0.001); a = a * a * a; a /= a.x + a.y + a.z;
  float warp = (vnoise(p.xz * 0.05 + p.y * 0.03) - 0.5) * 0.35;
  vec2 ux = vec2(p.z, p.y) / 9.0 + warp, uz = vec2(p.x, p.y) / 9.0 + warp + 0.31, uy = p.xz / 9.0;
  // two limestones (white with ochre seams / grey massive), mixed by large soft noise
  float m = smoothstep(0.42, 0.62, vfbm(vec2(p.x + p.z, p.y * 0.55) * 0.045));
  vec3 cx = mix(texture2D(tA, ux).rgb, texture2D(tB, ux * 0.8).rgb, m);
  vec3 cz = mix(texture2D(tA, uz).rgb, texture2D(tB, uz * 0.8).rgb, m);
  vec3 cy = texture2D(tB, uy * 1.3).rgb;
  vec3 c = cx * a.x + cz * a.z + cy * a.y;
  // second, larger scale hides the repetition
  vec3 far = texture2D(tC, vec2(p.x + p.z * 0.8, p.y) / 38.0).rgb;
  float lf = dot(far, vec3(0.333));
  c *= mix(0.72, 1.42, smoothstep(0.2, 0.75, lf));
  vec3 nx = texture2D(tAn, ux).xyz * 2.0 - 1.0, nz = texture2D(tAn, uz).xyz * 2.0 - 1.0, ny = texture2D(tAn, uy).xyz * 2.0 - 1.0;
  vec3 wnx = vec3(0.0, nx.y, nx.x), wnz = vec3(nz.x, nz.y, 0.0), wny = vec3(ny.x, 0.0, -ny.y);
  nOut = normalize(n + (wnx * a.x + wnz * a.z + wny * a.y) * 0.95);
  // sun-bleached limestone albedo: pale grey-white with warm seams
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 0.62);
  c = pow(c, vec3(0.8)) * vec3(0.93, 0.9, 0.85);
  float s1 = vnoise(vec2((p.x - p.z) * 0.55, p.y * 0.045));
  float s2 = vnoise(vec2((p.x - p.z) * 0.21 + 7.0, p.y * 0.03));
  float wall = 1.0 - smoothstep(0.35, 0.75, n.y);
  c *= mix(1.0, 0.58, smoothstep(0.62, 0.86, s1) * wall);                                     // dark water streaks
  c = mix(c, c * vec3(1.16, 0.84, 0.58), smoothstep(0.55, 0.85, s2) * wall * 0.7);            // iron stains
  return c;
}
`

function makeMaterial(far: boolean) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.93, metalness: 0, envMapIntensity: 1.35 })
  m.vertexColors = true
  const u = {
    tA: { value: coveTex('cliff_a_diff', true, 8) }, tAn: { value: coveTex('cliff_a_nor_gl', false, 4) },
    tB: { value: coveTex('cliff_b_diff', true, 8) }, tC: { value: coveTex('cliff_c_diff', true, 2) },
    tG: { value: coveTex('ground_rocky_diff', true, 4) }, tGn: { value: coveTex('ground_rocky_nor_gl') },
    tSand: { value: coveTex('seabed_sand_diff', true, 4) },
  }
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, u)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vP; varying vec3 vN; varying float vAo;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvP = (modelMatrix * vec4(position, 1.0)).xyz; vN = normalize(mat3(modelMatrix) * normal); vAo = color.r;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG)
      .replace('#include <color_fragment>', '')
      .replace(
        '#include <map_fragment>',
        /* glsl */ `
        vec3 n0 = normalize(vN);
        vec3 pp = vP;
        pp.xz += uwRefract(vP);
        vec3 nRock; vec3 col = limestone(pp, n0, nRock);
        float flatK = smoothstep(0.62, 0.86, n0.y + (vnoise(vP.xz * 0.8) - 0.5) * 0.22);
        float macro = vfbm(vP.xz * 0.05);
        // thin garrigue soil, dry herbs and pine litter on the tops
        vec3 g = texture2D(tG, vP.xz * 0.22).rgb * mix(1.0, dot(texture2D(tG, vP.xz * 0.037).rgb, vec3(0.9)) + 0.5, 0.6);
        vec3 ground = g * mix(vec3(0.95, 0.86, 0.72), vec3(0.62, 0.66, 0.4), smoothstep(0.35, 0.65, macro));
        float soil = flatK * smoothstep(2.6, 5.0, vP.y) * smoothstep(0.3, 0.55, vfbm(vP.xz * 0.11 + 3.0)) ;
        col = mix(col, ground, soil * 0.92);
        ${far ? `
        float garr = smoothstep(0.5, 0.8, n0.y) * smoothstep(3.0, 8.0, vP.y) * smoothstep(0.34, 0.6, vfbm(vP.xz * 0.035));
        col = mix(col, vec3(0.085, 0.105, 0.045) * (0.6 + 0.9 * vnoise(vP.xz * 0.6)), garr * 0.85);` : ''}
        // splash zone: dark lichen band, pale scoured band, algae at the waterline
        float lip = vP.y + (vnoise(vP.xz * 0.7) - 0.5) * 0.7;
        col *= mix(vec3(1.0), vec3(0.46, 0.42, 0.36), smoothstep(1.35, 0.75, lip) * smoothstep(-0.2, 0.25, lip) );
        col = mix(col, col * vec3(0.5, 0.5, 0.26), smoothstep(0.35, 0.0, lip) * smoothstep(-1.6, -0.3, vP.y));
        gWet = smoothstep(0.75, 0.1, lip);
        // seabed
        if (vP.y < 0.3) {
          float flat2 = smoothstep(0.55, 0.85, n0.y);
          vec3 sand = texture2D(tSand, pp.xz * 0.16).rgb; sand = mix(sand, texture2D(tSand, pp.xz * 0.031).rgb, 0.4);
          sand = pow(sand, vec3(0.62)) * vec3(1.0, 0.95, 0.84);
          float rip = sin(dot(pp.xz, vec2(1.6, 0.7)) * 2.2 + vnoise(pp.xz * 0.25) * 9.0);
          sand *= 0.96 + 0.05 * rip;
          float grassN = vfbm(pp.xz * 0.042 + 11.0) + 0.22 * (vfbm(pp.xz * 0.21) - 0.5);
          float meadow = smoothstep(0.475, 0.535, grassN) * smoothstep(-1.3, -2.6, vP.y);
          vec3 posid = vec3(0.028, 0.06, 0.03) * (0.55 + 1.1 * vnoise(pp.xz * vec2(2.4, 5.2)) + 0.5 * vnoise(pp.xz * 9.0));
          vec3 pebble = limestone(pp * 1.7, n0, nRock) * vec3(0.62, 0.6, 0.48);
          vec3 bed = mix(sand, pebble, smoothstep(0.56, 0.68, vfbm(pp.xz * 0.16 + 5.0)) * 0.85);
          bed = mix(bed, posid, meadow);
          vec3 rockUw = col * mix(vec3(0.62, 0.6, 0.42), vec3(0.32, 0.36, 0.2), smoothstep(0.4, 0.7, vnoise(pp.xz * 1.3)));
          float uwk = smoothstep(0.15, -0.7, vP.y);
          col = mix(col, mix(rockUw, bed, flat2), uwk);
          nRock = normalize(mix(nRock, n0, flat2 * uwk * 0.75));
        }
        vec3 fN = normalize(cross(dFdx(vP), dFdy(vP))); nRock = normalize(nRock + (fN - n0) * 0.45 * smoothstep(140.0, 20.0, distance(cameraPosition, vP)) * smoothstep(0.0, 1.0, vP.y));
        gNrm = normalize(mix(nRock, normalize(n0 + vec3(texture2D(tGn, vP.xz * 0.22).xy * 2.0 - 1.0, 0.0).xzy * 0.5), soil));
        float ao = mix(1.0, vAo, 0.9);
        col *= mix(vec3(0.62, 0.56, 0.5), vec3(1.0), ao);   // bounce-tinted cavities
        diffuseColor.rgb = col;`,
      )
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(gNrm, 0.0)).xyz);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, gWet * 0.8);')
      .replace('#include <aomap_fragment>', 'reflectedLight.indirectDiffuse *= mix(0.25, 1.0, vAo) * vec3(1.1, 1.0, 0.88); reflectedLight.indirectSpecular *= vAo * vAo;')
    // direct light is also softened inside cracks
    s.fragmentShader = s.fragmentShader.replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directDiffuse *= mix(0.55, 1.0, smoothstep(0.1, 0.7, vAo));')
  }
  m.customProgramCacheKey = () => 'cove-rock' + far
  return patchUnderwater(m)
}

export function CoveTerrain() {
  const [scene, setScene] = useState<THREE.Group | null>(null)
  useEffect(() => {
    let on = true
    loadGLTFUrl('models/cove_terrain.glb').then((g) => {
      if (!g || !on) return
      g.scene.traverse((o) => {
        const m = o as THREE.Mesh
        if (!m.isMesh) return
        const far = /far/i.test(m.name)
        m.material = makeMaterial(far)
        m.receiveShadow = true
        m.castShadow = !far
      })
      g.scene.name = 'cove-terrain'
      setScene(g.scene)
    })
    return () => {
      on = false
    }
  }, [])
  void quality
  if (!scene) return null
  return <primitive object={scene} />
}
