import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { OcrResult, SpFile, SpTree } from '@shared/types'
import { toast } from '../components/common/toast'
import { useSettingsStore } from './settingsStore'
import {
  COURSE_SUBFOLDERS,
  INBOX_DIR,
  INDEX_FILE,
  contentSignatures,
  emptyIndex,
  findAppendTarget,
  findDuplicate,
  parseIndex,
  relPathOf,
  resultKey,
  safeName,
  splitUndo,
  suggestFiling,
  type FachResult,
  type GradeComponent,
  type IndexData,
  type IndexEntry,
  type UndoRecord
} from '../studienplaner/model'
import { recognizeNotes, rectifyScan, scanQualityWarning } from '../studienplaner/ocr'
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
  taskCalendarEvent,
  taskTimeHHMM,
  type Lernplan,
  type LernplanMeta,
  type PlanTask
} from '../studienplaner/prep'
import { AI_NOTES_FILE } from '../studienplaner/aiSystemPrompt'
import { fachGrade } from '../studienplaner/grades'

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
  /** Unterordner im Fach: „Informationen" | „Übungen" (leer = direkt im Kurs). */
  subfolder: string
  /** Bild-Scans in ein durchsuchbares PDF umwandeln (Standard: an). */
  makeSearchable: boolean
  /** Wenn gesetzt: an diese vorhandene PDF anhängen statt neue Datei anlegen (relPath). */
  appendToRelPath?: string
}

/** Vorberechneter Vorschlag für eine Eingang-Datei (Autopilot). */
export interface InboxHint {
  thema: string
  semester?: string
  kurs?: string
  subfolder: string
  /** 0…1 – Sicherheit des Fach-Treffers. */
  confidence: number
  /** Bestbewertete Fächer mit Prozent + Trefferwörtern (für die Sicherheits-Anzeige). */
  candidates?: { semester: string; kurs: string; pct: number; matched: string[] }[]
  /** Woher der Semestervorschlag kommt. */
  semesterFrom?: 'match' | 'text' | 'none'
  /** Vorschlag, den Scan an eine vorhandene PDF im Zielkurs anzuhängen. */
  appendTo?: { relPath: string; name: string }
  /** Anzahl erkannter Textzeichen – ein Qualitätssignal für die Ablage. */
  ocrChars?: number
  /** true, wenn Fach sicher passt UND die Scan-Qualität stimmt UND kein Duplikat. */
  ready: boolean
  ocr: OcrResult | null
  /** Hinweis zur Scan-Qualität (unscharf, abgeschnitten …), sonst leer. */
  warn?: string | null
  /** relPath eines vorhandenen Eintrags, der derselbe Inhalt sein dürfte. */
  duplicateOf?: string
  /** Bild-Hash aus der Aufbereitung – landet beim Ablegen im Index-Eintrag. */
  ahash?: string
}

interface SpState {
  path: string | null
  tree: SpTree | null
  index: IndexData
  loading: boolean
  /** Status-Text während OCR / Einsortieren; null = frei. */
  busy: string | null
  error: string | null
  /** Autopilot: Vorschlag je Eingang-Datei (Schlüssel = absoluter Pfad). */
  inboxHints: Record<string, InboxHint>

  open: () => Promise<void>
  close: () => void
  choosePath: () => Promise<void>
  refresh: () => Promise<void>
  /** Eingang-Dateien vorab per OCR analysieren und Vorschläge berechnen. */
  scanInbox: () => Promise<void>
  /** Eine Eingang-Datei direkt nach ihrem Vorschlag ablegen. */
  fileFromHint: (file: SpFile, mode?: 'file' | 'append') => Promise<void>
  createSemester: (name: string) => Promise<void>
  createCourse: (semester: string, name: string) => Promise<void>
  /** Erstellt ein ZIP-Backup des Studienordners (`silent` = ohne Toast). */
  backupNow: (silent?: boolean) => Promise<void>
  /** OCR + Index für Notiz-Dateien nachziehen, die noch keinen Index-Eintrag haben. */
  autoIndex: () => Promise<number>
  /** Fächer mit lang vergangener Prüfung nach `_Archiv/` verschieben (fragt nach). */
  archiveOldExams: () => Promise<void>
  /** Legt für mehrere Fächer je einen Kurs-Ordner mit „Informationen" + „Übungen" an. */
  scaffoldCourses: (semester: string, kurse: string[]) => Promise<number>
  ocrFile: (file: SpFile) => Promise<OcrResult | null>
  fileItem: (
    file: SpFile,
    target: FilingTarget,
    ocr: OcrResult | null,
    opts?: { dupConfirmed?: boolean; qualityConfirmed?: boolean; ahash?: string }
  ) => Promise<void>
  deleteFile: (file: SpFile) => Promise<void>
  openInEditor: (file: SpFile) => Promise<void>
  /** Die letzten Einsortier-Vorgänge (jüngste zuerst) – für „Rückgängig". */
  listUndo: () => UndoRecord[]
  /** Macht einen Einsortier-Vorgang rückgängig (Datei zurück in den Eingang bzw.
   *  angehängte Seite wieder entfernen). */
  undoFiling: (id: string) => Promise<void>

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
  /** Alle Lernplan-Aufgaben über alle Fächer (für die zentrale Tages-Ansicht). */
  allPlanTasks: () => Promise<{ semester: string; kurs: string; task: PlanTask }[]>
  /** Fügt einem Fach eine (selbst angelegte) Aufgabe hinzu. */
  addPlanTask: (semester: string, kurs: string, task: PlanTask) => Promise<void>
  /** Ändert Felder einer Aufgabe eines Fachs (z. B. `done`). */
  patchPlanTask: (
    semester: string,
    kurs: string,
    id: string,
    patch: Partial<PlanTask>
  ) => Promise<void>
  /** Entfernt eine Aufgabe aus einem Fach. */
  removePlanTask: (semester: string, kurs: string, id: string) => Promise<void>
  /**
   * Lässt Gemini die überfälligen, noch offenen Aufgaben eines Fachs neu auf die
   * nächsten Tage verteilen – um die bereits geplanten Aufgaben und den Kalender
   * herum, ohne dass eine Aufgabe wegfällt. Gibt die Zahl der verschobenen
   * Aufgaben zurück (0 = nichts zu tun oder Gemini kam nicht durch).
   */
  rescheduleOverdueForCourse: (semester: string, kurs: string, busyText?: string) => Promise<number>
  /**
   * Gegenrichtung der Sync: im Kalender verschobene Lerntermine zurück in die
   * Lernpläne übernehmen (Abgleich per `calEventId`). Gibt die Zahl der
   * angepassten Aufgaben zurück.
   */
  pullCalendarMoves: (calEvents: { id: string; start: string; title: string }[]) => Promise<number>
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

  /** Alle erfassten Fach-Ergebnisse (für die Seite „Studienergebnisse"). */
  getResults: () => FachResult[]
  /** Ergebnis eines Fachs anlegen/ändern (ECTS, Teilleistungen …). */
  setFachResult: (semester: string, kurs: string, patch: Partial<FachResult>) => Promise<void>
  /**
   * Klausur-Ergebnis speichern: Teilleistungen + ECTS ablegen, einen Schnappschuss
   * der Lern-Vorbereitung sichern und das Fach optional nach `_Archiv` verschieben.
   */
  saveExamResult: (
    semester: string,
    kurs: string,
    input: { components: GradeComponent[]; ects?: number; archive?: boolean }
  ) => Promise<void>
  /** KI-Lernstrategie-Auswertung im Index ablegen (Studienergebnisse-Seite). */
  saveTacticsAnalysis: (text: string) => Promise<void>
}

let unwatch: (() => void) | null = null
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let autoIndexRunning = false
const autoIndexTried = new Set<string>()
let inboxScanRunning = false

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

/** Ordner für Rückgängig-Backups (Vorher-Stände beim Anhängen). */
const UNDO_DIR = '.astra-undo'

/** Neuen Rückgängig-Eintrag vorn einfügen, auf `UNDO_LIMIT` kürzen, alte Backups wegräumen. */
async function pushUndo(root: string, index: IndexData, rec: UndoRecord): Promise<void> {
  const { kept, dropped } = splitUndo([rec, ...(index.undo ?? [])])
  index.undo = kept
  for (const d of dropped) {
    if (d.backupRel) await window.api.spTrash(joinPath(root, d.backupRel)).catch(() => undefined)
  }
}

/** Verschiebt einen Kurs-Ordner nach `_Archiv/<Semester>/<Kurs>` (Lernplan bleibt drin). */
async function moveCourseToArchive(root: string, semester: string, kurs: string): Promise<void> {
  const from = joinPath(root, safeName(semester), safeName(kurs))
  const to = joinPath(root, '_Archiv', safeName(semester), safeName(kurs))
  await window.api.spMkdirp(joinPath(root, '_Archiv', safeName(semester))).catch(() => undefined)
  await window.api.spMove(from, to)
}

/** Verknüpfte Kalendertermine für geänderte Aufgaben nachziehen (Plan → Kalender). */
async function pushTaskCalUpdates(kursName: string, tasks: PlanTask[]): Promise<void> {
  const withEvent = tasks.filter((t) => t.calEventId)
  if (!withEvent.length) return
  try {
    const { useCalendarStore } = await import('./calendarStore')
    await useCalendarStore
      .getState()
      .updateEvents(
        withEvent.map((t) => ({ id: t.calEventId as string, ...taskCalendarEvent(kursName, t) }))
      )
  } catch (e) {
    console.warn('Kalender-Sync (update) fehlgeschlagen:', e)
  }
}

/** Verknüpfte Kalendertermine für entfernte Aufgaben löschen (Plan → Kalender). */
async function pushTaskCalDeletes(ids: (string | undefined)[]): Promise<void> {
  const clean = ids.filter((x): x is string => Boolean(x))
  if (!clean.length) return
  try {
    const { useCalendarStore } = await import('./calendarStore')
    await useCalendarStore.getState().deleteEvents(clean)
  } catch (e) {
    console.warn('Kalender-Sync (delete) fehlgeschlagen:', e)
  }
}

export const useStudienplanerStore = create<SpState>((set, get) => ({
  path: useSettingsStore.getState().studienplanerPath,
  tree: null,
  index: emptyIndex(),
  loading: false,
  busy: null,
  error: null,
  inboxHints: {},

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
      refreshTimer = setTimeout(() => {
        void get()
          .refresh()
          .then(() => get().autoIndex())
          .then(() => get().scanInbox())
      }, 300)
    })
    // Wöchentliches ZIP-Backup (ein einziges, altes wird ersetzt).
    const last = useSettingsStore.getState().studienplanerLastBackup
    if (!useSettingsStore.getState().studienplanerDemo && Date.now() - last > 7 * 864e5) {
      void get().backupNow(true)
    }
    // Neue Dateien (Finder/iCloud) ohne Index-Eintrag automatisch erkennen.
    void get().autoIndex()
    // Eingang-Dateien vorab analysieren (Autopilot).
    void get().scanInbox()
    // Fächer mit lang vergangener Prüfung zum Archivieren anbieten (fragt nach).
    if (!useSettingsStore.getState().studienplanerDemo) {
      setTimeout(() => void get().archiveOldExams(), 2500)
    }
  },

  backupNow: async (silent = false) => {
    const path = get().path
    if (!path || useSettingsStore.getState().studienplanerDemo) return
    const res = await window.api.spBackup(path).catch(() => ({ error: 'Fehler' }))
    if ('error' in res) {
      if (!silent) toast.error(`Backup fehlgeschlagen: ${res.error}`)
      return
    }
    useSettingsStore.getState().setStudienplanerLastBackup(res.when)
    if (!silent) {
      const mb = (res.bytes / 1048576).toFixed(1)
      toast.success(`Backup gespeichert (${mb} MB) – ${res.path}`)
    }
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
        for (const c of s.courses) {
          for (const f of c.files) alive.add(relPathOf(path, f.path))
          for (const g of c.groups ?? []) {
            for (const f of g.files) alive.add(relPathOf(path, f.path))
          }
        }
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
    const courseDir = joinPath(path, semester, safeName(name))
    await window.api.spMkdirp(courseDir)
    // Jedes Fach bekommt „Informationen" + „Übungen".
    for (const sub of COURSE_SUBFOLDERS) {
      await window.api.spMkdirp(joinPath(courseDir, sub)).catch(() => undefined)
    }
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
      for (const sub of COURSE_SUBFOLDERS) {
        await window.api.spMkdirp(joinPath(path, sem, ku, sub)).catch(() => undefined)
      }
      n++
    }
    await get().refresh()
    return n
  },

  autoIndex: async () => {
    const path = get().path
    if (!path || autoIndexRunning) return 0
    const tree = get().tree
    if (!tree) return 0
    autoIndexRunning = true
    try {
      const index = get().index
      // (relPath, ext, semester, kurs) aller Notiz-Dateien im Baum
      const files: { rel: string; ext: string; sem: string; kurs: string; name: string }[] = []
      for (const s of tree.semesters) {
        for (const c of s.courses) {
          for (const f of [...c.files, ...(c.groups ?? []).flatMap((g) => g.files)]) {
            files.push({
              rel: relPathOf(path, f.path),
              ext: f.ext,
              sem: safeName(s.name),
              kurs: safeName(c.name),
              name: f.name
            })
          }
        }
      }
      const todo = files
        .filter((f) => !index.entries[f.rel] && !autoIndexTried.has(f.rel))
        .slice(0, 10) // pro Durchlauf begrenzen – Rest kommt beim nächsten refresh
      if (!todo.length) return 0

      let changed = 0
      for (const f of todo) {
        autoIndexTried.add(f.rel)
        try {
          let text = ''
          let engine: IndexEntry['ocrEngine'] = 'none'
          const bytes = await window.api.spRead(joinPath(path, f.rel))
          if (f.ext === 'txt' || f.ext === 'md') {
            text = new TextDecoder().decode(bytes).trim()
          } else if (OCRABLE_EXT.has(f.ext)) {
            const res = await recognizeNotes(bytes, f.ext)
            if (res && res.text.trim()) {
              text = res.text.trim()
              engine = res.engine
            }
          } else {
            continue
          }
          index.entries[f.rel] = {
            relPath: f.rel,
            semester: f.sem,
            kurs: f.kurs,
            thema: f.name.replace(/\.[^.]+$/, ''),
            added: new Date().toISOString(),
            ocrEngine: engine,
            text
          }
          changed++
        } catch (err) {
          console.warn('autoIndex für', f.rel, 'fehlgeschlagen:', err)
        }
      }
      if (changed) {
        await saveIndex(path, index)
        set({ index: { ...index } })
      }
      return changed
    } finally {
      autoIndexRunning = false
    }
  },

  archiveOldExams: async () => {
    const path = get().path
    if (!path) return
    const index = get().index
    const tree = get().tree
    if (!tree) return
    const cutoff = Date.now() - 30 * 864e5
    const liveCourses = new Set(
      tree.semesters.flatMap((s) =>
        s.courses.map((c) => `${safeName(s.name)}//${safeName(c.name)}`)
      )
    )
    let offered: string[] = []
    try {
      offered = JSON.parse(localStorage.getItem('astra.sp.archiveOffered') ?? '[]')
    } catch {
      /* egal */
    }
    const cand = Object.values(index.exams ?? {})
      .filter(
        (e) =>
          e.dateIso &&
          new Date(e.dateIso).getTime() < cutoff &&
          liveCourses.has(`${safeName(e.semester)}//${safeName(e.kurs)}`) &&
          !offered.includes(e.examKey)
      )
      .filter((e, i, a) => a.findIndex((x) => x.semester === e.semester && x.kurs === e.kurs) === i)
    if (!cand.length) return
    localStorage.setItem(
      'astra.sp.archiveOffered',
      JSON.stringify([...offered, ...cand.map((c) => c.examKey)])
    )
    const names = cand.map((c) => `${c.kurs} (${c.semester})`).join(', ')
    if (
      !confirm(
        `${cand.length} Fach/Fächer mit lange vergangener Prüfung nach „_Archiv" verschieben?\n\n${names}\n\nDer Lernplan bleibt erhalten, nur nicht mehr in der Liste.`
      )
    ) {
      return
    }
    for (const c of cand) {
      await moveCourseToArchive(path, c.semester, c.kurs).catch((err) => {
        console.warn('Archivieren fehlgeschlagen:', err)
      })
      delete index.exams?.[c.examKey]
    }
    await saveIndex(path, index)
    set({ index: { ...index } })
    await get().refresh()
    toast.success(`${cand.length} Fach/Fächer archiviert (unter „_Archiv" im Ordner).`)
  },

  scanInbox: async () => {
    const path = get().path
    const tree = get().tree
    if (!path || !tree || inboxScanRunning) return
    const pending = tree.inbox.filter((f) => !get().inboxHints[f.path])
    if (!pending.length) return
    inboxScanRunning = true
    try {
      const hints = { ...get().inboxHints }
      // veraltete Einträge (Datei weg) entfernen
      const live = new Set(tree.inbox.map((f) => f.path))
      for (const k of Object.keys(hints)) if (!live.has(k)) delete hints[k]

      const index = get().index
      for (const f of pending.slice(0, 6)) {
        try {
          const bytes = await window.api.spRead(f.path)
          const ocr = await recognizeNotes(bytes, f.ext)
          const s = suggestFiling(ocr?.text ?? f.name, tree)
          const semOk = Boolean(s.semester && tree.semesters.some((x) => x.name === s.semester))
          const kursOk =
            semOk &&
            Boolean(
              s.kurs &&
              tree.semesters
                .find((x) => x.name === s.semester)
                ?.courses.some((c) => c.name === s.kurs)
            )
          // Scan-Qualität + Duplikat-Check vorab, damit die Zeile im Eingang
          // gleich zeigt, ob „Direkt ablegen" gefahrlos ist.
          const rect = await rectifyScan(bytes, f.ext)
          const warn = scanQualityWarning(rect?.report)
          const sig = await contentSignatures(bytes, ocr?.text ?? '')
          const dup = findDuplicate(index, { ...sig, ahash: rect?.report.ahash })
          // Gehört der Scan an eine vorhandene PDF im Zielkurs (gleicher Name)?
          const appendTo =
            kursOk && s.kurs && s.semester && !dup
              ? findAppendTarget(index, s.semester, s.kurs, s.thema)
              : null
          hints[f.path] = {
            thema: s.thema,
            semester: semOk ? s.semester : undefined,
            kurs: kursOk ? s.kurs : undefined,
            subfolder: s.subfolder,
            confidence: s.confidence,
            candidates: s.candidates.map((c) => ({
              semester: c.semester,
              kurs: c.kurs,
              pct: Math.round(c.score * 100),
              matched: c.matched
            })),
            semesterFrom: s.semesterFrom,
            ocrChars: (ocr?.text ?? '').trim().length,
            appendTo: appendTo ?? undefined,
            ready: semOk && kursOk && s.confidence >= 0.34 && !warn && !dup,
            ocr,
            warn,
            duplicateOf: dup?.relPath,
            ahash: rect?.report.ahash
          }
        } catch (err) {
          console.warn('scanInbox für', f.name, 'fehlgeschlagen:', err)
        }
      }
      set({ inboxHints: hints })
    } finally {
      inboxScanRunning = false
    }
  },

  fileFromHint: async (file, mode) => {
    const hint = get().inboxHints[file.path]
    if (!hint || !hint.semester || !hint.kurs) {
      toast.error('Kein sicherer Vorschlag – bitte „Einsortieren".')
      return
    }
    const appendRel = mode === 'append' ? hint.appendTo?.relPath : undefined
    await get().fileItem(
      file,
      {
        semester: hint.semester,
        kurs: hint.kurs,
        thema: hint.thema,
        subfolder: hint.subfolder,
        makeSearchable: true,
        appendToRelPath: appendRel
      },
      hint.ocr,
      // Der Vorschlag hat Qualität & Duplikat schon geprüft und angezeigt;
      // wer hier „Direkt ablegen" / „Anhängen" klickt, hat das gesehen.
      { dupConfirmed: true, qualityConfirmed: true, ahash: hint.ahash }
    )
    const hints = { ...get().inboxHints }
    delete hints[file.path]
    set({ inboxHints: hints })
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

  fileItem: async (file, target, ocr, opts) => {
    const path = get().path
    if (!path) return
    const { semester, kurs, thema, makeSearchable, subfolder, appendToRelPath } = target
    if (!semester.trim() || !kurs.trim()) {
      toast.error('Bitte Semester und Kurs angeben.')
      return
    }
    set({ busy: appendToRelPath ? 'Wird angehängt …' : 'Wird einsortiert …' })
    try {
      const targetDir = joinPath(path, safeName(semester), safeName(kurs), subfolder || '')
      await window.api.spMkdirp(targetDir)

      const isImage = IMG_EXT.has(file.ext)
      const origBytes = await window.api.spRead(file.path)
      const nt = await import('../studienplaner/notesToPdf')

      // Foto begradigen & säubern, bevor daraus ein PDF wird.
      let workBytes = origBytes
      let workExt = file.ext
      let ahash = opts?.ahash
      if (isImage) {
        const rect = await rectifyScan(origBytes, file.ext)
        if (rect) {
          workBytes = rect.bytes
          workExt = 'jpg'
          ahash = rect.report.ahash
          if (!opts?.qualityConfirmed) {
            const warn = scanQualityWarning(rect.report)
            if (
              warn &&
              !confirm(
                `Scan-Qualität: ${warn}. Trotzdem ablegen? Ein neues Foto wird meist besser erkannt.`
              )
            ) {
              set({ busy: null })
              return
            }
          }
        }
      }

      const index = get().index

      // Signaturen für den Dubletten-Check und fürs Merken im Index.
      const sig = await contentSignatures(origBytes, ocr?.text ?? '')

      // ── Dublette? (nur bei neuer Datei – Anhängen IST die Antwort darauf) ──
      if (!appendToRelPath && !opts?.dupConfirmed) {
        const dup = findDuplicate(index, { ...sig, ahash })
        if (
          dup &&
          !confirm(
            `„${dup.thema}" in ${dup.kurs} sieht genauso aus. Trotzdem als neue Datei ablegen?`
          )
        ) {
          set({ busy: null })
          return
        }
      }

      // Inhalt der neuen Notiz als PDF-Bytes (für „durchsuchbar" und fürs Anhängen).
      const contentAsPdf = async (): Promise<Uint8Array> => {
        if (isImage) {
          let imgBytes = workBytes
          let imgExt = workExt
          if (!['png', 'jpg', 'jpeg'].includes(imgExt)) {
            imgBytes = await window.api.sipsConvert({ bytes: workBytes }, 'jpeg')
            imgExt = 'jpg'
          }
          return nt.imageToSearchablePdf({
            bytes: imgBytes,
            ext: imgExt,
            ocr: ocr?.pages[0] ?? null
          })
        }
        return (ocr?.pages.length ?? 0) > 0
          ? nt.addTextLayerToPdf(origBytes, ocr!.pages)
          : origBytes
      }

      const fromInbox = file.path.includes(`/${INBOX_DIR}/`)

      // ── An vorhandene PDF anhängen ────────────────────────────────────
      if (appendToRelPath) {
        if (!isImage && file.ext !== 'pdf') {
          throw new Error('Nur Bilder oder PDFs lassen sich anhängen.')
        }
        const existAbs = joinPath(path, appendToRelPath)
        const cur = index.entries[appendToRelPath]
        const beforeBytes = await window.api.spRead(existAbs)
        // Vorher-Stand sichern, damit „Rückgängig" die Seite wieder entfernen kann.
        const backupRel = `${UNDO_DIR}/${nanoid(10)}.pdf`
        await window.api.spMkdirp(joinPath(path, UNDO_DIR))
        await window.api.spWrite(joinPath(path, backupRel), beforeBytes)

        const merged = await nt.appendPdf(beforeBytes, await contentAsPdf())
        await window.api.spWrite(existAbs, merged)
        await window.api.spTrash(file.path)

        const fname = appendToRelPath.split('/').pop() ?? appendToRelPath
        index.entries[appendToRelPath] = {
          relPath: appendToRelPath,
          semester: cur?.semester ?? safeName(semester),
          kurs: cur?.kurs ?? safeName(kurs),
          thema: cur?.thema ?? fname.replace(/\.[^.]+$/, ''),
          added: cur?.added ?? new Date().toISOString(),
          ocrEngine:
            cur?.ocrEngine && cur.ocrEngine !== 'none' ? cur.ocrEngine : (ocr?.engine ?? 'none'),
          text: [cur?.text ?? '', (ocr?.text ?? '').trim()].filter(Boolean).join('\n\n'),
          sha1: cur?.sha1,
          textHash: cur?.textHash,
          ahash: cur?.ahash ?? ahash
        }
        await pushUndo(path, index, {
          id: nanoid(8),
          when: new Date().toISOString(),
          kind: 'append',
          destRelPath: appendToRelPath,
          originalName: file.name,
          fromInbox,
          backupRel,
          prevText: cur?.text ?? ''
        })
        await saveIndex(path, index)
        set({ index: { ...index } })
        await get().refresh()
        toast.success(`Seite an „${fname}" angehängt.`)
        return
      }

      // ── Neue Datei ───────────────────────────────────────────────────
      const base = safeName(thema) || file.name.replace(/\.[^.]+$/, '')
      const wantPdf =
        makeSearchable && (isImage || (file.ext === 'pdf' && (ocr?.pages.length ?? 0) > 0))
      const dest = joinPath(targetDir, `${base}.${wantPdf ? 'pdf' : file.ext}`)

      if (wantPdf) {
        await window.api.spWrite(dest, await contentAsPdf())
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
        text: ocr?.text ?? '',
        sha1: sig.sha1,
        textHash: sig.textHash,
        ahash
      }
      index.entries[entry.relPath] = entry
      await pushUndo(path, index, {
        id: nanoid(8),
        when: new Date().toISOString(),
        kind: 'file',
        destRelPath: entry.relPath,
        originalName: file.name,
        fromInbox
      })
      await saveIndex(path, index)
      set({ index: { ...index } })
      await get().refresh()
      toast.success(`„${base}" in ${safeName(kurs)}${subfolder ? ' / ' + subfolder : ''} abgelegt.`)
    } catch (err) {
      toast.error(`Einsortieren fehlgeschlagen: ${err instanceof Error ? err.message : err}`)
    } finally {
      set({ busy: null })
    }
  },

  listUndo: () => get().index.undo ?? [],

  undoFiling: async (id) => {
    const path = get().path
    if (!path) return
    const index = get().index
    const rec = (index.undo ?? []).find((r) => r.id === id)
    if (!rec) return
    set({ busy: 'Wird rückgängig gemacht …' })
    try {
      if (rec.kind === 'file') {
        // Datei zurück in den Eingang, Index-Eintrag entfernen.
        const srcAbs = joinPath(path, rec.destRelPath)
        if (await window.api.spExists(srcAbs)) {
          const baseName = rec.destRelPath.split('/').pop() ?? rec.destRelPath
          let backTo = joinPath(path, INBOX_DIR, baseName)
          if (await window.api.spExists(backTo)) {
            const dot = baseName.lastIndexOf('.')
            const stem = dot > 0 ? baseName.slice(0, dot) : baseName
            const ext = dot > 0 ? baseName.slice(dot) : ''
            backTo = joinPath(path, INBOX_DIR, `${stem} (zurück ${nanoid(4)})${ext}`)
          }
          await window.api.spMkdirp(joinPath(path, INBOX_DIR))
          await window.api.spMove(srcAbs, backTo)
        }
        delete index.entries[rec.destRelPath]
        toast.success('Ablage rückgängig – Datei liegt wieder im Eingang.')
      } else {
        // Angehängte Seite entfernen: Ziel-PDF aus dem Backup wiederherstellen.
        if (rec.backupRel && (await window.api.spExists(joinPath(path, rec.backupRel)))) {
          const before = await window.api.spRead(joinPath(path, rec.backupRel))
          await window.api.spWrite(joinPath(path, rec.destRelPath), before)
          await window.api.spTrash(joinPath(path, rec.backupRel)).catch(() => undefined)
          const e = index.entries[rec.destRelPath]
          if (e) e.text = rec.prevText ?? ''
          toast.success('Angehängte Seite wieder entfernt. Das Original liegt im Papierkorb.')
        } else {
          toast.error('Backup nicht mehr vorhanden – Rückgängig nicht möglich.')
        }
      }
      index.undo = (index.undo ?? []).filter((r) => r.id !== id)
      await saveIndex(path, index)
      set({ index: { ...index } })
      await get().refresh()
    } catch (err) {
      toast.error(`Rückgängig fehlgeschlagen: ${err instanceof Error ? err.message : err}`)
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

  allPlanTasks: async () => {
    const tree = get().tree
    if (!tree) return []
    const pairs = tree.semesters.flatMap((sem) =>
      sem.courses.map((c) => ({ semester: sem.name, kurs: c.name }))
    )
    const plans = await Promise.all(pairs.map((p) => get().loadLernplan(p.semester, p.kurs)))
    const out: { semester: string; kurs: string; task: PlanTask }[] = []
    pairs.forEach((p, i) => {
      for (const task of plans[i].planTasks ?? []) {
        out.push({ semester: p.semester, kurs: p.kurs, task })
      }
    })
    return out
  },

  addPlanTask: async (semester, kurs, task) => {
    const plan = await get().loadLernplan(semester, kurs)
    await get().saveLernplan(semester, kurs, {
      ...plan,
      planTasks: [...(plan.planTasks ?? []), task]
    })
  },

  patchPlanTask: async (semester, kurs, id, patch) => {
    const plan = await get().loadLernplan(semester, kurs)
    const next = (plan.planTasks ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t))
    await get().saveLernplan(semester, kurs, { ...plan, planTasks: next })
    // Datum/Uhrzeit/Titel/Dauer geändert → verknüpften Kalendertermin nachziehen.
    if (
      patch.date !== undefined ||
      patch.time !== undefined ||
      patch.title !== undefined ||
      patch.minutes !== undefined
    ) {
      const changed = next.find((t) => t.id === id && t.calEventId)
      if (changed) await pushTaskCalUpdates(kurs, [changed])
    }
  },

  removePlanTask: async (semester, kurs, id) => {
    const plan = await get().loadLernplan(semester, kurs)
    const gone = (plan.planTasks ?? []).find((t) => t.id === id)
    await get().saveLernplan(semester, kurs, {
      ...plan,
      planTasks: (plan.planTasks ?? []).filter((t) => t.id !== id)
    })
    await pushTaskCalDeletes([gone?.calEventId])
  },

  rescheduleOverdueForCourse: async (semester, kurs, busyText) => {
    const plan = await get().loadLernplan(semester, kurs)
    const today = new Date().toISOString().slice(0, 10)
    const tasks = plan.planTasks ?? []
    const overdue = tasks.filter((t) => !t.done && t.date < today)
    if (!overdue.length) return 0
    const keep = tasks
      .filter((t) => !t.done && t.date >= today)
      .map((t) => ({ date: t.date, time: t.time, title: t.title }))
    const { rescheduleOverdue } = await import('../studienplaner/ai')
    const moves = await rescheduleOverdue(
      kurs,
      overdue.map((t) => ({
        id: t.id,
        title: t.title,
        topic: t.topic,
        minutes: t.minutes,
        kind: t.kind
      })),
      keep,
      busyText,
      plan.examDateIso ?? null
    )
    if (!moves.length) return 0
    const byId = new Map(moves.map((m) => [m.id, m]))
    const nextTasks = tasks.map((t) => {
      const m = byId.get(t.id)
      return m ? { ...t, date: m.date, time: m.time ?? t.time } : t
    })
    await get().saveLernplan(semester, kurs, { ...plan, planTasks: nextTasks })
    // Verschobene Aufgaben, die schon im Kalender stehen, dort mitziehen.
    await pushTaskCalUpdates(
      kurs,
      nextTasks.filter((t) => byId.has(t.id) && t.calEventId)
    )
    return moves.length
  },

  pullCalendarMoves: async (calEvents) => {
    const tree = get().tree
    if (!tree) return 0
    // Kalender-Termine nach ihrer EventKit-ID (ohne Serien-Suffix „@ISO") ablegen.
    const byId = new Map<string, { start: string }>()
    for (const ev of calEvents) {
      const key = ev.id.includes('@') ? ev.id.slice(0, ev.id.indexOf('@')) : ev.id
      if (!byId.has(key)) byId.set(key, { start: ev.start })
    }
    const pad = (n: number): string => String(n).padStart(2, '0')
    const pairs = tree.semesters.flatMap((sem) =>
      sem.courses.map((c) => ({ semester: sem.name, kurs: c.name }))
    )
    const plans = await Promise.all(pairs.map((p) => get().loadLernplan(p.semester, p.kurs)))
    let changed = 0
    await Promise.all(
      pairs.map(async (p, i) => {
        const plan = plans[i]
        let touched = false
        const nextTasks = (plan.planTasks ?? []).map((t) => {
          if (!t.calEventId) return t
          const hit = byId.get(t.calEventId)
          if (!hit) return t
          const d = new Date(hit.start)
          if (Number.isNaN(d.getTime())) return t
          const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
          const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`
          if (date === t.date && time === taskTimeHHMM(t)) return t
          touched = true
          changed += 1
          return { ...t, date, time }
        })
        if (touched) await get().saveLernplan(p.semester, p.kurs, { ...plan, planTasks: nextTasks })
      })
    )
    return changed
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
  },

  getResults: () => Object.values(get().index.results ?? {}),

  saveTacticsAnalysis: async (text) => {
    const path = get().path
    if (!path) return
    const index = get().index
    const basis = Object.values(index.results ?? {}).filter((r) => fachGrade(r) !== null).length
    index.tactics = { text, at: new Date().toISOString(), basis }
    await saveIndex(path, index)
    set({ index: { ...index } })
  },

  setFachResult: async (semester, kurs, patch) => {
    const path = get().path
    if (!path) return
    const index = get().index
    const key = resultKey(semester, kurs)
    const prev: FachResult = index.results?.[key] ?? {
      semester: safeName(semester),
      kurs: safeName(kurs),
      components: []
    }
    // Nur wirklich gesetzte Felder übernehmen – `undefined` darf einen vorhandenen
    // Wert (z. B. ECTS aus dem Semester-Setup) nicht überschreiben.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined)
    ) as Partial<FachResult>
    index.results = {
      ...(index.results ?? {}),
      [key]: {
        ...prev,
        ...clean,
        semester: safeName(semester),
        kurs: safeName(kurs),
        components: clean.components ?? prev.components
      }
    }
    await saveIndex(path, index)
    set({ index: { ...index } })
  },

  saveExamResult: async (semester, kurs, input) => {
    const path = get().path
    if (!path) return
    set({ busy: 'Ergebnis wird gespeichert …' })
    try {
      // Schnappschuss der Lern-Vorbereitung (geplant/erledigt, Quiz-Quote).
      const plan = await get().loadLernplan(semester, kurs)
      const { analyzeProgress } = await import('../studienplaner/prep')
      const perf = analyzeProgress(plan)
      const tasks = plan.planTasks ?? []
      const prep = {
        plannedTasks: tasks.length,
        doneTasks: tasks.filter((t) => t.done).length,
        quizAccuracy: perf.overallTotal > 0 ? perf.overallAccuracy : null,
        examDateIso: plan.examDateIso ?? null
      }
      await get().setFachResult(semester, kurs, {
        components: input.components,
        ects: input.ects,
        prep,
        ...(input.archive ? { archivedAt: new Date().toISOString() } : {})
      })
      if (input.archive) {
        await moveCourseToArchive(path, semester, kurs).catch((err) =>
          console.warn('Archivieren nach Ergebnis fehlgeschlagen:', err)
        )
        const index = get().index
        for (const [k, e] of Object.entries(index.exams ?? {})) {
          if (safeName(e.semester) === safeName(semester) && safeName(e.kurs) === safeName(kurs)) {
            delete index.exams?.[k]
          }
        }
        await saveIndex(path, index)
        set({ index: { ...index } })
        await get().refresh()
      }
      toast.success('Ergebnis gespeichert.')
    } catch (err) {
      toast.error(`Ergebnis speichern fehlgeschlagen: ${err instanceof Error ? err.message : err}`)
    } finally {
      set({ busy: null })
    }
  }
}))
