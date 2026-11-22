import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from '@react-three/postprocessing'
import { BlendFunction, Effect, EffectAttribute, ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { MOTION } from '../camera/motion'
import { GLOBAL } from '../shared'
import { useStore } from '../../store'

/** Radial "speed" blur driven by camera velocity during flights. */
class SpeedBlurEffect extends Effect {
  constructor() {
    super(
      'SpeedBlur',
      /* glsl */ `
      uniform float strength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (strength < 0.002) { outputColor = inputColor; return; }
        vec2 dir = uv - vec2(0.5);
        float edge = smoothstep(0.05, 0.7, length(dir));
        vec4 acc = vec4(0.0); float tot = 0.0;
        for (int i = 0; i < 12; i++) {
          float t = float(i) / 11.0;
          float w = 1.0 - t * 0.6;
          acc += texture2D(inputBuffer, uv - dir * t * strength * 0.075 * edge) * w;
          tot += w;
        }
        outputColor = acc / tot;
      }`,
      { attributes: EffectAttribute.CONVOLUTION, uniforms: new Map([['strength', new THREE.Uniform(0)]]) },
    )
  }
}

/** Exposure + subtle filmic grade (warmth at golden hour, cool blue night, vignette). */
class GradeEffect extends Effect {
  constructor() {
    super(
      'Grade',
      /* glsl */ `
      uniform float exposure; uniform float golden; uniform float night; uniform float fade;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb * exposure;
        c *= mix(vec3(1.0), vec3(1.06, 0.99, 0.9), golden);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(c, mix(vec3(l), c, 0.86) * vec3(0.86, 0.95, 1.12), night * 0.55);
        vec2 d = uv - 0.5;
        c *= 1.0 - dot(d, d) * 0.55;
        outputColor = vec4(c, inputColor.a);
      }`,
      {
        blendFunction: BlendFunction.SET,
        uniforms: new Map([
          ['exposure', new THREE.Uniform(1)],
          ['golden', new THREE.Uniform(0)],
          ['night', new THREE.Uniform(0)],
          ['fade', new THREE.Uniform(0)],
        ]),
      },
    )
  }
}

export function PostFX() {
  const gl = useThree((s) => s.gl)
  const speed = useMemo(() => new SpeedBlurEffect(), [])
  const grade = useMemo(() => new GradeEffect(), [])
  const interior = useStore((s) => s.mode === 'interior' || s.mode === 'sheet')
  useFrame(() => {
    speed.uniforms.get('strength')!.value = MOTION.speed
    grade.uniforms.get('exposure')!.value = gl.toneMappingExposure
    grade.uniforms.get('golden')!.value = GLOBAL.uGolden.value
    grade.uniforms.get('night')!.value = GLOBAL.uNight.value
  })
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <N8AO aoRadius={interior ? 1.2 : 4} intensity={interior ? 2.2 : 1.6} distanceFalloff={interior ? 0.6 : 1.5} quality="medium" halfRes={!interior} />
      <Bloom mipmapBlur luminanceThreshold={1.1} luminanceSmoothing={0.2} intensity={0.55} radius={0.7} />
      <primitive object={speed} />
      <primitive object={grade} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      <SMAA />
    </EffectComposer>
  )
}
