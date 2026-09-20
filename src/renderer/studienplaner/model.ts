import type { SpTree } from '@shared/types'
import { semesterSortKey } from './calendar'

/** Versteckte Indexdatei im Wurzelordner – hält OCR-Text & Ablage-Infos, synct via iCloud mit. */
export const INDEX_FILE = '.astra-studienplaner.json'
/** Unterordner für frisch gescannte, noch nicht einsortierte Dateien. */
export const INBOX_DIR = '_Eingang'

export interface IndexEntry {
  /** Pfad relativ zum Wurzelordner, z. B. "2. Semester/Analysis II/Grenzwerte.pdf". */
  relPath: string
  semester: string
  kurs: string
  thema: string
  /** ISO-Zeitpunkt der Einsortierung. */
  added: string
  /** Womit der Text erkannt wurde. */
  ocrEngine: 'vision' | 'tesseract' | 'none'
  /** Erkannter Volltext (für die Suche). */
  text: string
  /** SHA-1 der Originaldatei (exakte Dubletten). */
  sha1?: string
  /** SHA-1 des normalisierten OCR-Textes (inhaltliche Dubletten trotz Neu-Scan). */
  textHash?: string
  /** 8×8-Average-Hash des aufbereiteten Bilds (ähnliche Scans). */
  ahash?: string
}

/** Eine benotete Teilleistung eines Fachs (Klausur, Midterm, Übungsblatt-Schnitt …). */
export interface GradeComponent {
  id: string
  title: string
  /** Eingabeform: deutsche Note, Punkte (0–15) oder nur bestanden/nicht bestanden. */
  mode: 'grade' | 'points' | 'passfail'
  /** Deutsche Note 1,0–5,0 (bei mode 'grade'). */
  grade?: number
  /** Punkte 0–15 (bei mode 'points'); die Note wird daraus abgeleitet. */
  points?: number
  /** bestanden? (bei mode 'passfail'); zählt nicht in den Schnitt. */
  passed?: boolean
  /** Gewichtung in Prozent (Standard 100). */
  weightPct: number
  /** ISO-Datum der Prüfung. */
  dateIso?: string
}

/** Ergebnis eines Fachs: ECTS + benotete Teilleistungen + Vorbereitungs-Schnappschuss. */
export interface FachResult {
  semester: string
  kurs: string
  /** Leistungspunkte des Fachs (für den ECTS-gewichteten Schnitt). */
  ects?: number
  components: GradeComponent[]
  /** Gesetzt, sobald das Fach abgeschlossen/archiviert wurde. */
  archivedAt?: string
  /**
   * Fach zählt bewusst nicht für den Bachelor-Schnitt (z. B. Vorkurs,
   * Zusatzleistung). Note/ECTS bleiben erhalten und sichtbar, gehen aber nicht
   * in Gesamt-/Semesterschnitt, Diagramme oder die KI-Lernauswertung ein.
   */
  excludeFromGpa?: boolean
  /** Schnappschuss der Lern-Vorbereitung zum Zeitpunkt der Ergebniseingabe. */
  prep?: {
    plannedTasks: number
    doneTasks: number
    /** Quiz-Trefferquote 0…1 vor der Prüfung. */
    quizAccuracy: number | null
    examDateIso?: string | null
  }
}

/** Verknüpfung einer Kalender-Prüfung mit einem Fach. */
export interface IndexExam {
  examKey: string
  title: string
  dateIso: string | null
  semester: string
  kurs: string
  /** Veraltet (Unterordner) – nur noch für Altbestand. */
  slug?: string
}

/** Ein rückgängig machbarer Einsortier-Vorgang (jüngste 20 werden behalten). */
export interface UndoRecord {
  id: string
  /** ISO-Zeitpunkt der Ablage. */
  when: string
  /** Neue Datei angelegt, oder an eine vorhandene PDF angehängt. */
  kind: 'file' | 'append'
  /** relPath der Zieldatei. */
  destRelPath: string
  /** Ursprünglicher Dateiname im Eingang. */
  originalName: string
  /** Kam die Datei aus dem Eingang (Autopilot)? */
  fromInbox: boolean
  /** Bei `append`: relPath der gesicherten Vorher-PDF unter `.astra-undo/`. */
  backupRel?: string
  /** Bei `append`: Index-Text der Zieldatei vor dem Anhängen. */
  prevText?: string
}

/** Wie viele Rückgängig-Einträge der Index maximal behält. */
export const UNDO_LIMIT = 20

/** Teilt eine (neueste-zuerst) Undo-Liste in „behalten" und „wegwerfen". */
export function splitUndo(list: UndoRecord[]): { kept: UndoRecord[]; dropped: UndoRecord[] } {
  return { kept: list.slice(0, UNDO_LIMIT), dropped: list.slice(UNDO_LIMIT) }
}

export interface IndexData {
  v: 1
  updated: string
  entries: Record<string, IndexEntry>
  /** Prüfung (Kalender) → Fach/Vorbereitung, Schlüssel = examKey. */
  exams?: Record<string, IndexExam>
  /** Rückgängig-Verlauf der letzten Ablagen (max. 20, jüngste zuerst). */
  undo?: UndoRecord[]
  /** Klausur-Ergebnisse je Fach, Schlüssel = `${safeName(sem)}//${safeName(kurs)}`. */
  results?: Record<string, FachResult>
  /** Zuletzt von der KI erstellte Lernstrategie-Auswertung (Studienergebnisse-Seite). */
  tactics?: {
    /** Markdown-Text der Auswertung. */
    text: string
    /** ISO-Zeitpunkt der Erstellung. */
    at: string
    /** Anzahl benoteter Fächer, auf denen die Auswertung beruht (für „veraltet"-Hinweis). */
    basis: number
  }
}

/** Schlüssel eines Fach-Ergebnisses im Index. */
export function resultKey(semester: string, kurs: string): string {
  return `${safeName(semester)}//${safeName(kurs)}`
}

export function emptyIndex(): IndexData {
  return { v: 1, updated: new Date().toISOString(), entries: {} }
}

export function parseIndex(raw: string | null): IndexData {
  if (!raw) return emptyIndex()
  try {
    const parsed = JSON.parse(raw) as IndexData
    if (parsed && parsed.v === 1 && parsed.entries) {
      if (!Array.isArray(parsed.undo)) parsed.undo = []
      if (!parsed.results || typeof parsed.results !== 'object') parsed.results = {}
      if (parsed.tactics && typeof parsed.tactics.text !== 'string') delete parsed.tactics
      return parsed
    }
  } catch {
    /* kaputte Datei → frisch anfangen */
  }
  return emptyIndex()
}

export function relPathOf(root: string, abs: string): string {
  const r = root.endsWith('/') ? root : root + '/'
  return abs.startsWith(r) ? abs.slice(r.length) : abs
}

/** Macht aus einem Wunschnamen einen sicheren Dateinamen (deutsche Buchstaben bleiben). */
export function safeName(name: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|\x00-\x1f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || 'Notiz'
}

const STOP = new Set([
  'der',
  'die',
  'das',
  'und',
  'oder',
  'mit',
  'für',
  'von',
  'im',
  'in',
  'am',
  'zur',
  'zum',
  'ein',
  'eine',
  'the',
  'and',
  'for',
  'of',
  'vorlesung',
  'übung',
  'uebung',
  'blatt',
  'seite',
  'notiz',
  'notizen'
])

export function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-zà-ÿ0-9]{3,}/gi) ?? [])
    .map((t) => t.toLowerCase())
    .filter((t) => !STOP.has(t))
}

/** Erkennt eine Semester-Angabe im Text ("3. Semester", "WS 2024", "SoSe 25"). */
export function detectSemester(text: string, known: string[]): string | undefined {
  const lower = text.toLowerCase()
  for (const s of known) {
    if (lower.includes(s.toLowerCase())) return s
  }
  const ord = /(\d{1,2})\.?\s*semester/i.exec(text)
  if (ord) {
    const n = ord[1]
    const hit = known.find((s) => new RegExp(`(^|\\D)${n}(\\D|$)`).test(s))
    if (hit) return hit
    return `${n}. Semester`
  }
  const term = /\b(wi?se?|ws|sose?|ss)\s*'?\s*(\d{2,4})\b/i.exec(text)
  if (term) {
    const isWinter = /^w/i.test(term[1])
    const yr = term[2].length === 2 ? `20${term[2]}` : term[2]
    const guess = `${isWinter ? 'WS' : 'SS'} ${yr}`
    const hit = known.find(
      (s) => s.toLowerCase().replace(/\s+/g, '') === guess.toLowerCase().replace(/\s+/g, '')
    )
    return hit ?? guess
  }
  return undefined
}

/** Feste Unterordner, die jedes Fach bekommt. */
export const COURSE_SUBFOLDERS = ['Informationen', 'Übungen'] as const
export type CourseSubfolder = (typeof COURSE_SUBFOLDERS)[number]

/** Rät aus dem erkannten Text, ob eine Notiz zu „Übungen" oder „Informationen" gehört. */
export function guessSubfolder(text: string): CourseSubfolder {
  return /\b(übung|uebung|übungsblatt|aufgabe|aufgabenblatt|hausaufgabe|tutorium|serie|zettel|blatt\s*\d|exercise|problem\s*set|lösung|loesung|abgabe)\b/i.test(
    text
  )
    ? 'Übungen'
    : 'Informationen'
}

/**
 * Sinnvoller Dateiname aus dem erkannten Text: erkennt „Übungsblatt 3",
 * „Blatt 5", „Serie 2", „Vorlesung 7", „Kapitel 4" … sonst die erste
 * brauchbare Zeile, sonst „Mitschrift <Datum>".
 */
export function smartNoteName(text: string): string {
  const t = text.replace(/\s+/g, ' ')
  const num = (re: RegExp): string | null => {
    const m = re.exec(t)
    return m ? m[1] : null
  }
  let n: string | null
  if ((n = num(/(?:übungs|aufgaben)?blatt\s*(?:nr\.?\s*)?(\d{1,2})/i)))
    return `Übungsblatt ${Number(n)}`
  if ((n = num(/\bserie\s*(?:nr\.?\s*)?(\d{1,2})/i))) return `Serie ${Number(n)}`
  if ((n = num(/\b(?:übungs)?zettel\s*(\d{1,2})/i))) return `Zettel ${Number(n)}`
  if ((n = num(/\bvorlesung\s*(?:nr\.?\s*)?(\d{1,2})/i))) return `Vorlesung ${Number(n)}`
  if ((n = num(/\bkapitel\s*(\d{1,2})/i))) return `Kapitel ${Number(n)}`
  if ((n = num(/\b(?:lecture|chapter)\s*(\d{1,2})/i))) return `Kapitel ${Number(n)}`
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length >= 3 && l.length <= 60 && /[a-zà-ÿ]/i.test(l))
  const clean = line ? safeName(line).slice(0, 48) : ''
  return clean || `Mitschrift ${new Date().toISOString().slice(0, 10)}`
}

/** Ein bewerteter Fach-Kandidat für die Ablage. */
export interface FilingCandidate {
  semester: string
  kurs: string
  /** 0…1 – Anteil der Kursnamen-Wörter, die im Text vorkommen. */
  score: number
  /** Welche Wörter des Kursnamens im Text gefunden wurden. */
  matched: string[]
}

export interface FilingSuggestion {
  semester?: string
  kurs?: string
  thema: string
  /** „Informationen" oder „Übungen" – geraten aus dem Text. */
  subfolder: CourseSubfolder
  /** 0…1 – wie sicher der beste Kurs-Treffer ist (= candidates[0].score). */
  confidence: number
  /** Bestbewertete Fächer, absteigend (max. 4). Leer, wenn nichts passt. */
  candidates: FilingCandidate[]
  /** Woher der Semestervorschlag kommt. */
  semesterFrom: 'match' | 'text' | 'none'
  /**
   * Semester, dessen Fächer bevorzugt vorgeschlagen werden: das im Text genannte,
   * sonst das jüngste im Ordner. Fächer daraus ranken IMMER vor Fächern aus
   * anderen Semestern – ältere Semester werden nur als Alternative gezeigt.
   */
  focusSemester?: string
}

/** Jüngstes Semester im Ordner (chronologisch). */
export function latestSemester(tree: SpTree): string | undefined {
  return [...tree.semesters]
    .map((s) => s.name)
    .sort((a, b) => semesterSortKey(b) - semesterSortKey(a))[0]
}

/**
 * Schlägt anhand des erkannten Textes Semester / Kurs / Thema / Unterordner vor.
 * Kurs-Treffer entstehen durch Überschneidung der Kursnamen-Wörter mit dem Text.
 * Fächer aus dem aktuellen (bzw. im Text genannten) Semester ranken vor allen
 * anderen – ein gleichnamiges Fach aus einem früheren Semester wird höchstens als
 * Alternative vorgeschlagen.
 */
export function suggestFiling(text: string, tree: SpTree): FilingSuggestion {
  const words = new Set(tokens(text))
  const knownSemesters = tree.semesters.map((s) => s.name)
  const textSemester = detectSemester(text, knownSemesters)
  const focusSemester =
    textSemester && knownSemesters.includes(textSemester) ? textSemester : latestSemester(tree)

  const candidates: FilingCandidate[] = []
  for (const sem of tree.semesters) {
    for (const course of sem.courses) {
      const cw = tokens(course.name)
      if (!cw.length) continue
      const matched = cw.filter((w) => words.has(w))
      if (!matched.length) continue
      candidates.push({
        semester: sem.name,
        kurs: course.name,
        score: Math.min(1, matched.length / cw.length),
        matched
      })
    }
  }
  // Fokus-Semester zuerst, darin nach Trefferquote.
  candidates.sort((a, b) => {
    const fa = a.semester === focusSemester ? 1 : 0
    const fb = b.semester === focusSemester ? 1 : 0
    return fb - fa || b.score - a.score || a.kurs.localeCompare(b.kurs)
  })
  const top = candidates.slice(0, 4)
  const best = top[0]

  return {
    semester: best?.semester ?? textSemester,
    kurs: best?.kurs,
    thema: smartNoteName(text),
    subfolder: guessSubfolder(text),
    confidence: best ? best.score : 0,
    candidates: top,
    semesterFrom: best ? 'match' : textSemester ? 'text' : 'none',
    focusSemester
  }
}

/** Normalisierter Name (für „gehört zusammen"-Vergleiche). */
export function normName(x: string): string {
  return safeName(x)
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Sucht im Zielkurs eine vorhandene PDF, an die der neue Scan vermutlich angehängt
 * gehört: gleicher (normalisierter) Name wie das erkannte Thema. Gibt `relPath` +
 * Anzeigename zurück, sonst `null`.
 */
export function findAppendTarget(
  index: IndexData,
  semester: string,
  kurs: string,
  thema: string
): { relPath: string; name: string } | null {
  const wanted = `${safeName(semester)}/${safeName(kurs)}/`
  const themaN = normName(thema)
  if (themaN.length < 3) return null
  for (const e of Object.values(index.entries)) {
    if (!e.relPath.startsWith(wanted)) continue
    if (!e.relPath.toLowerCase().endsWith('.pdf')) continue
    const base = e.relPath.split('/').pop() ?? e.relPath
    if (normName(base) === themaN) {
      return { relPath: e.relPath, name: base.replace(/\.[^.]+$/, '') }
    }
  }
  return null
}

/* ── Duplikat-Erkennung ───────────────────────────────────────────────── */

async function sha1Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  const buf = data instanceof Uint8Array ? data.slice() : new Uint8Array(data)
  const digest = await crypto.subtle.digest('SHA-1', buf)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Normalisiert OCR-Text für den inhaltlichen Vergleich (Kleinschrift, nur Wörter). */
function normText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

export interface ContentSignature {
  sha1: string
  /** Nur gesetzt, wenn genug Text da ist (> 120 Zeichen normalisiert). */
  textHash?: string
}

/** Berechnet die Signaturen einer eingehenden Datei für den Dubletten-Check. */
export async function contentSignatures(
  bytes: Uint8Array,
  ocrText: string
): Promise<ContentSignature> {
  const sha1 = await sha1Hex(bytes)
  const norm = normText(ocrText)
  const textHash = norm.length > 120 ? await sha1Hex(new TextEncoder().encode(norm)) : undefined
  return { sha1, textHash }
}

/** Hamming-Abstand zweier gleich langer Hex-Strings (Bit-Ebene). */
export function hammingHex(a: string, b: string): number {
  if (!a || !b || a.length !== b.length) return Number.MAX_SAFE_INTEGER
  let d = 0
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

/**
 * Sucht einen vorhandenen Index-Eintrag, der derselbe Inhalt sein dürfte:
 * exakt gleiche Datei, gleicher normalisierter Text, oder sehr ähnlicher
 * Bild-Hash (Average-Hash-Hamming ≤ 6).
 */
export function findDuplicate(
  index: IndexData,
  sig: { sha1?: string; textHash?: string; ahash?: string }
): IndexEntry | null {
  for (const e of Object.values(index.entries)) {
    if (sig.sha1 && e.sha1 && e.sha1 === sig.sha1) return e
    if (sig.textHash && e.textHash && e.textHash === sig.textHash) return e
    if (sig.ahash && e.ahash && hammingHex(sig.ahash, e.ahash) <= 6) return e
  }
  return null
}

export interface SearchHit {
  entry: IndexEntry
  score: number
  /** Kurzer Textausschnitt rund um den ersten Treffer. */
  snippet: string
}

export function searchIndex(index: IndexData, query: string): SearchHit[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const parts = q.split(/\s+/).filter(Boolean)
  const hits: SearchHit[] = []
  for (const entry of Object.values(index.entries)) {
    const hay =
      `${entry.relPath}\n${entry.kurs}\n${entry.semester}\n${entry.thema}\n${entry.text}`.toLowerCase()
    let score = 0
    for (const p of parts) {
      if (!hay.includes(p)) {
        score = 0
        break
      }
      score += 1
      if (entry.thema.toLowerCase().includes(p)) score += 2
      if (entry.kurs.toLowerCase().includes(p)) score += 1
    }
    if (score <= 0) continue
    const where = entry.text.toLowerCase().indexOf(parts[0])
    const snippet =
      where >= 0
        ? '…' +
          entry.text
            .slice(Math.max(0, where - 40), where + 80)
            .replace(/\s+/g, ' ')
            .trim() +
          '…'
        : entry.thema
    hits.push({ entry, score, snippet })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, 60)
}
