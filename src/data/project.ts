// Project-level promotion data. Everything here is mock data for a fictional hotel —
// swap these objects for a real project's content.

export const PROJECT = {
  id: 'vellmare-cove',
  name: 'Vellmare Cove',
  tagline: 'One hotel. One hidden cove. The sea below your room.',
  developer: 'Vellmare Hotels',
  currency: 'EUR',
}

export type ShotId = 'hotel' | 'rooms' | 'pool' | 'deck' | 'jump' | 'cove' | 'lookout' | 'sky' | 'sea'

export interface Shot {
  id: ShotId
  label: string
  icon: string
  status: string
  eye: [number, number, number]
  target: [number, number, number]
  /** orbit limits around the framed target, so only finished scenery is ever in view */
  az: number // ± degrees
  up: number // degrees the camera may rise
  down: number // degrees the camera may sink
  zoom: [number, number] // min / max distance factor
  fov?: number
  /** wider lens on tall phone screens */
  portraitFov?: number
}

export const SHOTS: Shot[] = [
  { id: 'hotel', label: 'The Hotel', icon: 'building', eye: [-14, 13, 34], target: [0, 34, -92], az: 24, up: 10, down: 3, zoom: [0.62, 1.12], portraitFov: 58, status: 'Vellmare Cove · the hotel' },
  { id: 'rooms', label: 'Rooms', icon: 'bed', eye: [-12, 40, -34], target: [2, 40, -92], az: 30, up: 14, down: 14, zoom: [0.55, 1.15], portraitFov: 56, status: 'Choose a room · tap any balcony' },
  { id: 'pool', label: 'Infinity Pool', icon: 'pool', eye: [17.5, 13.2, -73], target: [-9, 9.2, -52], az: 24, up: 14, down: 5, zoom: [0.55, 1.1], portraitFov: 60, status: 'Infinity pool above the cove' },
  { id: 'deck', label: 'Sea Deck', icon: 'lounge', eye: [0, 6.2, -20], target: [17, 2.2, -47], az: 26, up: 14, down: 4, zoom: [0.5, 1.15], portraitFov: 58, status: 'Sea deck · straight into the water' },
  { id: 'jump', label: 'Jump Rocks', icon: 'dive', eye: [-6, 6.5, 13], target: [-35, 6.5, -8], az: 24, up: 14, down: 5, zoom: [0.5, 1.15], portraitFov: 60, status: 'Jump rocks · 4, 8 and 12 metres' },
  { id: 'cove', label: 'In the Water', icon: 'wave', eye: [9, 1.15, 34], target: [-4, 1.6, -10], az: 30, up: 24, down: 0.3, zoom: [0.5, 1.1], portraitFov: 60, status: 'Swimming in the cove' },
  { id: 'lookout', label: 'Pine Lookout', icon: 'tree', eye: [-60, 31, 66], target: [6, 4, 4], az: 14, up: 8, down: 6, zoom: [0.8, 1.06], portraitFov: 56, status: 'Lookout under the pines' },
  { id: 'sky', label: 'Sky Bar', icon: 'terrace', eye: [6, 82.3, -99], target: [-8, 62, -30], az: 30, up: 12, down: 6, zoom: [0.9, 1.1], portraitFov: 60, status: 'Sky bar · the whole cove and the open sea' },
  { id: 'sea', label: 'From the Sea', icon: 'boat', eye: [8, 3.4, 138], target: [0, 26, -80], az: 10, up: 8, down: 0.6, zoom: [0.8, 1.06], portraitFov: 50, status: 'Arriving by boat' },
]

export const TIME_PRESETS = [
  { id: 'day', label: 'Day', t: 0.3 },
  { id: 'golden', label: 'Golden Hour', t: 0.62 },
  { id: 'night', label: 'Night', t: 0.92 },
] as const

export const LOCATION = {
  center: [43.2012, 5.4998] as [number, number],
  zoom: 12,
  address: 'Calanque Vellmare, Mediterranean coast (fictional)',
  pois: [
    { name: 'Vellmare Cove', kind: 'project', pos: [43.2012, 5.4998], eta: '' },
    { name: 'Private boat landing', kind: 'marina', pos: [43.1985, 5.5008], eta: '3 min by boat' },
    { name: 'Coastal trail head', kind: 'golf', pos: [43.2085, 5.5068], eta: '12 min walk' },
    { name: 'Fishing harbour & dining', kind: 'dining', pos: [43.2142, 5.5371], eta: '20 min by boat' },
    { name: 'International airport', kind: 'airport', pos: [43.4393, 5.2214], eta: '45 min drive' },
  ] as { name: string; kind: string; pos: [number, number]; eta: string }[],
}

export const ADVISOR = {
  name: 'Reservations',
  role: 'Guest relations',
  agency: 'Vellmare Cove',
  phone: '+33 4 00 00 12 34',
  email: 'stay@vellmare.example',
  languages: ['English', 'Français', 'العربية'],
  hours: 'Every day · 24 h',
}

export const AMENITY_LIST = [
  { label: 'Infinity pool', detail: '32 m pool whose edge meets the sea' },
  { label: 'Sea deck', detail: 'Timber deck with ladders straight into the cove' },
  { label: 'Jump rocks', detail: 'Natural ledges at 4, 8 and 12 metres' },
  { label: 'Sky bar', detail: 'Rooftop bar over the whole coast' },
  { label: 'Pine lookout', detail: 'Shaded trail above the cove' },
  { label: 'Boat landing', detail: 'Arrive by sea' },
]
