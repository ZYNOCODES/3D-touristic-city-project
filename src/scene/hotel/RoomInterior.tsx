// Rooms: one baked interior model (blender/room_interior.py) opened inside whichever room is selected.
// Selected from outside → the façade is cut away and the lit room shows through a glowing frame;
// entered → walk between hotspots with the real cove, sea and time of day through the open doors.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { HOTEL, ROOM_BY_ID, UNIT_TYPES, roomFrame } from '../../data/rooms'
import { applyPBR, loadGLTFUrl } from '../../lib/assets'
import { useStore, type HotspotId, type Spot } from '../../store'
import { GLOBAL, GLSL_NOISE } from '../shared'
import { CUT } from './Hotel'

const BASE = import.meta.env.BASE_URL
export interface Frame { position: THREE.Vector3; rotationY: number }
const PAL = { uTintWood: { value: new THREE.Color(1, 1, 1) }, uTintFabric: { value: new THREE.Color(1, 1, 1) }, uTintWall: { value: new THREE.Color(1, 1, 1) }, uTintThrow: { value: new THREE.Color(1, 1, 1) } }
const PALETTES = [
  { wood: [1.0, 0.95, 0.88], fabric: [1, 0.98, 0.94], wall: [1, 1, 1], thr: [1, 1, 1] }, // pale oak & linen
  { wood: [0.86, 0.7, 0.56], fabric: [0.95, 0.82, 0.7], wall: [1, 0.96, 0.9], thr: [1.15, 0.78, 0.6] }, // terracotta
  { wood: [0.46, 0.36, 0.3], fabric: [0.62, 0.66, 0.68], wall: [0.86, 0.85, 0.83], thr: [0.35, 0.5, 0.56] }, // walnut & sea-slate
]
interface RoomSpec { hotspots: Spot[]; scale: number; size: [number, number, number] }
type Loaded = { group: THREE.Group; spec: RoomSpec }
let loadP: Promise<Loaded | null> | null = null

function lit(m: THREE.MeshStandardMaterial, name: string, day: THREE.Texture, night: THREE.Texture, scale: number) {
  const kind = /walnut|^wood|parquet|legs/.test(name) ? 'uTintWood' : /fabric|rug|curtain/.test(name) ? 'uTintFabric' : /stucco/.test(name) ? 'uTintWall' : /throw/.test(name) ? 'uTintThrow' : ''
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, PAL, { tDay: { value: day }, tNight: { value: night }, uNight: GLOBAL.uNight, uGolden: GLOBAL.uGolden })
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 uv1; varying vec2 vLm; varying vec3 vRp; varying vec3 vRn;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLm = uv1; vRp = position; vRn = normal;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform sampler2D tDay, tNight; uniform float uNight, uGolden; uniform vec3 uTintWood, uTintFabric, uTintWall, uTintThrow; varying vec2 vLm; varying vec3 vRp; varying vec3 vRn;\n${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${kind ? `diffuseColor.rgb *= ${kind};` : ''}
        ${name === 'art' ? 'vec2 ap = vec2(vRp.z * 2.2, vRp.y * 2.2); float an = vfbm(ap * 1.7 + floor(vRp.z * 1.2) * 9.0); diffuseColor.rgb = mix(vec3(0.86, 0.83, 0.76), mix(vec3(0.08, 0.36, 0.44), vec3(0.62, 0.36, 0.2), smoothstep(0.35, 0.6, vfbm(ap + 4.0))), smoothstep(0.45, 0.52, an));' : ''}
        ${name === 'rug' ? 'diffuseColor.rgb *= 0.86 + 0.28 * vnoise(vRp.xz * 90.0) ;' : ''}
        ${name === 'cushion' || name === 'fabric' ? 'diffuseColor.rgb *= 0.95 + 0.1 * vnoise(vRp.xz * 60.0 + vRp.y * 60.0);' : ''}`)
      .replace('#include <aomap_fragment>', `
        vec3 ld = texture2D(tDay, vLm).rgb; vec3 ln = texture2D(tNight, vLm).rgb;
        ld = ld * ld * ${scale.toFixed(1)}; ln = ln * ln * ${scale.toFixed(1)};
        vec3 dayTone = mix(vec3(1.0), vec3(1.15, 0.78, 0.52), uGolden);
        vec3 irr = mix(ld * dayTone * vec3(1.62, 1.46, 1.28) * mix(1.0, 0.75, uGolden), ln * 1.5, uNight);
        reflectedLight.directDiffuse = vec3(0.0);
        reflectedLight.directSpecular *= 0.0;
        reflectedLight.indirectDiffuse = irr * diffuseColor.rgb;
        float lum = dot(irr, vec3(0.333));
        reflectedLight.indirectSpecular *= clamp(lum * 0.9, 0.04, 0.8);`)
  }
  m.customProgramCacheKey = () => 'room-' + name
  return m
}

function makeMat(name: string, src: THREE.MeshStandardMaterial, day: THREE.Texture, night: THREE.Texture, scale: number): THREE.Material {
  const std = (p: THREE.MeshStandardMaterialParameters, pbr?: string, rep = 0.5, ns = 0.6) => {
    const m = new THREE.MeshStandardMaterial({ envMapIntensity: 0.8, ...p })
    if (pbr) applyPBR(m, pbr, rep, ns).then(() => {
      // fabrics keep the weave relief only; their colour comes from the palette
      if (pbr === 'linen') {
        m.map = null
        m.needsUpdate = true
      }
    })
    return lit(m, name, day, night, scale)
  }
  switch (name) {
    case 'glass':
      return new THREE.MeshPhysicalMaterial({ color: '#dfeeee', roughness: 0.02, transparent: true, opacity: 0.1, envMapIntensity: 0.9, depthWrite: false })
    case 'lamp':
      return lampMat()
    case 'parquet':
      return std({ color: new THREE.Color(1.7, 1.55, 1.38), roughness: 0.5 }, 'parquet', 0.5, 0.4)
    case 'wood':
      return std({ color: new THREE.Color(1.3, 1.16, 0.98), roughness: 0.6 }, 'oak', 0.5, 0.5)
    case 'walnut':
      return std({ color: '#e9d3bd', roughness: 0.5 }, 'oak', 0.4, 0.4)
    case 'stucco':
      return std({ color: '#f1ece3', roughness: 0.95 })
    case 'ceiling':
      return std({ color: '#f6f3ee', roughness: 0.95 })
    case 'travertine':
      return std({ color: '#f2e8da', roughness: 0.45 }, 'travertine', 0.35, 0.4)
    case 'marble':
      return std({ color: '#f5efe6', roughness: 0.22 }, 'marble', 0.6, 0.2)
    case 'fabric':
      return std({ color: '#e7ddcf', roughness: 0.95 }, 'linen', 1.2, 0.6)
    case 'cushion':
      return std({ color: '#f7f3ec', roughness: 0.95 }, 'linen', 1.4, 0.5)
    case 'throw':
      return std({ color: '#b98763', roughness: 1 }, 'linen', 1.2, 0.8)
    case 'rug':
      return std({ color: '#cfc3b2', roughness: 1 }, 'linen', 2.5, 1)
    case 'curtain':
      return std({ color: '#efe9de', roughness: 1, side: THREE.DoubleSide })
    case 'dark_metal':
      return std({ color: '#2b2622', roughness: 0.45, metalness: 0.6 })
    case 'brass':
      return std({ color: '#c9a063', roughness: 0.28, metalness: 0.9 })
    case 'mirror':
      return new THREE.MeshStandardMaterial({ color: '#dfe6e6', roughness: 0.03, metalness: 1, envMapIntensity: 0.35 })
    case 'bathwater':
      return new THREE.MeshPhysicalMaterial({ color: '#bfe3e2', roughness: 0.03, transparent: true, opacity: 0.55, envMapIntensity: 0.5 })
    case 'ceramic':
      return std({ color: '#f4f2ee', roughness: 0.18 })
    case 'black':
      return std({ color: '#16130f', roughness: 0.5 })
    case 'rope':
      return std({ color: '#b59d77', roughness: 1 })
    case 'art':
      return std({ color: '#ffffff', roughness: 0.7 })
    default: {
      if (src.transparent) return src
      const m = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, color: src.color, roughness: src.roughness, metalness: Math.min(src.metalness, 0.9), alphaTest: src.alphaTest || (/leav/i.test(name) ? 0.4 : 0), side: /leav/i.test(name) ? THREE.DoubleSide : THREE.FrontSide, envMapIntensity: 0.6 })
      return lit(m, name, day, night, scale)
    }
  }
}

function lampMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#fff3df', emissive: '#ffcf94', emissiveIntensity: 1, roughness: 0.9 })
  m.onBeforeCompile = (s) => {
    s.uniforms.uNight = GLOBAL.uNight
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= mix(0.75, 1.9, uNight);')
  }
  return m
}

function loadRoom() {
  loadP ??= (async () => {
    const tl = new THREE.TextureLoader()
    const tex = async (n: string) => {
      const t = await tl.loadAsync(BASE + 'models/room_' + n + '.webp')
      t.flipY = false
      t.colorSpace = THREE.NoColorSpace
      t.generateMipmaps = false
      t.minFilter = THREE.LinearFilter
      return t
    }
    const [g, day, night, spec] = await Promise.all([loadGLTFUrl('models/room.glb'), tex('day'), tex('night'), fetch(BASE + 'models/room.json').then((r) => r.json() as Promise<RoomSpec>)])
    if (!g) return null
    const group = new THREE.Group()
    g.scene.updateMatrixWorld(true)
    const list: THREE.Mesh[] = []
    g.scene.traverse((o) => (o as THREE.Mesh).isMesh && list.push(o as THREE.Mesh))
    for (const m of list) {
      const src = m.material as THREE.MeshStandardMaterial
      const name = src.name.replace(/\.\d+$/, '')
      const mesh = new THREE.Mesh(m.geometry, makeMat(name, src, day, night, spec.scale))
      mesh.applyMatrix4(m.matrixWorld)
      mesh.castShadow = false
      mesh.receiveShadow = false
      if ((mesh.material as THREE.Material).transparent) mesh.renderOrder = 8
      group.add(mesh)
    }
    return { group, spec }
  })()
  return loadP
}
export const preloadRoom = async (id: string) => {
  const r = await loadRoom()
  const u = ROOM_BY_ID.get(id)
  if (u) {
    const p = PALETTES[UNIT_TYPES[u.typeId].palette]
    PAL.uTintWood.value.setRGB(p.wood[0], p.wood[1], p.wood[2])
    PAL.uTintFabric.value.setRGB(p.fabric[0], p.fabric[1], p.fabric[2])
    PAL.uTintWall.value.setRGB(p.wall[0], p.wall[1], p.wall[2])
    PAL.uTintThrow.value.setRGB(p.thr[0], p.thr[1], p.thr[2])
  }
  if (r) useStore.setState({ spots: r.spec.hotspots, hotspot: r.spec.hotspots[0].id })
}

function InteriorRig({ frame }: { frame: Frame }) {
  const { camera, gl } = useThree()
  const hotspot = useStore((s) => s.hotspot)
  const st = useRef({ yaw: 0, pitch: 0, tYaw: 0, tPitch: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), k: 1, fov: 62, tFov: 62 })
  const toWorld = (p: [number, number, number]) =>
    new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.rotationY).add(frame.position)
  const spots = () => useStore.getState().spots

  // place the camera on mount
  useEffect(() => {
    const h = spots().find((x) => x.id === useStore.getState().hotspot) ?? spots()[0]
    const p = toWorld(h.pos)
    const l = toWorld(h.look)
    const d = l.clone().sub(p).normalize()
    const s = st.current
    s.yaw = s.tYaw = Math.atan2(-d.x, -d.z)
    s.pitch = s.tPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    s.from.copy(p)
    s.to.copy(p)
    s.k = 1
    camera.position.copy(p).add(d.clone().multiplyScalar(-0.6)) // small push-in on arrival
    s.from.copy(camera.position)
    s.k = 0
    const cam = camera as THREE.PerspectiveCamera
    cam.near = 0.04
    s.fov = s.tFov = innerWidth < innerHeight ? 80 : 64
    cam.updateProjectionMatrix()
    return () => {
      cam.near = 0.5
      cam.fov = 40
      cam.updateProjectionMatrix()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // glide to a new hotspot
  useEffect(() => {
    const h = spots().find((x) => x.id === hotspot) ?? spots()[0]
    const s = st.current
    s.from.copy(camera.position)
    s.to.copy(toWorld(h.pos))
    s.k = 0
    const d = toWorld(h.look).sub(s.to).normalize()
    let yaw = Math.atan2(-d.x, -d.z)
    while (yaw - s.yaw > Math.PI) yaw -= Math.PI * 2
    while (yaw - s.yaw < -Math.PI) yaw += Math.PI * 2
    s.tYaw = yaw
    s.tPitch = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotspot])

  // drag-to-look, wheel zoom, arrow keys
  useEffect(() => {
    const el = gl.domElement
    let drag: { x: number; y: number } | null = null
    const down = (e: PointerEvent) => (drag = { x: e.clientX, y: e.clientY })
    const move = (e: PointerEvent) => {
      if (!drag) return
      const s = st.current
      s.tYaw += (e.clientX - drag.x) * 0.0042
      s.tPitch = THREE.MathUtils.clamp(s.tPitch + (e.clientY - drag.y) * 0.0032, -1.2, 1.2)
      drag = { x: e.clientX, y: e.clientY }
    }
    const up = () => (drag = null)
    const wheel = (e: WheelEvent) => {
      st.current.tFov = THREE.MathUtils.clamp(st.current.tFov + e.deltaY * 0.03, 34, 86)
    }
    const key = (e: KeyboardEvent) => {
      const ids = spots().map((h) => h.id)
      const i = ids.indexOf(useStore.getState().hotspot)
      if (e.key === 'ArrowRight') useStore.setState({ hotspot: ids[(i + 1) % ids.length] })
      if (e.key === 'ArrowLeft') useStore.setState({ hotspot: ids[(i + ids.length - 1) % ids.length] })
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('wheel', wheel, { passive: true })
    window.addEventListener('keydown', key)
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('wheel', wheel)
      window.removeEventListener('keydown', key)
    }
  }, [gl])

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05)
    const s = st.current
    if (s.k < 1) {
      s.k = Math.min(1, s.k + dt / 1.6)
      const e = s.k * s.k * (3 - 2 * s.k)
      camera.position.lerpVectors(s.from, s.to, e)
      camera.position.y += Math.sin(e * Math.PI) * 0.05 // gentle "step" bob
    }
    const a = 1 - Math.exp(-6 * dt)
    s.yaw += (s.tYaw - s.yaw) * a
    s.pitch += (s.tPitch - s.pitch) * a
    s.fov += (s.tFov - s.fov) * a
    const cam = camera as THREE.PerspectiveCamera
    if (Math.abs(cam.fov - s.fov) > 0.01) {
      cam.fov = s.fov
      cam.updateProjectionMatrix()
    }
    camera.rotation.set(s.pitch, s.yaw, 0, 'YXZ')
  })
  return null
}

function HotspotMarkers({ toWorld }: { toWorld: (p: [number, number, number]) => THREE.Vector3 }) {
  const current = useStore((s) => s.hotspot)
  const list = useStore((s) => s.spots)
  const [hover, setHover] = useState<HotspotId | null>(null)
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.4, 1.4), transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false }), [])
  const discMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.18, depthWrite: false }), [])
  const t = useRef(0)
  const refs = useRef<THREE.Group[]>([])
  useFrame((_, dt) => {
    t.current += dt
    refs.current.forEach((g, i) => g && g.scale.setScalar(1 + Math.sin(t.current * 2.5 + i) * 0.06))
  })
  return (
    <>
      {list.filter((h) => h.id !== current).map((h, i) => {
        const p = toWorld([h.pos[0], 0.02, h.pos[2]])
        return (
          <group key={h.id} position={p} ref={(g) => void (refs.current[i] = g!)}>
            <mesh
              rotation-x={-Math.PI / 2}
              material={discMat}
              onClick={(e) => {
                e.stopPropagation()
                if (e.delta < 6) useStore.setState({ hotspot: h.id })
              }}
              onPointerOver={() => {
                setHover(h.id)
                document.body.style.cursor = 'pointer'
              }}
              onPointerOut={() => {
                setHover(null)
                document.body.style.cursor = ''
              }}
            >
              <circleGeometry args={[0.42, 32]} />
            </mesh>
            <mesh rotation-x={-Math.PI / 2} position-y={0.005} material={ringMat} scale={hover === h.id ? 1.15 : 1}>
              <ringGeometry args={[0.36, 0.42, 48]} />
            </mesh>
            <Html position={[0, 0.25, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className={`hotspot-label ${hover === h.id ? 'on' : ''}`}>{h.label}</div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

/** glowing edges of the opened room (as a light frame around the cut-away) */
function GlowFrame({ show }: { show: boolean }) {
  const ref = useRef<THREE.Group>(null)
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 2.6, 3.0), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }), [])
  const bars = useMemo(() => {
    const w = HOTEL.bw / 2 - 0.12
    const h = 2.9
    const z = 0.14
    const t = 0.035
    return [
      [0, 0, z, w * 2, t, t], [0, h, z, w * 2, t, t], [-w, h / 2, z, t, h, t], [w, h / 2, z, t, h, t],
    ] as number[][]
  }, [])
  useFrame(({ clock }, dt) => {
    mat.opacity = THREE.MathUtils.damp(mat.opacity, show ? 0.82 + 0.15 * Math.sin(clock.elapsedTime * 2.2) : 0, 6, Math.min(dt || 0.016, 0.1))
    if (ref.current) ref.current.visible = mat.opacity > 0.01
  })
  return (
    <group ref={ref}>
      {bars.map((b, i) => (
        <mesh key={i} position={[b[0], b[1], b[2]]} material={mat} renderOrder={9}>
          <boxGeometry args={[b[3], b[4], b[5]]} />
        </mesh>
      ))}
    </group>
  )
}

export function RoomInterior() {
  const selected = useStore((s) => s.selectedUnit)
  const interior = useStore((s) => s.interiorUnit)
  const mode = useStore((s) => s.mode)
  const id = interior ?? selected
  const [data, setData] = useState<Loaded | null>(null)
  useEffect(() => {
    if (!id) return
    let on = true
    preloadRoom(id)
    loadRoom().then((d) => on && setData(d))
    return () => {
      on = false
    }
  }, [id])
  const frame = useMemo<Frame | null>(() => {
    if (!id) return null
    const f = roomFrame(ROOM_BY_ID.get(id)!)
    return { position: f.origin, rotationY: f.theta }
  }, [id])
  useEffect(() => {
    CUT.uCutOn.value = frame && data ? 1 : 0
    if (frame) {
      const m = new THREE.Matrix4().makeRotationY(frame.rotationY).setPosition(frame.position)
      CUT.uCutInv.value.copy(m).invert()
      CUT.uCutMin.value.set(-HOTEL.bw / 2 + 0.14, 0.0, -9.6)
      CUT.uCutMax.value.set(HOTEL.bw / 2 - 0.14, 2.94, 0.12)
    }
    return () => {
      CUT.uCutOn.value = 0
    }
  }, [frame, data])
  if (!frame || !data) return null
  const inside = mode === 'interior' || (mode === 'sheet' && !!interior)
  const toWorld = (p: [number, number, number]) => new THREE.Vector3(...p).applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.rotationY).add(frame.position)
  return (
    <>
      <group position={frame.position} rotation-y={frame.rotationY}>
        <primitive object={data.group} />
        <GlowFrame show={!inside && mode === 'masterplan'} />
      </group>
      {inside && (
        <>
          {mode === 'interior' && <HotspotMarkers toWorld={toWorld} />}
          <InteriorRig frame={frame} />
        </>
      )}
    </>
  )
}
