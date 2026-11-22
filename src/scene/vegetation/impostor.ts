// Multi-view impostors for the photoreal vegetation baked by blender/build_vegetation.py.
// Each atlas holds 8 azimuths × 3 elevations of an orthographic render of a scanned or
// procedurally modelled plant. A camera-facing card picks the two closest azimuth frames
// (cross-faded) at the nearest elevation, so a tree keeps its real silhouette as you orbit.
// The same billboard code runs in the shadow depth pass (seen from the sun) for correct shadows.
import * as THREE from 'three'
import { GLOBAL } from '../shared'

export interface ImpostorMeta {
  atlas: string
  cols: number
  rows: number
  elevations: number[]
  size: number
  center: [number, number, number]
  height: number
  width: number
}

const VERT_HEAD = /* glsl */ `
uniform float uSize; uniform float uCenterY; uniform float uCols; uniform float uRows;
uniform float uTime; uniform float uWind;
varying vec2 vUv0; varying vec2 vUv1; varying float vW;
vec3 impWorld; vec3 impNormal;
void impostor(vec3 pos) {
  mat4 im = mat4(1.0);
  #ifdef USE_INSTANCING
    im = instanceMatrix;
  #endif
  vec3 base = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(im[0].xyz);
  float yaw = atan(-im[0].z, im[0].x);
  vec3 center = base + vec3(0.0, uCenterY * s, 0.0);
  vec3 v = normalize(cameraPosition - center);
  float el = degrees(asin(clamp(v.y, -1.0, 1.0)));
  float row = clamp(floor(el / 30.0 + 0.5), 0.0, uRows - 1.0);
  float az = atan(v.x, v.z) - yaw;
  float fa = fract(az / 6.28318530718) * uCols;
  float a0 = floor(fa);
  float a1 = mod(a0 + 1.0, uCols);
  vW = fa - a0;
  vec2 local = pos.xy + 0.5;
  // atlas rows are stored top = elevation 0
  float vr = (uRows - 1.0 - row);
  vUv0 = vec2((a0 + local.x) / uCols, (vr + local.y) / uRows);
  vUv1 = vec2((a1 + local.x) / uCols, (vr + local.y) / uRows);
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 right = normalize(cross(up, v));
  vec3 upv = normalize(cross(v, right));
  float sway = sin(uTime * 1.1 + base.x * 0.13 + base.z * 0.07) * 0.012 * uWind * max(pos.y + 0.2, 0.0);
  impWorld = center + (right * (pos.x + sway) + upv * pos.y) * uSize * s;
  impNormal = normalize(mix(v, up, 0.35));
}
`

function patchVertex(src: string) {
  return src
    .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
    // run the billboard setup first: three computes normals before <begin_vertex>
    .replace(/void main\(\) \{/, 'void main() {\nimpostor(position);')
    .replace('#include <project_vertex>', 'vec4 mvPosition = viewMatrix * vec4(impWorld, 1.0);\ngl_Position = projectionMatrix * mvPosition;')
    .replace('#include <worldpos_vertex>', 'vec4 worldPosition = vec4(impWorld, 1.0);')
}

const FRAG_HEAD = 'varying vec2 vUv0; varying vec2 vUv1; varying float vW;'
const FRAG_MAP = /* glsl */ `
  vec4 imp0 = texture2D(map, vUv0);
  vec4 imp1 = texture2D(map, vUv1);
  vec4 impC = mix(imp0, imp1, vW);
  diffuseColor *= impC;
`

export function makeImpostorMaterials(meta: ImpostorMeta, tex: THREE.Texture, tint = new THREE.Color(0.62, 0.68, 0.58)) {
  const uniforms = {
    uSize: { value: meta.size },
    uCenterY: { value: meta.center[1] },
    uCols: { value: meta.cols },
    uRows: { value: meta.rows },
    uTime: GLOBAL.uTime,
    uWind: GLOBAL.uWind,
  }
  // the atlas already carries baked key light: tone it down so scene lighting does not double it
  const mat = new THREE.MeshStandardMaterial({ map: tex, color: tint, alphaTest: 0.42, roughness: 1, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.45 })
  mat.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = patchVertex(s.vertexShader).replace(
      '#include <defaultnormal_vertex>',
      '#include <defaultnormal_vertex>\ntransformedNormal = normalize(mat3(viewMatrix) * impNormal);',
    )
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD).replace('#include <map_fragment>', FRAG_MAP)
  }
  mat.customProgramCacheKey = () => 'impostor'
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 })
  depth.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms)
    s.vertexShader = patchVertex(s.vertexShader)
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_HEAD).replace('#include <map_fragment>', FRAG_MAP)
  }
  depth.customProgramCacheKey = () => 'impostor-depth'
  return { mat, depth }
}

export interface Plant {
  x: number
  y: number
  z: number
  s: number
  r: number
}

/** Spatially chunked instanced impostors (per-chunk frustum culling). */
export function buildImpostorGroup(name: string, meta: ImpostorMeta, tex: THREE.Texture, plants: Plant[], opts: { chunk?: number; shadow?: boolean; tint?: THREE.Color } = {}) {
  const { mat, depth } = makeImpostorMaterials(meta, tex, opts.tint)
  const geo = new THREE.PlaneGeometry(1, 1)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, meta.center[1], 0), meta.size * 0.75)
  geo.boundingBox = new THREE.Box3(new THREE.Vector3(-meta.size / 2, 0, -meta.size / 2), new THREE.Vector3(meta.size / 2, meta.size, meta.size / 2))
  const size = opts.chunk ?? 160
  const buckets = new Map<string, Plant[]>()
  for (const p of plants) {
    const k = `${Math.floor(p.x / size)},${Math.floor(p.z / size)}`
    if (!buckets.has(k)) buckets.set(k, [])
    buckets.get(k)!.push(p)
  }
  const group = new THREE.Group()
  group.name = name
  const m4 = new THREE.Matrix4()
  const q = new THREE.Quaternion()
  const Y = new THREE.Vector3(0, 1, 0)
  for (const list of buckets.values()) {
    const im = new THREE.InstancedMesh(geo, mat, list.length)
    list.forEach((p, i) => im.setMatrixAt(i, m4.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(Y, p.r), new THREE.Vector3(p.s, p.s, p.s))))
    im.customDepthMaterial = depth
    im.castShadow = opts.shadow ?? true
    im.receiveShadow = false
    im.computeBoundingSphere()
    group.add(im)
  }
  return group
}
