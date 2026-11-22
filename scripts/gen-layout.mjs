// Generates src/data/layout.json — the single source of truth for the site plan.
// Both the web app (TypeScript) and the Blender pipeline (Python) read it.
// Edit the rules here (or hand-edit the JSON) and re-run: `node scripts/gen-layout.mjs`.
import { writeFileSync } from 'node:fs'

let seed = 1337
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296)
const jitter = (a) => (rnd() * 2 - 1) * a

const terrain = {
  size: 2400, // metres, square, centred on origin
  shoreZ: 170, // shoreline z at x = 0 (ocean towards +z)
  shoreAmp: 22,
  shoreFreq: 0.011,
  headlandStart: 360,
  headlandEnd: 640,
  headlandPush: 260,
  beachWidth: 38,
  slope: 0.17,
  noiseAmp: 7,
  mountainStart: 560,
  mountainEnd: 1150,
  mountainHeight: 230,
  island: { x: 560, z: 820, r: 170, h: 58 },
  seed: 7,
}

const shore = (x) => {
  const ax = Math.abs(x)
  const t = Math.min(1, Math.max(0, (ax - terrain.headlandStart) / (terrain.headlandEnd - terrain.headlandStart)))
  const s = t * t * (3 - 2 * t)
  return terrain.shoreZ + terrain.headlandPush * s + terrain.shoreAmp * Math.sin(x * terrain.shoreFreq)
}
const toZ = (x, d) => shore(x) - d // d = distance inland from the shoreline
const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p

// --- Amenities (positions are x + inland distance d) --------------------------
const amenitiesD = {
  pool: { x: -18, d: 150, w: 36, l: 14, deckW: 64, deckL: 34, rot: 0 },
  lounge: { x: 48, d: 152, w: 22, l: 16, rot: 0 },
  court: { x: 58, d: 212, w: 28, l: 15, rot: 0 },
  playground: { x: -48, d: 214, r: 14 },
  beachClub: { x: -70, d: 16, w: 40, l: 12 },
  garden: { x: 0, d: 245, r: 18 },
}
const amenities = {}
for (const [k, a] of Object.entries(amenitiesD)) {
  amenities[k] = { ...a, x: round(a.x), z: round(toZ(a.x, a.d)) }
  delete amenities[k].d
}

// --- Main road (winding, beach -> residence block) ----------------------------
const roadX = (d) => 150 * Math.sin(d * 0.0115 + 0.4) - 30
const road = []
for (let d = 6; d <= 420; d += 12) road.push([round(roadX(d)), round(toZ(roadX(d), d))])

// --- Villas along contour rows -------------------------------------------------
const villas = []
const rows = [104, 146, 188, 230, 272, 314]
const paths = []
rows.forEach((d, r) => {
  const rowPts = []
  for (let x = -350; x <= 350; x += 10) rowPts.push([round(x), round(toZ(x, d - 15))])
  paths.push({ kind: 'path', width: 3.2, points: rowPts })
  for (let x = -336; x <= 336; x += 40 + (r % 2) * 3) {
    const vx = x + jitter(5) + (r % 2) * 20
    const vd = d + jitter(4)
    if (Math.abs(vx) > 345) continue
    if (Math.abs(vx) < 108 && vd > 118 && vd < 252) continue // amenity core
    if (Math.abs(vx - roadX(vd)) < 20) continue // keep clear of the road
    const dz = toZ(vx + 1, vd) - toZ(vx - 1, vd)
    const rot = round(Math.atan2(dz, 2) * -1 + jitter(0.06), 3)
    const type = r < 2 ? 'ocean' : r < 4 ? 'ridge' : 'canopy'
    villas.push({ x: round(vx), z: round(toZ(vx, vd)), rot, type, row: r })
  }
})
villas.sort((a, b) => a.row - b.row || a.x - b.x)
villas.forEach((v, i) => (v.id = `V${String(i + 1).padStart(2, '0')}`))

// --- Residence block (terraced apartments at the top of the site) --------------
const residence = {
  x: 0,
  z: round(toZ(0, 405)),
  rot: 0,
  length: 132,
  depth: 20,
  floors: 7, // ground = lobby/amenity, 1..6 = residences
  floorHeight: 3.4,
  stepBack: 2.6, // each upper floor steps back for terraces
  bays: 8, // apartments per floor along the facade
  wings: 2,
}

// Spur paths from the road to amenities
paths.push({ kind: 'road', width: 7, points: road })
paths.push({
  kind: 'path', width: 4,
  points: [[amenities.pool.x, amenities.pool.z + 20], [amenities.pool.x, amenities.pool.z - 18], [amenities.playground.x, amenities.playground.z + 16]].map((p) => p.map((v) => round(v))),
})
paths.push({
  kind: 'path', width: 4,
  points: [[amenities.lounge.x, amenities.lounge.z + 12], [amenities.lounge.x + 4, amenities.lounge.z - 14], [amenities.court.x, amenities.court.z + 12]].map((p) => p.map((v) => round(v))),
})
paths.push({
  kind: 'path', width: 3.5,
  points: [[amenities.pool.x, amenities.pool.z + 20], [amenities.beachClub.x + 10, (amenities.pool.z + amenities.beachClub.z) / 2], [amenities.beachClub.x, amenities.beachClub.z - 8]].map((p) => p.map((v) => round(v))),
})

// --- Terrain pads (flattened terraces) -------------------------------------------
const pads = []
for (const v of villas) pads.push({ x: v.x, z: v.z, rx: 15, rz: 12, rot: v.rot, falloff: 7 })
pads.push({ x: amenities.pool.x, z: amenities.pool.z, rx: 36, rz: 20, rot: 0, falloff: 10 })
pads.push({ x: amenities.lounge.x, z: amenities.lounge.z, rx: 14, rz: 11, rot: 0, falloff: 8 })
pads.push({ x: amenities.court.x, z: amenities.court.z, rx: 19, rz: 12, rot: 0, falloff: 9 })
pads.push({ x: amenities.playground.x, z: amenities.playground.z, rx: 17, rz: 17, rot: 0, falloff: 8 })
pads.push({ x: residence.x, z: residence.z, rx: 78, rz: 24, rot: 0, falloff: 16 })

const layout = { version: 1, units: 'metres', terrain, amenities, residence, villas, paths, pads }
writeFileSync(new URL('../src/data/layout.json', import.meta.url), JSON.stringify(layout, null, 1))
console.log(`layout.json: ${villas.length} villas, ${paths.length} paths, ${pads.length} pads`)
