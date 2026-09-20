import type { FachResult, GradeComponent } from './model'
import { semesterSortKey } from './calendar'

/**
 * Reine Notenmathematik für den Studienplaner: deutsche Skala 1,0–5,0,
 * Punkte 0–15 → Note, Fach-Note als gewichtetes Mittel der Teilleistungen,
 * ECTS-gewichteter Gesamt- und Semesterschnitt.
 */

/** Standard-Umrechnung Notenpunkte (0–15) → deutsche Note (1,0–5,0). */
export function pointsToGrade(points: number): number {
  const p = Math.round(points)
  const table: Record<number, number> = {
    15: 1.0,
    14: 1.0,
    13: 1.3,
    12: 1.7,
    11: 2.0,
    10: 2.3,
    9: 2.7,
    8: 3.0,
    7: 3.3,
    6: 3.7,
    5: 4.0
  }
  if (p >= 15) return 1.0
  if (p <= 4) return 5.0
  return table[p] ?? 5.0
}

/** Note einer Teilleistung (1,0–5,0) oder `null`, wenn sie nicht in den Schnitt zählt. */
export function componentGrade(c: GradeComponent): number | null {
  if (c.mode === 'grade') {
    return typeof c.grade === 'number' && c.grade >= 1 && c.grade <= 5 ? c.grade : null
  }
  if (c.mode === 'points') {
    return typeof c.points === 'number' && c.points >= 0 && c.points <= 15
      ? pointsToGrade(c.points)
      : null
  }
  return null // passfail zählt nicht in den Schnitt
}

/**
 * Fach-Note = gewichtetes Mittel der benoteten Teilleistungen. Gewichte werden
 * normalisiert (müssen nicht exakt 100 ergeben). `null`, wenn keine benotet ist.
 */
export function fachGrade(result: Pick<FachResult, 'components'>): number | null {
  let wsum = 0
  let gsum = 0
  for (const c of result.components ?? []) {
    const g = componentGrade(c)
    if (g === null) continue
    const w = c.weightPct > 0 ? c.weightPct : 0
    wsum += w
    gsum += g * w
  }
  if (wsum <= 0) return null
  return Math.round((gsum / wsum) * 100) / 100
}

/** „bestanden", „nicht bestanden" oder `null` (unklar) – wenn es nur passfail-Teile gibt. */
export function fachPassStatus(result: Pick<FachResult, 'components'>): boolean | null {
  const pf = (result.components ?? []).filter((c) => c.mode === 'passfail')
  if (!pf.length || fachGrade(result) !== null) return null
  // Nicht ausgefüllt (kein passed-Wert gesetzt) → unklar, nicht „durchgefallen".
  if (pf.some((c) => typeof c.passed !== 'boolean')) return null
  return pf.every((c) => c.passed === true)
}

export interface GpaSummary {
  /** ECTS-gewichteter Schnitt (1,0–5,0) oder `null`, wenn nichts zählbar ist. */
  gpa: number | null
  /** Summe der ECTS, die in den Schnitt eingehen. */
  credits: number
  /** Anzahl der Fächer im Schnitt. */
  counted: number
  /** Fächer mit Note, aber ohne ECTS – zählen NICHT mit. */
  missingEcts: string[]
}

function gpaOf(results: FachResult[]): GpaSummary {
  let credits = 0
  let weighted = 0
  let counted = 0
  const missingEcts: string[] = []
  for (const r of results) {
    if (r.excludeFromGpa) continue
    const g = fachGrade(r)
    if (g === null) continue
    if (!r.ects || r.ects <= 0) {
      missingEcts.push(r.kurs)
      continue
    }
    credits += r.ects
    weighted += g * r.ects
    counted += 1
  }
  return {
    gpa: credits > 0 ? Math.round((weighted / credits) * 100) / 100 : null,
    credits,
    counted,
    missingEcts
  }
}

/** ECTS-gewichteter Gesamtschnitt über alle Fächer. */
export function overallGpa(results: FachResult[]): GpaSummary {
  return gpaOf(results)
}

/** ECTS-gewichteter Schnitt eines einzelnen Semesters. */
export function semesterGpa(results: FachResult[], semester: string): GpaSummary {
  return gpaOf(results.filter((r) => r.semester === semester))
}

/** Deutsche Notendarstellung: „1,7" statt „1.7"; „–" für null. */
export function gradeLabel(grade: number | null): string {
  if (grade === null || Number.isNaN(grade)) return '–'
  return grade.toFixed(1).replace('.', ',')
}

/** Frühestes Datum eines Fach-Ergebnisses (Prüfungstermin oder erste Teilleistung). */
function fachDate(r: FachResult): string {
  return (
    r.prep?.examDateIso ??
    r.components
      .map((c) => c.dateIso)
      .filter((d): d is string => Boolean(d))
      .sort()[0] ??
    ''
  )
}

/**
 * Kompakter Daten-Digest aller benoteten Fächer für die KI-Lernauswertung:
 * Gesamt-/Semesterschnitt plus je Fach Note, Aufwand (geplant/erledigt),
 * Quiz-Sicherheit und Teilleistungen. Leerer String, wenn nichts benotet ist.
 */
export function buildTacticsDigest(results: FachResult[]): string {
  const graded = results.filter((r) => fachGrade(r) !== null && !r.excludeFromGpa)
  if (!graded.length) return ''

  const overall = overallGpa(results)
  const lines: string[] = [
    `Gesamtschnitt (ECTS-gewichtet): ${gradeLabel(overall.gpa)} aus ${overall.counted} Fächern / ${overall.credits} ECTS.`
  ]
  if (overall.missingEcts.length) {
    lines.push(`Ohne ECTS (zählen nicht in den Schnitt): ${overall.missingEcts.join(', ')}.`)
  }

  const semesters = [...new Set(graded.map((r) => r.semester))].sort(
    (a, b) => semesterSortKey(a) - semesterSortKey(b) || a.localeCompare(b)
  )
  lines.push('', 'Schnitt je Semester (chronologisch):')
  for (const s of semesters) {
    const sg = semesterGpa(results, s)
    lines.push(`- ${s}: ${gradeLabel(sg.gpa)} (${sg.credits} ECTS)`)
  }

  lines.push('', 'Fächer (chronologisch, älteste zuerst):')
  const ordered = [...graded].sort(
    (a, b) =>
      fachDate(a).localeCompare(fachDate(b)) ||
      semesterSortKey(a.semester) - semesterSortKey(b.semester) ||
      a.kurs.localeCompare(b.kurs)
  )
  for (const r of ordered) {
    const parts = [`Note ${gradeLabel(fachGrade(r))}`, r.ects ? `${r.ects} ECTS` : 'ECTS fehlt']
    if (r.prep && r.prep.plannedTasks > 0) {
      const pct = Math.round((r.prep.doneTasks / r.prep.plannedTasks) * 100)
      parts.push(`Lernaufgaben ${r.prep.doneTasks}/${r.prep.plannedTasks} erledigt (${pct} %)`)
    } else {
      parts.push('kein Lernplan-Schnappschuss')
    }
    if (r.prep && r.prep.quizAccuracy !== null) {
      parts.push(`Quiz-Sicherheit ${Math.round(r.prep.quizAccuracy * 100)} %`)
    }
    const gradedComps = r.components.filter((c) => c.mode !== 'passfail')
    if (gradedComps.length > 1) {
      parts.push(
        `${gradedComps.length} Teilleistungen (${gradedComps
          .map((c) => `${c.title} ${c.weightPct} %`)
          .join(', ')})`
      )
    }
    lines.push(`- ${r.kurs} (${r.semester}): ${parts.join(' · ')}`)
  }

  return lines.join('\n')
}
