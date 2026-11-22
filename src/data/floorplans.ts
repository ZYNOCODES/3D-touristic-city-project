// Floorplans as simple room rectangles (metres). The PropertySheet renders them as
// an interactive SVG; real projects can replace these with traced CAD data.
export interface Room {
  id: string
  name: string
  x: number
  y: number
  w: number
  h: number
  kind?: 'living' | 'bed' | 'wet' | 'service' | 'outdoor' | 'circulation' | 'pool'
}
export interface Level {
  name: string
  width: number
  depth: number
  rooms: Room[]
}
export interface Floorplan {
  id: string
  levels: Level[]
}

const villaGround = (scale = 1): Level => ({
  name: 'Ground floor',
  width: 22 * scale,
  depth: 20,
  rooms: [
    { id: 'living', name: 'Living room', x: 0, y: 0, w: 9 * scale, h: 7, kind: 'living' },
    { id: 'dining', name: 'Dining & kitchen', x: 9 * scale, y: 0, w: 7 * scale, h: 7, kind: 'living' },
    { id: 'stair', name: 'Stair & lounge', x: 16 * scale, y: 0, w: 6 * scale, h: 7, kind: 'circulation' },
    { id: 'guest', name: 'Guest suite', x: 16 * scale, y: 7, w: 6 * scale, h: 4.5, kind: 'bed' },
    { id: 'pantry', name: 'Pantry & laundry', x: 9 * scale, y: 7, w: 4 * scale, h: 4.5, kind: 'service' },
    { id: 'wc', name: 'Powder room', x: 13 * scale, y: 7, w: 3 * scale, h: 4.5, kind: 'wet' },
    { id: 'entry', name: 'Entry gallery', x: 0, y: 7, w: 9 * scale, h: 4.5, kind: 'circulation' },
    { id: 'terrace', name: 'Pool terrace', x: 0, y: 11.5, w: 12 * scale, h: 8.5, kind: 'outdoor' },
    { id: 'pool', name: 'Infinity pool', x: 12 * scale, y: 13, w: 10 * scale, h: 5, kind: 'pool' },
  ],
})

const villaUpper = (scale = 1, beds = 3): Level => {
  const rooms: Room[] = [
    { id: 'master', name: 'Master suite', x: 0, y: 0, w: 9 * scale, h: 7, kind: 'bed' },
    { id: 'mbath', name: 'Master bath', x: 0, y: 7, w: 5 * scale, h: 4.5, kind: 'wet' },
    { id: 'wir', name: 'Walk-in robe', x: 5 * scale, y: 7, w: 4 * scale, h: 4.5, kind: 'service' },
    { id: 'hall', name: 'Gallery landing', x: 9 * scale, y: 0, w: 4 * scale, h: 11.5, kind: 'circulation' },
  ]
  const bw = (9 * scale) / Math.max(1, beds - 1)
  for (let i = 0; i < beds - 1; i++) {
    rooms.push({ id: `bed${i + 2}`, name: `Bedroom ${i + 2}`, x: 13 * scale + i * bw, y: 0, w: bw, h: 7, kind: 'bed' })
    rooms.push({ id: `bath${i + 2}`, name: `Ensuite ${i + 2}`, x: 13 * scale + i * bw, y: 7, w: bw, h: 4.5, kind: 'wet' })
  }
  rooms.push({ id: 'balcony', name: 'Ocean balcony', x: 0, y: 11.5, w: 22 * scale, h: 3, kind: 'outdoor' })
  return { name: 'Upper floor', width: 22 * scale, depth: 14.5, rooms }
}

const apt = (beds: number): Level => {
  const w = beds === 1 ? 10 : beds === 2 ? 13 : 16
  const rooms: Room[] = [
    { id: 'living', name: 'Living & dining', x: 0, y: 0, w: w * 0.55, h: 6.5, kind: 'living' },
    { id: 'kitchen', name: 'Kitchen', x: w * 0.55, y: 0, w: w * 0.45, h: 3.2, kind: 'living' },
    { id: 'master', name: 'Master bedroom', x: w * 0.55, y: 3.2, w: w * 0.45, h: 3.8, kind: 'bed' },
    { id: 'bath', name: 'Bathroom', x: 0, y: 6.5, w: 3.2, h: 2.8, kind: 'wet' },
    { id: 'entry', name: 'Entry', x: 3.2, y: 6.5, w: w * 0.55 - 3.2, h: 2.8, kind: 'circulation' },
  ]
  if (beds >= 2) rooms.push({ id: 'bed2', name: 'Bedroom 2', x: w * 0.55, y: 7, w: w * 0.45, h: 2.3 + (beds >= 3 ? 0 : 0.3), kind: 'bed' })
  if (beds >= 3) rooms.push({ id: 'bed3', name: 'Bedroom 3', x: 0, y: 9.3, w: w * 0.5, h: 3, kind: 'bed' }, { id: 'bath2', name: 'Ensuite', x: w * 0.5, y: 9.3, w: w * 0.5, h: 3, kind: 'wet' })
  const depth = beds >= 3 ? 12.3 : 9.6
  rooms.push({ id: 'terrace', name: 'Terrace', x: 0, y: -3, w, h: 3, kind: 'outdoor' })
  return { name: 'Residence', width: w, depth, rooms }
}

export const FLOORPLANS: Record<string, Floorplan> = {
  'villa-ocean': { id: 'villa-ocean', levels: [villaGround(1.15), villaUpper(1.15, 5)] },
  'villa-ridge': { id: 'villa-ridge', levels: [villaGround(1.05), villaUpper(1.05, 4)] },
  'villa-canopy': { id: 'villa-canopy', levels: [villaGround(0.95), villaUpper(0.95, 3)] },
  'apt-1': { id: 'apt-1', levels: [apt(1)] },
  'apt-2': { id: 'apt-2', levels: [apt(2)] },
  'apt-3': { id: 'apt-3', levels: [apt(3)] },
}

export const roomArea = (r: Room) => Math.round(r.w * r.h * 10) / 10
