import { create } from 'zustand'
import {
  NEUTRAL_ADJUST,
  type Adjust,
  type Anno,
  type BoxAnno,
  type DrawAnno,
  type ImgTool,
  type LineAnno,
  type StepAnno,
  type TextAnno
} from '../image/model'
import { composite } from '../image/compose'
import {
  canvasFromBytes,
  cropCanvas,
  flipCanvas,
  resizeCanvas,
  rotateCanvas,
  type RotateDir
} from '../image/transform'
import { readImageMeta, type MetaField } from '../image/exif'

type AnnoPatch = Partial<BoxAnno> &
  Partial<LineAnno> &
  Partial<TextAnno> &
  Partial<DrawAnno> &
  Partial<StepAnno>

interface Snapshot {
  base: HTMLCanvasElement
  annos: Anno[]
  adjust: Adjust
}

const SIPS_DECODE = new Set(['heic', 'heif', 'tif', 'tiff'])
const HISTORY_CAP = 60

function extOf(name: string): string {
  return /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? ''
}
function mimeFromExt(ext: string): string {
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'bmp') return 'image/bmp'
  if (ext === 'avif') return 'image/avif'
  return 'image/png'
}
function cloneAnnos(list: Anno[]): Anno[] {
  return list.map((a) => (a.type === 'draw' ? { ...a, points: [...a.points] } : { ...a }))
}

interface ImageState {
  name: string | null
  mime: string
  base: HTMLCanvasElement | null
  annos: Anno[]
  adjust: Adjust
  meta: MetaField[]
  origSize: number
  loading: boolean
  error: string | null

  tool: ImgTool
  color: string
  strokeWidth: number
  fontSize: number
  strength: number
  selectedId: string | null
  editingId: string | null
  stepCounter: number

  past: Snapshot[]
  future: Snapshot[]
  coalesceKey: string | null
  coalesceAt: number
  rev: number

  load: (name: string, bytes: Uint8Array) => Promise<void>
  close: () => void

  setTool: (t: ImgTool) => void
  setColor: (c: string) => void
  setStrokeWidth: (n: number) => void
  setFontSize: (n: number) => void
  setStrength: (n: number) => void
  select: (id: string | null) => void
  setEditing: (id: string | null) => void

  pushHistory: (coalesceKey?: string) => void
  addAnno: (a: Anno) => void
  updateAnno: (id: string, patch: AnnoPatch) => void
  removeAnno: (id: string) => void
  bringToFront: (id: string) => void
  nextStep: () => number

  setAdjust: (patch: Partial<Adjust>) => void
  resetAdjust: () => void

  rotate: (dir: RotateDir) => void
  flip: (axis: 'h' | 'v') => void
  crop: (x: number, y: number, w: number, h: number) => void
  resize: (w: number, h: number) => void

  undo: () => void
  redo: () => void
  revertAll: () => void

  exportCanvas: () => HTMLCanvasElement | null
}

export const useImageStore = create<ImageState>((set, get) => {
  const snapshot = (): Snapshot => {
    const s = get()
    return {
      base: s.base as HTMLCanvasElement,
      annos: cloneAnnos(s.annos),
      adjust: { ...s.adjust }
    }
  }

  const pushHistory = (coalesceKey?: string): void => {
    const s = get()
    if (!s.base) return
    const now = Date.now()
    if (coalesceKey && coalesceKey === s.coalesceKey && now - s.coalesceAt < 700) {
      set({ coalesceAt: now })
      return
    }
    set({
      past: [...s.past, snapshot()].slice(-HISTORY_CAP),
      future: [],
      coalesceKey: coalesceKey ?? null,
      coalesceAt: now
    })
  }

  const flatten = (): HTMLCanvasElement => {
    const s = get()
    return composite(s.base as HTMLCanvasElement, s.annos, s.adjust)
  }

  /** Grundbild ersetzen und alle darübergelegten Ebenen einbacken/leeren. */
  const replaceBase = (mk: (flat: HTMLCanvasElement) => HTMLCanvasElement): void => {
    if (!get().base) return
    pushHistory()
    const next = mk(flatten())
    set({
      base: next,
      annos: [],
      adjust: { ...NEUTRAL_ADJUST },
      selectedId: null,
      editingId: null,
      rev: get().rev + 1
    })
  }

  return {
    name: null,
    mime: 'image/png',
    base: null,
    annos: [],
    adjust: { ...NEUTRAL_ADJUST },
    meta: [],
    origSize: 0,
    loading: false,
    error: null,

    tool: 'select',
    color: '#ff3b30',
    strokeWidth: 4,
    fontSize: 40,
    strength: 16,
    selectedId: null,
    editingId: null,
    stepCounter: 0,

    past: [],
    future: [],
    coalesceKey: null,
    coalesceAt: 0,
    rev: 0,

    load: async (name, bytes) => {
      set({ loading: true, error: null })
      try {
        let ext = extOf(name)
        let data = bytes
        if (SIPS_DECODE.has(ext)) {
          data = await window.api.sipsConvert({ bytes }, 'png')
          ext = 'png'
        }
        const mime = mimeFromExt(ext)
        const base = await canvasFromBytes(data, mime)
        set({
          name,
          mime,
          base,
          annos: [],
          adjust: { ...NEUTRAL_ADJUST },
          meta: readImageMeta(data, mime),
          origSize: bytes.length,
          loading: false,
          error: null,
          tool: 'select',
          selectedId: null,
          editingId: null,
          stepCounter: 0,
          past: [],
          future: [],
          rev: get().rev + 1
        })
      } catch (e) {
        set({
          loading: false,
          error: e instanceof Error ? e.message : 'Bild konnte nicht geladen werden'
        })
      }
    },

    close: () =>
      set({
        name: null,
        base: null,
        annos: [],
        adjust: { ...NEUTRAL_ADJUST },
        meta: [],
        past: [],
        future: [],
        selectedId: null,
        editingId: null,
        error: null
      }),

    setTool: (tool) => set({ tool, selectedId: null, editingId: null }),
    setColor: (color) => {
      const { selectedId, annos } = get()
      set({ color })
      if (selectedId) {
        const a = annos.find((x) => x.id === selectedId)
        if (a && a.type !== 'pixelate' && a.type !== 'blur') {
          pushHistory('color:' + selectedId)
          get().updateAnno(selectedId, { color })
        }
      }
    },
    setStrokeWidth: (strokeWidth) => {
      const { selectedId } = get()
      set({ strokeWidth })
      if (selectedId) {
        pushHistory('sw:' + selectedId)
        get().updateAnno(selectedId, { strokeWidth })
      }
    },
    setFontSize: (fontSize) => {
      const { selectedId, annos } = get()
      set({ fontSize })
      if (selectedId && annos.find((x) => x.id === selectedId)?.type === 'text') {
        pushHistory('fs:' + selectedId)
        get().updateAnno(selectedId, { fontSize })
      }
    },
    setStrength: (strength) => {
      const { selectedId, annos } = get()
      set({ strength })
      const t = selectedId ? annos.find((x) => x.id === selectedId)?.type : null
      if (selectedId && (t === 'pixelate' || t === 'blur')) {
        pushHistory('str:' + selectedId)
        get().updateAnno(selectedId, { strength })
      }
    },
    select: (selectedId) => set({ selectedId, editingId: null }),
    setEditing: (editingId) => set({ editingId }),

    pushHistory,

    addAnno: (a) => {
      pushHistory()
      set({ annos: [...get().annos, a], selectedId: a.id, rev: get().rev + 1 })
    },
    updateAnno: (id, patch) =>
      set({
        annos: get().annos.map((a) => (a.id === id ? ({ ...a, ...patch } as Anno) : a)),
        rev: get().rev + 1
      }),
    removeAnno: (id) => {
      pushHistory()
      set({
        annos: get().annos.filter((a) => a.id !== id),
        selectedId: null,
        editingId: null,
        rev: get().rev + 1
      })
    },
    bringToFront: (id) => {
      const { annos } = get()
      const a = annos.find((x) => x.id === id)
      if (!a) return
      pushHistory('front:' + id)
      set({ annos: [...annos.filter((x) => x.id !== id), a], rev: get().rev + 1 })
    },
    nextStep: () => {
      const n = get().stepCounter + 1
      set({ stepCounter: n })
      return n
    },

    setAdjust: (patch) => set({ adjust: { ...get().adjust, ...patch }, rev: get().rev + 1 }),
    resetAdjust: () => {
      pushHistory()
      set({ adjust: { ...NEUTRAL_ADJUST }, rev: get().rev + 1 })
    },

    rotate: (dir) => replaceBase((flat) => rotateCanvas(flat, dir)),
    flip: (axis) => replaceBase((flat) => flipCanvas(flat, axis)),
    crop: (x, y, w, h) => replaceBase((flat) => cropCanvas(flat, x, y, w, h)),
    resize: (w, h) => replaceBase((flat) => resizeCanvas(flat, w, h)),

    undo: () => {
      const s = get()
      if (!s.past.length || !s.base) return
      const prev = s.past[s.past.length - 1]
      set({
        base: prev.base,
        annos: cloneAnnos(prev.annos),
        adjust: { ...prev.adjust },
        past: s.past.slice(0, -1),
        future: [snapshot(), ...s.future].slice(0, HISTORY_CAP),
        selectedId: null,
        editingId: null,
        coalesceKey: null,
        rev: s.rev + 1
      })
    },
    redo: () => {
      const s = get()
      if (!s.future.length || !s.base) return
      const nxt = s.future[0]
      set({
        base: nxt.base,
        annos: cloneAnnos(nxt.annos),
        adjust: { ...nxt.adjust },
        future: s.future.slice(1),
        past: [...s.past, snapshot()].slice(-HISTORY_CAP),
        selectedId: null,
        editingId: null,
        coalesceKey: null,
        rev: s.rev + 1
      })
    },
    revertAll: () => {
      const s = get()
      if (!s.past.length) return
      const first = s.past[0]
      set({
        base: first.base,
        annos: cloneAnnos(first.annos),
        adjust: { ...first.adjust },
        past: [],
        future: [],
        selectedId: null,
        editingId: null,
        rev: s.rev + 1
      })
    },

    exportCanvas: () => {
      const s = get()
      return s.base ? composite(s.base, s.annos, s.adjust) : null
    }
  }
})
