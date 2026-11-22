// Project-level promotion data. Everything here is mock data for a fictional
// development — swap these objects for a real project's content.
import layout from './layout.json'

export const PROJECT = {
  id: 'vellmare-bay',
  name: 'Vellmare Bay',
  tagline: 'Residences in the canopy, above the bay',
  developer: 'Vellmare Living',
  currency: 'USD',
  otherProjects: [
    { id: 'vellmare-bay', name: 'Vellmare Bay', status: 'Selling now' },
    { id: 'vellmare-ridge', name: 'Vellmare Ridge', status: 'Coming 2027' },
    { id: 'vellmare-cove', name: 'Vellmare Cove', status: 'Sold out' },
  ],
}

export type ShotId =
  | 'masterplan'
  | 'villas'
  | 'residence'
  | 'pool'
  | 'court'
  | 'playground'
  | 'lounge'
  | 'beach'
  | 'boat'

export interface Shot {
  id: ShotId
  label: string
  icon: string
  /** ground point the camera looks at (y is sampled from terrain + lift) */
  target: [number, number]
  lift: number
  distance: number
  /** degrees, 0 = looking towards -z (inland, from the ocean side) */
  azimuth: number
  elevation: number
  status: string
  /** fixed eye position (world) instead of azimuth/elevation/distance */
  eye?: [number, number, number]
}

const A = layout.amenities
const R = layout.residence

export const SHOTS: Shot[] = [
  { id: 'masterplan', label: 'Masterplan', icon: 'map', target: [0, -110], lift: 20, distance: 720, azimuth: -8, elevation: 21, status: 'Masterplan overview' },
  { id: 'villas', label: 'Villas', icon: 'villa', target: [-175, -30], lift: 6, distance: 230, azimuth: -18, elevation: 30, status: 'Exploring the villa terraces' },
  { id: 'residence', label: 'Residence Block', icon: 'building', target: [R.x, R.z + 10], lift: 11, distance: 165, azimuth: 14, elevation: 11, status: 'Vellmare Residences · terraced apartments' },
  { id: 'pool', label: 'Swimming Pool', icon: 'pool', target: [A.pool.x, A.pool.z], lift: 1, distance: 46, azimuth: 28, elevation: 22, status: 'Navigating to central pool area' },
  { id: 'court', label: 'Sports Court', icon: 'court', target: [A.court.x, A.court.z], lift: 1, distance: 36, azimuth: -32, elevation: 24, status: 'Sports court · basketball & futsal' },
  { id: 'playground', label: 'Playground', icon: 'play', target: [A.playground.x, A.playground.z], lift: 1, distance: 30, azimuth: 36, elevation: 22, status: "Children's playground" },
  { id: 'lounge', label: 'Social Lounge', icon: 'lounge', target: [A.lounge.x, A.lounge.z], lift: 2, distance: 34, azimuth: -20, elevation: 18, status: 'Social lounge & gardens' },
  { id: 'beach', label: 'Beach Club', icon: 'beach', target: [A.beachClub.x, A.beachClub.z], lift: 1, distance: 70, azimuth: 160, elevation: 16, status: 'Beach club on the bay' },
  { id: 'boat', label: 'From the Bay', icon: 'boat', target: [10, -70], lift: 18, distance: 0, azimuth: 0, elevation: 0, eye: [-40, 2.55, 330], status: 'Aboard · the view from the bay' },
]

export const TIME_PRESETS = [
  { id: 'day', label: 'Day', t: 0.3 },
  { id: 'golden', label: 'Golden Hour', t: 0.62 },
  { id: 'night', label: 'Night', t: 0.92 },
] as const

export const LOCATION = {
  center: [10.4405, -85.7765] as [number, number],
  zoom: 11,
  address: 'Bahía Vellmare, Guanacaste coast, Costa Rica (fictional)',
  pois: [
    { name: 'Vellmare Bay', kind: 'project', pos: [10.4405, -85.7765], eta: '' },
    { name: 'Beach & Beach Club', kind: 'beach', pos: [10.4428, -85.7812], eta: '2 min walk' },
    { name: 'Marina & Yacht Club', kind: 'marina', pos: [10.4325, -85.7905], eta: '6 min drive' },
    { name: 'Village centre & dining', kind: 'dining', pos: [10.4502, -85.7618], eta: '8 min drive' },
    { name: 'International School', kind: 'school', pos: [10.4268, -85.7472], eta: '12 min drive' },
    { name: 'Regional Hospital', kind: 'health', pos: [10.4701, -85.7312], eta: '18 min drive' },
    { name: 'Golf & Country Club', kind: 'golf', pos: [10.4092, -85.7536], eta: '15 min drive' },
    { name: 'International Airport', kind: 'airport', pos: [10.5933, -85.5444], eta: '55 min drive' },
  ] as { name: string; kind: string; pos: [number, number]; eta: string }[],
}

export const ADVISOR = {
  name: 'Isabela Montoya',
  role: 'Senior Sales Advisor',
  agency: 'Vellmare Living · Sales Gallery',
  phone: '+506 4000 1234',
  email: 'sales@vellmare.example',
  languages: ['English', 'Español', 'Português'],
  hours: 'Mon–Sat · 9:00–18:00',
}

export const AMENITY_LIST = [
  { label: 'Infinity pool deck', detail: '36 m lap & leisure pool, loungers, cabanas' },
  { label: 'Sports court', detail: 'Basketball / futsal, night lighting' },
  { label: "Children's playground", detail: 'Slides, swings, soft-fall surface' },
  { label: 'Social lounge', detail: 'Pavilion, fire pit, outdoor kitchen' },
  { label: 'Beach club', detail: 'Private loungers, kayaks, sunset bar' },
  { label: 'Canopy trails', detail: '3.2 km of shaded walking paths' },
]
