// Downloads the extra CC0 / free sources used by the cove hotel (cached in assets/cache).
import { mkdirSync, existsSync, statSync, writeFileSync, copyFileSync, readFileSync } from 'node:fs'
import { dirname, join, basename } from 'node:path'
const UA = { 'User-Agent': 're-promo-asset-pipeline/1.0' }
const C = 'assets/cache'
async function dl(url, dest) {
  if (existsSync(dest) && statSync(dest).size > 0) return true
  mkdirSync(dirname(dest), { recursive: true })
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA })
      if (!r.ok) throw new Error(r.status)
      writeFileSync(dest, Buffer.from(await r.arrayBuffer()))
      return true
    } catch (e) { console.log('retry', url, e.message) }
  }
  return false
}
const files = (id) => fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA }).then((r) => r.json())
// name → [poly haven id, resolution, maps]
const TEX = {
  cliff_a: ['marble_cliff_04', '2k'], cliff_b: ['marble_cliff_05', '2k'], cliff_c: ['marble_cliff_06', '2k'],
  seabed_sand: ['coast_sand_03', '1k'], ground_rocky: ['rocky_terrain_02', '1k'], shore_rock: ['marble_rock_01', '1k'],
  seagrass: ['coral_mud_01', '1k'], deck_grey: ['weathered_planks', '1k'],
}
const MODELS = { namaqualand_cliff_02: '2k', namaqualand_cliff_01: '2k', namaqualand_boulder_03: '1k', namaqualand_boulder_04: '1k', boulder_01: '1k', rock_face_02: '2k', rock_face_01: '2k', shrub_03: '1k', pine_sapling_small: '1k', searsia_burchellii: '1k', grass_medium_01: '1k', coast_rocks_05: '1k', mountainside: '1k', outdoor_table_chair_set_01: '1k', modern_arm_chair_01: '1k' }
const jobs = []
for (const [name, [id, res]] of Object.entries(TEX)) jobs.push(async () => {
  const f = await files(id)
  for (const [k, key] of [['diff', 'Diffuse'], ['nor_gl', 'nor_gl'], ['rough', 'Rough'], ['disp', 'Displacement']]) {
    const n = f[key]?.[res]?.jpg
    if (n) await dl(n.url, join(C, 'cove_tex', name, `${k}.jpg`))
  }
  console.log('tex', name)
})
for (const [id, res] of Object.entries(MODELS)) jobs.push(async () => {
  const f = await files(id)
  const g = f.gltf?.[res]?.gltf
  if (!g) return console.log('no model', id)
  const base = join(C, 'cove_models', id)
  await dl(g.url, join(base, `${id}.gltf`))
  for (const [rel, inc] of Object.entries(g.include || {})) await dl(inc.url, join(base, rel))
  console.log('model', id)
})
jobs.push(async () => {
  const f = await files('kloofendal_43d_clear_puresky')
  await dl(f.hdri['2k'].hdr.url, join(C, 'hdri', 'kloofendal_43d_clear_puresky_2k.hdr'))
  console.log('hdri')
})
const CMU = ['126_01','126_02','126_03','126_06','126_08','126_10','126_12','126_14','125_01','125_02','125_03','125_06','16_03','16_05','13_11','13_39','75_01','75_02','49_02','49_18','128_02','127_01','118_01','118_10','90_02','09_01','16_35']
for (const c of CMU) jobs.push(() => dl(`https://raw.githubusercontent.com/una-dinosauria/cmu-mocap/master/data/${c.split('_')[0].padStart(3, '0')}/${c}.bvh`, join(C, 'cmu', `${c}.bvh`)))
for (const av of ['Professions/Sports_Female_01', 'Professions/Sports_Female_02', 'Professions/Sports_Male_01', 'Professions/Sports_Male_04', 'Adults/Male_Adult_05', 'Adults/Male_Adult_17', 'Professions/Chef_Female_01']) jobs.push(async () => {
  const n = basename(av)
  const R = 'https://raw.githubusercontent.com/microsoft/Microsoft-Rocketbox/master/Assets/Avatars'
  await dl(`${R}/${av}/Export/${n}.fbx`, join(C, 'rocketbox', n, `${n}.fbx`))
  const l = await fetch(`https://api.github.com/repos/microsoft/Microsoft-Rocketbox/contents/Assets/Avatars/${av}/Textures`, { headers: UA }).then((r) => r.json())
  for (const t of l) if (/\.tga$/.test(t.name) && /_color|_normal\.|opacity/.test(t.name) && !/wrinkle/.test(t.name)) await dl(t.download_url, join(C, 'rocketbox', n, 'Textures', t.name))
  console.log('avatar', n)
})
let i = 0
await Promise.all(Array.from({ length: 6 }, async () => { while (i < jobs.length) { const j = jobs[i++]; try { await j() } catch (e) { console.log('ERR', e.message) } } }))
console.log('done')
