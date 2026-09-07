import { create } from 'zustand'
import type { AnnotationId } from '../pdf/model'

export type ToolId =
  | 'select'
  | 'hand'
  | 'text'
  | 'editText'
  | 'redact'
  | 'highlight'
  | 'underline'
  | 'strikeout'
  | 'ink'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'shape-line'
  | 'shape-arrow'
  | 'image'
  | 'note'
  | 'stamp'
  | 'signature'

export type ViewMode = 'single' | 'continuous' | 'spread'
export type ZoomMode = 'custom' | 'fit-width' | 'fit-page'

/** Werkzeuge, die nach einmaliger Benutzung zu "select" zurückspringen. */
const ONE_SHOT_TOOLS: ToolId[] = ['image', 'signature', 'stamp']

interface UiState {
  tool: ToolId
  previousTool: ToolId
  setTool: (tool: ToolId) => void
  /** Nach dem Platzieren einer One-Shot-Annotation aufrufen. */
  finishOneShot: () => void

  zoom: number
  zoomMode: ZoomMode
  setZoom: (zoom: number, mode?: ZoomMode) => void
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void

  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  nightMode: boolean
  toggleNight: () => void

  presentation: boolean
  setPresentation: (on: boolean) => void

  sidebarOpen: boolean
  inspectorOpen: boolean
  toggleSidebar: () => void
  toggleInspector: () => void

  /** Aktuell im Viewer sichtbare Seite (1-basiert), für die Statusleiste. */
  currentPage: number
  setCurrentPage: (page: number) => void

  /** Ausgewählte Annotation(en) im aktiven Dokument. */
  selectedAnnotations: AnnotationId[]
  selectAnnotations: (ids: AnnotationId[]) => void
  toggleAnnotation: (id: string, additive: boolean) => void
  clearSelection: () => void

  /** Annotation, die gerade im Textmodus bearbeitet wird. */
  editingAnnotationId: AnnotationId | null
  setEditingAnnotation: (id: AnnotationId | null) => void

  /** Ausgewählte Seiten in der Sidebar (0-basiert). */
  selectedPages: number[]
  selectPages: (indices: number[]) => void

  search: { query: string; open: boolean; activeIndex: number; total: number }
  setSearch: (patch: Partial<UiState['search']>) => void

  /** Standard-Annotationsfarbe (vom letzten Tool übernommen). */
  toolColor: string
  toolStrokeWidth: number
  setToolColor: (hex: string) => void
  setToolStrokeWidth: (w: number) => void
}

const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 6, 8]

export const useUiStore = create<UiState>((set, get) => ({
  tool: 'select',
  previousTool: 'select',
  setTool: (tool) => set((s) => ({ tool, previousTool: s.tool })),
  finishOneShot: () =>
    set((s) => (ONE_SHOT_TOOLS.includes(s.tool) ? { tool: 'select' } : {})),

  zoom: 1,
  zoomMode: 'fit-width',
  setZoom: (zoom, mode) =>
    set({ zoom: Math.min(8, Math.max(0.1, zoom)), zoomMode: mode ?? 'custom' }),
  zoomIn: () => {
    const z = get().zoom
    const next = ZOOM_STEPS.find((s) => s > z + 0.001) ?? 8
    set({ zoom: next, zoomMode: 'custom' })
  },
  zoomOut: () => {
    const z = get().zoom
    const next = [...ZOOM_STEPS].reverse().find((s) => s < z - 0.001) ?? 0.1
    set({ zoom: next, zoomMode: 'custom' })
  },
  resetZoom: () => set({ zoom: 1, zoomMode: 'custom' }),

  viewMode: 'continuous',
  setViewMode: (viewMode) => set({ viewMode }),

  nightMode: false,
  toggleNight: () => set((s) => ({ nightMode: !s.nightMode })),

  presentation: false,
  setPresentation: (presentation) => set({ presentation }),

  sidebarOpen: true,
  inspectorOpen: true,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleInspector: () => set((s) => ({ inspectorOpen: !s.inspectorOpen })),

  currentPage: 1,
  setCurrentPage: (currentPage) => set({ currentPage }),

  selectedAnnotations: [],
  selectAnnotations: (selectedAnnotations) => set({ selectedAnnotations }),
  toggleAnnotation: (id, additive) =>
    set((s) => {
      if (!additive) return { selectedAnnotations: [id] }
      return s.selectedAnnotations.includes(id)
        ? { selectedAnnotations: s.selectedAnnotations.filter((x) => x !== id) }
        : { selectedAnnotations: [...s.selectedAnnotations, id] }
    }),
  clearSelection: () => set({ selectedAnnotations: [], editingAnnotationId: null }),

  editingAnnotationId: null,
  setEditingAnnotation: (editingAnnotationId) => set({ editingAnnotationId }),

  selectedPages: [],
  selectPages: (selectedPages) => set({ selectedPages }),

  search: { query: '', open: false, activeIndex: 0, total: 0 },
  setSearch: (patch) => set((s) => ({ search: { ...s.search, ...patch } })),

  toolColor: '#ffd60a',
  toolStrokeWidth: 2,
  setToolColor: (toolColor) => set({ toolColor }),
  setToolStrokeWidth: (toolStrokeWidth) => set({ toolStrokeWidth })
}))
