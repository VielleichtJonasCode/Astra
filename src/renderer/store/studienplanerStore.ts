import { create } from 'zustand'
import type { OcrResult, SpFile, SpTree } from '@shared/types'
import { toast } from '../components/common/toast'
import { useSettingsStore } from './settingsStore'
import {
  INBOX_DIR,
  INDEX_FILE,
  emptyIndex,
  parseIndex,
  relPathOf,
  safeName,
  type IndexData,
  type IndexEntry
} from '../studienplaner/model'
import { recognizeNotes } from '../studienplaner/ocr'
import { joinPath } from '../studienplaner/paths'
import {
  LEGACY_PLAN_FILE,
  OCRABLE_EXT,
  PLAN_FILE,
  coursePrepPath,
  courseNotesText,
  emptyLernplan,
  extOf,
  lernplanMeta,
  mergeProgress,
  parseLernplan,
  type Lernplan,
  type LernplanMeta
} from '../studienplaner/prep'
import { AI_NOTES_FILE } from '../studienplaner/aiSystemPrompt'

const AI_NOTES_TEMPLATE = `<!-- Vorlage – hier eigene Regeln für den KI-Lern-Assistenten eintragen.
     Alles unter dieser Zeile wird bei jeder KI-Anfrage zusätzlich mitgeschickt.
     Beispiele: bevorzugte Erklärtiefe, Notation, "immer mit Beispiel", Sprache,
     Themen die betont/ausgelassen werden sollen. Änderungen wirken sofort. -->

`

export { joinPath }

const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'])

export interface FilingTarget {
  semester: string
  kurs: string
  thema: string
  /** Bild-Scans in ein durchsuchbares PDF umwandeln (Standard: an). */
  makeSearchable: boolean
}

interface SpState {
  path: string | null
  tree: SpTree | null
  index: IndexData
  loading: boolean
  /** Status-Text während OCR / Einsortieren; null = frei. */
  busy: string | null
  error: string | null

  open: () => Promise<void>
  close: () => void
  choosePath: () => Promise<void>
  refresh: () => Promise<void>
  createSemester: (name: string) => Promise<void>
  createCourse: (semester: string, name: string) => Promise<void>
  /** Legt für mehrere Fächer je einen Kurs-Ordner mit „Wichtig" + „Übungen" an. */
  scaffoldCourses: (semester: string, kurse: string[]) => Promise<number>
  ocrFile: (file: SpFile) => Promise<OcrResult | null>
  fileItem: (file: SpFile, target: FilingTarget, ocr: OcrResult | null) => Promise<void>
  deleteFile: (file: SpFile) => Promise<void>
  openInEditor: (file: SpFile) => Promise<void>

  /** Lädt den Lernplan eines Fachs (oder einen frischen, wenn noch keiner existiert). */
  loadLernplan: (semester: string, kurs: string) => Promise<Lernplan>
  /** Speichert den Lernplan des Fachs (mit Fortschritts-Merge, falls das Handy neuer ist). */
  saveLernplan: (semester: string, kurs: string, plan: Lernplan) => Promise<void>
  /** Übersicht aller Fächer für die zentrale „Lernplan“-Seite. */
  allLernplaene: () => Promise<LernplanMeta[]>
  /** Heutige Lernplan-Aufgaben über alle Fächer (für die Menüleiste). */
  todayTasks: () => Promise<
    { semester: string; kurs: string; id: string; title: string; time?: string; done: boolean }[]
  >
  /**
   * Liefert den Notiztext der gewählten Quellen für eine KI-Anfrage. Bild-/PDF-
   * Notizen ohne erkannten Text werden vorher per Apple Vision erkannt und der
   * Text dauerhaft im Index gesichert (kommt so auch der Suche zugute).
   */
  ensureNotesText: (semester: string, kurs: string, relPaths: string[]) => Promise<string>
  /** Verknüpft eine Kalender-Prüfung mit einem Fach (Countdown + adaptive Planung). */
  linkExamToCourse: (
    exam: { examKey: string; title: string; dateIso: string | null },
    semester: string,
    kurs: string
  ) => Promise<void>
}

let unwatch: (() => void) | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null

async function loadIndex(root: string): Promise<IndexData> {
  const file = joinPath(root, INDEX_FILE)
  if (!(await window.api.spExists(file))) return emptyIndex()
  try {
    return parseIndex(new TextDecoder().decode(await window.api.spRead(file)))
  } catch {
    return emptyIndex()
  }
}

async function saveIndex(root: string, index: IndexData): Promise<void> {
  index.updated = new Date().toISOString()
  await window.api.spWrite(
    joinPath(root, INDEX_FILE),
    new TextEncoder().encode(JSON.stringify(index, null, 2))
  )
}

export const useStudienplanerStore = create<SpState>((set, get) => ({
  path: useSettingsStore.getState().studienplanerPath,
  tree: null,
  index: emptyIndex(),
  loading: false,
  busy: null,
  error: null,

  open: async () => {
    const path = useSettingsStore.getState().studienplanerPath
    set({ path })
    if (!path) return
    await get().refresh()
    // Vorlage für eigene KI-Regeln anlegen, falls noch nicht da.
    if (!(await window.api.spExists(joinPath(path, AI_NOTES_FILE)))) {
      await window.api
        .spWrite(joinPath(path, AI_NOTES_FILE), new TextEncoder().encode(AI_NOTES_TEMPLATE))
        .catch(() => undefined)
    }
    await window.api.spWatch(path).catch(() => undefined)
    unwatch?.()
    unwatch = window.api.onStudienplanerChange(() => {
      if (refreshTimer) clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => void get().refresh(), 300)
    })
  },

  close: () => {
    unwatch?.()
    unwatch = null
    if (refreshTimer) clearTimeout(refreshTimer)
    void window.api.spUnwatch().catch(() => undefined)
  },

  choosePath: async () => {
    const dir = await window.api.pickDirectory()
    if (!dir) return
    useSettingsStore.getState().setStudienplanerPath(dir)
    set({ path: dir, tree: null, index: emptyIndex() })
    await window.api.spMkdirp(joinPath(dir, INBOX_DIR)).catch(() => undefined)
    await get().open()
    toast.success('Studienplaner-Ordner gesetzt.')
  },

  refresh: async () => {
    const path = get().path
    if (!path) return
    set({ loading: true, error: null })
    try {
      const [tree, index] = await Promise.all([window.api.spTree(path), loadIndex(path)])
      // Index-Einträge zu verschwundenen Dateien entfernen.
      const alive = new Set<string>()
      for (const s of tree.semesters) {
        for (const c of s.courses) for (const f of c.files) alive.add(relPathOf(path, f.path))
        for (const f of s.looseFiles) alive.add(relPathOf(path, f.path))
      }
      let changed = false
      for (const key of Object.keys(index.entries)) {
        if (!alive.has(key)) {
          delete index.entries[key]
          changed = true
        }
      }
      set({ tree, index, loading: false })
      if (changed) await saveIndex(path, index)
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Ordner nicht lesbar' })
    }
  },

  createSemester: async (name) => {
    const path = get().path
    if (!path || !name.trim()) return
    await window.api.spMkdirp(joinPath(path, safeName(name)))
    await get().refresh()
  },

  createCourse: async (semester, name) => {
    const path = get().path
    if (!path || !semester || !name.trim()) return
    await window.api.spMkdirp(joinPath(path, semester, safeName(name)))
    await get().refresh()
  },

  scaffoldCourses: async (semester, kurse) => {
    const path = get().path
    if (!path || !semester.trim()) return 0
    const sem = safeName(semester)
    const seen = new Set<string>()
    let n = 0
    for (const raw of kurse) {
      const ku = safeName(raw)
      if (!ku || seen.has(ku)) continue
      seen.add(ku)
      for (const sub of ['Wichtig', 'Übungen']) {
        await window.api.spMkdirp(joinPath(path, sem, ku, sub)).catch(() => undefined)
      }
      n++
    }
    await get().refresh()
    return n
  },

  ocrFile: async (file) => {
    set({ busy: 'Text wird erkannt …' })
    try {
      const bytes = await window.api.spRead(file.path)
      return await recognizeNotes(bytes, file.ext)
    } catch (err) {
      console.warn('OCR fehlgeschlagen:', err)
      return null
    } finally {
      set({ busy: null })
    }
  },

  fileItem: async (file, target, ocr) => {
    const path = get().path
    if (!path) return
    const { semester, kurs, thema, makeSearchable } = target
    if (!semester.trim() || !kurs.trim()) {
      toast.error('Bitte Semester und Kurs angeben.')
      return
    }
    set({ busy: 'Wird einsortiert …' })
    try {
      const courseDir = joinPath(path, safeName(semester), safeName(kurs))
      await window.api.spMkdirp(courseDir)

      const base = safeName(thema) || file.name.replace(/\.[^.]+$/, '')
      const isImage = IMG_EXT.has(file.ext)
      const wantPdf =
        makeSearchable && (isImage || (file.ext === 'pdf' && (ocr?.pages.length ?? 0) > 0))
      const destName = `${base}.${wantPdf ? 'pdf' : file.ext}`
      const dest = joinPath(courseDir, destName)

      if (wantPdf) {
        const bytes = await window.api.spRead(file.path)
        const { imageToSearchablePdf, addTextLayerToPdf } =
          await import('../studienplaner/notesToPdf')
        let out: Uint8Array
        if (isImage) {
          let imgBytes = bytes
          let imgExt = file.ext
          if (!['png', 'jpg', 'jpeg'].includes(imgExt)) {
            imgBytes = await window.api.sipsConvert({ bytes }, 'jpeg')
            imgExt = 'jpg'
          }
          out = await imageToSearchablePdf({
            bytes: imgBytes,
            ext: imgExt,
            ocr: ocr?.pages[0] ?? null
          })
        } else {
          out = await addTextLayerToPdf(bytes, ocr?.pages ?? [])
        }
        await window.api.spWrite(dest, out)
        await window.api.spTrash(file.path)
      } else {
        await window.api.spMove(file.path, dest)
      }

      const entry: IndexEntry = {
        relPath: relPathOf(path, dest),
        semester: safeName(semester),
        kurs: safeName(kurs),
        thema: base,
        added: new Date().toISOString(),
        ocrEngine: ocr?.engine ?? 'none',
        text: ocr?.text ?? ''
      }
      const index = get().index
      index.entries[entry.relPath] = entry
      await saveIndex(path, index)
      set({ index: { ...index } })
      await get().refresh()
      toast.success(`„${base}" in ${safeName(kurs)} abgelegt.`)
    } catch (err) {
      toast.error(`Einsortieren fehlgeschlagen: ${err instanceof Error ? err.message : err}`)
    } finally {
      set({ busy: null })
    }
  },

  deleteFile: async (file) => {
    const path = get().path
    if (!path) return
    try {
      await window.api.spTrash(file.path)
      const index = get().index
      delete index.entries[relPathOf(path, file.path)]
      await saveIndex(path, index)
      set({ index: { ...index } })
      await get().refresh()
    } catch (err) {
      toast.error(`Löschen fehlgeschlagen: ${err instanceof Error ? err.message : err}`)
    }
  },

  openInEditor: async (file) => {
    if (file.ext === 'pdf') {
      const m = await import('../lib/fileActions')
      await m.openPaths([file.path])
    } else {
      window.api.spReveal(file.path)
    }
  },

  loadLernplan: async (semester, kurs) => {
    const path = get().path
    const sem = safeName(semester)
    const ku = safeName(kurs)
    const fresh = (): Lernplan => ({ ...emptyLernplan(sem, ku) })
    if (!path) return fresh()
    const base = coursePrepPath(path, sem, ku)

    // 1) flache Datei direkt im Prüfungsvorbereitung-Ordner
    for (const fn of [PLAN_FILE, LEGACY_PLAN_FILE]) {
      const fp = joinPath(base, fn)
      if (!(await window.api.spExists(fp))) continue
      try {
        const p = parseLernplan(new TextDecoder().decode(await window.api.spRead(fp)), ku)
        if (p) return { ...p, semester: sem, kurs: ku }
      } catch {
        /* kaputte Datei – weiter */
      }
    }
    // 2) Altbestand aus benannten Unterordnern (früheres Layout) – neuesten nehmen
    const subs = (await window.api.spListDir(base)).filter((e) => e.isDir)
    let best: Lernplan | null = null
    for (const s of subs) {
      for (const fn of [PLAN_FILE, LEGACY_PLAN_FILE]) {
        const fp = joinPath(base, s.name, fn)
        if (!(await window.api.spExists(fp))) continue
        try {
          const p = parseLernplan(new TextDecoder().decode(await window.api.spRead(fp)), s.name)
          if (p && (!best || p.updated > best.updated)) best = p
        } catch {
          /* kaputte Datei – weiter */
        }
      }
    }
    if (best) return { ...best, semester: sem, kurs: ku, name: ku }
    return fresh()
  },

  saveLernplan: async (semester, kurs, plan) => {
    const path = get().path
    if (!path) return
    const sem = safeName(semester)
    const ku = safeName(kurs)
    const dir = coursePrepPath(path, sem, ku)
    await window.api.spMkdirp(dir)
    let merged: Lernplan = {
      ...plan,
      semester: sem,
      kurs: ku,
      name: ku,
      updated: new Date().toISOString()
    }
    const planFp = joinPath(dir, PLAN_FILE)
    if (await window.api.spExists(planFp)) {
      try {
        const onDisk = parseLernplan(new TextDecoder().decode(await window.api.spRead(planFp)), ku)
        if (onDisk) merged = { ...mergeProgress(merged, onDisk), updated: new Date().toISOString() }
      } catch {
        /* kaputte Datei ignorieren */
      }
    }
    await window.api.spWrite(
      joinPath(dir, PLAN_FILE),
      new TextEncoder().encode(JSON.stringify(merged, null, 2))
    )
    if (merged.summary.trim()) {
      await window.api.spWrite(
        joinPath(dir, 'Zusammenfassung.md'),
        new TextEncoder().encode(`# ${ku} – Zusammenfassung\n\n${merged.summary}\n`)
      )
    }
    if (merged.plan.trim()) {
      await window.api.spWrite(
        joinPath(dir, 'Lernplan.md'),
        new TextEncoder().encode(`# ${ku} – Lernplan\n\n${merged.plan}\n`)
      )
    }
  },

  allLernplaene: async () => {
    const tree = get().tree
    if (!tree) return []
    const pairs = tree.semesters.flatMap((sem) =>
      sem.courses.map((c) => ({ semester: sem.name, kurs: c.name }))
    )
    // Alle Fächer parallel laden – sonst wird die zentrale Lernplan-Seite bei
    // vielen Kursen spürbar langsam.
    const plans = await Promise.all(pairs.map((p) => get().loadLernplan(p.semester, p.kurs)))
    return pairs.map((p, i) => {
      const plan = plans[i]
      // „exists" nur, wenn wirklich schon Inhalt drin ist
      const has =
        plan.quizzes.length > 0 ||
        plan.summary.trim() ||
        plan.plan.trim() ||
        (plan.resources?.length ?? 0) > 0 ||
        plan.examKey
      return {
        ...lernplanMeta(p.semester, p.kurs, has ? plan : null),
        semester: p.semester,
        kurs: p.kurs
      }
    })
  },

  todayTasks: async () => {
    const tree = get().tree
    if (!tree) return []
    const today = new Date().toISOString().slice(0, 10)
    const pairs = tree.semesters.flatMap((sem) =>
      sem.courses.map((c) => ({ semester: sem.name, kurs: c.name }))
    )
    const plans = await Promise.all(pairs.map((p) => get().loadLernplan(p.semester, p.kurs)))
    const out: {
      semester: string
      kurs: string
      id: string
      title: string
      time?: string
      done: boolean
    }[] = []
    pairs.forEach((p, i) => {
      for (const t of plans[i].planTasks ?? []) {
        if (t.date === today) {
          out.push({
            semester: p.semester,
            kurs: p.kurs,
            id: t.id,
            title: t.title,
            time: t.time,
            done: Boolean(t.done)
          })
        }
      }
    })
    return out.sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
  },

  ensureNotesText: async (semester, kurs, relPaths) => {
    const path = get().path
    const sem = safeName(semester)
    const ku = safeName(kurs)
    if (!path) return ''
    const index = get().index
    const want = new Set(relPaths)
    const todo = relPaths
      .map((rp) => index.entries[rp])
      .filter(
        (e): e is IndexEntry => Boolean(e) && !e.text.trim() && OCRABLE_EXT.has(extOf(e.relPath))
      )
    if (todo.length) {
      let changed = false
      for (const e of todo) {
        try {
          const bytes = await window.api.spRead(joinPath(path, e.relPath))
          const res = await recognizeNotes(bytes, extOf(e.relPath))
          if (res && res.text.trim()) {
            e.text = res.text.trim()
            e.ocrEngine = res.engine
            changed = true
          }
        } catch (err) {
          console.warn('Vision-OCR für', e.relPath, 'fehlgeschlagen:', err)
        }
      }
      if (changed) {
        await saveIndex(path, index)
        set({ index: { ...index } })
      }
    }
    return courseNotesText(get().index, sem, ku, want)
  },

  linkExamToCourse: async (exam, semester, kurs) => {
    const path = get().path
    if (!path) return
    const sem = safeName(semester)
    const ku = safeName(kurs)
    const plan = await get().loadLernplan(sem, ku)
    await get().saveLernplan(sem, ku, {
      ...plan,
      examKey: exam.examKey,
      examTitle: exam.title,
      examDateIso: exam.dateIso
    })
    const index = get().index
    index.exams = {
      ...(index.exams ?? {}),
      [exam.examKey]: {
        examKey: exam.examKey,
        title: exam.title,
        dateIso: exam.dateIso,
        semester: sem,
        kurs: ku
      }
    }
    await saveIndex(path, index)
    set({ index: { ...index } })
  }
}))
