import { Experience } from './scene/Experience'
import { useStore } from './store'
import { Dock, HoverTip, StatusPill, TopBar } from './ui/Hud'
import { InteriorHud } from './ui/InteriorHud'
import { PropertySheet } from './ui/PropertySheet'
import { PROJECT } from './data/project'

function Loader() {
  const ready = useStore((s) => s.ready)
  const p = useStore((s) => s.loadProgress)
  return (
    <div className={`loader ${ready ? 'done' : ''}`}>
      <div className="loader-inner">
        <div className="brand-mark big" />
        <h1>{PROJECT.name}</h1>
        <p>{PROJECT.tagline}</p>
        <div className="bar">
          <i style={{ width: `${Math.round(p * 100)}%` }} />
        </div>
        <small>Preparing the cove · {Math.round(p * 100)}%</small>
      </div>
    </div>
  )
}

function Fade() {
  const fade = useStore((s) => s.fade)
  const mode = useStore((s) => s.mode)
  return (
    <div className={`fade ${fade > 0 ? 'on' : ''}`}>
      <div className="fade-label">{mode === 'entering' ? 'Loading…' : ''}</div>
    </div>
  )
}

export default function App() {
  const mode = useStore((s) => s.mode)
  const ready = useStore((s) => s.ready)
  const sheet = useStore((s) => !!s.sheetUnit)
  const exterior = mode === 'masterplan' || mode === 'entering' || (mode === 'sheet' && !useStore.getState().interiorUnit)
  return (
    <div className={`app mode-${mode} ${sheet ? 'has-sheet' : ''}`}>
      <Experience />
      {ready && exterior && (
        <div className={`hud ${mode === 'entering' ? 'hide' : ''}`}>
          <TopBar />
          <Dock />
          <StatusPill />
          <HoverTip />
        </div>
      )}
      {(mode === 'interior' || (mode === 'sheet' && useStore.getState().interiorUnit)) && <InteriorHud />}
      <PropertySheet />
      <Fade />
      <Loader />
    </div>
  )
}
