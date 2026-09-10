import type { PlanTask, QuizItem } from './prep'
import { AI_NOTES_FILE, AI_SYSTEM_BASE } from './aiSystemPrompt'
import { joinPath } from './paths'
import { useSettingsStore } from '../store/settingsStore'
import {
  parseNextStep,
  parseQuizItems,
  parseRescheduleMoves,
  parseSemesterSetup,
  parseStudyPlan,
  type StudyPlan,
  type NextStep,
  type RescheduleMove,
  type SemesterSetup
} from './aiParse'

export type { StudyPlan, NextStep, RescheduleMove, SemesterSetup } from './aiParse'

/**
 * KI-Funktionen für die Prüfungsvorbereitung (Gemini, Aufruf über den
 * Hauptprozess). Jede Funktion baut hier den Prompt, `run()` schickt ihn an
 * Gemini, und die reinen Parser aus `aiParse.ts` machen aus der Antwort
 * geprüfte Daten – auch wenn Gemini Zäune, Fließtext oder Unfug liefert.
 */

/** Basis-Anweisung + optionale eigene Regeln aus <Studium>/KI-Anweisung.md. */
async function buildSystemInstruction(root: string): Promise<string> {
  if (!root) return AI_SYSTEM_BASE
  const file = joinPath(root, AI_NOTES_FILE)
  if (!(await window.api.spExists(file))) return AI_SYSTEM_BASE
  try {
    const addon = new TextDecoder().decode(await window.api.spRead(file)).trim()
    // Vorlagen-Datei ohne eigene Ergänzungen ignorieren.
    if (addon && !addon.startsWith('<!-- Vorlage')) {
      return `${AI_SYSTEM_BASE}\n\n## Zusätzliche Regeln von dir\n${addon}`
    }
  } catch {
    /* nicht lesbar – Basis nutzen */
  }
  return AI_SYSTEM_BASE
}

// Kurzzeit-Cache: der Nutzer stellt oft mehrere KI-Anfragen kurz hintereinander;
// die KI-Anweisung dafür nicht jedes Mal per IPC von der Platte lesen.
let sysCache: { root: string; text: string; at: number } | null = null

async function systemInstruction(): Promise<string> {
  const root = useSettingsStore.getState().studienplanerPath ?? ''
  if (sysCache && sysCache.root === root && Date.now() - sysCache.at < 20_000) return sysCache.text
  const text = await buildSystemInstruction(root)
  sysCache = { root, text, at: Date.now() }
  return text
}

async function run(prompt: string, opts: { json?: boolean; temp?: number } = {}): Promise<string> {
  const call = window.api.llmGenerate({
    system: await systemInstruction(),
    prompt,
    wantJson: opts.json,
    temperature: opts.temp,
    model: useSettingsStore.getState().geminiModel
  })
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_, rej) => {
    timer = setTimeout(() => rej(new Error('Zeitüberschreitung – bitte erneut versuchen.')), 90_000)
  })
  try {
    const res = await Promise.race([call, guard])
    if ('error' in res) throw new Error(res.error)
    return res.text
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function notesBlock(notes: string): string {
  return notes.trim()
    ? `\n\n=== NOTIZEN ===\n${notes.trim()}\n=== ENDE NOTIZEN ===`
    : '\n\n(Keine erkannten Notiztexte vorhanden.)'
}

export async function makeSummary(kurs: string, notes: string): Promise<string> {
  return run(
    `Fasse die folgenden Vorlesungsnotizen für „${kurs}" als kompakte, klar ` +
      `gegliederte Lern-Zusammenfassung in Markdown zusammen: Überschriften je Thema, ` +
      `Kernbegriffe fett, wichtige Formeln/Definitionen als Aufzählung, am Ende „Häufige ` +
      `Fallstricke". Keine Einleitungsfloskeln.` +
      notesBlock(notes)
  )
}

/**
 * Beantwortet im laufenden „Fragen"-Dialog eine Frage zu einem Fach. Bekommt den
 * bisherigen Verlauf (für echte Rückfragen) und optional die Fach-Zusammenfassung
 * als zusätzlichen Kontext.
 */
/**
 * Wertet die Lern- und Prüfungsdaten aller Fächer aus (Digest aus `grades.ts`)
 * und gibt Verbesserungstipps fürs Lernen als Markdown zurück.
 */
export async function analyzeStudyTactics(digest: string): Promise<string> {
  return run(
    `Analysiere die folgenden Lern- und Prüfungsdaten eines Studierenden und gib eine ehrliche, ` +
      `konkrete Auswertung der Lernstrategie mit Verbesserungstipps. Struktur in Markdown, genau diese Abschnitte:\n` +
      `## Was gut läuft\n(2–3 Stichpunkte)\n` +
      `## Woran es hakt\n(die klarsten Muster in den Daten: Zusammenhang zwischen erledigten Lernaufgaben ` +
      `bzw. Quiz-Sicherheit und Note, schwache Semester, Fächer mit viel Aufwand aber mäßiger Note, unfertige Lernpläne)\n` +
      `## Konkret ändern\n(3–5 nummerierte, spezifische Maßnahmen – auf die genannten Fächer und Muster bezogen)\n\n` +
      `Nur aus den Daten schließen, nichts erfinden, keine Pauschaltipps, kein Vorwort.` +
      `\n\n=== DATEN ===\n${digest}`
  )
}

export async function answerQuestion(
  kurs: string,
  notes: string,
  history: { role: 'user' | 'model'; text: string }[],
  question: string,
  extra?: { summary?: string }
): Promise<string> {
  const conv = history
    .filter((m) => m.text.trim() && !m.text.startsWith('⚠️'))
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'STUDENT' : 'DU'}: ${m.text}`)
    .join('\n')
  const sum = extra?.summary?.trim()
    ? `\n\n=== BISHERIGE ZUSAMMENFASSUNG (Kontext, darfst du nutzen) ===\n${extra.summary.trim().slice(0, 4000)}`
    : ''
  return run(
    `Fach „${kurs}". Du führst ein fortlaufendes Lern-Gespräch und beantwortest die nächste Frage ` +
      `der/des Studierenden auf Basis der Notizen. Sauberes Markdown, konkret, mit Beispiel wenn es hilft; ` +
      `beziehe dich auf das bisherige Gespräch und wiederhole nichts unnötig. Fragt die Person nach mehr ` +
      `Tiefe („genauer", „warum", „Beispiel"), dann Zwischenschritte einzeln, die Intuition dahinter und ein ` +
      `durchgerechnetes Beispiel.` +
      (conv ? `\n\n=== BISHERIGES GESPRÄCH ===\n${conv}` : '') +
      `\n\n=== NEUE FRAGE ===\n${question}` +
      sum +
      notesBlock(notes)
  )
}

export async function makeQuiz(
  kurs: string,
  notes: string,
  count = 8,
  avoidQuestions: string[] = [],
  focusTopic?: string
): Promise<QuizItem[]> {
  const avoid = avoidQuestions.length
    ? `\n\nStelle ANDERE Fragen als diese bereits vorhandenen (keine Wiederholungen, andere Aspekte):\n- ${avoidQuestions.slice(-40).join('\n- ')}`
    : ''
  const focus = focusTopic
    ? `\n\nKonzentriere dich auf das Thema „${focusTopic}" – vertiefende Fragen dazu.`
    : ''
  const text = await run(
    `Erstelle ${count} Multiple-Choice-Übungsfragen zu „${kurs}" aus den Notizen. ` +
      `Nur Inhalte, die in den Notizen vorkommen. Jede Frage mit genau 4 Optionen, ` +
      `nur eine richtig, plus kurze Begründung und einem kurzen Themen-Label. ` +
      `Gib AUSSCHLIESSLICH ein JSON-Array zurück, Schema pro Element: ` +
      `{"question": string, "choices": [string,string,string,string], "answer": number (0-3), "explanation": string, "topic": string (2-4 Wörter)}.` +
      focus +
      avoid +
      notesBlock(notes),
    { json: true, temp: 0.6 }
  )
  const items = parseQuizItems(text, focusTopic)
  if (!items.length) throw new Error('Kein verwertbares Quiz erhalten. Nochmal versuchen.')
  return items
}

export interface PlanContext {
  busyText?: string
  perfText?: string
  otherExamsText?: string
}

/** Gemeinsame Kontext-Blöcke (Kalender · Leistung · andere Prüfungen) für Plan-Erstellung und -Überarbeitung. */
function planContextBlocks(ctx: PlanContext): string {
  const busy = ctx.busyText
    ? `\n\nBereits verplante Zeiten des Studierenden – lege die Lernblöcke gezielt in die ` +
      `freien Lücken dazwischen, überlappe NIE mit diesen Terminen, an vollen Tagen weniger ` +
      `einplanen, freie Tage stärker nutzen:\n${ctx.busyText}`
    : ''
  const perf = ctx.perfText
    ? `\n\nAktuelle Leistung / Fehlerquoten – richte den Plan danach aus: schwachen Themen deutlich mehr Zeit, ` +
      `eigene Wiederholungstage und je einen "quiz"-Block; starke Themen nur kurz auffrischen:\n${ctx.perfText}`
    : ''
  const others = ctx.otherExamsText
    ? `\n\nWeitere Prüfungen des Studierenden (ganzer Zeitplan – NICHT für dieses Fach planen, aber ` +
      `Rücksicht nehmen: in den letzten ~2 Tagen vor jeder anderen Prüfung hier nichts Großes einplanen):\n${ctx.otherExamsText}`
    : ''
  return busy + perf + others
}

const PLAN_SCHEMA =
  `{"markdown": string (lesbarer Plan als Markdown-Liste/Tabelle, mit einem kurzen Absatz oben, ` +
  `warum der Plan so aussieht – Bezug auf Leistung/schwache Themen/andere Prüfungen), ` +
  `"tasks": [{"date":"YYYY-MM-DD","time":"HH:MM","title":string (kurz),"topic":string,"minutes":number,"kind":"lernen"|"wiederholen"|"quiz"}]}`

export async function makeStudyPlan(
  kurs: string,
  examTitle: string,
  examDateIso: string | null,
  notes: string,
  busyText?: string,
  perfText?: string,
  otherExamsText?: string
): Promise<StudyPlan> {
  const today = new Date().toISOString().slice(0, 10)
  const until = examDateIso
    ? `bis zur Prüfung am ${new Date(examDateIso).toLocaleDateString('de-DE')} (${examDateIso.slice(0, 10)})`
    : 'für die nächsten 14 Tage'
  const text = await run(
    `Erstelle einen realistischen, tageweisen Lernplan (${until}, heute ist ${today}) ` +
      `für „${examTitle}" im Fach „${kurs}". Nutze die Themen aus den Notizen, verteile sie ` +
      `sinnvoll, plane Wiederholungstage und einen Puffer vor der Prüfung. ` +
      `Gib AUSSCHLIESSLICH JSON zurück: ${PLAN_SCHEMA}. ` +
      `tasks nur an realen Kalendertagen zwischen heute und Prüfung, minutes 30–150, ` +
      `time am besten nachmittags/abends und an vollen Tagen später.` +
      planContextBlocks({ busyText, perfText, otherExamsText }) +
      notesBlock(notes),
    { json: true }
  )
  return parseStudyPlan(text)
}

/** Kompakte Aufgaben-Darstellung für den „aktueller Plan"-Block einer Überarbeitung. */
function tasksForPrompt(tasks: PlanTask[]): string {
  return JSON.stringify(
    tasks.map((t) => ({
      date: t.date,
      time: t.time ?? '',
      title: t.title,
      topic: t.topic,
      minutes: t.minutes,
      kind: t.kind ?? 'lernen',
      done: Boolean(t.done)
    }))
  )
}

/**
 * Überarbeitet einen bestehenden Lernplan-Entwurf anhand eines Änderungswunsches.
 * Bewährtes bleibt, erledigte Aufgaben (done:true) werden nicht gestrichen.
 * Das Ergebnis ist wieder nur ein Entwurf – der Nutzer bestätigt separat.
 */
export async function reviseStudyPlan(
  kurs: string,
  examTitle: string,
  examDateIso: string | null,
  notes: string,
  current: { markdown: string; tasks: PlanTask[] },
  feedback: string,
  busyText?: string,
  perfText?: string,
  otherExamsText?: string
): Promise<StudyPlan> {
  const today = new Date().toISOString().slice(0, 10)
  const until = examDateIso ? `bis ${examDateIso.slice(0, 10)}` : 'für die nächsten 14 Tage'
  const text = await run(
    `Überarbeite den bestehenden Lernplan für „${examTitle}" im Fach „${kurs}" (${until}, heute ist ${today}). ` +
      `Behalte, was gut ist – ändere nur, was der Änderungswunsch verlangt oder was dadurch nötig wird. ` +
      `Bereits erledigte Aufgaben (done:true) NICHT streichen und möglichst am selben Tag lassen. ` +
      `Gib AUSSCHLIESSLICH JSON im selben Schema zurück: ${PLAN_SCHEMA}. minutes 30–150, ` +
      `tasks nur an realen Kalendertagen ab heute.` +
      `\n\n=== AKTUELLER PLAN (Begründung) ===\n${current.markdown.slice(0, 4000)}` +
      `\n\n=== AKTUELLE AUFGABEN (JSON) ===\n${tasksForPrompt(current.tasks)}` +
      `\n\n=== ÄNDERUNGSWUNSCH ===\n${feedback.trim().slice(0, 800)}` +
      planContextBlocks({ busyText, perfText, otherExamsText }) +
      notesBlock(notes),
    { json: true }
  )
  return parseStudyPlan(text)
}

/** Empfiehlt anhand der Leistung den nächsten Schritt. */
export async function recommendNext(
  kurs: string,
  examTitle: string,
  perfText: string
): Promise<NextStep> {
  const text = await run(
    `Ein Studierender bereitet sich auf „${examTitle}" (${kurs}) vor. Aktuelle Leistung:\n${perfText}\n\n` +
      `Empfiehl den nächsten Schritt. Gib AUSSCHLIESSLICH JSON zurück: ` +
      `{"text": string (1–2 Sätze, motivierend, konkret), "action": "quiz"|"review"|"ready", "topic": string (nötig bei quiz/review, sonst "")}. ` +
      `"quiz" = neues gezieltes Quiz zu einem schwachen Thema; "review" = Thema nochmal durchgehen; ` +
      `"ready" = Leistung reicht, nur noch auffrischen.`,
    { json: true, temp: 0.4 }
  )
  return parseNextStep(text)
}

/**
 * Verteilt überfällige Aufgaben neu auf die nächsten Tage, ohne mit den schon
 * geplanten Terminen oder dem Kalender zu kollidieren – nichts fällt weg.
 * Gibt nur die neuen Datum/Uhrzeit-Werte der überfälligen Aufgaben zurück.
 */
export async function rescheduleOverdue(
  kurs: string,
  overdue: { id: string; title: string; topic: string; minutes: number; kind?: string }[],
  keep: { date: string; time?: string; title: string }[],
  busyText?: string,
  examDateIso?: string | null
): Promise<RescheduleMove[]> {
  const today = new Date().toISOString().slice(0, 10)
  const until = examDateIso
    ? `spätestens bis ${examDateIso.slice(0, 10)}`
    : 'in den nächsten 14 Tagen'
  const keepTxt = keep.length
    ? `\n\nBereits geplante Aufgaben (NICHT verschieben, nicht am selben Slot doppeln):\n` +
      keep.map((k) => `- ${k.date}${k.time ? ' ' + k.time : ''}: ${k.title}`).join('\n')
    : ''
  const busy = busyText
    ? `\n\nBelegte Kalenderzeiten (nicht überlappen, volle Tage meiden):\n${busyText}`
    : ''
  const list = overdue
    .map(
      (t) =>
        `- id ${t.id}: ${t.title} (${t.topic || 'Thema?'}, ${t.minutes} min, ${t.kind ?? 'lernen'})`
    )
    .join('\n')
  const text = await run(
    `Fach „${kurs}". Diese Aufgaben sind überfällig und müssen neu eingeplant werden ` +
      `(ab morgen, ${until}, heute ist ${today}). Verteile sie sinnvoll über die freien Tage, ` +
      `Uhrzeit nachmittags/abends, an vollen Tagen weniger. Keine Aufgabe darf wegfallen.\n${list}` +
      keepTxt +
      busy +
      `\n\nGib AUSSCHLIESSLICH ein JSON-Array zurück, je überfälliger Aufgabe genau ein Eintrag: ` +
      `[{"id": string (exakt wie oben), "date": "YYYY-MM-DD", "time": "HH:MM"}].`,
    { json: true }
  )
  return parseRescheduleMoves(
    text,
    overdue.map((t) => t.id),
    today
  )
}

/**
 * Liest aus dem Text eines Modulhandbuchs / Stundenplans den Semesternamen,
 * die Fächer, deren ECTS-Punkte und – falls genannt – Prüfungstermine heraus.
 */
export async function extractSemesterSetup(text: string): Promise<SemesterSetup> {
  const today = new Date().toISOString().slice(0, 10)
  const out = await run(
    `Aus dem folgenden Text (Modulhandbuch / Stundenplan / Studienübersicht) die ` +
      `Studien-Struktur herausziehen. Heute ist ${today}. ` +
      `Gib AUSSCHLIESSLICH JSON zurück: {"semester": string (z. B. "WS 2025" oder "3. Semester"), ` +
      `"courses": [{"name": string (Fach-/Modulname, ohne "Vorlesung/Übung"-Zusatz), ` +
      `"ects": number (Leistungspunkte, weglassen wenn unbekannt), ` +
      `"examDateIso": "YYYY-MM-DD" (Prüfungstermin, nur wenn eindeutig genannt)}]}. ` +
      `Nur echte Module, keine Dubletten.` +
      notesBlock(text),
    { json: true }
  )
  return parseSemesterSetup(out)
}
