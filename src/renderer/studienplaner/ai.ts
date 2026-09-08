import { nanoid } from 'nanoid'
import type { PlanTask, QuizItem } from './prep'
import { AI_NOTES_FILE, AI_SYSTEM_BASE } from './aiSystemPrompt'
import { joinPath } from './paths'
import { useSettingsStore } from '../store/settingsStore'

/**
 * KI-Funktionen für die Prüfungsvorbereitung (Gemini, Aufruf über den
 * Hauptprozess). Alle Funktionen bekommen den erkannten Notiztext als Kontext
 * und werfen bei Fehlern eine `Error` mit lesbarer Meldung.
 */

/** Basis-Anweisung + optionale eigene Regeln aus <Studium>/KI-Anweisung.md. */
async function systemInstruction(): Promise<string> {
  const root = useSettingsStore.getState().studienplanerPath
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

export async function answerQuestion(
  kurs: string,
  notes: string,
  history: { role: 'user' | 'model'; text: string }[],
  question: string
): Promise<string> {
  const conv = history
    .slice(-6)
    .map((m) => `${m.role === 'user' ? 'Frage' : 'Antwort'}: ${m.text}`)
    .join('\n')
  return run(
    `Beantworte die Frage einer/eines Studierenden zu „${kurs}" auf Basis der Notizen. ` +
      `Kurz, konkret, mit Beispiel wenn hilfreich.` +
      (conv ? `\n\nBisheriges Gespräch:\n${conv}` : '') +
      `\n\nNeue Frage: ${question}` +
      notesBlock(notes)
  )
}

interface RawQuiz {
  question?: string
  choices?: string[]
  answer?: number
  explanation?: string
  topic?: string
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
  let raw: RawQuiz[]
  try {
    const parsed = JSON.parse(text) as unknown
    raw = Array.isArray(parsed)
      ? (parsed as RawQuiz[])
      : ((parsed as { questions?: RawQuiz[] }).questions ?? [])
  } catch {
    throw new Error('Die KI-Antwort war kein gültiges Quiz-JSON. Nochmal versuchen.')
  }
  const items = raw
    .filter((q) => q.question && Array.isArray(q.choices) && q.choices.length >= 2)
    .map<QuizItem>((q) => ({
      id: nanoid(8),
      question: String(q.question),
      choices: q.choices!.map(String),
      answer: Math.max(0, Math.min((q.choices!.length ?? 1) - 1, Number(q.answer) || 0)),
      explanation: String(q.explanation ?? ''),
      topic: q.topic ? String(q.topic).slice(0, 40) : focusTopic
    }))
  if (!items.length) throw new Error('Kein verwertbares Quiz erhalten. Nochmal versuchen.')
  return items
}

export interface StudyPlan {
  markdown: string
  tasks: PlanTask[]
}

export async function makeStudyPlan(
  kurs: string,
  examTitle: string,
  examDateIso: string | null,
  notes: string,
  busyText?: string,
  perfText?: string
): Promise<StudyPlan> {
  const today = new Date().toISOString().slice(0, 10)
  const until = examDateIso
    ? `bis zur Prüfung am ${new Date(examDateIso).toLocaleDateString('de-DE')} (${examDateIso.slice(0, 10)})`
    : 'für die nächsten 14 Tage'
  const busy = busyText
    ? `\n\nBereits verplante Zeiten des Studierenden (nicht überlappen, an vollen Tagen weniger einplanen, freie Tage stärker nutzen):\n${busyText}`
    : ''
  const perf = perfText
    ? `\n\nAktuelle Leistung – richte den Plan danach aus: schwachen Themen deutlich mehr Zeit, ` +
      `eigene Wiederholungstage und je einen "quiz"-Block; starke Themen nur kurz auffrischen:\n${perfText}`
    : ''
  const text = await run(
    `Erstelle einen realistischen, tageweisen Lernplan (${until}, heute ist ${today}) ` +
      `für „${examTitle}" im Fach „${kurs}". Nutze die Themen aus den Notizen, verteile sie ` +
      `sinnvoll, plane Wiederholungstage und einen Puffer vor der Prüfung. ` +
      `Gib AUSSCHLIESSLICH JSON zurück: {"markdown": string (lesbarer Plan als Markdown-Liste/Tabelle, ` +
      `mit einem kurzen Absatz oben, warum der Plan so aussieht – Bezug auf Leistung/schwache Themen), ` +
      `"tasks": [{"date":"YYYY-MM-DD","time":"HH:MM","title":string (kurz),"topic":string,"minutes":number,"kind":"lernen"|"wiederholen"|"quiz"}]}. ` +
      `tasks nur an realen Kalendertagen zwischen heute und Prüfung, minutes 30–150, ` +
      `time am besten nachmittags/abends und an vollen Tagen später.` +
      busy +
      perf +
      notesBlock(notes),
    { json: true }
  )
  let parsed: { markdown?: string; tasks?: unknown[] }
  try {
    parsed = JSON.parse(text) as { markdown?: string; tasks?: unknown[] }
  } catch {
    return { markdown: text, tasks: [] }
  }
  const KINDS = new Set(['lernen', 'wiederholen', 'quiz'])
  const tasks: PlanTask[] = (Array.isArray(parsed.tasks) ? parsed.tasks : [])
    .map((t) => t as Partial<PlanTask>)
    .filter((t) => t.date && /^\d{4}-\d{2}-\d{2}$/.test(String(t.date)) && t.title)
    .map((t) => ({
      id: nanoid(6),
      date: String(t.date),
      time: /^\d{1,2}:\d{2}$/.test(String(t.time)) ? String(t.time).padStart(5, '0') : undefined,
      title: String(t.title).slice(0, 90),
      topic: String(t.topic ?? '').slice(0, 120),
      minutes: Math.max(15, Math.min(240, Math.round(Number(t.minutes) || 60))),
      kind: KINDS.has(String(t.kind)) ? (String(t.kind) as PlanTask['kind']) : 'lernen',
      done: false
    }))
  return { markdown: String(parsed.markdown ?? text), tasks }
}

export interface NextStep {
  /** Kurzer Rat in 1–2 Sätzen. */
  text: string
  action: 'quiz' | 'review' | 'ready'
  /** Thema für action = "quiz" / "review". */
  topic?: string
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
  try {
    const j = JSON.parse(text) as Partial<NextStep>
    const action =
      j.action === 'quiz' || j.action === 'review' || j.action === 'ready' ? j.action : 'review'
    return {
      text: String(j.text ?? 'Weiter üben.'),
      action,
      topic: j.topic ? String(j.topic) : undefined
    }
  } catch {
    return { text: text.slice(0, 300), action: 'review' }
  }
}
