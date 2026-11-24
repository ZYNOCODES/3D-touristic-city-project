// Hotel inventory: every room of the tower (geometry from blender/hotel.py, commercial data mocked).
import * as THREE from 'three'
import raw from './generated/hotel.json'

export const HOTEL = raw as unknown as {
  rooms: { floor: number; bay: number; theta: number; y: number }[]
  R0: number; cx: number; cz: number; bw: number; fh: number; bays: number; floors: number; terraceY: number; deckY: number; top: number
  pool: { x0: number; x1: number; z0: number; z1: number; y: number }
  planters: [number, number, number, number][]
  trees: [number, number, number, number][]
  people: Record<string, number[][]>
}

export type UnitStatus = 'available' | 'reserved' | 'sold'
export type RoomTypeId = 'deluxe' | 'terrace' | 'suite' | 'sky'

export const UNIT_TYPES: Record<RoomTypeId, { label: string; beds: string; guests: number; areaM2: number; terraceM2: number; base: number; palette: number; floorplan: string; blurb: string }> = {
  deluxe: { label: 'Deluxe Sea Room', beds: 'King bed', guests: 2, areaM2: 46, terraceM2: 13, base: 340, palette: 0, floorplan: 'room', blurb: 'Pale oak, linen and limestone, the cove straight ahead.' },
  terrace: { label: 'Wave Terrace Room', beds: 'King bed', guests: 2, areaM2: 46, terraceM2: 19, base: 420, palette: 1, floorplan: 'room', blurb: 'On the crest of the wave façade, with the deepest terraces.' },
  suite: { label: 'Corner Suite', beds: 'King bed + daybed', guests: 3, areaM2: 52, terraceM2: 21, base: 610, palette: 1, floorplan: 'room', blurb: 'End of the arc, light from two sides.' },
  sky: { label: 'Sky Suite', beds: 'King bed + daybed', guests: 3, areaM2: 52, terraceM2: 24, base: 890, palette: 2, floorplan: 'room', blurb: 'Walnut, dark marble and the open sea, above everything.' },
}

export interface Unit {
  id: string
  code: string
  name: string
  kind: 'room'
  typeId: RoomTypeId
  status: UnitStatus
  price: number
  guests: number
  beds: string
  areaM2: number
  terraceM2: number
  floor: number
  bay: number
  view: string
  index: number
}

function rand(i: number, salt: number) {
  let n = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt, 40503)) >>> 0
  n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296
}

export const ROOMS: Unit[] = HOTEL.rooms.map((r, i) => {
  const firstBay = Math.min(...HOTEL.rooms.filter((q) => q.floor === r.floor).map((q) => q.bay))
  const end = r.bay === firstBay || r.bay === HOTEL.bays - 1
  const wave = Math.sin((r.theta / (HOTEL.bw / HOTEL.R0)) * 1.12 + r.floor * 0.36)
  const typeId: RoomTypeId = r.floor >= 16 ? 'sky' : end ? 'suite' : wave > 0.35 ? 'terrace' : 'deluxe'
  const t = UNIT_TYPES[typeId]
  const code = `${r.floor}${String(r.bay + 1).padStart(2, '0')}`
  const k = rand(i, 21)
  return {
    id: `R${code}`, code, name: `Room ${code}`, kind: 'room', typeId,
    status: k < 0.62 ? 'available' : k < 0.82 ? 'reserved' : 'sold',
    price: Math.round((t.base * (1 + r.floor * 0.018)) / 5) * 5,
    guests: t.guests, beds: t.beds, areaM2: t.areaM2, terraceM2: t.terraceM2, floor: r.floor, bay: r.bay,
    view: r.floor >= 12 ? 'Cove and open sea' : r.bay >= 4 ? 'Cove and white cliffs' : 'Cove and jump rocks', index: i,
  }
})
export const ALL_UNITS = ROOMS
export const ROOM_BY_ID = new Map(ROOMS.map((u) => [u.id, u]))
export const UNIT_BY_ID = ROOM_BY_ID

/** world frame of a room: origin on the glass line at floor level */
export function roomFrame(u: Unit) {
  const r = HOTEL.rooms[u.index]
  const s = Math.sin(r.theta)
  const c = Math.cos(r.theta)
  const out = new THREE.Vector3(s, 0, c)
  const right = new THREE.Vector3(c, 0, -s)
  const origin = new THREE.Vector3(HOTEL.cx + HOTEL.R0 * s, r.y, HOTEL.cz + HOTEL.R0 * c)
  return { origin, out, right, theta: r.theta, center: origin.clone().add(new THREE.Vector3(0, 1.45, 0)) }
}
export function roomAnchor(id: string) {
  const f = roomFrame(ROOM_BY_ID.get(id)!)
  return f.center.clone().addScaledVector(f.right, innerWidth < innerHeight ? 0 : 4.2).addScaledVector(f.out, 1.5).add(new THREE.Vector3(0, innerWidth < innerHeight ? -2.4 : 1.2, 0))
}

export const STATUS_META: Record<UnitStatus, { label: string; color: string }> = {
  available: { label: 'Available', color: '#35c2b0' },
  reserved: { label: 'On hold', color: '#f2a65a' },
  sold: { label: 'Booked', color: '#ef6b5b' },
}
export const fmtPrice = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
export const m2ToSqft = (m2: number) => Math.round(m2 * 10.7639)
