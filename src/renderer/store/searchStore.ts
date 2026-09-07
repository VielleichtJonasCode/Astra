import { create } from 'zustand'
import type { Rect } from '../lib/geometry'

export interface SearchMatch {
  /** 1-basierter Index in doc.pages. */
  pageIndex: number
  /** Overlay-Koordinaten (oben-links), PDF-Punkte, unskaliert. */
  rect: Rect
}

interface SearchState {
  query: string
  running: boolean
  matches: SearchMatch[]
  active: number
  setQuery: (q: string) => void
  setResult: (matches: SearchMatch[]) => void
  setRunning: (running: boolean) => void
  next: () => void
  prev: () => void
  setActive: (i: number) => void
  reset: () => void
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  running: false,
  matches: [],
  active: 0,
  setQuery: (query) => set({ query }),
  setResult: (matches) => set({ matches, active: 0, running: false }),
  setRunning: (running) => set({ running }),
  next: () => {
    const { matches, active } = get()
    if (matches.length) set({ active: (active + 1) % matches.length })
  },
  prev: () => {
    const { matches, active } = get()
    if (matches.length) set({ active: (active - 1 + matches.length) % matches.length })
  },
  setActive: (active) => set({ active }),
  reset: () => set({ matches: [], active: 0, running: false })
}))
