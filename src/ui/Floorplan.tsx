import { useRef, useState } from 'react'
import { roomArea, type Floorplan as FP, type Level, type Room } from '../data/floorplans'
import { m2ToSqft } from '../data/units'
import { Icon } from './icons'

const FILL: Record<string, string> = {
  living: '#f3ede3',
  bed: '#eef1ec',
  wet: '#e6eef1',
  service: '#efedea',
  circulation: '#f7f5f1',
  outdoor: '#f1ece2',
  pool: '#cfe9ee',
}

function RoomShapes({ level, hover, setHover, labels }: { level: Level; hover?: string | null; setHover?: (id: string | null) => void; labels: boolean }) {
  return (
    <>
      {level.rooms.map((r) => (
        <g
          key={r.id}
          onPointerEnter={() => setHover?.(r.id)}
          onPointerLeave={() => setHover?.(null)}
          className={`room ${hover === r.id ? 'hl' : ''}`}
        >
          <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={FILL[r.kind ?? 'living']} stroke="#2b2b2b" strokeWidth={r.kind === 'outdoor' || r.kind === 'pool' ? 0.04 : 0.14} strokeDasharray={r.kind === 'outdoor' ? '0.25 0.18' : undefined} />
          {r.kind === 'pool' && <path d={`M${r.x + 0.4} ${r.y + r.h / 2} q 0.6 -0.35 1.2 0 t 1.2 0 t 1.2 0 t 1.2 0`} stroke="#7fb9c6" strokeWidth={0.07} fill="none" />}
          {r.kind === 'bed' && <rect x={r.x + r.w / 2 - 0.9} y={r.y + 0.4} width={1.8} height={2.1} rx={0.1} fill="none" stroke="#9a9488" strokeWidth={0.05} />}
          {labels && r.w > 2.2 && (
            <>
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 - 0.1} className="room-name">
                {r.name}
              </text>
              <text x={r.x + r.w / 2} y={r.y + r.h / 2 + 0.55} className="room-area">
                {roomArea(r)} m²
              </text>
            </>
          )}
        </g>
      ))}
    </>
  )
}

const bounds = (l: Level) => {
  const minY = Math.min(0, ...l.rooms.map((r) => r.y))
  const maxY = Math.max(...l.rooms.map((r) => r.y + r.h))
  return { x: -0.6, y: minY - 0.6, w: l.width + 1.2, h: maxY - minY + 1.2 }
}

export function FloorplanThumb({ level }: { level: Level }) {
  const b = bounds(level)
  return (
    <svg className="fp-thumb" viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} preserveAspectRatio="xMidYMid meet">
      <RoomShapes level={level} labels={false} />
    </svg>
  )
}

export function FloorplanViewer({ plan }: { plan: FP }) {
  const [lvl, setLvl] = useState(0)
  const [hover, setHover] = useState<string | null>(null)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)
  const level = plan.levels[Math.min(lvl, plan.levels.length - 1)]
  const b = bounds(level)
  const room: Room | undefined = level.rooms.find((r) => r.id === hover)
  const total = level.rooms.filter((r) => r.kind !== 'outdoor' && r.kind !== 'pool').reduce((a, r) => a + roomArea(r), 0)
  const zoom = (f: number) => setView((v) => ({ ...v, s: Math.min(4, Math.max(1, v.s * f)) }))
  return (
    <div className="fp-viewer">
      <div className="fp-toolbar">
        <div className="seg">
          {plan.levels.map((l, i) => (
            <button key={l.name} className={i === lvl ? 'active' : ''} onClick={() => setLvl(i)}>
              {l.name}
            </button>
          ))}
        </div>
        <div className="seg">
          <button onClick={() => zoom(1.3)} aria-label="Zoom in"><Icon name="plus" size={14} /></button>
          <button onClick={() => zoom(1 / 1.3)} aria-label="Zoom out"><Icon name="minus" size={14} /></button>
          <button onClick={() => setView({ s: 1, x: 0, y: 0 })}>Reset</button>
        </div>
      </div>
      <div className="fp-body">
        <div
          className="fp-canvas"
          onWheel={(e) => zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12)}
          onPointerDown={(e) => {
            drag.current = { x: e.clientX, y: e.clientY }
            ;(e.target as Element).setPointerCapture?.(e.pointerId)
          }}
          onPointerMove={(e) => {
            if (!drag.current) return
            const dx = e.clientX - drag.current.x
            const dy = e.clientY - drag.current.y
            drag.current = { x: e.clientX, y: e.clientY }
            setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }))
          }}
          onPointerUp={() => (drag.current = null)}
        >
          <svg viewBox={`${b.x} ${b.y} ${b.w} ${b.h}`} style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}>
            <RoomShapes level={level} hover={hover} setHover={setHover} labels />
            <g className="north" transform={`translate(${b.x + b.w - 1.2} ${b.y + 1.1})`}>
              <circle r={0.55} fill="none" stroke="#555" strokeWidth={0.05} />
              <path d="M0 -0.45 L0.18 0.2 L0 0.08 L-0.18 0.2Z" fill="#333" />
            </g>
          </svg>
          {room && (
            <div className="fp-tip">
              <b>{room.name}</b>
              <span>
                {roomArea(room)} m² · {m2ToSqft(roomArea(room))} sq ft
              </span>
              <span>
                {room.w.toFixed(1)} × {room.h.toFixed(1)} m
              </span>
            </div>
          )}
        </div>
        <ul className="fp-rooms">
          {level.rooms.map((r) => (
            <li key={r.id} className={hover === r.id ? 'hl' : ''} onPointerEnter={() => setHover(r.id)} onPointerLeave={() => setHover(null)}>
              <span>{r.name}</span>
              <span>{roomArea(r)} m²</span>
            </li>
          ))}
          <li className="total">
            <span>Interior total</span>
            <span>
              {Math.round(total)} m² · {m2ToSqft(total).toLocaleString()} sq ft
            </span>
          </li>
        </ul>
      </div>
    </div>
  )
}
