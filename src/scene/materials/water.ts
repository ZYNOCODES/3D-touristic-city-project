// Animated water built on MeshPhysicalMaterial so it keeps PBR env reflections,
// sun specular glints, shadows and fog. A procedural multi-octave normal field is
// injected in view space; colour is driven by depth (ocean) or a fixed tint (pools).
import * as THREE from 'three'
import { GLOBAL, GLSL_NOISE } from '../shared'

export interface WaterOptions {
  kind: 'ocean' | 'pool'
  depthTex?: THREE.Texture
  depthBounds?: { x0: number; x1: number; z0: number; z1: number }
  shallow?: THREE.ColorRepresentation
  deep?: THREE.ColorRepresentation
  scale?: number
  strength?: number
  opacity?: number
}

export function makeWaterMaterial(o: WaterOptions) {
  const ocean = o.kind === 'ocean'
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: ocean ? 0.06 : 0.03,
    metalness: 0,
    ior: 1.33,
    specularIntensity: 1,
    clearcoat: ocean ? 0 : 0.6,
    clearcoatRoughness: 0.02,
    transparent: !ocean,
    opacity: o.opacity ?? 1,
    envMapIntensity: ocean ? 1.0 : 1.2,
  })
  const b = o.depthBounds ?? { x0: 0, x1: 1, z0: 0, z1: 1 }
  const uniforms = {
    uTime: GLOBAL.uTime,
    uNight: GLOBAL.uNight,
    uSunDir: GLOBAL.uSunDir,
    uSunColor: GLOBAL.uSunColor,
    tDepth: { value: o.depthTex ?? null },
    uBounds: { value: new THREE.Vector4(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0) },
    uShallow: { value: new THREE.Color(o.shallow ?? (ocean ? '#3fc7c0' : '#6fd3ef')) },
    uDeep: { value: new THREE.Color(o.deep ?? (ocean ? '#0b3b5c' : '#1580cf')) },
    uScale: { value: o.scale ?? (ocean ? 1 : 3.5) },
    uStrength: { value: o.strength ?? (ocean ? 0.42 : 0.16) },
  }
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        #ifdef USE_INSTANCING
          vWPos = (modelMatrix * instanceMatrix * vec4(transformed,1.0)).xyz;
        #else
          vWPos = (modelMatrix * vec4(transformed,1.0)).xyz;
        #endif`,
      )
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vWPos;
        uniform float uTime, uNight, uScale, uStrength;
        uniform vec3 uSunDir, uSunColor, uShallow, uDeep;
        uniform vec4 uBounds;
        ${ocean ? 'uniform sampler2D tDepth;' : ''}
        ${GLSL_NOISE}
        vec2 gradN(vec2 p){
          float e = 0.07;
          return vec2(vnoise(p+vec2(e,0.0)) - vnoise(p-vec2(e,0.0)), vnoise(p+vec2(0.0,e)) - vnoise(p-vec2(0.0,e))) / (2.0*e);
        }
        vec3 waterNormal(vec2 p, float dist){
          float t = uTime;
          vec2 g = vec2(0.0);
          // swell (directional), chop and fine ripples
          g += gradN(p*0.045*uScale + vec2(t*0.035, t*0.05)) * 0.9;
          g += gradN(p*0.11*uScale + vec2(-t*0.07, t*0.04)) * 0.55;
          g += gradN(p*0.31*uScale + vec2(t*0.11, -t*0.09)) * 0.32;
          g += gradN(p*0.83*uScale + vec2(-t*0.19, -t*0.15)) * 0.18;
          float fade = 1.0 / (1.0 + dist*0.0025); // calmer with distance (less aliasing)
          g *= uStrength * mix(0.35, 1.0, fade);
          return normalize(vec3(-g.x, 1.0, -g.y));
        }
        `,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float camDist = length(vWPos - cameraPosition);
        vec3 wN = waterNormal(vWPos.xz, camDist);
        ${
          ocean
            ? `vec2 duv = (vWPos.xz - uBounds.xy) / uBounds.zw;
        float depth = texture2D(tDepth, clamp(duv, 0.001, 0.999)).r;
        if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) depth = 40.0;
        float shallowK = 1.0 - smoothstep(0.0, 9.0, depth);
        vec3 wc = mix(uDeep, uShallow, shallowK * shallowK);
        wc = mix(wc, vec3(0.86,0.83,0.72), (1.0 - smoothstep(0.0, 0.9, depth)) * 0.55); // sand showing through
        // shoreline foam bands
        float foamBand = (1.0 - smoothstep(0.0, 1.4, depth)) * smoothstep(-0.3, 0.2, depth);
        float waves = sin(depth*5.0 - uTime*1.6 + vnoise(vWPos.xz*0.08)*6.0) * 0.5 + 0.5;
        float foam = foamBand * smoothstep(0.55, 0.95, waves * (0.6 + 0.6*vnoise(vWPos.xz*0.35 + uTime*0.2)));
        wc = mix(wc, vec3(0.95), foam);`
            : `float foam = 0.0; float shallowK = 0.6;
        vec3 wc = mix(uDeep, uShallow, 0.5 + 0.5*vnoise(vWPos.xz*0.3 + uTime*0.1));`
        }
        diffuseColor.rgb = wc;
        `,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        `,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.6, foam);`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // sub-surface scatter: light passing through wave crests towards the viewer
        vec3 V = normalize(cameraPosition - vWPos);
        float sss = pow(max(dot(V, -uSunDir), 0.0), 4.0) * max(wN.y - 0.82, 0.0) * 6.0;
        totalEmissiveRadiance += uShallow * uSunColor * sss * 0.25 * (1.0 - uNight) * shallowK;
        ${ocean ? '' : 'totalEmissiveRadiance += vec3(0.05, 0.32, 0.85) * uNight * 0.6;'}
        `,
      )
  }
  mat.customProgramCacheKey = () => `water-${o.kind}`
  return mat
}
