import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { LOCATION, PROJECT } from '../data/project'

const KIND_GLYPH: Record<string, string> = {
  project: '★', beach: '≈', marina: '⚓', dining: '◆', school: '✎', health: '+', golf: '⛳', airport: '✈',
}

export function LocationMap() {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const markers = useRef<L.Marker[]>([])
  const [active, setActive] = useState(0)
  const [tilesFailed, setTilesFailed] = useState(false)

  useEffect(() => {
    if (!el.current || map.current) return
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true }).setView(LOCATION.center, LOCATION.zoom)
    let errors = 0
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    })
      .on('tileerror', () => {
        errors++
        if (errors > 6) setTilesFailed(true)
      })
      .addTo(m)
    markers.current = LOCATION.pois.map((p, i) =>
      L.marker(p.pos, {
        icon: L.divIcon({
          className: '',
          html: `<div class="poi ${p.kind}">${KIND_GLYPH[p.kind] ?? '•'}</div>`,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      })
        .addTo(m)
        .bindTooltip(`<b>${p.name}</b>${p.eta ? `<br/>${p.eta}` : ''}`, { direction: 'top', offset: [0, -14] })
        .on('click', () => setActive(i)),
    )
    map.current = m
    return () => {
      m.remove()
      map.current = null
    }
  }, [])

  useEffect(() => {
    const p = LOCATION.pois[active]
    map.current?.flyTo(p.pos, active === 0 ? LOCATION.zoom : 13, { duration: 1.2 })
    markers.current[active]?.openTooltip()
  }, [active])

  return (
    <div className="location">
      <div className="map" ref={el}>
        {tilesFailed && <div className="map-offline">Map tiles unavailable offline — points of interest are listed alongside.</div>}
      </div>
      <ul className="poi-list">
        {LOCATION.pois.map((p, i) => (
          <li key={p.name} className={i === active ? 'active' : ''} onClick={() => setActive(i)}>
            <span className={`poi small ${p.kind}`}>{KIND_GLYPH[p.kind]}</span>
            <span className="name">{i === 0 ? PROJECT.name : p.name}</span>
            <span className="eta">{p.eta || LOCATION.address}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
