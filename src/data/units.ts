// Mock inventory: villas come from layout.json, apartments from the residence block grid.
import layout from './layout.json'
import { CELLS, TOP_FLOOR } from './residenceSpec'

export type UnitStatus = 'available' | 'reserved' | 'sold'
export type UnitKind = 'villa' | 'apartment'

export interface Unit {
  id: string
  code: string
  name: string
  kind: UnitKind
  typeId: keyof typeof UNIT_TYPES
  status: UnitStatus
  price: number
  bedrooms: number
  bathrooms: number
  parking: number
  areaM2: number
  terraceM2: number
  plotM2?: number
  floor?: number
  view: string
  /** villa index in layout.villas, or [floor, bay] for apartments */
  index: number
  floorIdx?: number
  bay?: number
}

export const UNIT_TYPES = {
  ocean: { label: 'Ocean Villa', bedrooms: 5, bathrooms: 5.5, parking: 3, areaM2: 446, terraceM2: 168, plotM2: 1150, base: 2_450_000, floorplan: 'villa-ocean' },
  ridge: { label: 'Ridge Villa', bedrooms: 4, bathrooms: 4.5, parking: 2, areaM2: 378, terraceM2: 132, plotM2: 980, base: 1_680_000, floorplan: 'villa-ridge' },
  canopy: { label: 'Canopy Villa', bedrooms: 3, bathrooms: 3.5, parking: 2, areaM2: 312, terraceM2: 104, plotM2: 840, base: 1_190_000, floorplan: 'villa-canopy' },
  apt1: { label: 'Garden Residence', bedrooms: 1, bathrooms: 1.5, parking: 1, areaM2: 86, terraceM2: 28, plotM2: undefined, base: 420_000, floorplan: 'apt-1' },
  apt2: { label: 'Bay Residence', bedrooms: 2, bathrooms: 2.5, parking: 1, areaM2: 134, terraceM2: 42, plotM2: undefined, base: 640_000, floorplan: 'apt-2' },
  apt3: { label: 'Corner Residence', bedrooms: 3, bathrooms: 3.5, parking: 2, areaM2: 188, terraceM2: 64, plotM2: undefined, base: 910_000, floorplan: 'apt-3' },
  ph: { label: 'Sky Penthouse', bedrooms: 3, bathrooms: 3.5, parking: 2, areaM2: 236, terraceM2: 140, plotM2: undefined, base: 1_520_000, floorplan: 'apt-3' },
} as const

// tiny deterministic PRNG so the inventory is stable between reloads
function rand(i: number, salt: number) {
  let n = (Math.imul(i + 1, 2654435761) ^ Math.imul(salt, 40503)) >>> 0
  n = Math.imul(n ^ (n >>> 15), 2246822519) >>> 0
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296
}
const pickStatus = (r: number): UnitStatus => (r < 0.6 ? 'available' : r < 0.8 ? 'reserved' : 'sold')

const views = ['Ocean & sunset', 'Bay & island', 'Canopy & bay', 'Garden & ocean', 'Panoramic coast']

export const VILLAS: Unit[] = layout.villas.map((v, i) => {
  const t = UNIT_TYPES[v.type as 'ocean' | 'ridge' | 'canopy']
  const r = rand(i, 7)
  const num = parseInt(v.id.slice(1), 10)
  return {
    id: v.id,
    code: v.id,
    name: `Villa ${num}`,
    kind: 'villa',
    typeId: v.type as 'ocean' | 'ridge' | 'canopy',
    status: pickStatus(r),
    price: Math.round((t.base * (0.94 + rand(i, 3) * 0.16) + (5 - v.row) * 18_000) / 5000) * 5000,
    bedrooms: t.bedrooms,
    bathrooms: t.bathrooms,
    parking: t.parking,
    areaM2: t.areaM2,
    terraceM2: t.terraceM2,
    plotM2: Math.round(t.plotM2! * (0.92 + rand(i, 5) * 0.18)),
    view: views[Math.floor(rand(i, 9) * views.length)],
    index: i,
  }
})

const BAYS_TOTAL = Math.max(...CELLS.map((c) => c.bay)) + 1
export const APARTMENTS: Unit[] = []
for (const cell of CELLS) {
  {
    const f = cell.floor
    const b = cell.bay
    const isEnd = b === 0 || b === BAYS_TOTAL - 1
    const typeId: Unit['typeId'] = f === TOP_FLOOR[b] && f >= 4 ? 'ph' : isEnd ? 'apt3' : b % 3 === 1 ? 'apt1' : 'apt2'
    const t = UNIT_TYPES[typeId]
    const i = APARTMENTS.length
    const code = `${f}${String(b + 1).padStart(2, '0')}`
    APARTMENTS.push({
      id: `A${code}`,
      code,
      name: `Apartment ${code}`,
      kind: 'apartment',
      typeId,
      status: pickStatus(rand(i, 21)),
      price: Math.round((t.base * (1 + f * 0.035) * (0.97 + rand(i, 2) * 0.08)) / 5000) * 5000,
      bedrooms: t.bedrooms,
      bathrooms: t.bathrooms,
      parking: t.parking,
      areaM2: t.areaM2,
      terraceM2: t.terraceM2,
      floor: f,
      view: f >= 4 ? 'Panoramic ocean' : 'Bay & gardens',
      index: i,
      floorIdx: f,
      bay: b,
    })
  }
}

export const ALL_UNITS: Unit[] = [...VILLAS, ...APARTMENTS]
export const UNIT_BY_ID = new Map(ALL_UNITS.map((u) => [u.id, u]))

export const STATUS_META: Record<UnitStatus, { label: string; color: string }> = {
  available: { label: 'Available', color: '#35c2b0' },
  reserved: { label: 'Reserved', color: '#f2a65a' },
  sold: { label: 'Sold', color: '#ef6b5b' },
}

export const fmtPrice = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
export const m2ToSqft = (m2: number) => Math.round(m2 * 10.7639)
