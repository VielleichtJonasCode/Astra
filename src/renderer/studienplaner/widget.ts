import type { FachResult, IndexExam } from './model'
import { buildTacticsDigest, gradeLabel, overallGpa, semesterGpa } from './grades'
import { semesterSortKey } from './calendar'

/**
 * Datenschnappschuss für die macOS-Widgets. Der Renderer baut ihn aus den
 * Studienplaner-Daten (`widgetSync.ts`), der Hauptprozess schreibt ihn als JSON
 * in den App-Group-Container, aus dem die WidgetKit-Erweiterung liest.
 * Bewusst klein und flach gehalten – Widgets rendern nur Kerninfos.
 */
export interface WidgetSnapshot {
  v: 1
  updatedIso: string
  configured: boolean
  studienordner: string | null

  /** ECTS-gewichteter Gesamtschnitt (1,0–5,0) oder null. */
  gpa: number | null
  gpaLabel: string
  credits: number
  countedFaecher: number
  missingEctsFaecher: number

  /** Nächste anstehende Klausur/Prüfung. */
  nextExam: { title: string; kurs: string; dateIso: string; daysLeft: number } | null

  /** Heute. */
  dateLabel: string
  today: {
    tasks: {
      id: string
      semester: string
      kurs: string
      title: string
      time: string
      minutes: number
      kind: 'lernen' | 'wiederholen' | 'quiz'
      done: boolean
    }[]
    events: { time: string; title: string }[]
    openCount: number
  }

  /** Fortschritt über alle Fächer. */
  overdueCount: number
  quizAccuracy: number | null
  plannedTasksTotal: number
  doneTasksTotal: number

  /** Notenverlauf je Semester (chronologisch, älteste zuerst). */
  gradeTrend: { label: string; gpa: number | null; credits: number }[]
  currentSemesterLabel: string | null
  currentSemesterGpaLabel: string

  /** Letzte KI-Lernstrategie in Kurzform. */
  tip: string | null
  tipDateIso: string | null

  /** Interner Kurz-Digest der Ergebnisse (Debug / künftige Widgets). */
  resultsDigest: string
}

export interface WidgetInputs {
  configured: boolean
  studienordner: string | null
  now: Date
  results: FachResult[]
  exams: IndexExam[]
  tactics: { text: string; at: string } | null
  metas: {
    semester: string
    kurs: string
    taskTotal: number
    taskDone: number
    correctRate: number
    gradedCount: number
  }[]
  todayTasks: {
    semester: string
    kurs: string
    id: string
    title: string
    time?: string
    minutes?: number
    kind?: 'lernen' | 'wiederholen' | 'quiz'
    done: boolean
  }[]
  todayEvents: { time: string; title: string }[]
  /** Anzahl überfälliger, offener Lern-Aufgaben (aus dem Store). */
  overdueCount: number
}

const DAY = 86_400_000

type TaskKind = 'lernen' | 'wiederholen' | 'quiz'
function taskKind(k: unknown): TaskKind {
  return k === 'wiederholen' || k === 'quiz' ? k : 'lernen'
}

/** Ganze Tage von `now` bis `iso` (heute = 0, morgen = 1, gestern = -1). */
export function daysBetween(now: Date, iso: string): number {
  const a = new Date(now)
  a.setHours(0, 0, 0, 0)
  const b = new Date(iso)
  b.setHours(0, 0, 0, 0)
  return Math.round((b.getTime() - a.getTime()) / DAY)
}

/**
 * Kürzt die KI-Lernauswertung auf einen einzelnen umsetzbaren Satz für die
 * Widget-Kachel: bevorzugt den ersten Punkt aus „Konkret ändern", sonst aus
 * „Woran es hakt", sonst die erste Prosa-Zeile. Auf `max` Zeichen gekappt.
 */
export function shortTip(text: string, max = 240): string {
  const lines = text.split('\n').map((l) => l.trim())
  const isHeading = (l: string): boolean => /^#{1,6}\s/.test(l)
  const strip = (l: string): string => l.replace(/^(#{1,6}\s+|[-*]\s+|\d+\.\s+)/, '').trim()
  const cap = (s: string): string => {
    const flat = s.replace(/\s+/g, ' ').trim()
    return flat.length > max ? flat.slice(0, max - 1).trimEnd() + '…' : flat
  }

  let start = lines.findIndex((l) => isHeading(l) && /(konkret|ändern|nächst|schritt)/i.test(l))
  if (start === -1) start = lines.findIndex((l) => isHeading(l) && /(hakt|verbesser)/i.test(l))
  if (start < 0) start = -1

  for (let i = start + 1; i < lines.length; i++) {
    if (isHeading(lines[i])) break
    const body = strip(lines[i])
    if (body.length > 1) return cap(body)
  }
  return cap(text.replace(/[#*_`>]/g, ' '))
}

export function buildWidgetSnapshot(inp: WidgetInputs): WidgetSnapshot {
  const nowIso = inp.now.toISOString()
  const overall = overallGpa(inp.results)

  // Nächste Klausur: frühester Termin >= heute.
  const todayKey = nowIso.slice(0, 10)
  const nextExam =
    inp.exams
      .filter((e) => e.dateIso && e.dateIso.slice(0, 10) >= todayKey)
      .sort((a, b) => String(a.dateIso).localeCompare(String(b.dateIso)))
      .map((e) => ({
        title: e.title,
        kurs: e.kurs,
        dateIso: e.dateIso as string,
        daysLeft: daysBetween(inp.now, e.dateIso as string)
      }))[0] ?? null

  // Semester chronologisch (aus Ergebnissen + Metas).
  const semNames = [
    ...new Set([...inp.results.map((r) => r.semester), ...inp.metas.map((m) => m.semester)])
  ].sort((a, b) => semesterSortKey(a) - semesterSortKey(b) || a.localeCompare(b))
  const gradeTrend = semNames
    .map((s) => {
      const g = semesterGpa(inp.results, s)
      return { label: s, gpa: g.gpa, credits: g.credits }
    })
    .filter((row) => row.gpa !== null)
    .slice(-6)

  const currentSemesterLabel = semNames.length ? semNames[semNames.length - 1] : null
  const currentSemesterGpaLabel = currentSemesterLabel
    ? gradeLabel(semesterGpa(inp.results, currentSemesterLabel).gpa)
    : '–'

  // Quiz-/Aufgaben-Summen über alle Fächer.
  let plannedTasksTotal = 0
  let doneTasksTotal = 0
  let gradedSum = 0
  let correctWeighted = 0
  for (const m of inp.metas) {
    plannedTasksTotal += m.taskTotal
    doneTasksTotal += m.taskDone
    if (m.gradedCount > 0) {
      gradedSum += m.gradedCount
      correctWeighted += m.correctRate * m.gradedCount
    }
  }
  const quizAccuracy = gradedSum > 0 ? correctWeighted / gradedSum : null

  const tasks = inp.todayTasks.slice(0, 8).map((t) => ({
    id: t.id,
    semester: t.semester,
    kurs: t.kurs,
    title: t.title,
    time: /^\d{1,2}:\d{2}$/.test((t.time ?? '').trim()) ? (t.time as string).padStart(5, '0') : '',
    minutes: Number.isFinite(t.minutes) && (t.minutes as number) > 0 ? (t.minutes as number) : 0,
    kind: taskKind(t.kind),
    done: Boolean(t.done)
  }))

  return {
    v: 1,
    updatedIso: nowIso,
    configured: inp.configured,
    studienordner: inp.studienordner,

    gpa: overall.gpa,
    gpaLabel: gradeLabel(overall.gpa),
    credits: overall.credits,
    countedFaecher: overall.counted,
    missingEctsFaecher: overall.missingEcts.length,

    nextExam,

    dateLabel: inp.now.toLocaleDateString('de-DE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long'
    }),
    today: {
      tasks,
      events: inp.todayEvents.slice(0, 6),
      openCount: tasks.filter((t) => !t.done).length
    },

    overdueCount: Math.max(0, Math.round(inp.overdueCount)),
    quizAccuracy,
    plannedTasksTotal,
    doneTasksTotal,

    gradeTrend,
    currentSemesterLabel,
    currentSemesterGpaLabel,

    tip: inp.tactics ? shortTip(inp.tactics.text) : null,
    tipDateIso: inp.tactics ? inp.tactics.at : null,

    resultsDigest: buildTacticsDigest(inp.results).slice(0, 1200)
  }
}
