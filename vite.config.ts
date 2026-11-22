import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Dev-only: POST /__qa/save?name=foo with a PNG data URL → docs/qa/after/web/foo.png */
function qaCapture(): Plugin {
  return {
    name: 'qa-capture',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__qa/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name')?.replace(/[^\w-]/g, '') || 'shot'
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          const file = join(process.cwd(), 'docs', 'qa', 'after', 'web', `${name}.png`)
          mkdirSync(dirname(file), { recursive: true })
          writeFileSync(file, Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'))
          res.end(file)
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), qaCapture()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
})
