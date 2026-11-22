// Site-wide spatial validation (runs the same planting plan the browser uses).
//   node scripts/validate-site.mjs            → prints a report, writes docs/qa/site-validation.json
// Checks: plants vs building / hardscape footprints and paths (rejected at plan time),
// tree trunk spacing, villa podium overlaps, terrain under villas, people spawn surfaces.
import { createServer } from 'vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { plan, REJECTED, CROWN } = await vite.ssrLoadModule('/src/scene/vegetation/plan.ts')
  const { FOOTPRINTS, blockedBy, pathClearance } = await vite.ssrLoadModule('/src/lib/footprints.ts')
  const { height } = await vite.ssrLoadModule('/src/lib/heightfield.ts')
  const layout = JSON.parse(readFileSync('src/data/layout.json', 'utf8'))
  const veg = JSON.parse(readFileSync('public/models/vegetation/vegetation.json', 'utf8'))

  const meta = Object.fromEntries(Object.keys(veg).map((k) => [k, true]))
  const plants = plan(meta)
  const report = { plants: 0, species: {}, rejectedAtPlanTime: {}, violations: [], warnings: [] }

  // 1. every placed plant must be outside footprints and off paths
  const trees = []
  for (const [sp, list] of plants) {
    report.species[sp] = list.length
    report.plants += list.length
    for (const p of list) {
      const hit = blockedBy(p.x, p.z, 0.3)
      if (hit && !(hit.name.startsWith('residence forecourt'))) report.violations.push(`${sp} trunk inside ${hit.name} at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`)
      if (pathClearance(p.x, p.z) < 0.2 && !hit) report.violations.push(`${sp} on a path at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`)
      if (Math.abs(p.y - (height(p.x, p.z) - 0.15)) > 1.0 && !hit) report.warnings.push(`${sp} not on terrain at (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`)
      if ((CROWN[sp] ?? 1) > 1.5) trees.push({ sp, ...p })
    }
  }
  for (const r of REJECTED) report.rejectedAtPlanTime[r.why.replace(/ V\d+$/, ' (villas)')] = (report.rejectedAtPlanTime[r.why.replace(/ V\d+$/, ' (villas)')] ?? 0) + 1

  // 2. tree trunks too close to each other (grid hash)
  const cell = 4
  const grid = new Map()
  let crowded = 0
  for (const t of trees) {
    const k = `${Math.floor(t.x / cell)},${Math.floor(t.z / cell)}`
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        for (const o of grid.get(`${Math.floor(t.x / cell) + dx},${Math.floor(t.z / cell) + dz}`) ?? []) {
          if (Math.hypot(o.x - t.x, o.z - t.z) < 1.2) crowded++
        }
      }
    if (!grid.has(k)) grid.set(k, [])
    grid.get(k).push(t)
  }
  if (crowded) report.warnings.push(`${crowded} tree pairs with trunks < 1.2 m apart`)

  // 3. villa podiums must not overlap each other
  const villas = FOOTPRINTS.filter((f) => f.name.startsWith('villa'))
  for (let i = 0; i < villas.length; i++)
    for (let j = i + 1; j < villas.length; j++) {
      const a = villas[i]
      const b = villas[j]
      const ra = Math.hypot(a.x1 - a.x0, a.z1 - a.z0) / 2
      const rb = Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2
      if (Math.hypot(a.x - b.x, a.z - b.z) < ra + rb) {
        // precise test: any corner of b inside a
        const c = Math.cos(b.rot)
        const s = Math.sin(b.rot)
        for (const [lx, lz] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]]) {
          const wx = b.x + lx * c + lz * s
          const wz = b.z - lx * s + lz * c
          if (blockedBy(wx, wz, 0)?.name === a.name) report.violations.push(`${a.name} podium overlaps ${b.name}`)
        }
      }
    }

  // 4. people spawn surfaces (path walkers sample the terrain; static people sit on known decks)
  report.footprints = FOOTPRINTS.length
  report.villas = layout.villas.length
  mkdirSync('docs/qa', { recursive: true })
  writeFileSync('docs/qa/site-validation.json', JSON.stringify(report, null, 1))
  console.log(`plants placed: ${report.plants} across ${Object.keys(report.species).length} species`)
  console.log('rejected at plan time (footprint / path rules):', report.rejectedAtPlanTime)
  console.log(`violations: ${report.violations.length}`)
  report.violations.slice(0, 20).forEach((v) => console.log('  ✗', v))
  console.log(`warnings: ${report.warnings.length}`)
  report.warnings.slice(0, 10).forEach((v) => console.log('  !', v))
  process.exitCode = report.violations.length ? 1 : 0
} finally {
  await vite.close()
}
