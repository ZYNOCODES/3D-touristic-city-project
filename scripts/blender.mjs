// Finds a Blender executable and runs the asset pipeline.
//   npm run blender                 → fetch + all models + gallery renders
//   npm run assets                  → fetch only
//   node scripts/blender.mjs villa interior   → specific steps
// Set BLENDER_PATH if Blender is not on PATH or in a standard install location.
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function findBlender() {
  if (process.env.BLENDER_PATH && existsSync(process.env.BLENDER_PATH)) return process.env.BLENDER_PATH
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['blender'], { encoding: 'utf8' })
  if (which.status === 0 && which.stdout.trim()) return which.stdout.trim().split(/\r?\n/)[0]
  const candidates = []
  if (process.platform === 'win32') {
    for (const base of ['C:/Program Files/Blender Foundation', `${process.env.LOCALAPPDATA}/Programs/Blender Foundation`]) {
      if (!existsSync(base)) continue
      for (const d of readdirSync(base).sort().reverse()) candidates.push(join(base, d, 'blender.exe'))
    }
    candidates.push('C:/Program Files (x86)/Steam/steamapps/common/Blender/blender.exe')
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Blender.app/Contents/MacOS/Blender')
  } else {
    candidates.push('/usr/bin/blender', '/snap/bin/blender', '/opt/blender/blender')
  }
  return candidates.find((c) => existsSync(c))
}

const blender = findBlender()
if (!blender) {
  console.error('Blender not found. Install Blender 4.2+ or set BLENDER_PATH. The web app still runs with procedural fallbacks.')
  process.exit(1)
}
let steps = process.argv.slice(2)
if (steps[0] === 'all') steps = []
if (steps[0] === 'fetch' && steps.length === 1) steps = ['fetch']
console.log(`[pipeline] using ${blender}`)
const r = spawnSync(blender, ['-b', '--factory-startup', '--python', 'blender/run_all.py', '--', ...steps], { stdio: 'inherit' })
process.exit(r.status ?? 1)
