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

export const FLOORPLANS: Record<string, Floorplan> = {
  room: {
    id: 'room',
    levels: [
      {
        name: 'Room',
        width: 5.9,
        depth: 10.6,
        rooms: [
          { id: 'bath', name: 'Bathroom', x: 0, y: 0, w: 4.3, h: 2.8, kind: 'wet' },
          { id: 'entry', name: 'Entry & closet', x: 4.3, y: 0, w: 1.6, h: 2.8, kind: 'circulation' },
          { id: 'bed', name: 'Bed', x: 0, y: 2.8, w: 3.9, h: 3.4, kind: 'bed' },
          { id: 'desk', name: 'Console', x: 3.9, y: 2.8, w: 2, h: 3.4, kind: 'living' },
          { id: 'lounge', name: 'Lounge', x: 0, y: 6.2, w: 5.9, h: 2.2, kind: 'living' },
          { id: 'terrace', name: 'Wave terrace', x: 0, y: 8.4, w: 5.9, h: 2.2, kind: 'outdoor' },
        ],
      },
    ],
  },
}
export const roomArea = (r: Room) => Math.round(r.w * r.h * 10) / 10
