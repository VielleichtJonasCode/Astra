import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { CalEvent } from '@shared/types'
import type { ChatMessage, Lernplan, PlanTask, QuizItem } from '../studienplaner/prep'
import {
  analyzeProgress,
  carryDoneByTitle,
  courseNoteList,
  courseNotesText,
  examKeyOf,
  perfPromptText,
  quizStats,
  taskCalendarEvent,
  taskStartMs,
  trimChat,
  weakQuiz
} from '../studienplaner/prep'
import {
  answerQuestion,
  makeQuiz,
  makeStudyPlan,
  makeSummary,
  recommendNext,
  reviseStudyPlan,
  type NextStep
} from '../studienplaner/ai'
import { busyDigest, daysLeftLabel, daysUntil, isExam } from '../studienplaner/calendar'
import { useStudienplanerStore, joinPath } from '../store/studienplanerStore'
import { useCalendarStore } from '../store/calendarStore'
import { requestDialog } from '../store/dialogStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Segmented, Toggle } from './common/controls'
import { Spinner } from './common/misc'
import { Markdown } from './common/Markdown'
import { PlanChecklist } from './PlanChecklist'
import { AddTaskForm } from './AddTaskForm'
import { CorrectRateBar } from './CorrectRateBar'
import { ExamResultForm } from './ExamResultForm'
import { resultKey } from '../studienplaner/model'
import { openPaths } from '../lib/fileActions'
import { toast } from './common/toast'
import { cx } from '../lib/cx'
import './prep.css'

export type PrepTab = 'summary' | 'ask' | 'quiz' | 'plan' | 'material' | 'result'
type Tab = PrepTab

const KIND_LABEL: Record<string, string> = {
  lernen: 'Lernen',
  wiederholen: 'Wiederholen',
  quiz: 'Quiz'
}

/** Aufgaben-Vorschau eines noch nicht übernommenen Lernplan-Entwurfs. */
function DraftPreview({
  tasks,
  onRemove
}: {
  tasks: PlanTask[]
  onRemove: (id: string) => void
}): JSX.Element {
  const sorted = [...tasks].sort((a, b) =>
    `${a.date} ${a.time ?? ''}`.localeCompare(`${b.date} ${b.time ?? ''}`)
  )
  if (!sorted.length) {
    return (
      <p className="prep__muted">
        Keine Aufgaben im Entwurf – „Mit KI anpassen“ nutzen oder „Aufgabe“ hinzufügen.
      </p>
    )
  }
  return (
    <ul className="prep__draftlist">
      {sorted.map((t) => (
        <li key={t.id}>
          <span className="prep__draftday">
            {new Date(`${t.date}T00:00:00`).toLocaleDateString('de-DE', {
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            })}
          </span>
          <span className="prep__drafttime">{t.time ?? '–'}</span>
          <span className="prep__drafttitle">{t.title}</span>
          <span className="prep__draftmeta">
            {t.minutes} min · {KIND_LABEL[t.kind ?? 'lernen']}
          </span>
          <button className="prep__draftdel" onClick={() => onRemove(t.id)} aria-label="Entfernen">
            ✕
          </button>
        </li>
      ))}
    </ul>
  )
}

/* ── Quiz-Übung ───────────────────────────────────────────────────────── */

function QuizRunner({
  items,
  plan,
  onProgress
}: {
  items: QuizItem[]
  plan: Lernplan
  onProgress: (qid: string, correct: boolean) => void
}): JSX.Element {
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const q = items[i]

  const answered = Object.keys(plan.progress).length
  const correct = Object.values(plan.progress).filter((p) => p.correct > 0).length

  if (!q) return <p className="prep__muted">Noch keine Fragen. Oben „Quiz erstellen“.</p>

  const choose = (idx: number): void => {
    if (picked !== null) return
    setPicked(idx)
    onProgress(q.id, idx === q.answer)
  }

  return (
    <div className="prep__quiz">
      <div className="prep__quizbar">
        <span>
          Frage {i + 1} / {items.length}
        </span>
        <span className="prep__muted">
          {answered} beantwortet · {correct} sicher
        </span>
      </div>
      <p className="prep__q">{q.question}</p>
      <div className="prep__choices">
        {q.choices.map((c, idx) => (
          <button
            key={idx}
            className={cx(
              'prep__choice',
              picked !== null && idx === q.answer && 'is-correct',
              picked === idx && idx !== q.answer && 'is-wrong'
            )}
            onClick={() => choose(idx)}
          >
            <span className="prep__choicekey">{String.fromCharCode(65 + idx)}</span>
            {c}
          </button>
        ))}
      </div>
      {picked !== null && (
        <div className="prep__expl">
          <strong>{picked === q.answer ? 'Richtig.' : 'Nicht ganz.'}</strong> {q.explanation}
        </div>
      )}
      <div className="prep__quiznav">
        <Button
          variant="ghost"
          disabled={i === 0}
          onClick={() => {
            setI((v) => Math.max(0, v - 1))
            setPicked(null)
          }}
        >
          Zurück
        </Button>
        {i < items.length - 1 ? (
          <Button
            variant="primary"
            disabled={picked === null}
            onClick={() => {
              setI((v) => v + 1)
              setPicked(null)
            }}
          >
            Weiter
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={picked === null}
            onClick={() => {
              setI(0)
              setPicked(null)
              toast.info('Von vorn – Fortschritt bleibt gespeichert.')
            }}
          >
            Nochmal von vorn
          </Button>
        )}
      </div>
    </div>
  )
}

/* ── Panel ────────────────────────────────────────────────────────────── */

export function PrepPanel({
  semester,
  kurs,
  onClose,
  initialTab
}: {
  semester: string
  kurs: string
  onClose: () => void
  initialTab?: PrepTab
}): JSX.Element {
  const index = useStudienplanerStore((s) => s.index)
  const loadLernplan = useStudienplanerStore((s) => s.loadLernplan)
  const saveLernplan = useStudienplanerStore((s) => s.saveLernplan)
  const linkExamToCourse = useStudienplanerStore((s) => s.linkExamToCourse)
  const ensureNotesText = useStudienplanerStore((s) => s.ensureNotesText)
  const calEvents = useCalendarStore((s) => s.events)

  const [plan, setPlan] = useState<Lernplan | null>(null)
  const [tab, setTab] = useState<Tab>(initialTab ?? 'summary')
  const [busy, setBusy] = useState<string | null>(null)
  const [hasKey, setHasKey] = useState(true)
  const [chat, setChat] = useState<ChatMessage[]>([])
  const [askError, setAskError] = useState<string | null>(null)
  const [question, setQuestion] = useState('')
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [sourcesOpen, setSourcesOpen] = useState(true)
  const [quizIdx, setQuizIdx] = useState(0)
  const [weakMode, setWeakMode] = useState(false)
  const [nextStep, setNextStep] = useState<NextStep | null>(null)
  const [examPickerOpen, setExamPickerOpen] = useState(false)
  const [addingTask, setAddingTask] = useState(false)
  // Lernplan-Entwurf: erst nach „Übernehmen" wird er der aktive Plan.
  const [draft, setDraft] = useState<{ markdown: string; tasks: PlanTask[] } | null>(null)
  const [planFeedback, setPlanFeedback] = useState('')
  const [resTitle, setResTitle] = useState('')
  const [resUrl, setResUrl] = useState('')
  const calStatus = useCalendarStore((s) => s.status)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const runSummaryRef = useRef<(() => Promise<void>) | null>(null)
  const sourcesInit = useRef(false)
  // Immer der frischeste Plan – für Persist-Aufrufe nach einem `await`, damit
  // eine zwischenzeitliche Änderung (z. B. Quellenauswahl) nicht überschrieben wird.
  const planRef = useRef<Lernplan | null>(null)

  // Notizen mit Text + Bilder/PDF, aus denen Apple Vision noch Text ziehen kann.
  const noteList = useMemo(
    () => courseNoteList(index, semester, kurs).filter((n) => n.hasText || n.ocrable),
    [index, semester, kurs]
  )
  const notes = useMemo(
    () => courseNotesText(index, semester, kurs, sources),
    [index, semester, kurs, sources]
  )
  const anyOcrPending = useMemo(
    () => noteList.some((n) => n.ocrable && sources.has(n.relPath)),
    [noteList, sources]
  )

  /** Notiztext für die KI holen – Bilder/PDF ohne Text vorher per Apple Vision erkennen. */
  const gatherNotes = async (): Promise<string> => {
    if (anyOcrPending) setBusy('Notizen werden gelesen (Apple Vision) …')
    return ensureNotesText(semester, kurs, [...sources])
  }

  useEffect(() => {
    sourcesInit.current = false
    setSources(new Set())
    setDraft(null)
    setPlanFeedback('')
    void loadLernplan(semester, kurs).then((p) => {
      setPlan(p)
      setChat(p.chat ?? [])
      setAskError(null)
    })
    void window.api.llmHasKey().then(setHasKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester, kurs, loadLernplan])

  // Quellen-Vorauswahl: erst wenn die Notizen wirklich geladen sind (im Demo-/
  // Kaltstart kommt der Ordner-Index verzögert). Gespeicherte Auswahl gewinnt,
  // sonst alle Notizen mit Text.
  useEffect(() => {
    if (sourcesInit.current || !plan) return
    const all = noteList.map((n) => n.relPath)
    if (all.length === 0) return
    const stored = (plan.sources ?? []).filter((rp) => all.includes(rp))
    setSources(new Set(stored.length ? stored : all))
    sourcesInit.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, noteList])

  // Nur für Screenshots: #spdraft=1 zeigt den Lernplan-Entwurf-Zustand.
  useEffect(() => {
    if (plan && !draft && /[#&]spdraft=1/.test(location.hash)) {
      setDraft({ markdown: plan.plan, tasks: plan.planTasks ?? [] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  const perf = useMemo(() => (plan ? analyzeProgress(plan) : null), [plan])

  // Zusammenfassung beim ersten Öffnen des Tabs automatisch erstellen, wenn es
  // Notizen gibt und noch keine da ist.
  const autoSummaryTried = useRef(false)
  useEffect(() => {
    if (autoSummaryTried.current || busy) return
    if (tab !== 'summary' || !plan || plan.summary.trim()) return
    if (!hasKey || noteList.length === 0 || sources.size === 0) return
    autoSummaryTried.current = true
    void runSummaryRef.current?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, plan, hasKey, noteList.length, sources.size, busy])

  planRef.current = plan

  if (!plan) {
    return (
      <div className="prep prep--loading">
        <Spinner size={22} />
      </div>
    )
  }

  const persist = (next: Lernplan, immediate = false): void => {
    setPlan(next)
    planRef.current = next
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const doSave = (): void => void saveLernplan(semester, kurs, next)
    if (immediate) doSave()
    else saveTimer.current = setTimeout(doSave, 900)
  }

  const applySources = (next: Set<string>): void => {
    setSources(next)
    persist({ ...plan, sources: [...next] })
  }

  const guardKey = (): boolean => {
    if (hasKey) return true
    toast.error('Erst einen Gemini-Schlüssel in den Einstellungen eintragen.')
    return false
  }

  const guardSources = (): boolean => {
    if (noteList.length === 0) {
      toast.error('Für dieses Fach gibt es noch keine Notizen.')
      return false
    }
    if (sources.size === 0) {
      toast.error('Wähle oben mindestens eine Quelle aus.')
      return false
    }
    return true
  }

  const runSummary = async (): Promise<void> => {
    if (!guardKey() || !guardSources()) return
    try {
      const src = await gatherNotes()
      setBusy('Zusammenfassung wird erstellt …')
      const text = await makeSummary(plan.kurs, src)
      persist({ ...plan, summary: text }, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }
  runSummaryRef.current = runSummary

  /**
   * Kontext für die KI (Notiztext · Kalender-Auslastung · Leistung · andere
   * Prüfungen). `askCalendar` stellt die einmalige „ist alles im Kalender?"-Frage.
   */
  const buildPlanContext = async (
    askCalendar: boolean
  ): Promise<{
    src: string
    busyText?: string
    perfText?: string
    otherExamsText?: string
    cancelled?: boolean
  }> => {
    const src = await gatherNotes()
    let busyText: string | undefined
    if (plan.useCalendar && calStatus === 'authorized') {
      const from = new Date().toISOString()
      const to = new Date(
        plan.examDateIso ? new Date(plan.examDateIso).getTime() : Date.now() + 21 * 864e5
      ).toISOString()
      const evs = await window.api.calEvents(from, to).catch(() => [] as CalEvent[])
      busyText = busyDigest(evs, plan.examDateIso ?? null) || undefined
      if (
        askCalendar &&
        !confirm(
          'Astra legt die Lernblöcke in die freien Lücken deines Kalenders. ' +
            'Steht in den nächsten Tagen sonst noch etwas an, das NICHT im Kalender ist? ' +
            'Dann bitte zuerst eintragen.\n\nOK = alles Wichtige ist im Kalender, Entwurf jetzt erstellen.'
        )
      ) {
        return { src, cancelled: true }
      }
    }
    const perfText = perf
      ? perfPromptText(
          perf,
          perf.weakItemIds
            .map(
              (id) =>
                plan.quizzes.flatMap((q) => q.items).find((it) => it.id === id)?.question ?? ''
            )
            .filter(Boolean)
        ) || undefined
      : undefined
    const otherExamsText =
      calEvents
        .filter(
          (e) =>
            isExam(e.title, e.notes) &&
            new Date(e.start).getTime() > Date.now() &&
            examKeyOf(e.title, e.start) !== plan.examKey
        )
        .sort((a, b) => a.start.localeCompare(b.start))
        .slice(0, 8)
        .map((e) => `- ${e.title} am ${e.start.slice(0, 10)}`)
        .join('\n') || undefined
    return { src, busyText, perfText, otherExamsText }
  }

  /** Neuen Lernplan-Entwurf von der KI erstellen lassen (noch nicht übernehmen). */
  const generatePlan = async (): Promise<void> => {
    if (!guardKey() || !guardSources()) return
    try {
      const ctx = await buildPlanContext(true)
      if (ctx.cancelled) return
      setBusy('Lernplan-Entwurf wird erstellt …')
      const res = await makeStudyPlan(
        plan.kurs,
        plan.name,
        plan.examDateIso ?? null,
        ctx.src,
        ctx.busyText,
        ctx.perfText,
        ctx.otherExamsText
      )
      setDraft({ markdown: res.markdown, tasks: res.tasks })
      setPlanFeedback('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  /** Den aktiven Plan als Entwurf laden, um ihn (mit KI) zu überarbeiten. */
  const startRevise = (): void => {
    setDraft({ markdown: plan.plan, tasks: plan.planTasks ?? [] })
    setPlanFeedback('')
    setAddingTask(false)
  }

  /** Den aktuellen Entwurf anhand des Änderungswunsches von der KI anpassen lassen. */
  const revisePlan = async (): Promise<void> => {
    if (!draft || !guardKey() || !guardSources()) return
    const fb = planFeedback.trim()
    if (!fb) {
      toast.error('Schreib kurz, was am Plan anders sein soll.')
      return
    }
    try {
      const ctx = await buildPlanContext(false)
      if (ctx.cancelled) return
      setBusy('Entwurf wird angepasst …')
      const res = await reviseStudyPlan(
        plan.kurs,
        plan.name,
        plan.examDateIso ?? null,
        ctx.src,
        draft,
        fb,
        ctx.busyText,
        ctx.perfText,
        ctx.otherExamsText
      )
      setDraft({ markdown: res.markdown, tasks: res.tasks })
      setPlanFeedback('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  const removeDraftTask = (id: string): void =>
    setDraft((d) => (d ? { ...d, tasks: d.tasks.filter((t) => t.id !== id) } : d))

  const discardDraft = (): void => {
    setDraft(null)
    setPlanFeedback('')
    setAddingTask(false)
  }

  /** Entwurf endgültig übernehmen: wird der aktive Plan; Fortschritt bleibt erhalten. */
  const confirmDraft = (): void => {
    if (!draft) return
    // Kalendertermine des ersetzten Plans entfernen und die Verknüpfungen der
    // übernommenen Aufgaben zurücksetzen – der Plan gilt danach als „noch nicht
    // im Kalender", „In Kalender eintragen" trägt ihn frisch ein.
    const staleEventIds = (plan.planTasks ?? [])
      .map((t) => t.calEventId)
      .filter((id): id is string => Boolean(id))
    if (staleEventIds.length) void useCalendarStore.getState().deleteEvents(staleEventIds)
    const tasks = carryDoneByTitle(plan.planTasks ?? [], draft.tasks).map((t) =>
      t.calEventId ? { ...t, calEventId: undefined } : t
    )
    persist({ ...plan, plan: draft.markdown, planTasks: tasks, plannedAt: null }, true)
    setDraft(null)
    setPlanFeedback('')
    setAddingTask(false)
    toast.success('Lernplan übernommen.')
  }

  const taskEvent = (t: PlanTask): { title: string; start: string; end: string; notes: string } =>
    taskCalendarEvent(plan.name, t)

  const planToCalendar = async (): Promise<void> => {
    const tasks = plan.planTasks ?? []
    if (!tasks.length) {
      toast.error('Keine planbaren Aufgaben – Lernplan neu erstellen.')
      return
    }
    const cutoff = Date.now() - 3600_000
    const future = tasks.filter((t) => taskStartMs(t) > cutoff)
    const toAdd = future.filter((t) => !t.calEventId)
    const toUpdate = future.filter((t) => t.calEventId)
    if (!toAdd.length && !toUpdate.length) {
      toast.error('Alle Termine liegen in der Vergangenheit – Lernplan neu erstellen.')
      return
    }
    const msg = toUpdate.length
      ? `${toAdd.length} neue Lerntermine eintragen und ${toUpdate.length} vorhandene aktualisieren?`
      : `${toAdd.length} Lerntermine in den Studium-Kalender eintragen?`
    if (!confirm(msg)) return
    setBusy('Kalender wird abgeglichen …')
    try {
      const cal = useCalendarStore.getState()
      if (toUpdate.length) {
        await cal.updateEvents(
          toUpdate.map((t) => ({ id: t.calEventId as string, ...taskEvent(t) }))
        )
      }
      let planTasks = plan.planTasks ?? []
      if (toAdd.length) {
        const { ids } = await cal.addEvents(toAdd.map(taskEvent))
        const idByTask = new Map<string, string>()
        toAdd.forEach((t, i) => {
          if (ids[i]) idByTask.set(t.id, ids[i])
        })
        planTasks = planTasks.map((t) =>
          idByTask.has(t.id) ? { ...t, calEventId: idByTask.get(t.id) } : t
        )
      }
      persist({ ...plan, planTasks, plannedAt: new Date().toISOString() }, true)
      toast.success(`Kalender abgeglichen · ${toAdd.length + toUpdate.length} Lerntermine.`)
    } finally {
      setBusy(null)
    }
  }

  const toggleTask = (id: string): void => {
    const now = new Date().toISOString()
    const planTasks = (plan.planTasks ?? []).map((t) =>
      t.id === id ? { ...t, done: !t.done, doneAt: now } : t
    )
    persist({ ...plan, planTasks }, true)
  }

  const removeTask = (id: string): void => {
    const gone = (plan.planTasks ?? []).find((t) => t.id === id)
    if (gone?.calEventId) void useCalendarStore.getState().deleteEvents([gone.calEventId])
    persist({ ...plan, planTasks: (plan.planTasks ?? []).filter((t) => t.id !== id) }, true)
  }

  const addTask = (task: PlanTask): void => {
    if (draft) setDraft({ ...draft, tasks: [...draft.tasks, task] })
    else persist({ ...plan, planTasks: [...(plan.planTasks ?? []), task] }, true)
    setAddingTask(false)
  }

  const openAttachment = (rel: string): void => {
    const root = useStudienplanerStore.getState().path
    if (!root) return
    const abs = joinPath(root, rel)
    if (rel.toLowerCase().endsWith('.pdf')) void openPaths([abs])
    else window.api.spReveal(abs)
  }

  const runQuiz = async (mode: 'new' | 'append' | 'regen', focusTopic?: string): Promise<void> => {
    if (!guardKey() || !guardSources()) return
    setWeakMode(false)
    try {
      const src = await gatherNotes()
      setBusy(
        mode === 'append'
          ? 'Weitere Fragen …'
          : mode === 'regen'
            ? 'Neue Fragen zum selben Thema …'
            : 'Quiz wird erstellt …'
      )
      const avoid = plan.quizzes.flatMap((q) => q.items.map((it) => it.question))
      // „regen": Themen des aktuellen Quiz als Fokus, gleiche Fragenzahl.
      const cur = plan.quizzes[quizIdx]
      const regenTopics =
        mode === 'regen' && cur
          ? [...new Set(cur.items.map((it) => it.topic).filter(Boolean))].join(', ')
          : undefined
      const count = mode === 'regen' && cur ? Math.max(4, cur.items.length) : 8
      const items = await makeQuiz(plan.kurs, src, count, avoid, focusTopic ?? regenTopics)
      if (mode === 'regen' && cur) {
        const keepIds = new Set(items.map((it) => it.id))
        const quizzes = plan.quizzes.map((q, i) => (i === quizIdx ? { ...q, items } : q))
        // verwaiste Fortschritts-Einträge des alten Quiz entfernen
        const stillUsed = new Set(quizzes.flatMap((q) => q.items.map((it) => it.id)))
        const progress = Object.fromEntries(
          Object.entries(plan.progress).filter(([id]) => stillUsed.has(id) || keepIds.has(id))
        )
        persist({ ...plan, quizzes, progress }, true)
        setTab('quiz')
        toast.success('Quiz mit neuen Fragen zum selben Thema.')
        return
      }
      if (mode === 'append' && plan.quizzes[quizIdx]) {
        const quizzes = plan.quizzes.map((q, i) =>
          i === quizIdx ? { ...q, items: [...q.items, ...items] } : q
        )
        persist({ ...plan, quizzes }, true)
      } else {
        const name = focusTopic ? `${focusTopic}`.slice(0, 24) : `Quiz ${plan.quizzes.length + 1}`
        const quizzes = [
          ...plan.quizzes,
          { id: nanoid(6), name, created: new Date().toISOString(), items }
        ]
        persist({ ...plan, quizzes }, true)
        setQuizIdx(quizzes.length - 1)
      }
      setTab('quiz')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  /** Modell fragen und die Antwort an `base` anhängen + speichern. */
  const runAnswer = async (
    q: string,
    history: ChatMessage[],
    base: ChatMessage[]
  ): Promise<void> => {
    try {
      const src = await gatherNotes()
      setBusy('Denkt nach …')
      const a = await answerQuestion(plan.kurs, src, history, q, { summary: plan.summary })
      const next = trimChat([
        ...base,
        { id: nanoid(8), role: 'model', text: a, at: new Date().toISOString() }
      ])
      setChat(next)
      // frischesten Plan nehmen – der Nutzer könnte während „Denkt nach …" etwas geändert haben
      persist({ ...(planRef.current ?? plan), chat: next }, true)
    } catch (e) {
      setAskError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  const ask = async (explicit?: string): Promise<void> => {
    const q = (explicit ?? question).trim()
    if (!q || Boolean(busy) || !guardKey() || !guardSources()) return
    if (!explicit) setQuestion('')
    setAskError(null)
    const history = chat
    const withUser = trimChat([
      ...chat,
      { id: nanoid(8), role: 'user', text: q, at: new Date().toISOString() }
    ])
    setChat(withUser)
    persist({ ...plan, chat: withUser }, true)
    await runAnswer(q, history, withUser)
  }

  /** Nach einem Fehler die letzte Frage erneut stellen – ohne sie zu doppeln. */
  const retryLast = async (): Promise<void> => {
    if (Boolean(busy) || !guardKey() || !guardSources()) return
    const idx = chat.map((m) => m.role).lastIndexOf('user')
    if (idx < 0) return
    setAskError(null)
    await runAnswer(chat[idx].text, chat.slice(0, idx), chat)
  }

  /** Kurze Rückfrage an die letzte KI-Antwort. */
  const followUp = (text: string): void => void ask(text)

  const explainDeeper = (): void =>
    followUp(
      'Erkläre deine letzte Antwort ausführlicher: Zwischenschritte einzeln, die Intuition dahinter und ein konkretes, durchgerechnetes Beispiel.'
    )

  const clearChat = (): void => {
    setChat([])
    setAskError(null)
    persist({ ...plan, chat: [] }, true)
  }

  const onQuizProgress = (qid: string, correct: boolean): void => {
    const prev = plan.progress[qid]
    persist({
      ...plan,
      progress: {
        ...plan.progress,
        [qid]: {
          seen: (prev?.seen ?? 0) + 1,
          correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
          lastCorrect: correct,
          updated: new Date().toISOString()
        }
      }
    })
  }

  const askNext = async (): Promise<void> => {
    if (!guardKey() || !perf?.hasData) return
    setBusy('Empfehlung wird geholt …')
    try {
      const step = await recommendNext(plan.kurs, plan.name, perfPromptText(perf))
      setNextStep(step)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  const runningItems =
    weakMode && perf ? weakQuiz(plan, perf.weakItemIds).items : (plan.quizzes[quizIdx]?.items ?? [])

  const n = plan.examDateIso ? daysUntil(plan.examDateIso) : null
  const upcomingExams = calEvents
    .filter((e) => isExam(e.title, e.notes) && new Date(e.end).getTime() > Date.now())
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 12)

  const linkExam = async (ev: { title: string; start: string }): Promise<void> => {
    await linkExamToCourse(
      { examKey: examKeyOf(ev.title, ev.start), title: ev.title, dateIso: ev.start },
      semester,
      kurs
    )
    setPlan((p) => (p ? { ...p, examKey: 'x', examTitle: ev.title, examDateIso: ev.start } : p))
    setExamPickerOpen(false)
    toast.success(`Mit „${ev.title}" verknüpft.`)
  }
  const unlinkExam = (): void => {
    persist({ ...plan, examKey: null, examTitle: null, examDateIso: null }, true)
  }

  const addResource = (): void => {
    const title = resTitle.trim()
    let url = resUrl.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    persist(
      {
        ...plan,
        resources: [
          ...(plan.resources ?? []),
          { id: nanoid(6), title: title || url.replace(/^https?:\/\//, '').slice(0, 40), url }
        ]
      },
      true
    )
    setResTitle('')
    setResUrl('')
  }

  return (
    <div className="prep">
      <header className="prep__head">
        <button className="prep__back" onClick={onClose}>
          <Icon name="chevron-left" size={15} /> Lernplan
        </button>
        <div className="prep__title">
          <strong>{plan.kurs}</strong>
          <span>
            {plan.semester}
            {plan.examTitle && ` · 🗓 ${plan.examTitle}`}
            {n !== null && ` · ${daysLeftLabel(n)}`}
          </span>
        </div>
        <div className="prep__headright">
          {plan.examKey ? (
            <button className="prep__link" onClick={unlinkExam} title="Verknüpfung lösen">
              🗓 verknüpft ✕
            </button>
          ) : (
            <button className="prep__link" onClick={() => setExamPickerOpen((v) => !v)}>
              🗓 Prüfung verknüpfen
            </button>
          )}
          <IconButton
            name="folder-open"
            label="Ordner zeigen"
            onClick={() => {
              const path = useStudienplanerStore.getState().path
              if (path) window.api.spReveal(path)
            }}
          />
        </div>
      </header>

      {examPickerOpen && (
        <div className="prep__exampick">
          {upcomingExams.length === 0 ? (
            <p className="prep__muted">
              Keine kommenden Prüfungen im Kalender (oder Kalender nicht verbunden – in der
              Termine-Leiste verbinden).
            </p>
          ) : (
            upcomingExams.map((ev) => (
              <button key={ev.id} className="prep__examopt" onClick={() => void linkExam(ev)}>
                <strong>{ev.title}</strong>
                <span>
                  {new Date(ev.start).toLocaleDateString('de-DE', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  })}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {!hasKey && (
        <div className="prep__keywarn">
          Für Zusammenfassung, Quiz &amp; Fragen braucht Astra einen kostenlosen Gemini-Schlüssel.
          <Button size="sm" onClick={() => requestDialog('preferences')}>
            Einstellungen öffnen
          </Button>
        </div>
      )}

      <div className="prep__tabs">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'summary', label: 'Zusammenf.' },
            { value: 'ask', label: 'Fragen' },
            { value: 'quiz', label: 'Quiz' },
            { value: 'plan', label: 'Lernplan' },
            { value: 'material', label: 'Material' },
            { value: 'result', label: 'Ergebnis' }
          ]}
        />
      </div>

      {noteList.length > 0 && (
        <div className="prep__sources">
          <button className="prep__srchead" onClick={() => setSourcesOpen((v) => !v)}>
            <Icon name={sourcesOpen ? 'chevron-down' : 'chevron-right'} size={14} />
            <span>
              Welche Notizen soll die KI nutzen?
              <em>
                {' '}
                {sources.size} / {noteList.length} ausgewählt
              </em>
            </span>
          </button>
          {sourcesOpen && (
            <div className="prep__srlist">
              <div className="prep__srall">
                <button onClick={() => applySources(new Set(noteList.map((n) => n.relPath)))}>
                  Alle auswählen
                </button>
                <button onClick={() => applySources(new Set())}>Keine</button>
              </div>
              {noteList.map((n) => {
                const on = sources.has(n.relPath)
                return (
                  <label key={n.relPath} className={cx('prep__srrow', on && 'is-on')}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(sources)
                        if (next.has(n.relPath)) next.delete(n.relPath)
                        else next.add(n.relPath)
                        applySources(next)
                      }}
                    />
                    <span className="prep__srtext">
                      <span className="prep__srthema">{n.thema}</span>
                      <span className="prep__srname">
                        {n.name}
                        {n.ocrable && <em className="prep__srocr"> · Text wird erkannt</em>}
                      </span>
                    </span>
                  </label>
                )
              })}

              <div className="prep__srcal">
                <Toggle
                  checked={Boolean(plan.useCalendar)}
                  onChange={(v) => persist({ ...plan, useCalendar: v })}
                  label="Kalender einbeziehen"
                />
                <span>
                  Kalender einbeziehen
                  <em>
                    {calStatus === 'authorized'
                      ? 'Der Lernplan plant um volle Tage herum und nutzt freie Tage stärker.'
                      : 'Zuerst in der Termine-Leiste „Kalender verbinden“.'}
                  </em>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="prep__body">
        {busy && (
          <div className="prep__busy">
            <Spinner size={18} /> {busy}
          </div>
        )}

        {tab === 'summary' && (
          <>
            <div className="prep__actions">
              <Button icon="sparkles" onClick={() => void runSummary()} disabled={Boolean(busy)}>
                {plan.summary ? 'Neu erstellen' : 'Zusammenfassung erstellen'}
              </Button>
            </div>
            {plan.summary ? (
              <Markdown md={plan.summary} />
            ) : (
              <p className="prep__muted">
                Aus den erkannten Notiztexten dieses Fachs entsteht hier eine Lern-Zusammenfassung.
                {notes
                  ? ''
                  : anyOcrPending
                    ? ' (Der Text wird beim ersten Erstellen per Apple Vision aus den Bildern gelesen.)'
                    : ' (Noch keine Notizen in diesem Kurs.)'}
              </p>
            )}
          </>
        )}

        {tab === 'ask' && (
          <div className="prep__chat">
            {chat.length > 0 && (
              <div className="prep__chattop">
                <span className="prep__muted">Gespräch zu {plan.kurs} · bleibt gespeichert</span>
                <button className="prep__chatclear" onClick={clearChat} disabled={Boolean(busy)}>
                  Verlauf löschen
                </button>
              </div>
            )}
            {chat.length === 0 && !askError && (
              <p className="prep__muted">
                Stell Fragen zu diesem Fach – z. B. „Erklär mir den Beweis von …“. Du kannst
                jederzeit nachfragen; der Verlauf bleibt erhalten und die KI bezieht sich darauf.
              </p>
            )}
            {chat.map((m, i) => {
              const last = i === chat.length - 1
              return (
                <div
                  key={m.id}
                  className={cx('prep__msg', m.role === 'user' ? 'is-user' : 'is-model')}
                >
                  {m.role === 'model' ? <Markdown md={m.text} className="prep__msgmd" /> : m.text}
                  {m.role === 'model' && last && !busy && (
                    <div className="prep__followups">
                      <button className="prep__deeper" onClick={explainDeeper}>
                        Genauer erklären
                      </button>
                      <button
                        className="prep__deeper"
                        onClick={() =>
                          followUp('Gib dazu ein konkretes, durchgerechnetes Beispiel.')
                        }
                      >
                        Beispiel
                      </button>
                      <button
                        className="prep__deeper"
                        onClick={() => followUp('Fasse das in zwei, drei Sätzen zusammen.')}
                      >
                        Kürzer
                      </button>
                      <button
                        className="prep__deeper"
                        onClick={() =>
                          followUp('Warum ist das so? Begründe den entscheidenden Schritt.')
                        }
                      >
                        Warum?
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {askError && (
              <div className="prep__msg is-model prep__msg--err">
                ⚠️ {askError}
                <button className="prep__deeper" onClick={() => void retryLast()}>
                  Nochmal versuchen
                </button>
              </div>
            )}
            <form
              className="prep__askbar"
              onSubmit={(e) => {
                e.preventDefault()
                void ask()
              }}
            >
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={chat.length ? 'Nachfragen …' : 'Frage zu diesem Fach …'}
              />
              <Button variant="primary" disabled={Boolean(busy) || !question.trim()} type="submit">
                {chat.length ? 'Senden' : 'Fragen'}
              </Button>
            </form>
          </div>
        )}

        {tab === 'quiz' && (
          <>
            <div className="prep__actions">
              <Button icon="sparkles" onClick={() => void runQuiz('new')} disabled={Boolean(busy)}>
                {plan.quizzes.length ? 'Neues Quiz' : 'Quiz erstellen'}
              </Button>
              {plan.quizzes.length > 0 && (
                <Button
                  variant="ghost"
                  onClick={() => void runQuiz('append')}
                  disabled={Boolean(busy)}
                >
                  Fragen ergänzen
                </Button>
              )}
              {plan.quizzes[quizIdx] && (
                <Button
                  variant="ghost"
                  onClick={() => void runQuiz('regen')}
                  disabled={Boolean(busy)}
                >
                  Neue Fragen, gleiches Thema
                </Button>
              )}
              {perf?.hasData && (
                <Button variant="ghost" onClick={() => void askNext()} disabled={Boolean(busy)}>
                  Nächster Schritt
                </Button>
              )}
            </div>

            {perf && perf.overallTotal > 0 && (
              <div className="prep__perf">
                <CorrectRateBar
                  label="Richtig gesamt"
                  correct={perf.overallCorrect}
                  total={perf.overallTotal}
                />
                <p className="prep__perfsub">
                  {perf.overallCorrect}/{perf.overallTotal} korrekt
                  {perf.taskScored > 0
                    ? ` · davon ${perf.taskCorrect}/${perf.taskTotal} aus eigenen Aufgaben`
                    : ''}
                </p>
                {perf.byTopic
                  .filter((t) => t.seen > 0)
                  .map((t) => (
                    <div key={t.topic} className="prep__perfrow">
                      <span title={t.topic}>{t.topic}</span>
                      <span className={cx('prep__bar', t.weak && 'is-weak')}>
                        <i style={{ width: `${Math.round(t.mastery * 100)}%` }} />
                      </span>
                      <span className="prep__perfval">{Math.round(t.mastery * 100)}%</span>
                    </div>
                  ))}
              </div>
            )}

            {nextStep && (
              <div className="prep__next">
                <p>{nextStep.text}</p>
                {nextStep.action === 'quiz' && nextStep.topic && (
                  <Button
                    size="sm"
                    icon="sparkles"
                    disabled={Boolean(busy)}
                    onClick={() => void runQuiz('new', nextStep.topic)}
                  >
                    Quiz zu „{nextStep.topic}“
                  </Button>
                )}
                {nextStep.action === 'review' && nextStep.topic && (
                  <Button size="sm" onClick={() => setTab('summary')}>
                    „{nextStep.topic}“ in der Zusammenfassung
                  </Button>
                )}
                <button className="prep__nextx" onClick={() => setNextStep(null)}>
                  ✕
                </button>
              </div>
            )}

            <div className="prep__quizpick">
              {plan.quizzes.map((qz, i) => {
                const st = quizStats(plan, qz)
                return (
                  <button
                    key={qz.id}
                    className={cx('prep__quizchip', !weakMode && i === quizIdx && 'is-active')}
                    onClick={() => {
                      setWeakMode(false)
                      setQuizIdx(i)
                    }}
                  >
                    {qz.name}
                    <em>
                      {st.answered}/{st.total}
                      {st.pct !== null ? ` · ${Math.round(st.pct * 100)}% richtig` : ''}
                    </em>
                  </button>
                )
              })}
              {perf && perf.weakItemIds.length > 0 && (
                <button
                  className={cx('prep__quizchip', 'prep__quizchip--weak', weakMode && 'is-active')}
                  onClick={() => setWeakMode(true)}
                >
                  Wackelige Fragen<em>{perf.weakItemIds.length}</em>
                </button>
              )}
            </div>

            <QuizRunner
              key={weakMode ? 'weak' : (plan.quizzes[quizIdx]?.id ?? 'none')}
              items={runningItems}
              plan={plan}
              onProgress={onQuizProgress}
            />
          </>
        )}

        {tab === 'plan' && draft && (
          <div className="prep__draft">
            <div className="prep__draftbar">
              <span className="prep__drafttag">Entwurf – noch nicht übernommen</span>
              <div className="prep__draftbtns">
                <Button
                  variant="primary"
                  onClick={confirmDraft}
                  disabled={Boolean(busy) || draft.tasks.length === 0}
                >
                  Übernehmen ({draft.tasks.length})
                </Button>
                <Button variant="ghost" onClick={discardDraft} disabled={Boolean(busy)}>
                  Verwerfen
                </Button>
              </div>
            </div>

            <p className="prep__muted">
              {plan.planTasks?.length
                ? 'Ändere den Plan per KI oder von Hand. Erst „Übernehmen“ ersetzt deinen aktuellen Plan – erledigte Aufgaben bleiben erhalten.'
                : 'Prüfe den Vorschlag, passe ihn an und übernimm ihn dann.'}
            </p>

            <div className="prep__draftrevise">
              <textarea
                value={planFeedback}
                onChange={(e) => setPlanFeedback(e.target.value)}
                placeholder="Was soll anders sein? z. B. „weniger am Wochenende“, „Reihen früher dran“, „max. 60 min pro Tag“"
                rows={2}
                disabled={Boolean(busy)}
              />
              <div className="prep__draftrbtns">
                <Button
                  icon="sparkles"
                  onClick={() => void revisePlan()}
                  disabled={Boolean(busy) || !planFeedback.trim()}
                >
                  Mit KI anpassen
                </Button>
                <Button variant="ghost" icon="plus" onClick={() => setAddingTask((v) => !v)}>
                  Aufgabe
                </Button>
              </div>
            </div>

            {addingTask && (
              <AddTaskForm notes={noteList} onAdd={addTask} onCancel={() => setAddingTask(false)} />
            )}

            <DraftPreview tasks={draft.tasks} onRemove={removeDraftTask} />

            {draft.markdown && (
              <details className="prep__plandetails" open>
                <summary>Begründung des Entwurfs</summary>
                <Markdown md={draft.markdown} />
              </details>
            )}
          </div>
        )}

        {tab === 'plan' && !draft && (
          <>
            <div className="prep__actions">
              {(plan.planTasks?.length ?? 0) > 0 ? (
                <>
                  <Button icon="sparkles" onClick={startRevise} disabled={Boolean(busy)}>
                    Mit KI anpassen
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => void generatePlan()}
                    disabled={Boolean(busy)}
                  >
                    Neu erstellen
                  </Button>
                </>
              ) : (
                <Button
                  icon="sparkles"
                  onClick={() => void generatePlan()}
                  disabled={Boolean(busy)}
                >
                  Lernplan mit KI erstellen
                </Button>
              )}
              <Button variant="ghost" icon="plus" onClick={() => setAddingTask((v) => !v)}>
                Aufgabe
              </Button>
              {(plan.planTasks?.length ?? 0) > 0 && (
                <Button
                  variant={plan.plannedAt ? 'ghost' : 'primary'}
                  icon="calendar"
                  onClick={() => void planToCalendar()}
                  disabled={Boolean(busy)}
                >
                  {plan.plannedAt
                    ? 'Erneut eintragen'
                    : `In Kalender eintragen (${plan.planTasks?.length})`}
                </Button>
              )}
            </div>
            {addingTask && (
              <AddTaskForm notes={noteList} onAdd={addTask} onCancel={() => setAddingTask(false)} />
            )}
            {perf?.hasData && (
              <p className="prep__muted">
                Der Plan richtet sich nach deiner Quiz-Leistung (schwache Themen bekommen mehr Zeit
                und Wiederholung).
              </p>
            )}
            {plan.plannedAt && (
              <p className="prep__muted">
                ✓ Am {new Date(plan.plannedAt).toLocaleString('de-DE')} in den Studium-Kalender
                eingetragen.
              </p>
            )}
            {(plan.planTasks?.length ?? 0) > 0 && (
              <PlanChecklist
                items={(plan.planTasks ?? []).map((t) => ({ key: t.id, task: t }))}
                onToggle={toggleTask}
                onRemove={removeTask}
                onOpenAttachment={openAttachment}
                attachmentName={(rel) =>
                  rel
                    .split('/')
                    .pop()
                    ?.replace(/\.[^.]+$/, '') ?? rel
                }
                onSetScore={(id, score) =>
                  persist(
                    {
                      ...plan,
                      planTasks: (plan.planTasks ?? []).map((t) =>
                        t.id === id ? { ...t, score: score ?? undefined } : t
                      )
                    },
                    true
                  )
                }
              />
            )}
            {plan.plan ? (
              <details className="prep__plandetails">
                <summary>Begründung des Plans</summary>
                <Markdown md={plan.plan} />
              </details>
            ) : (
              <p className="prep__muted">
                Tageweiser Plan bis zur Prüfung, aus den Themen deiner Notizen – zum Abhaken, mit
                Zeiten. Erscheint auch im zentralen Lernplan.
                {plan.useCalendar ? ' Berücksichtigt deinen Kalender.' : ''}
              </p>
            )}
          </>
        )}

        {tab === 'material' && (
          <div className="prep__material">
            <p className="prep__muted">
              Videos und Web-Links zu diesem Fach – z. B. Vorlesungsaufzeichnungen, Erklärvideos,
              Skripte.
            </p>
            <div className="prep__matadd">
              <input
                placeholder="Titel (optional)"
                value={resTitle}
                onChange={(e) => setResTitle(e.target.value)}
              />
              <input
                placeholder="https://…"
                value={resUrl}
                onChange={(e) => setResUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addResource()}
              />
              <Button size="sm" icon="plus" disabled={!resUrl.trim()} onClick={addResource}>
                Hinzufügen
              </Button>
            </div>
            <div className="prep__matlist">
              {(plan.resources ?? []).length === 0 && <p className="prep__muted">Noch nichts.</p>}
              {(plan.resources ?? []).map((r) => (
                <div key={r.id} className="prep__mat">
                  <button className="prep__matopen" onClick={() => window.open(r.url, '_blank')}>
                    <Icon name="play" size={13} /> {r.title}
                  </button>
                  <span className="prep__maturl">{r.url.replace(/^https?:\/\//, '')}</span>
                  <IconButton
                    name="trash"
                    label="Entfernen"
                    onClick={() =>
                      persist(
                        { ...plan, resources: (plan.resources ?? []).filter((x) => x.id !== r.id) },
                        true
                      )
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'result' && (
          <div className="prep__result">
            <p className="prep__muted">
              Note(n) dieses Fachs eintragen – mehrere Teilleistungen (z. B. Test + Klausur) mit
              eigener Gewichtung möglich. Fließt ECTS-gewichtet in „Studienergebnisse" ein.
            </p>
            <ExamResultForm
              key={`${semester}/${kurs}`}
              semester={semester}
              kurs={kurs}
              initial={
                useStudienplanerStore.getState().index.results?.[resultKey(semester, kurs)] ?? null
              }
              onSaved={() => setTab('summary')}
            />
          </div>
        )}
      </div>
    </div>
  )
}
