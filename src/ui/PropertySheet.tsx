// Light "architectural dossier" for a unit: gallery, floorplan, facts, specs,
// advisor & inquiry, and the location map. Slides up over the 3D experience.
import { useEffect, useRef, useState } from 'react'
import { ADVISOR, AMENITY_LIST, PROJECT } from '../data/project'
import { FLOORPLANS } from '../data/floorplans'
import { GALLERY, SPECIFICATIONS } from '../data/specs'
import { HOTEL, STATUS_META, UNIT_BY_ID, UNIT_TYPES, fmtPrice, m2ToSqft } from '../data/units'
import { useStore } from '../store'
import { FloorplanViewer } from './Floorplan'
import { Icon } from './icons'
import { LocationMap } from './LocationMap'

const BASE = import.meta.env.BASE_URL

function Gallery() {
  const GALLERY_LIST = GALLERY
  const [ok, setOk] = useState<Record<string, boolean>>({})
  const [i, setI] = useState(0)
  const items = GALLERY_LIST.filter((g) => ok[g.src] !== false)
  useEffect(() => {
    const id = setInterval(() => setI((v) => v + 1), 5200)
    return () => clearInterval(id)
  }, [])
  const cur = items.length ? items[i % items.length] : null
  return (
    <div className="gallery">
      {GALLERY_LIST.map((g) => (
        <img
          key={g.src}
          src={BASE + g.src}
          alt={g.caption}
          className={cur?.src === g.src ? 'show' : ''}
          onLoad={() => setOk((o) => ({ ...o, [g.src]: true }))}
          onError={() => setOk((o) => ({ ...o, [g.src]: false }))}
        />
      ))}
      {!items.length && <div className="gallery-empty">Run <code>npm run blender</code> to render the photoreal gallery.</div>}
      {cur && <div className="gallery-caption">{cur.caption}</div>}
      <div className="gallery-dots">
        {items.map((g, k) => (
          <button key={g.src} className={k === i % items.length ? 'on' : ''} onClick={() => setI(k)} aria-label={g.caption} />
        ))}
      </div>
    </div>
  )
}

function Accordion({ title, items, open: initial }: { title: string; items: readonly (readonly [string, string])[]; open?: boolean }) {
  const [open, setOpen] = useState(!!initial)
  return (
    <div className={`acc ${open ? 'open' : ''}`}>
      <button className="acc-head" onClick={() => setOpen((v) => !v)}>
        <span>{title}</span>
        <Icon name="chevD" size={16} />
      </button>
      <div className="acc-body">
        <ul>
          {items.map(([k, v]) => (
            <li key={k}>
              <Icon name="check" size={14} />
              <b>{k}</b>
              <span>{v}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function Inquiry({ unit }: { unit: string }) {
  const [sent, setSent] = useState(false)
  return sent ? (
    <div className="inquiry sent">
      <Icon name="check" size={22} />
      <div>
        <b>Request received</b>
        <p>This demo stores nothing — connect the form to your CRM in <code>src/ui/PropertySheet.tsx</code>.</p>
      </div>
    </div>
  ) : (
    <form
      className="inquiry"
      onSubmit={(e) => {
        e.preventDefault()
        setSent(true)
      }}
    >
      <div className="row">
        <input required placeholder="Full name" autoComplete="name" />
        <input required type="email" placeholder="Email" autoComplete="email" />
      </div>
      <div className="row">
        <input placeholder="Phone (optional)" autoComplete="tel" />
        <select defaultValue="presentation">
          <option value="presentation">Private presentation</option>
          <option value="visit">Site visit</option>
          <option value="call">Video call</option>
          <option value="brochure">Send brochure</option>
        </select>
      </div>
      <textarea rows={3} defaultValue={`I'm interested in ${unit}. Please contact me with availability and pricing.`} />
      <button className="btn dark" type="submit">
        <Icon name="calendar" size={15} /> Book a presentation
      </button>
    </form>
  )
}

export function PropertySheet() {
  const id = useStore((s) => s.sheetUnit)
  const close = useStore((s) => s.closeSheet)
  const enter = useStore((s) => s.enterInterior)
  const interiorUnit = useStore((s) => s.interiorUnit)
  const scroller = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const u = id ? UNIT_BY_ID.get(id) : null
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [id])
  if (!u) return <div className="sheet" aria-hidden />
  const t = UNIT_TYPES[u.typeId]
  const plan = FLOORPLANS[t.floorplan]
  const meta = STATUS_META[u.status]
  const facts: { icon: string; label: string; value: string | number; sub?: string }[] = [
    { icon: 'bed', label: 'Beds', value: u.beds },
    { icon: 'people', label: 'Guests', value: u.guests },
    { icon: 'area', label: 'Room', value: `${u.areaM2} m²`, sub: `${m2ToSqft(u.areaM2)} sq ft` },
    { icon: 'terrace', label: 'Terrace', value: `${u.terraceM2} m²`, sub: `${m2ToSqft(u.terraceM2)} sq ft` },
    { icon: 'floor', label: 'Floor', value: `Level ${u.floor}`, sub: `of ${HOTEL.floors}` },
    { icon: 'eye', label: 'View', value: u.view },
  ]
  return (
    <div className={`sheet ${id ? 'open' : ''}`}>
      <div className="sheet-scroll" ref={scroller} onScroll={(e) => setStuck((e.target as HTMLDivElement).scrollTop > 380)}>
        <div className={`sheet-bar ${stuck ? 'stuck' : ''}`}>
          <button className="chip dark" onClick={close}>
            <Icon name="arrowL" size={14} /> {interiorUnit ? 'Back to the room' : 'Hotel'}
          </button>
          <div className="bar-facts">
            <b>{u.name}</b>
            <span>{u.beds}</span>
            <span>{u.guests} guests</span>
            <span>{u.areaM2} m²</span>
            <span className="price">{u.status === 'sold' ? 'Booked' : `${fmtPrice(u.price)} / night`}</span>
          </div>
          <button className="chip" onClick={() => document.getElementById('advisor')?.scrollIntoView({ behavior: 'smooth' })}>
            Request dates
          </button>
        </div>

        <section className="hero">
          <Gallery />
          <div className="hero-copy">
            <span className="badge" style={{ background: meta.color }}>{meta.label}</span>
            <div className="eyebrow">{PROJECT.name} · {t.label}</div>
            <h1>{u.name}</h1>
            <p className="lede">
              {t.blurb} Sliding glass opens the whole room to the terrace; the pool, the sea deck and the jump rocks are an elevator ride below.
            </p>
            <div className="hero-price">{u.status === 'sold' ? 'Booked' : `${fmtPrice(u.price)} / night`}</div>
            <div className="hero-actions">
              {!interiorUnit && (
                <button className="btn dark" onClick={() => enter(u.id)}>
                  <Icon name="eye" size={15} /> Step inside
                </button>
              )}
              <button className="btn outline" onClick={() => window.print()}>
                <Icon name="download" size={15} /> {u.name} PDF
              </button>
            </div>
          </div>
        </section>

        <section>
          <h2>Floorplan</h2>
          <FloorplanViewer plan={plan} />
        </section>

        <section>
          <h2>Facts &amp; Features</h2>
          <div className="facts">
            {facts.map((f) => (
              <div key={f.label} className="fact">
                <Icon name={f.icon} size={20} />
                <span className="label">{f.label}</span>
                <span className="value">{f.value}</span>
                {f.sub && <span className="sub">{f.sub}</span>}
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2>Specifications</h2>
          {SPECIFICATIONS.map((s, i) => (
            <Accordion key={s.title} title={s.title} items={s.items} open={i === 0} />
          ))}
        </section>

        <section>
          <h2>At the hotel</h2>
          <div className="amenities">
            {AMENITY_LIST.map((a) => (
              <div key={a.label}>
                <b>{a.label}</b>
                <span>{a.detail}</span>
              </div>
            ))}
          </div>
        </section>

        <section id="advisor">
          <h2>Reservations</h2>
          <div className="advisor">
            <div className="advisor-card">
              <div className="avatar">{ADVISOR.name.split(' ').map((p) => p[0]).join('')}</div>
              <div>
                <b>{ADVISOR.name}</b>
                <span>{ADVISOR.role}</span>
                <span className="muted">{ADVISOR.agency}</span>
                <div className="contact">
                  <a href={`tel:${ADVISOR.phone.replace(/\s/g, '')}`}><Icon name="phone" size={14} />{ADVISOR.phone}</a>
                  <a href={`mailto:${ADVISOR.email}`}><Icon name="mail" size={14} />{ADVISOR.email}</a>
                </div>
                <span className="muted">{ADVISOR.languages.join(' · ')} · {ADVISOR.hours}</span>
              </div>
            </div>
            <Inquiry unit={u.name} />
          </div>
        </section>

        <section>
          <h2 className="center">
            Location <i className="live-dot" />
          </h2>
          <p className="center muted">Explore the surroundings</p>
          <LocationMap />
        </section>
        <footer className="sheet-foot">
          {PROJECT.name} · {PROJECT.developer}. Illustrative visualisation — images, plans and specifications are indicative only.
        </footer>
      </div>
    </div>
  )
}
