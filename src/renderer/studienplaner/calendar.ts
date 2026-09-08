import type { CalEvent } from '@shared/types'

/** Stichwörter, an denen Astra Klausuren / Tests / Präsentationen erkennt. */
export const EXAM_WORDS = [
  'klausur',
  'prüfung',
  'pruefung',
  'exam',
  'klausurtermin',
  'test',
  'präsentation',
  'praesentation',
  'presentation',
  'vortrag',
  'referat',
  'kolloquium',
  'mündlich',
  'muendlich',
  'abgabe',
  'deadline',
  'hausarbeit',
  'assessment'
]

export function isExam(title: string, notes?: string): boolean {
  const hay = `${title} ${notes ?? ''}`.toLowerCase()
  return EXAM_WORDS.some((w) => hay.includes(w))
}

/** Kürzel/Zusätze, die aus einem Termintitel entfernt werden, um den Fachnamen zu bekommen. */
const VERANSTALTUNGS_WORDS =
  /\b(vorlesung|übung|uebung| übungen|uebungen|tutorium|tut|praktikum|seminar|kurs|vl|ue|üb|prakt|labor|repetitorium|repetitor)\b/gi

/**
 * Zieht aus Kalenderterminen die Fachnamen: „Analysis II – Übung", „Analysis II (VL)"
 * und „Analysis II" landen alle als ein Fach „Analysis II". Klausuren/Tests werden
 * ausgelassen. Ergebnis alphabetisch, ohne Dubletten.
 */
export function courseNamesFromEvents(events: CalEvent[]): string[] {
  const byKey = new Map<string, string>()
  for (const e of events) {
    if (e.allDay || isExam(e.title, e.notes)) continue
    let name = e.title
      .replace(/\s*[–—:|/(-].*$/u, '') // alles ab erstem Trenner (– — : | / ( -) abschneiden
      .replace(VERANSTALTUNGS_WORDS, '')
      .replace(/\s+/g, ' ')
      .trim()
    if (name.length < 2 || /^\d+$/.test(name)) continue
    const key = name.toLowerCase()
    if (!byKey.has(key)) byKey.set(key, name)
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'de'))
}

/** Vorschlag für den Semesternamen aus dem aktuellen Datum (dt. Hochschul-Rhythmus). */
export function suggestSemesterName(now: Date = new Date()): string {
  const m = now.getMonth() // 0 = Januar
  const y = now.getFullYear()
  if (m >= 3 && m <= 8) return `SS ${y}` // April–September
  return `WS ${m >= 9 ? y : y - 1}` // Oktober–März
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Ganze Tage von heute bis zum Datum (heute = 0, gestern = -1). */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const then = startOfDay(new Date(iso)).getTime()
  const today = startOfDay(now).getTime()
  return Math.round((then - today) / 86_400_000)
}

export function daysLeftLabel(n: number): string {
  if (n < 0) return 'vorbei'
  if (n === 0) return 'heute'
  if (n === 1) return 'morgen'
  return `noch ${n} Tage`
}

const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']

export function dayLabel(d: Date, now: Date = new Date()): string {
  const n = daysUntil(d.toISOString(), now)
  if (n === 0) return 'Heute'
  if (n === 1) return 'Morgen'
  const date = `${d.getDate()}.${d.getMonth() + 1}.`
  return `${WD[d.getDay()]}, ${date}`
}

export function eventTime(ev: CalEvent): string {
  if (ev.allDay) return 'ganztägig'
  const s = new Date(ev.start)
  const e = new Date(ev.end)
  const f = (x: Date): string => `${x.getHours()}:${String(x.getMinutes()).padStart(2, '0')}`
  return e.getTime() - s.getTime() > 60_000 && e.getDate() === s.getDate()
    ? `${f(s)}–${f(e)}`
    : f(s)
}

export interface AgendaDay {
  key: string
  label: string
  events: CalEvent[]
}

/** Termine der nächsten `days` Tage, nach Tag gruppiert. */
export function buildAgenda(events: CalEvent[], days: number, now: Date = new Date()): AgendaDay[] {
  const limit = startOfDay(now).getTime() + days * 86_400_000
  const todayStart = startOfDay(now).getTime()
  const byDay = new Map<string, AgendaDay>()
  for (const ev of [...events].sort((a, b) => a.start.localeCompare(b.start))) {
    const d = new Date(ev.start)
    const t = d.getTime()
    if (t >= limit) continue
    // laufende oder heutige Termine behalten
    if (new Date(ev.end).getTime() < todayStart) continue
    const k = dayKey(d)
    if (!byDay.has(k)) byDay.set(k, { key: k, label: dayLabel(d, now), events: [] })
    byDay.get(k)!.events.push(ev)
  }
  return [...byDay.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** Kommende Klausuren/Tests/Präsentationen, frühestes zuerst. */
export function upcomingExams(events: CalEvent[], max = 8, now: Date = new Date()): CalEvent[] {
  const todayStart = startOfDay(now).getTime()
  return events
    .filter((ev) => isExam(ev.title, ev.notes) && new Date(ev.end).getTime() >= todayStart)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, max)
}
