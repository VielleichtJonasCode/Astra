import { nanoid } from 'nanoid'
import type { IndexData, IndexExam } from './model'
import { safeName } from './model'
import { joinPath } from './paths'

export type ExamLink = IndexExam

/** Unterordner je Fach, in dem der Lernplan des Fachs liegt. */
export const PREP_DIR = 'Prüfungsvorbereitung'
/** Dateiname des Lernplans eines Fachs (Plan + Quizze + Fortschritt, synct über iCloud). */
export const PLAN_FILE = 'lernplan.json'
/** Alter Name – wird beim Laden noch akzeptiert. */
export const LEGACY_PLAN_FILE = 'lernpaket.json'

/** Material-Eintrag (Video-/Web-Link) eines Fachs. */
export interface LernResource {
  id: string
  title: string
  url: string
}

export interface QuizItem {
  id: string
  question: string
  /** Multiple-Choice-Optionen (mind. 2). */
  choices: string[]
  /** Index der richtigen Option in `choices`. */
  answer: number
  explanation: string
  /** Grobes Thema der Frage (für Fortschritt je Thema). */
  topic?: string
}

/** Eine Nachricht im „Fragen"-Dialog eines Fachs (Nutzerfrage oder KI-Antwort). */
export interface ChatMessage {
  /** Stabile ID – für den iCloud-Merge (Handy ↔ Mac). */
  id: string
  role: 'user' | 'model'
  text: string
  /** ISO-Zeitpunkt – Sortierung und Merge. */
  at: string
}

/** So viele Dialog-Nachrichten je Fach werden aufbewahrt (älteste fallen weg). */
export const CHAT_LIMIT = 40

/** Auf die jüngsten `CHAT_LIMIT` Nachrichten kürzen. */
export function trimChat(list: ChatMessage[]): ChatMessage[] {
  return list.length > CHAT_LIMIT ? list.slice(list.length - CHAT_LIMIT) : list
}

/**
 * Den Q&A-Verlauf zweier Geräte vereinen: nach `id` zusammenführen (bei Kollision
 * gewinnt der neuere Zeitstempel), nach Zeitstempel sortiert, auf `CHAT_LIMIT`
 * gekürzt. Bei gleichem Zeitstempel bleibt die Eingangsreihenfolge erhalten
 * (Frage-vor-Antwort), weil ein Q/A-Paar immer auf demselben Gerät entsteht und
 * `Array.prototype.sort` stabil ist.
 */
export function mergeChat(a?: ChatMessage[] | null, b?: ChatMessage[] | null): ChatMessage[] {
  const byId = new Map<string, ChatMessage>()
  for (const m of [...(a ?? []), ...(b ?? [])]) {
    if (!m || !m.id || (m.role !== 'user' && m.role !== 'model')) continue
    const prev = byId.get(m.id)
    if (!prev || String(m.at) > String(prev.at)) byId.set(m.id, m)
  }
  return trimChat([...byId.values()].sort((x, y) => String(x.at).localeCompare(String(y.at))))
}

export interface QuizProgress {
  /** Anzahl Antworten. */
  seen: number
  /** davon richtig. */
  correct: number
  /** letzte Antwort korrekt? */
  lastCorrect: boolean
  updated: string
}

export interface Quiz {
  id: string
  name: string
  created: string
  items: QuizItem[]
}

/** Ein Lernplan-Punkt: Tagesaufgabe zum Abhaken und (optional) für den Kalender. */
export interface PlanTask {
  /** Stabile ID – fürs Abhaken und den iCloud-Merge. */
  id: string
  /** YYYY-MM-DD. */
  date: string
  /** Uhrzeit HH:MM (Standard 16:00, wenn leer). */
  time?: string
  title: string
  topic: string
  minutes: number
  /** Art: neu lernen · wiederholen · Quiz. */
  kind?: 'lernen' | 'wiederholen' | 'quiz'
  /** Vom Nutzer abgehakt. */
  done?: boolean
  /** ISO-Zeitpunkt der letzten Abhak-Änderung – für den iCloud-Merge (Handy ↔ Mac). */
  doneAt?: string
  /** Vom Nutzer selbst angelegt (nicht von der KI). */
  manual?: boolean
  /** Freitext-Notiz zur Aufgabe. */
  note?: string
  /** Verknüpfte Notizen (relPath im Studienordner). */
  attachments?: string[]
  /** Eigenes Ergebnis: wie viele Aufgaben/Fragen richtig von wie vielen. */
  score?: { correct: number; total: number }
  /** EventKit-ID des Kalendertermins für diese Aufgabe (für die Zwei-Wege-Sync). */
  calEventId?: string
}

/** Richtig-Anteil (0…1) eines Aufgaben-Ergebnisses, oder null wenn nichts erfasst. */
export function taskScorePct(score?: { correct: number; total: number } | null): number | null {
  if (!score || !(score.total > 0)) return null
  return Math.max(0, Math.min(1, score.correct / score.total))
}

/**
 * Beim Übernehmen eines überarbeiteten Lernplan-Entwurfs den Erledigt-Status
 * (und ein erfasstes Ergebnis) der alten Aufgaben per Titel auf die neuen
 * übertragen – damit bereits geschaffter Fortschritt nicht verloren geht.
 */
export function carryDoneByTitle(prev: PlanTask[], next: PlanTask[]): PlanTask[] {
  const norm = (s: string): string => s.trim().toLowerCase()
  const done = new Map<string, { doneAt?: string; score?: PlanTask['score'] }>()
  for (const t of prev) {
    if (t.done) done.set(norm(t.title), { doneAt: t.doneAt, score: t.score })
  }
  return next.map((t) => {
    const c = done.get(norm(t.title))
    return c ? { ...t, done: true, doneAt: c.doneAt, ...(c.score ? { score: c.score } : {}) } : t
  })
}

/** Uhrzeit einer Aufgabe als sauberes „HH:MM" (Standard 16:00 bei leerer/kaputter Angabe). */
export function taskTimeHHMM(t: Pick<PlanTask, 'time'>): string {
  const raw = (t.time ?? '').trim()
  return /^\d{1,2}:\d{2}$/.test(raw) ? raw.padStart(5, '0') : '16:00'
}

/** Start-Zeitpunkt (ms) einer Aufgabe in Ortszeit; `NaN`-sicher. */
export function taskStartMs(t: Pick<PlanTask, 'date' | 'time'>): number {
  const ms = new Date(`${t.date}T${taskTimeHHMM(t)}:00`).getTime()
  return Number.isNaN(ms) ? 0 : ms
}

/** Kalender-Termin-Nutzlast einer Lernplan-Aufgabe (Titel „📚 …", Zeitfenster, Notiz). */
export function taskCalendarEvent(
  kursName: string,
  t: PlanTask
): { title: string; start: string; end: string; notes: string } {
  const start = taskStartMs(t) || Date.now()
  const mins = Number.isFinite(t.minutes) && t.minutes > 0 ? t.minutes : 60
  return {
    title: `📚 ${t.title}`,
    start: new Date(start).toISOString(),
    end: new Date(start + mins * 60000).toISOString(),
    notes: `Lernplan „${kursName}"${t.topic ? ` · ${t.topic}` : ''}`
  }
}

/**
 * Der Lernplan EINES Fachs: von Gemini adaptiv gestaltet, bündelt
 * Zusammenfassung, den Plan (Text + Kalender-Aufgaben), mehrere Quizze,
 * Material-Links und den Fortschritt. Optional an eine Kalender-Prüfung gekoppelt.
 * Pro Fach gibt es genau einen; die zentrale „Lernplan“-Übersicht listet alle.
 */
export interface Lernplan {
  v: 2
  id: string
  /** Anzeigename (= Kursname). */
  name: string
  semester: string
  kurs: string
  /** Optionale Verknüpfung mit einer Kalender-Prüfung. */
  examKey?: string | null
  examTitle?: string | null
  examDateIso?: string | null
  summary: string
  /** Der Plan als Markdown. */
  plan: string
  /** Strukturierte Aufgaben (für den Kalender). */
  planTasks?: PlanTask[]
  /** Wurde in den Kalender eingetragen. */
  plannedAt?: string | null
  /** Quizze dieses Lernplans. */
  quizzes: Quiz[]
  /** „Fragen"-Dialog zu diesem Fach (bleibt erhalten, synct über iCloud). */
  chat?: ChatMessage[]
  /** Fortschritt je Frage-ID (über alle Quizze des Plans). */
  progress: Record<string, QuizProgress>
  /** Material: Video-/Web-Links. */
  resources?: LernResource[]
  /** Ausgewählte Quell-Notizen (relPath) für die KI; leer/fehlt = alle mit Text. */
  sources?: string[]
  /** KI darf den Kalender einbeziehen (freie/volle Tage). */
  useCalendar?: boolean
  created: string
  /** Zuletzt geändert (ISO) – „wer zuletzt speichert, gewinnt“. */
  updated: string
}

/** Leichte Übersicht je Fach für die zentrale „Lernplan“-Seite. */
export interface LernplanMeta {
  semester: string
  kurs: string
  examTitle?: string | null
  examDateIso?: string | null
  quizCount: number
  questionCount: number
  answered: number
  /** 0…1 – Anteil „sicher“ beantworteter Fragen. */
  progress: number
  /** 0…1 – Gesamt-Trefferquote (Quiz + eigene Aufgaben-Ergebnisse). */
  correctRate: number
  /** Anzahl bewerteter Einheiten (Quiz-Antworten + Aufgaben mit Ergebnis). */
  gradedCount: number
  /** Davon richtig. */
  correctCount: number
  hasSummary: boolean
  hasPlan: boolean
  resourceCount: number
  /** Aufgaben im Tagesplan gesamt / davon abgehakt. */
  taskTotal: number
  taskDone: number
  /** Titel der nächsten offenen Aufgabe (für die Übersicht). */
  nextTask?: string | null
  plannedAt?: string | null
  /** Gibt es überhaupt schon eine gespeicherte Lernplan-Datei? */
  exists: boolean
  updated: string
}

/** „Klausur Analysis II“ + 2026-02-10 → stabiler Schlüssel. */
export function examKeyOf(title: string, dateIso: string | null): string {
  const norm = title
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9]+/gi, ' ')
    .trim()
  const day = dateIso ? new Date(dateIso).toISOString().slice(0, 10) : 'ohne-datum'
  return `${norm}|${day}`
}

/** Ordner „…/Prüfungsvorbereitung“ eines Fachs. */
export function coursePrepPath(root: string, semester: string, kurs: string): string {
  return joinPath(root, safeName(semester), safeName(kurs), PREP_DIR)
}
/** Lernplan-Datei eines Fachs (direkt im Prüfungsvorbereitung-Ordner). */
export function courseLernplanFile(root: string, semester: string, kurs: string): string {
  return joinPath(coursePrepPath(root, semester, kurs), PLAN_FILE)
}

export function emptyLernplan(semester: string, kurs: string): Lernplan {
  const now = new Date().toISOString()
  return {
    v: 2,
    id: nanoid(8),
    name: kurs,
    semester,
    kurs,
    examKey: null,
    examTitle: null,
    examDateIso: null,
    summary: '',
    plan: '',
    planTasks: [],
    plannedAt: null,
    quizzes: [],
    chat: [],
    progress: {},
    created: now,
    updated: now
  }
}

/** Liest einen Lernplan – akzeptiert auch das alte v1-„lernpaket“-Format. */
export function parseLernplan(raw: string | null, fallbackName = 'Lernplan'): Lernplan | null {
  if (!raw) return null
  let p: Record<string, unknown>
  try {
    p = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  if (!p || (p.v !== 1 && p.v !== 2)) return null

  // v1 → v2
  const quizzes = Array.isArray(p.quizzes)
    ? (p.quizzes as Quiz[])
    : Array.isArray((p as { quiz?: QuizItem[] }).quiz) && (p as { quiz: QuizItem[] }).quiz.length
      ? [
          {
            id: 'q1',
            name: 'Quiz 1',
            created: String(p.updated ?? new Date().toISOString()),
            items: (p as { quiz: QuizItem[] }).quiz
          }
        ]
      : []
  const now = new Date().toISOString()
  return {
    v: 2,
    id: typeof p.id === 'string' ? p.id : nanoid(8),
    name: typeof p.name === 'string' && p.name ? p.name : String(p.examTitle ?? fallbackName),
    semester: String(p.semester ?? ''),
    kurs: String(p.kurs ?? ''),
    examKey: (p.examKey as string) ?? null,
    examTitle: (p.examTitle as string) ?? null,
    examDateIso: (p.examDateIso as string) ?? null,
    summary: String(p.summary ?? ''),
    plan: String(p.plan ?? ''),
    planTasks: Array.isArray(p.planTasks)
      ? (p.planTasks as Partial<PlanTask>[]).map((t, i) => ({
          id: typeof t.id === 'string' && t.id ? t.id : `t${i}-${nanoid(4)}`,
          date: String(t.date ?? ''),
          time: typeof t.time === 'string' ? t.time : undefined,
          title: String(t.title ?? ''),
          topic: String(t.topic ?? ''),
          minutes: Number(t.minutes) || 60,
          kind: t.kind,
          done: Boolean(t.done),
          doneAt: typeof t.doneAt === 'string' ? t.doneAt : undefined,
          manual: Boolean(t.manual),
          note: typeof t.note === 'string' ? t.note : undefined,
          attachments: Array.isArray(t.attachments)
            ? (t.attachments as unknown[]).filter((x): x is string => typeof x === 'string')
            : undefined,
          score:
            t.score && Number(t.score.total) > 0
              ? {
                  correct: Math.max(
                    0,
                    Math.min(Number(t.score.total), Math.round(Number(t.score.correct) || 0))
                  ),
                  total: Math.round(Number(t.score.total))
                }
              : undefined,
          calEventId: typeof t.calEventId === 'string' && t.calEventId ? t.calEventId : undefined
        }))
      : [],
    plannedAt: (p.plannedAt as string) ?? null,
    quizzes,
    chat: Array.isArray(p.chat)
      ? (p.chat as Partial<ChatMessage>[])
          .filter(
            (m) => m && (m.role === 'user' || m.role === 'model') && typeof m.text === 'string'
          )
          .map((m, i) => ({
            id: typeof m.id === 'string' && m.id ? m.id : `m${i}-${nanoid(4)}`,
            role: m.role as 'user' | 'model',
            text: String(m.text),
            at: typeof m.at === 'string' && m.at ? m.at : now
          }))
      : [],
    progress: (p.progress as Record<string, QuizProgress>) ?? {},
    resources: Array.isArray(p.resources)
      ? (p.resources as LernResource[]).filter((r) => r && r.url)
      : undefined,
    sources: Array.isArray(p.sources) ? (p.sources as string[]) : undefined,
    useCalendar: Boolean(p.useCalendar),
    created: String(p.created ?? p.updated ?? now),
    updated: String(p.updated ?? now)
  }
}

/** Baut die leichte Übersicht eines Fachs aus dem (evtl. fehlenden) Lernplan. */
export function lernplanMeta(semester: string, kurs: string, plan: Lernplan | null): LernplanMeta {
  if (!plan) {
    return {
      semester,
      kurs,
      quizCount: 0,
      questionCount: 0,
      answered: 0,
      progress: 0,
      correctRate: 0,
      gradedCount: 0,
      correctCount: 0,
      hasSummary: false,
      hasPlan: false,
      resourceCount: 0,
      taskTotal: 0,
      taskDone: 0,
      nextTask: null,
      exists: false,
      updated: ''
    }
  }
  const perf = analyzeProgress(plan)
  const tasks = plan.planTasks ?? []
  const open = tasks
    .filter((t) => !t.done)
    .sort((a, b) => (a.date === b.date ? 0 : a.date.localeCompare(b.date)))
  return {
    semester,
    kurs,
    examTitle: plan.examTitle ?? null,
    examDateIso: plan.examDateIso ?? null,
    quizCount: plan.quizzes.length,
    questionCount: perf.total,
    answered: perf.answered,
    progress: perf.answered > 0 ? perf.correct / Math.max(perf.total, perf.answered) : 0,
    correctRate: perf.overallAccuracy,
    gradedCount: perf.overallTotal,
    correctCount: perf.overallCorrect,
    hasSummary: Boolean(plan.summary.trim()),
    hasPlan: Boolean(plan.plan.trim()),
    resourceCount: plan.resources?.length ?? 0,
    taskTotal: tasks.length,
    taskDone: tasks.filter((t) => t.done).length,
    nextTask: open[0]?.title ?? null,
    plannedAt: plan.plannedAt ?? null,
    exists: true,
    updated: plan.updated
  }
}

/** Fortschritt aus `b` in `a` übernehmen, wenn `b` neuer ist (Handy ↔ Mac). */
export function mergeProgress(a: Lernplan, b: Lernplan): Lernplan {
  if (!b) return a
  const bNewer = new Date(b.updated).getTime() > new Date(a.updated).getTime()
  const base = bNewer ? b : a
  const other = bNewer ? a : b
  const progress: Record<string, QuizProgress> = { ...other.progress }
  for (const [id, p] of Object.entries(base.progress)) {
    const prev = progress[id]
    progress[id] = !prev || new Date(p.updated) >= new Date(prev.updated) ? p : prev
  }
  // Abhak-Status je Aufgabe zusammenführen: mit Zeitstempel gewinnt die neuere
  // Änderung (echtes „last write wins", auch fürs Abwählen); ohne Zeitstempel
  // (Altdaten) gilt „erledigt gewinnt", damit ein Haken nicht verloren geht.
  const doneOf = new Map<string, { done: boolean; at: string }>()
  const consider = (t: PlanTask): void => {
    if (!t.id) return
    const at = t.doneAt ?? ''
    const cur = doneOf.get(t.id)
    if (!cur) {
      doneOf.set(t.id, { done: Boolean(t.done), at })
      return
    }
    if (at && cur.at) {
      if (at >= cur.at) doneOf.set(t.id, { done: Boolean(t.done), at })
    } else if (at && !cur.at) {
      doneOf.set(t.id, { done: Boolean(t.done), at }) // Zeitstempel schlägt zeitlos
    } else if (!at && !cur.at && t.done) {
      doneOf.set(t.id, { done: true, at: '' }) // beide zeitlos: Haken gewinnt
    }
  }
  for (const t of a.planTasks ?? []) consider(t)
  for (const t of b.planTasks ?? []) consider(t)
  // Kalender-Verknüpfung nie verlieren: das Handy kennt `calEventId` nicht, also
  // aus der jeweils anderen Seite übernehmen, wenn `base` sie nicht hat.
  const calIdOf = new Map<string, string>()
  for (const t of other.planTasks ?? []) if (t.id && t.calEventId) calIdOf.set(t.id, t.calEventId)
  const planTasks = (base.planTasks ?? []).map((t) => {
    const s = doneOf.get(t.id)
    const calEventId = t.calEventId ?? calIdOf.get(t.id)
    const doneChanged = s && !(s.done === Boolean(t.done) && (!s.at || s.at === (t.doneAt ?? '')))
    if (!doneChanged && calEventId === t.calEventId) return t
    return {
      ...t,
      calEventId,
      ...(doneChanged ? { done: s!.done, doneAt: s!.at || t.doneAt } : {})
    }
  })
  // Der „Fragen"-Dialog wird nach id vereint, damit keine Frage/Antwort verloren
  // geht, egal auf welchem Gerät sie gestellt wurde.
  const chat = mergeChat(a.chat, b.chat)
  return { ...base, progress, planTasks, chat }
}

export function getExamLink(index: IndexData, examKey: string): ExamLink | null {
  return index.exams?.[examKey] ?? null
}

/** Endungen, aus denen Apple Vision bei Bedarf noch Text ziehen kann. */
export const OCRABLE_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'])

export function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? ''
}

export interface CourseNote {
  relPath: string
  thema: string
  /** Dateiname (letztes Pfadsegment). */
  name: string
  /** Hat bereits erkannten Text. */
  hasText: boolean
  /** Bild/PDF ohne Text – kann vor einer KI-Anfrage per Apple Vision erkannt werden. */
  ocrable: boolean
}

/** Alle Notizen eines Kurses (für die Quellen-Auswahl). */
export function courseNoteList(index: IndexData, semester: string, kurs: string): CourseNote[] {
  const wanted = `${safeName(semester)}/${safeName(kurs)}/`
  return Object.values(index.entries)
    .filter((e) => e.relPath.startsWith(wanted))
    .map((e) => {
      const name = e.relPath.split('/').pop() ?? e.relPath
      const hasText = Boolean(e.text.trim())
      return {
        relPath: e.relPath,
        thema: e.thema,
        name,
        hasText,
        ocrable: !hasText && OCRABLE_EXT.has(extOf(name))
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

/**
 * Sammelt den erkannten Text der (ausgewählten) Notizen eines Kurses für die KI.
 * `only` = Menge von relPaths; leer/weggelassen = alle Notizen des Kurses mit Text.
 */
export function courseNotesText(
  index: IndexData,
  semester: string,
  kurs: string,
  only?: Iterable<string> | null,
  maxChars = 22000
): string {
  const wanted = `${safeName(semester)}/${safeName(kurs)}/`
  const set = only == null ? null : new Set(only)
  const parts: string[] = []
  let total = 0
  for (const e of Object.values(index.entries)) {
    if (!e.relPath.startsWith(wanted) || !e.text.trim()) continue
    if (set && !set.has(e.relPath)) continue
    const block = `## ${e.thema}\n${e.text.trim()}\n`
    if (total + block.length > maxChars) break
    parts.push(block)
    total += block.length
  }
  return parts.join('\n')
}

/* ── Leistungs-Auswertung (für adaptive Lernpläne & Wiederholung) ──────── */

export interface TopicPerf {
  topic: string
  /** beantwortete Fragen dieses Themas. */
  seen: number
  correct: number
  /** correct / seen (0…1); 0 wenn noch nichts beantwortet. */
  accuracy: number
  /** 0…1 – Sicherheit: berücksichtigt auch, wie oft schon geübt wurde. */
  mastery: number
  /** Schwaches Thema (mastery < 0.6 bei mind. 2 Antworten). */
  weak: boolean
}

export interface PerfSummary {
  /** Fragen insgesamt (über alle Quizze). */
  total: number
  answered: number
  correct: number
  /** Quiz-Trefferquote (0…1). */
  accuracy: number
  byTopic: TopicPerf[]
  /** IDs der wackeligen Fragen (falsch beim letzten Mal oder < 50 % richtig). */
  weakItemIds: string[]
  /** Es gibt genug Daten für adaptive Vorschläge. */
  hasData: boolean
  /** Aus den eigenen Aufgaben-Ergebnissen: richtig / gesamt / Anzahl bewerteter Aufgaben. */
  taskCorrect: number
  taskTotal: number
  taskScored: number
  /** Quiz + Aufgaben-Ergebnisse zusammen. */
  overallCorrect: number
  overallTotal: number
  /** Gesamt-Trefferquote (0…1). */
  overallAccuracy: number
  /** Gesamt-Fehlerquote (0…1). */
  wrongPct: number
}

/** Wertet den Quiz-Fortschritt eines Lernpakets aus. */
export function analyzeProgress(pack: Lernplan): PerfSummary {
  const items = pack.quizzes.flatMap((q) => q.items)
  const total = items.length
  let answered = 0
  let correct = 0
  const topics = new Map<string, { seen: number; correct: number }>()
  const weakItemIds: string[] = []

  for (const it of items) {
    const p = pack.progress[it.id]
    const topic = (it.topic || 'Allgemein').trim() || 'Allgemein'
    if (!topics.has(topic)) topics.set(topic, { seen: 0, correct: 0 })
    if (p) {
      answered += 1
      const ok = p.correct > 0 && p.lastCorrect
      if (ok) correct += 1
      const t = topics.get(topic)!
      t.seen += 1
      if (ok) t.correct += 1
      const acc = p.seen > 0 ? p.correct / p.seen : 0
      if (!p.lastCorrect || acc < 0.5) weakItemIds.push(it.id)
    }
  }

  const byTopic: TopicPerf[] = [...topics.entries()]
    .map(([topic, t]) => {
      const accuracy = t.seen > 0 ? t.correct / t.seen : 0
      const mastery = Math.round(Math.min(1, (t.seen / 3) * accuracy + accuracy * 0.34) * 100) / 100
      return {
        topic,
        seen: t.seen,
        correct: t.correct,
        accuracy,
        mastery,
        weak: t.seen >= 2 && mastery < 0.6
      }
    })
    .sort((a, b) => a.mastery - b.mastery)

  // Eigene Aufgaben-Ergebnisse dazurechnen.
  let taskCorrect = 0
  let taskTotal = 0
  let taskScored = 0
  for (const t of pack.planTasks ?? []) {
    if (t.score && t.score.total > 0) {
      taskScored += 1
      taskCorrect += Math.max(0, Math.min(t.score.total, t.score.correct))
      taskTotal += t.score.total
    }
  }

  const overallCorrect = correct + taskCorrect
  const overallTotal = answered + taskTotal
  const overallAccuracy = overallTotal > 0 ? overallCorrect / overallTotal : 0

  return {
    total,
    answered,
    correct,
    accuracy: answered > 0 ? correct / answered : 0,
    byTopic,
    weakItemIds,
    hasData: answered >= 3,
    taskCorrect,
    taskTotal,
    taskScored,
    overallCorrect,
    overallTotal,
    overallAccuracy,
    wrongPct: overallTotal > 0 ? 1 - overallAccuracy : 0
  }
}

/** Formatiert die Leistung als Kontext für die KI. */
export function perfPromptText(perf: PerfSummary, weakQuestions: string[] = []): string {
  if (!perf.hasData && perf.taskScored === 0) return ''
  const lines: string[] = []
  if (perf.overallTotal > 0) {
    lines.push(
      `Gesamt-Trefferquote: ${Math.round(perf.overallAccuracy * 100)} % richtig ` +
        `(${Math.round(perf.wrongPct * 100)} % falsch), ${perf.overallCorrect}/${perf.overallTotal} korrekt.`
    )
  }
  if (perf.answered > 0) {
    lines.push(
      `Quiz: ${perf.answered}/${perf.total} beantwortet, ${Math.round(perf.accuracy * 100)} % richtig.`
    )
  }
  if (perf.taskScored > 0) {
    lines.push(`Eigene Aufgaben-Ergebnisse: ${perf.taskCorrect}/${perf.taskTotal} richtig.`)
  }
  if (perf.byTopic.some((t) => t.seen > 0)) {
    lines.push('Themen (Sicherheit):')
    for (const t of perf.byTopic) {
      if (t.seen === 0) continue
      lines.push(
        `- ${t.topic}: ${Math.round(t.mastery * 100)} %${t.weak ? ' (SCHWACH – mehr Zeit + Wiederholung einplanen)' : ''}`
      )
    }
  }
  if (weakQuestions.length) {
    lines.push('Wackelige Fragen:', ...weakQuestions.slice(0, 15).map((q) => `- ${q}`))
  }
  return lines.join('\n')
}

/** Baut aus den wackeligen Fragen ein Übungs-Quiz. */
export function weakQuiz(pack: Lernplan, ids: string[]): Quiz {
  const set = new Set(ids)
  const items = pack.quizzes.flatMap((q) => q.items).filter((it) => set.has(it.id))
  return { id: 'weak', name: 'Wackelige Fragen', created: new Date().toISOString(), items }
}

/** Trefferquote eines einzelnen Quiz: beantwortete Fragen, davon richtig, in %. */
export function quizStats(
  pack: Lernplan,
  quiz: Quiz
): { answered: number; total: number; correct: number; pct: number | null } {
  let answered = 0
  let correct = 0
  for (const it of quiz.items) {
    const p = pack.progress[it.id]
    if (!p) continue
    answered += 1
    if (p.correct > 0 && p.lastCorrect) correct += 1
  }
  return {
    answered,
    total: quiz.items.length,
    correct,
    pct: answered > 0 ? correct / answered : null
  }
}
