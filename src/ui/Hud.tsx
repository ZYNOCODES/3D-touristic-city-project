import { useEffect, useRef, useState } from 'react'
import { PROJECT, SHOTS, TIME_PRESETS } from '../data/project'
import { ALL_UNITS, STATUS_META, UNIT_BY_ID } from '../data/units'
import { useStore } from '../store'
import { quality, setTier, type Tier } from '../scene/cove/quality'
import { Icon } from './icons'

export function TopBar() {
  const [layers, setLayers] = useState(false)
  const availability = useStore((s) => s.availability)
  const showPeople = useStore((s) => s.showPeople)
  const set = useStore((s) => s.set)
  const counts = ALL_UNITS.reduce((a, u) => ((a[u.status] = (a[u.status] || 0) + 1), a), {} as Record<string, number>)
  return (
    <header className="topbar">
      <div className="pill brand" onClick={() => useStore.getState().goShot('hotel')}>
        <span className="brand-mark" />
        <span className="brand-name">{PROJECT.name}</span>
      </div>

      <div className="topbar-right">
        <div className={`pill availability ${availability ? 'on' : ''}`}>
          {availability && (
            <div className="legend">
              {(['available', 'reserved', 'sold'] as const).map((k) => (
                <span key={k}>
                  <i style={{ background: STATUS_META[k].color }} />
                  {STATUS_META[k].label} <b>{counts[k] ?? 0}</b>
                </span>
              ))}
            </div>
          )}
          <label className="switch">
            <span>Availability</span>
            <input type="checkbox" checked={availability} onChange={(e) => set({ availability: e.target.checked })} />
            <i />
          </label>
        </div>
        <div className="pill icon-btn" title="View options" onClick={() => setLayers((v) => !v)}>
          <Icon name="layers" />
          {layers && (
            <div className="menu right" onClick={(e) => e.stopPropagation()}>
              <div className="menu-title">View</div>
              <label className="check">
                                <input type="checkbox" checked={showPeople} onChange={(e) => set({ showPeople: e.target.checked })} /> Guests
              </label>
              <div className="menu-title">Quality</div>
              {(['low', 'medium', 'high'] as Tier[]).map((t) => (
                <label className="check" key={t}>
                  <input
                    type="radio"
                    name="q"
                    defaultChecked={quality.tier === t}
                    onChange={() => setTier(t)}
                  />{' '}
                  {t[0].toUpperCase() + t.slice(1)}
                </label>
              ))}
            </div>
          )}
        </div>
        <button
          className="pill icon-btn"
          title="Fullscreen"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
        >
          <Icon name="expand" />
        </button>
      </div>
    </header>
  )
}

export function TimeOfDay({ compact = false }: { compact?: boolean }) {
  const tod = useStore((s) => s.timeOfDay)
  const target = useStore((s) => s.timeTarget)
  const setT = useStore((s) => s.setTimeTarget)
  const icons = { day: 'sun', golden: 'sunset', night: 'moon' } as const
  const active = TIME_PRESETS.reduce((a, p) => (Math.abs(p.t - target) < Math.abs(a.t - target) ? p : a))
  return (
    <div className={`pill tod ${compact ? 'compact' : ''}`}>
      {TIME_PRESETS.map((p) => (
        <button key={p.id} className={active.id === p.id ? 'active' : ''} onClick={() => setT(p.t)} title={p.label}>
          <Icon name={icons[p.id]} size={16} />
          {!compact && <span>{p.label}</span>}
        </button>
      ))}
      <input
        className="scrub"
        type="range"
        min={0}
        max={1}
        step={0.001}
        value={tod}
        aria-label="Time of day"
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          useStore.setState({ timeOfDay: v, timeTarget: v })
        }}
      />
    </div>
  )
}

export function Dock() {
  const shot = useStore((s) => s.shot)
  const go = useStore((s) => s.goShot)
  const i = SHOTS.findIndex((s) => s.id === shot)
  const cur = SHOTS[i]
  return (
    <div className="dock">
      <TimeOfDay />
      <div className="pill carousel">
        <button className="round" onClick={() => go(SHOTS[(i + SHOTS.length - 1) % SHOTS.length].id)} aria-label="Previous">
          <Icon name="chevL" />
        </button>
        <div className="carousel-label" key={cur.id}>
          <Icon name={cur.icon} size={16} />
          {cur.label}
          <span className="count">
            {i + 1}/{SHOTS.length}
          </span>
        </div>
        <button className="round" onClick={() => go(SHOTS[(i + 1) % SHOTS.length].id)} aria-label="Next">
          <Icon name="chevR" />
        </button>
      </div>
      <nav className="pill nav">
        {SHOTS.map((s) => (
          <button key={s.id} className={s.id === shot ? 'active' : ''} onClick={() => go(s.id)}>
            <Icon name={s.icon} size={17} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

export function StatusPill() {
  const status = useStore((s) => s.status)
  const flying = useStore((s) => s.flying)
  return (
    <div className={`status ${flying ? 'busy' : ''}`}>
      <i />
      {flying ? `${status}…` : status}
    </div>
  )
}

export function HoverTip() {
  const hovered = useStore((s) => s.hoveredUnit)
  const selected = useStore((s) => s.selectedUnit)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (ref.current) ref.current.style.transform = `translate(${e.clientX + 16}px, ${e.clientY + 14}px)`
    }
    window.addEventListener('pointermove', move)
    return () => window.removeEventListener('pointermove', move)
  }, [])
  const u = hovered ? UNIT_BY_ID.get(hovered) : null
  return (
    <div ref={ref} className={`hovertip ${u && hovered !== selected ? 'on' : ''}`}>
      {u && (
        <>
          <b>{u.name}</b> – <span style={{ color: STATUS_META[u.status].color }}>{STATUS_META[u.status].label}</span>
          <div>Click to open the room</div>
        </>
      )}
    </div>
  )
}
