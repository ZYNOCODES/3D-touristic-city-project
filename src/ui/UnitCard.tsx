import { STATUS_META, UNIT_BY_ID, UNIT_TYPES, fmtPrice, m2ToSqft } from '../data/units'
import { FLOORPLANS } from '../data/floorplans'
import { useStore } from '../store'
import { FloorplanThumb } from './Floorplan'
import { Icon } from './icons'

export function UnitCard({ id, visible }: { id: string; visible: boolean }) {
  const u = UNIT_BY_ID.get(id)
  const select = useStore((s) => s.selectUnit)
  const enter = useStore((s) => s.enterInterior)
  const openSheet = useStore((s) => s.openSheet)
  if (!u) return null
  const t = UNIT_TYPES[u.typeId]
  const meta = STATUS_META[u.status]
  const plan = FLOORPLANS[t.floorplan]
  return (
    <div className={`unit-card ${visible ? 'in' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
      <button className="x" onClick={() => select(null)} aria-label="Close">
        <Icon name="close" size={14} />
      </button>
      <div className="thumb">
        <FloorplanThumb level={plan.levels[0]} />
        <span className="badge" style={{ background: meta.color }}>
          {meta.label}
        </span>
      </div>
      <div className="body">
        <div className="eyebrow">{t.label}</div>
        <h3>{u.name}</h3>
        <div className="specs">
          <span><Icon name="bed" size={14} />{u.bedrooms}</span>
          <span><Icon name="bath" size={14} />{u.bathrooms}</span>
          <span><Icon name="area" size={14} />{m2ToSqft(u.areaM2).toLocaleString()} sq ft</span>
          {u.floor != null ? <span><Icon name="floor" size={14} />Floor {u.floor}</span> : <span><Icon name="plot" size={14} />{u.plotM2} m²</span>}
        </div>
        <div className="price">{u.status === 'sold' ? 'Sold' : fmtPrice(u.price)}</div>
        <div className="actions">
          <button className="btn primary" onClick={() => enter(u.id)}>
            Explore residence <Icon name="chevR" size={14} />
          </button>
          <button className="btn ghost" onClick={() => openSheet(u.id)}>
            Details
          </button>
        </div>
      </div>
    </div>
  )
}
