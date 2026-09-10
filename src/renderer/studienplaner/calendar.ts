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
    // Von Astra angelegte Lernblöcke (📚 …) sind keine Vorlesungen.
    if (e.allDay || isExam(e.title, e.notes) || e.title.startsWith('📚')) continue
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

/**
 * Chronologischer Sortierschlüssel für Semesternamen. Deutsches Studienjahr:
 * „SS YYYY" (ab April) liegt vor „WS YYYY" (ab Oktober), das wiederum vor
 * „SS YYYY+1" liegt. „3. Semester" → 3. Unbekanntes → sehr groß (ans Ende).
 */
export function semesterSortKey(name: string): number {
  const term = /\b(WS|WiSe?|SoSe?|SS)\b/i.exec(name)?.[1]?.toUpperCase()
  const year = /\b(19|20)\d{2}\b/.exec(name)?.[0]
  if (term && year) return Number(year) + (/^W/.test(term) ? 0.5 : 0)
  const ord = /(\d{1,2})\.\s*sem/i.exec(name)?.[1]
  if (ord) return Number(ord)
  return 9e6
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
const WD_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const MON_SHORT = [
  'Jan',
  'Feb',
  'März',
  'Apr',
  'Mai',
  'Juni',
  'Juli',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez'
]

export function dayLabel(d: Date, now: Date = new Date()): string {
  const n = daysUntil(d.toISOString(), now)
  if (n === 0) return 'Heute'
  if (n === 1) return 'Morgen'
  if (n >= 2 && n <= 6) return `${WD[d.getDay()]}`
  return `${WD_SHORT[d.getDay()]}, ${d.getDate()}. ${MON_SHORT[d.getMonth()]}`
}

/** Kompakter „so viel ist verplant"-Text je Tag – Kontext für Gemini. */
export function busyDigest(events: CalEvent[], untilIso: string | null): string {
  const now = Date.now()
  const end = untilIso ? new Date(untilIso).getTime() : now + 21 * 864e5
  const perDay = new Map<string, number>()
  for (const e of events) {
    // Eigene Lernblöcke (📚) sind kein „schon verplant" – die sollen ja neu gelegt werden.
    if (e.title.startsWith('📚')) continue
    const t = new Date(e.start).getTime()
    if (t < now - 864e5 || t > end) continue
    const hrs = e.allDay
      ? 8
      : Math.max(0.5, (new Date(e.end).getTime() - new Date(e.start).getTime()) / 36e5)
    const day = e.start.slice(0, 10)
    perDay.set(day, (perDay.get(day) ?? 0) + hrs)
  }
  return [...perDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([d, h]) => `${d}: ~${Math.round(h)} h verplant`)
    .join('\n')
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

/* ── Monatsraster für die Kalender-Seite ───────────────────────────────── */

export interface MonthCell {
  /** YYYY-MM-DD. */
  key: string
  /** Tag im Monat (1…31). */
  day: number
  /** Gehört der Tag zum angezeigten Monat (oder ist Vor-/Nachlauf)? */
  inMonth: boolean
  isToday: boolean
  isWeekend: boolean
}

/**
 * 6×7-Raster (montagsbeginnend) für `year`/`month` (0-basiert), inklusive
 * Vor-/Nachlauftage der Nachbarmonate. Rein – für die Kalender-Seite.
 */
export function monthMatrix(year: number, month: number, now: Date = new Date()): MonthCell[][] {
  const first = new Date(year, month, 1)
  const startOffset = (first.getDay() + 6) % 7 // Mo=0 … So=6
  const start = new Date(year, month, 1 - startOffset)
  const today = dayKey(now)
  const weeks: MonthCell[][] = []
  for (let w = 0; w < 6; w++) {
    const row: MonthCell[] = []
    for (let d = 0; d < 7; d++) {
      const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      const k = dayKey(cur)
      row.push({
        key: k,
        day: cur.getDate(),
        inMonth: cur.getMonth() === month && cur.getFullYear() === year,
        isToday: k === today,
        isWeekend: d >= 5
      })
    }
    weeks.push(row)
  }
  return weeks
}

/** Termine nach Tag (YYYY-MM-DD) gebündelt, je Tag nach Startzeit sortiert. */
export function eventsByDay(events: CalEvent[]): Map<string, CalEvent[]> {
  const map = new Map<string, CalEvent[]>()
  for (const ev of events) {
    const k = ev.start.slice(0, 10)
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(ev)
  }
  for (const list of map.values()) list.sort((a, b) => a.start.localeCompare(b.start))
  return map
}

/** Kommende Klausuren/Tests/Präsentationen, frühestes zuerst. */
export function upcomingExams(events: CalEvent[], max = 8, now: Date = new Date()): CalEvent[] {
  const todayStart = startOfDay(now).getTime()
  return events
    .filter((ev) => isExam(ev.title, ev.notes) && new Date(ev.end).getTime() >= todayStart)
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, max)
}

/** Bereits vergangene Klausuren/Tests/Präsentationen, jüngste zuerst. */
export function pastExams(events: CalEvent[], max = 20, now: Date = new Date()): CalEvent[] {
  const todayStart = startOfDay(now).getTime()
  return events
    .filter((ev) => isExam(ev.title, ev.notes) && new Date(ev.end).getTime() < todayStart)
    .sort((a, b) => b.start.localeCompare(a.start))
    .slice(0, max)
}
