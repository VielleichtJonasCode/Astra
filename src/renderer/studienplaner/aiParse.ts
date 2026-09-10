import { nanoid } from 'nanoid'
import type { PlanTask, QuizItem } from './prep'

/**
 * Reine Parser für Gemini-Antworten – ohne Netzwerk/`window.api`, damit sie im
 * Selbsttest hart geprüft werden können. Gemini bekommt zwar
 * `responseMimeType: application/json`, liefert aber gelegentlich trotzdem
 * ```json-Zäune, Vor-/Nachtext oder abgeschnittenes JSON – all das wird hier
 * abgefangen, statt das ganze Feature scheitern zu lassen.
 */

/** Zieht das erste balancierte {…} oder […] aus einem Text (für Vor-/Nachgeplapper). */
function firstJsonBlock(s: string): string | null {
  const start = s.search(/[[{]/)
  if (start < 0) return null
  const open = s[start]
  const close = open === '{' ? '}' : ']'
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
      continue
    }
    if (ch === '"') inStr = true
    else if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

/** JSON.parse mit Toleranz für ```-Zäune und umgebenden Text. `null` bei Misserfolg. */
export function parseJsonLoose<T = unknown>(text: string): T | null {
  const candidates: string[] = []
  const trimmed = (text ?? '').trim()
  if (trimmed) candidates.push(trimmed)
  // ```json … ``` oder ``` … ```
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(text ?? '')
  if (fence?.[1]) candidates.push(fence[1].trim())
  const block = firstJsonBlock(text ?? '')
  if (block) candidates.push(block)
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T
    } catch {
      /* nächsten Kandidaten versuchen */
    }
  }
  return null
}

/* ── Quiz ──────────────────────────────────────────────────────────── */

interface RawQuiz {
  question?: unknown
  choices?: unknown
  answer?: unknown
  explanation?: unknown
  topic?: unknown
}

/** Wandelt eine Gemini-Quiz-Antwort in geprüfte `QuizItem`s (leere Liste = unbrauchbar). */
export function parseQuizItems(text: string, focusTopic?: string): QuizItem[] {
  const parsed = parseJsonLoose<unknown>(text)
  const raw: RawQuiz[] = Array.isArray(parsed)
    ? (parsed as RawQuiz[])
    : (((parsed as { questions?: RawQuiz[] } | null)?.questions ?? []) as RawQuiz[])
  return raw
    .filter(
      (q) => q && q.question && Array.isArray(q.choices) && (q.choices as unknown[]).length >= 2
    )
    .map<QuizItem>((q) => {
      const choices = (q.choices as unknown[]).map(String).slice(0, 6)
      return {
        id: nanoid(8),
        question: String(q.question),
        choices,
        answer: Math.max(0, Math.min(choices.length - 1, Math.round(Number(q.answer)) || 0)),
        explanation: String(q.explanation ?? ''),
        topic: q.topic ? String(q.topic).slice(0, 40) : focusTopic
      }
    })
}

/* ── Lernplan ──────────────────────────────────────────────────────── */

export interface StudyPlan {
  markdown: string
  tasks: PlanTask[]
}

const PLAN_KINDS = new Set(['lernen', 'wiederholen', 'quiz'])

export function parseStudyPlan(text: string): StudyPlan {
  const parsed = parseJsonLoose<{ markdown?: unknown; tasks?: unknown }>(text)
  if (!parsed) return { markdown: text, tasks: [] }
  const tasks: PlanTask[] = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
    .map((t) => (t ?? {}) as Partial<PlanTask>)
    .filter((t) => t.date && /^\d{4}-\d{2}-\d{2}$/.test(String(t.date)) && t.title)
    .slice(0, 60)
    .map((t) => ({
      id: nanoid(6),
      date: String(t.date),
      time: /^\d{1,2}:\d{2}$/.test(String(t.time)) ? String(t.time).padStart(5, '0') : undefined,
      title: String(t.title).slice(0, 90),
      topic: String(t.topic ?? '').slice(0, 120),
      minutes: Math.max(15, Math.min(240, Math.round(Number(t.minutes)) || 60)),
      kind: PLAN_KINDS.has(String(t.kind)) ? (String(t.kind) as PlanTask['kind']) : 'lernen',
      done: false
    }))
  return { markdown: String(parsed.markdown ?? text), tasks }
}

/* ── Nächster Schritt ──────────────────────────────────────────────── */

export interface NextStep {
  text: string
  action: 'quiz' | 'review' | 'ready'
  topic?: string
}

export function parseNextStep(text: string): NextStep {
  const j = parseJsonLoose<Partial<NextStep>>(text)
  if (!j) return { text: text.slice(0, 300) || 'Weiter üben.', action: 'review' }
  const action =
    j.action === 'quiz' || j.action === 'review' || j.action === 'ready' ? j.action : 'review'
  return {
    text: String(j.text ?? 'Weiter üben.'),
    action,
    topic: j.topic ? String(j.topic) : undefined
  }
}

/* ── Überfällige neu einplanen ─────────────────────────────────────── */

export interface RescheduleMove {
  id: string
  date: string
  time?: string
}

/**
 * Validiert Geminis Umplanungs-Vorschlag: nur überfällige IDs, echtes
 * Zukunftsdatum, keine Dubletten.
 */
export function parseRescheduleMoves(
  text: string,
  overdueIds: string[],
  today: string
): RescheduleMove[] {
  const parsed = parseJsonLoose<unknown>(text)
  const arr = Array.isArray(parsed)
    ? parsed
    : (((parsed as { moves?: unknown[] } | null)?.moves ?? []) as unknown[])
  const ids = new Set(overdueIds)
  const seen = new Set<string>()
  const out: RescheduleMove[] = []
  for (const x of arr) {
    const m = (x ?? {}) as Partial<RescheduleMove>
    const id = String(m.id ?? '')
    const date = String(m.date ?? '')
    if (!id || !ids.has(id) || seen.has(id)) continue
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date <= today) continue
    seen.add(id)
    out.push({
      id,
      date,
      time: /^\d{1,2}:\d{2}$/.test(String(m.time)) ? String(m.time).padStart(5, '0') : undefined
    })
  }
  return out
}

/* ── Semester aus Datei ────────────────────────────────────────────── */

export interface SemesterSetup {
  semester: string
  courses: { name: string; ects?: number; examDateIso?: string }[]
}

export function parseSemesterSetup(text: string): SemesterSetup {
  const raw = parseJsonLoose<Partial<SemesterSetup>>(text)
  if (!raw) return { semester: '', courses: [] }
  const seen = new Set<string>()
  const courses = (Array.isArray(raw.courses) ? raw.courses : [])
    .map((c) => (c ?? {}) as { name?: unknown; ects?: unknown; examDateIso?: unknown })
    .map((c) => {
      const name = String(c.name ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 80)
      const ectsNum = Number(c.ects)
      const ects = Number.isFinite(ectsNum) && ectsNum >= 1 && ectsNum <= 30 ? ectsNum : undefined
      const d = String(c.examDateIso ?? '')
      const examDateIso = /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : undefined
      return { name, ects, examDateIso }
    })
    .filter((c) => {
      const k = c.name.toLowerCase()
      if (c.name.length < 2 || seen.has(k)) return false
      seen.add(k)
      return true
    })
    .slice(0, 40)
  return { semester: String(raw.semester ?? '').slice(0, 40), courses }
}
