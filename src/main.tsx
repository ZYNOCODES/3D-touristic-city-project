import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// dev-only handle for debugging from the console
if (import.meta.env.DEV) {
  import('./store').then((m) => ((window as unknown as Record<string, unknown>).__store = m.useStore))
}
if (import.meta.env.DEV) {
  import('./lib/assets').then((m) => ((window as unknown as Record<string, unknown>).__assets = m))
}
// dev-only QA helpers: __qa.view([eye],[target]) then __qa.capture('name')
if (import.meta.env.DEV) {
  const w = window as unknown as Record<string, any>
  w.__qa = {
    view(eye: number[], target: number[]) {
      const c = w.__camera
      const ctl = w.__controls?.current
      c.position.set(eye[0], eye[1], eye[2])
      ctl?.target.set(target[0], target[1], target[2])
      c.lookAt(target[0], target[1], target[2])
      ctl?.update()
    },
    async capture(name: string) {
      await new Promise((r) => setTimeout(r, 1500))
      const url = (document.querySelector('canvas') as HTMLCanvasElement).toDataURL('image/png')
      const r = await fetch(`/__qa/save?name=${encodeURIComponent(name)}`, { method: 'POST', body: url })
      return r.text()
    },
  }
}
