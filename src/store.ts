import { create } from 'zustand'
import type { ShotId } from './data/project'

export type Mode = 'intro' | 'masterplan' | 'entering' | 'interior' | 'sheet'
export type HotspotId = string
export interface Spot { id: string; label: string; pos: [number, number, number]; look: [number, number, number] }

interface State {
  mode: Mode
  ready: boolean
  loadProgress: number
  /** 0..1 continuous time of day (0.3 day, 0.62 golden hour, 0.92 night) */
  timeOfDay: number
  timeTarget: number
  availability: boolean
  showLabels: boolean
  showPeople: boolean
  shot: ShotId
  flying: boolean
  status: string
  hoveredUnit: string | null
  selectedUnit: string | null
  cutaway: string | null
  interiorUnit: string | null
  hotspot: HotspotId
  spots: Spot[]
  sheetUnit: string | null
  fade: number

  set: (p: Partial<State>) => void
  goShot: (id: ShotId) => void
  setTimeTarget: (t: number) => void
  selectUnit: (id: string | null) => void
  enterInterior: (id: string) => void
  exitInterior: () => void
  openSheet: (id: string) => void
  closeSheet: () => void
}

export const useStore = create<State>((set, get) => ({
  mode: 'intro',
  ready: false,
  loadProgress: 0,
  timeOfDay: 0.6,
  timeTarget: 0.6,
  availability: false,
  showLabels: true,
  showPeople: true,
  shot: 'masterplan',
  flying: false,
  status: 'Loading experience',
  hoveredUnit: null,
  selectedUnit: null,
  cutaway: null,
  interiorUnit: null,
  hotspot: 'living',
  spots: [],
  sheetUnit: null,
  fade: 0,

  set: (p) => set(p),
  goShot: (id) => set({ shot: id, selectedUnit: null, cutaway: null }),
  setTimeTarget: (t) => set({ timeTarget: t }),
  selectUnit: (id) => set({ selectedUnit: id, cutaway: id && id.startsWith('A') ? id : null }),
  enterInterior: (id) => set({ mode: 'entering', interiorUnit: id, selectedUnit: null, sheetUnit: null, status: 'Loading residence…' }),
  exitInterior: () => set({ mode: 'masterplan', interiorUnit: null, cutaway: null, hotspot: 'living', status: 'Masterplan overview' }),
  openSheet: (id) => set({ sheetUnit: id, mode: get().mode === 'interior' ? 'sheet' : get().mode === 'masterplan' ? 'sheet' : get().mode }),
  closeSheet: () => set({ sheetUnit: null, mode: get().interiorUnit ? 'interior' : 'masterplan' }),
}))
