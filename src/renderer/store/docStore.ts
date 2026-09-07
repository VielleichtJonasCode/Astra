import { create } from 'zustand'
import {
  applyPatches,
  enablePatches,
  produceWithPatches,
  setAutoFreeze,
  type Patch
} from 'immer'
import { nanoid } from 'nanoid'
import { PDFDocument } from 'pdf-lib'
import type { LoadedFile } from '@shared/types'
import {
  DEFAULT_METADATA,
  type Annotation,
  type AnnotationId,
  type Asset,
  type PageModel,
  type PdfDoc,
  type Redaction,
  type Rotation
} from '../pdf/model'
import { toast } from '../components/common/toast'

enablePatches()
// Große Uint8Arrays nicht einfrieren – pdf.js / pdf-lib brauchen Schreibzugriff auf Kopien.
setAutoFreeze(false)

interface HistoryEntry {
  label: string
  inverse: Patch[]
  coalesceKey?: string
  at: number
}

interface DocHistory {
  undo: HistoryEntry[]
  redo: HistoryEntry[]
}

const HISTORY_LIMIT = 120
const COALESCE_MS = 650

interface DocState {
  docs: Record<string, PdfDoc>
  order: string[]
  activeKey: string | null
  history: Record<string, DocHistory>

  activeDoc: () => PdfDoc | null
  getDoc: (key: string) => PdfDoc | null

  openFiles: (files: LoadedFile[]) => Promise<void>
  setActive: (key: string) => void
  closeDoc: (key: string) => Promise<boolean>
  markSaved: (key: string, path: string, bytes: Uint8Array) => void
  renameActive: (name: string) => void

  /** Zentrale Mutations-Schleuse: Snapshot → immer-Recipe → Undo-Eintrag. */
  mutate: (
    key: string,
    label: string,
    recipe: (doc: PdfDoc) => void,
    opts?: { coalesceKey?: string; structural?: boolean }
  ) => void

  undo: () => void
  redo: () => void
  canUndo: () => boolean
  canRedo: () => boolean

  addAsset: (key: string, asset: Omit<Asset, 'id'>) => string

  // Seiten-Operationen
  rotatePages: (key: string, indices: number[], delta: 90 | -90 | 180) => void
  deletePages: (key: string, indices: number[]) => void
  duplicatePages: (key: string, indices: number[]) => void
  movePages: (key: string, indices: number[], toIndex: number) => void
  insertBlankPage: (key: string, atIndex: number, size?: { width: number; height: number }) => void
  insertPagesFromModels: (key: string, atIndex: number, pages: PageModel[]) => void

  // Annotationen
  addAnnotation: (key: string, annotation: Annotation) => void
  updateAnnotation: (
    key: string,
    id: AnnotationId,
    patch: Partial<Annotation>,
    opts?: { coalesceKey?: string }
  ) => void
  removeAnnotations: (key: string, ids: AnnotationId[]) => void

  // Redaktionen
  addRedaction: (key: string, redaction: Redaction) => void
  removeRedaction: (key: string, id: string) => void
}

function emptyHistory(): DocHistory {
  return { undo: [], redo: [] }
}

function normalizeRotation(angle: number): Rotation {
  const a = ((Math.round(angle / 90) * 90) % 360 + 360) % 360
  return a as Rotation
}

async function buildDoc(file: LoadedFile): Promise<PdfDoc> {
  const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes)
  const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
  const pages: PageModel[] = pdf.getPages().map((p, index) => {
    const { width, height } = p.getSize()
    return {
      id: nanoid(10),
      source: { kind: 'original', index },
      rotation: normalizeRotation(p.getRotation().angle),
      baseWidth: width,
      baseHeight: height
    }
  })

  const md = {
    ...DEFAULT_METADATA,
    title: safe(() => pdf.getTitle()) ?? '',
    author: safe(() => pdf.getAuthor()) ?? '',
    subject: safe(() => pdf.getSubject()) ?? '',
    keywords: safe(() => pdf.getKeywords()) ?? '',
    creator: safe(() => pdf.getCreator()) ?? 'PDF Studio'
  }

  return {
    key: nanoid(12),
    name: file.name || 'Unbenannt.pdf',
    path: file.path || null,
    originalBytes: bytes,
    pages,
    annotations: {},
    redactions: {},
    assets: {},
    metadata: md,
    encryption: null,
    overlays: {},
    postProcess: {},
    dirty: false,
    revision: 0
  }
}

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn()
  } catch {
    return undefined
  }
}

export const useDocStore = create<DocState>((set, get) => ({
  docs: {},
  order: [],
  activeKey: null,
  history: {},

  activeDoc: () => {
    const { activeKey, docs } = get()
    return activeKey ? (docs[activeKey] ?? null) : null
  },
  getDoc: (key) => get().docs[key] ?? null,

  openFiles: async (files) => {
    const built: PdfDoc[] = []
    for (const file of files) {
      try {
        built.push(await buildDoc(file))
      } catch (err) {
        toast.error(`„${file.name}" konnte nicht geöffnet werden.`)
        // eslint-disable-next-line no-console
        console.error(err)
      }
    }
    if (built.length === 0) return
    set((s) => {
      const docs = { ...s.docs }
      const history = { ...s.history }
      const order = [...s.order]
      for (const d of built) {
        docs[d.key] = d
        history[d.key] = emptyHistory()
        order.push(d.key)
      }
      return { docs, history, order, activeKey: built[built.length - 1].key }
    })
  },

  setActive: (key) => set({ activeKey: key }),

  closeDoc: async (key) => {
    const doc = get().docs[key]
    if (!doc) return true
    if (doc.dirty) {
      const choice = await window.api.confirmDiscard(doc.name)
      if (choice === 'cancel') return false
      if (choice === 'save') {
        // Sichern übernimmt der Aufrufer; hier nur Signal.
        return false
      }
    }
    set((s) => {
      const docs = { ...s.docs }
      const history = { ...s.history }
      delete docs[key]
      delete history[key]
      const order = s.order.filter((k) => k !== key)
      const activeKey =
        s.activeKey === key ? (order[order.length - 1] ?? null) : s.activeKey
      return { docs, history, order, activeKey }
    })
    return true
  },

  markSaved: (key, path, bytes) =>
    set((s) => {
      const doc = s.docs[key]
      if (!doc) return {}
      return {
        docs: {
          ...s.docs,
          [key]: { ...doc, path, name: path.split('/').pop() ?? doc.name, originalBytes: bytes, dirty: false }
        }
      }
    }),

  renameActive: (name) => {
    const key = get().activeKey
    if (key) get().mutate(key, 'Umbenennen', (d) => void (d.name = name))
  },

  mutate: (key, label, recipe, opts) => {
    const state = get()
    const doc = state.docs[key]
    if (!doc) return
    const [next, , inverse] = produceWithPatches(doc, (draft) => {
      recipe(draft as PdfDoc)
      draft.dirty = true
      if (opts?.structural !== false) draft.revision += 1
    })
    if (inverse.length === 0) return

    const hist = state.history[key] ?? emptyHistory()
    let undo = hist.undo
    const last = undo[undo.length - 1]
    const now = Date.now()
    if (
      opts?.coalesceKey &&
      last &&
      last.coalesceKey === opts.coalesceKey &&
      now - last.at < COALESCE_MS
    ) {
      undo = [
        ...undo.slice(0, -1),
        { ...last, inverse: [...inverse, ...last.inverse], at: now }
      ]
    } else {
      undo = [...undo, { label, inverse, coalesceKey: opts?.coalesceKey, at: now }]
      if (undo.length > HISTORY_LIMIT) undo = undo.slice(undo.length - HISTORY_LIMIT)
    }

    set({
      docs: { ...state.docs, [key]: next },
      history: { ...state.history, [key]: { undo, redo: [] } }
    })
    window.api.setDocumentEdited(true)
  },

  undo: () => {
    const { activeKey, docs, history } = get()
    if (!activeKey) return
    const hist = history[activeKey]
    const doc = docs[activeKey]
    if (!hist || !doc || hist.undo.length === 0) return
    const entry = hist.undo[hist.undo.length - 1]
    const [reverted, , inverseOfInverse] = produceWithPatches(doc, (draft) => {
      applyPatches(draft, entry.inverse)
    })
    set({
      docs: { ...docs, [activeKey]: reverted as PdfDoc },
      history: {
        ...history,
        [activeKey]: {
          undo: hist.undo.slice(0, -1),
          redo: [...hist.redo, { ...entry, inverse: inverseOfInverse }]
        }
      }
    })
  },

  redo: () => {
    const { activeKey, docs, history } = get()
    if (!activeKey) return
    const hist = history[activeKey]
    const doc = docs[activeKey]
    if (!hist || !doc || hist.redo.length === 0) return
    const entry = hist.redo[hist.redo.length - 1]
    const [reapplied, , inverse] = produceWithPatches(doc, (draft) => {
      applyPatches(draft, entry.inverse)
    })
    set({
      docs: { ...docs, [activeKey]: reapplied as PdfDoc },
      history: {
        ...history,
        [activeKey]: {
          undo: [...hist.undo, { ...entry, inverse }],
          redo: hist.redo.slice(0, -1)
        }
      }
    })
  },

  canUndo: () => {
    const { activeKey, history } = get()
    return !!activeKey && (history[activeKey]?.undo.length ?? 0) > 0
  },
  canRedo: () => {
    const { activeKey, history } = get()
    return !!activeKey && (history[activeKey]?.redo.length ?? 0) > 0
  },

  addAsset: (key, asset) => {
    const id = nanoid(10)
    get().mutate(key, 'Objekt einfügen', (d) => {
      d.assets[id] = { id, ...asset }
    })
    return id
  },

  rotatePages: (key, indices, delta) =>
    get().mutate(key, 'Seite drehen', (d) => {
      for (const i of indices) {
        const p = d.pages[i]
        if (p) p.rotation = (((p.rotation + delta) % 360) + 360) % 360 as Rotation
      }
    }),

  deletePages: (key, indices) =>
    get().mutate(key, 'Seite löschen', (d) => {
      const drop = new Set(indices)
      const removed = d.pages.filter((_, i) => drop.has(i))
      d.pages = d.pages.filter((_, i) => !drop.has(i))
      for (const p of removed) {
        delete d.annotations[p.id]
        delete d.redactions[p.id]
      }
      if (d.pages.length === 0) {
        d.pages.push({
          id: nanoid(10),
          source: { kind: 'blank', width: 595.28, height: 841.89 },
          rotation: 0,
          baseWidth: 595.28,
          baseHeight: 841.89
        })
      }
    }),

  duplicatePages: (key, indices) =>
    get().mutate(key, 'Seite duplizieren', (d) => {
      const sorted = [...indices].sort((a, b) => b - a)
      for (const i of sorted) {
        const p = d.pages[i]
        if (!p) continue
        const copy: PageModel = { ...structuredClone(p), id: nanoid(10) }
        d.pages.splice(i + 1, 0, copy)
        const anns = d.annotations[p.id]
        if (anns) {
          d.annotations[copy.id] = anns.map((a) => ({
            ...structuredClone(a),
            id: nanoid(10),
            pageId: copy.id
          }))
        }
      }
    }),

  movePages: (key, indices, toIndex) =>
    get().mutate(key, 'Seiten umsortieren', (d) => {
      const picked = indices
        .map((i) => d.pages[i])
        .filter((p): p is PageModel => Boolean(p))
      const pickedIds = new Set(picked.map((p) => p.id))
      const rest = d.pages.filter((p) => !pickedIds.has(p.id))
      const before = d.pages.slice(0, toIndex).filter((p) => !pickedIds.has(p.id)).length
      rest.splice(before, 0, ...picked)
      d.pages = rest
    }),

  insertBlankPage: (key, atIndex, size) =>
    get().mutate(key, 'Leere Seite', (d) => {
      const s = size ?? { width: 595.28, height: 841.89 }
      d.pages.splice(atIndex, 0, {
        id: nanoid(10),
        source: { kind: 'blank', width: s.width, height: s.height },
        rotation: 0,
        baseWidth: s.width,
        baseHeight: s.height
      })
    }),

  insertPagesFromModels: (key, atIndex, newPages) =>
    get().mutate(key, 'Seiten einfügen', (d) => {
      d.pages.splice(atIndex, 0, ...newPages)
    }),

  addAnnotation: (key, annotation) =>
    get().mutate(key, 'Objekt hinzufügen', (d) => {
      ;(d.annotations[annotation.pageId] ??= []).push(annotation)
    }),

  updateAnnotation: (key, id, patch, opts) =>
    get().mutate(
      key,
      'Objekt ändern',
      (d) => {
        for (const list of Object.values(d.annotations)) {
          const idx = list.findIndex((a) => a.id === id)
          if (idx >= 0) {
            list[idx] = { ...list[idx], ...patch } as Annotation
            return
          }
        }
      },
      { coalesceKey: opts?.coalesceKey }
    ),

  removeAnnotations: (key, ids) =>
    get().mutate(key, 'Objekt löschen', (d) => {
      const drop = new Set(ids)
      for (const pageId of Object.keys(d.annotations)) {
        d.annotations[pageId] = d.annotations[pageId].filter((a) => !drop.has(a.id))
      }
    }),

  addRedaction: (key, redaction) =>
    get().mutate(key, 'Schwärzung', (d) => {
      ;(d.redactions[redaction.pageId] ??= []).push(redaction)
    }),

  removeRedaction: (key, id) =>
    get().mutate(key, 'Schwärzung entfernen', (d) => {
      for (const pageId of Object.keys(d.redactions)) {
        d.redactions[pageId] = d.redactions[pageId].filter((r) => r.id !== id)
      }
    })
}))
