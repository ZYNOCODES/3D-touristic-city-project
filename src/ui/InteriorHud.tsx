import { UNIT_BY_ID, fmtPrice, STATUS_META } from '../data/units'
import { useStore } from '../store'
import { TimeOfDay } from './Hud'
import { Icon } from './icons'

export function InteriorHud() {
  const unitId = useStore((s) => s.interiorUnit)
  const hotspot = useStore((s) => s.hotspot)
  const HOTSPOTS = useStore((s) => s.spots)
  const exit = useStore((s) => s.exitInterior)
  const openSheet = useStore((s) => s.openSheet)
  const u = unitId ? UNIT_BY_ID.get(unitId) : null
  if (!u) return null
  const i = HOTSPOTS.findIndex((h) => h.id === hotspot)
  const go = (k: number) => useStore.setState({ hotspot: HOTSPOTS[(k + HOTSPOTS.length) % HOTSPOTS.length].id })
  return (
    <div className="interior-hud">
      <header className="topbar light">
        <div className="crumbs pill">
          <button onClick={exit}>
            <Icon name="map" size={15} /> Masterplan
          </button>
          <Icon name="chevR" size={13} />
          <span className="here">{u.name}</span>
          <span className="status-dot" style={{ background: STATUS_META[u.status].color }} />
        </div>
        <div className="topbar-right">
          <div className="pill quick">
            <span>{u.bedrooms} bd</span>
            <span>{u.bathrooms} ba</span>
            <span>{Math.round(u.areaM2 * 10.7639).toLocaleString()} sq ft</span>
            <b>{u.status === 'sold' ? 'Sold' : fmtPrice(u.price)}</b>
          </div>
          <button className="pill cta" onClick={() => openSheet(u.id)}>
            <Icon name="doc" size={15} /> Property details
          </button>
        </div>
      </header>
      <div className="dock">
        <TimeOfDay compact />
        <div className="pill hotspots">
          <button className="round" onClick={() => go(i - 1)} aria-label="Previous room">
            <Icon name="chevL" />
          </button>
          {HOTSPOTS.map((h) => (
            <button key={h.id} className={h.id === hotspot ? 'active' : ''} onClick={() => useStore.setState({ hotspot: h.id })}>
              {h.label}
            </button>
          ))}
          <button className="round" onClick={() => go(i + 1)} aria-label="Next room">
            <Icon name="chevR" />
          </button>
        </div>
      </div>
      <div className="hint">Drag to look around · click the floor rings or use ← → to move</div>
    </div>
  )
}
