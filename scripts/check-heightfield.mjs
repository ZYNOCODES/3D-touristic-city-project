// Verifies that blender/heightfield.py and src/lib/heightfield.ts produce identical terrain.
// Usage: node scripts/check-heightfield.mjs [path-to-python]
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const { height } = await import('../src/lib/heightfield.ts')
const py =
  process.argv[2] ||
  ['C:/Program Files/Blender Foundation/Blender 5.3/5.3/python/bin/python.exe', 'python3', 'python'].find((p) => !p.includes('/') || existsSync(p))
const r = spawnSync(py, ['-I', 'blender/heightfield.py'], { encoding: 'utf8' })
if (r.status !== 0) {
  console.error(r.stderr || r.error)
  process.exit(1)
}
const rows = JSON.parse(r.stdout.trim().split('\n').pop())
let worst = 0
for (const [x, z, hp] of rows) {
  const ht = height(x, z)
  worst = Math.max(worst, Math.abs(ht - hp))
  console.log(`(${x}, ${z})  ts=${ht.toFixed(4)}  py=${hp.toFixed(4)}`)
}
console.log(worst < 1e-3 ? `OK — max difference ${worst.toExponential(2)} m` : `MISMATCH — max difference ${worst} m`)
process.exit(worst < 1e-3 ? 0 : 1)
