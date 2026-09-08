import { useEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import type { CalEvent } from '@shared/types'
import type { Lernplan, QuizItem } from '../studienplaner/prep'
import {
  analyzeProgress,
  courseNoteList,
  courseNotesText,
  examKeyOf,
  perfPromptText,
  weakQuiz
} from '../studienplaner/prep'
import {
  answerQuestion,
  makeQuiz,
  makeStudyPlan,
  makeSummary,
  recommendNext,
  type NextStep
} from '../studienplaner/ai'
import { daysLeftLabel, daysUntil, isExam } from '../studienplaner/calendar'
import { useStudienplanerStore } from '../store/studienplanerStore'
import { useCalendarStore } from '../store/calendarStore'
import { requestDialog } from '../store/dialogStore'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Segmented, Toggle } from './common/controls'
import { Spinner } from './common/misc'
import { PlanChecklist } from './PlanChecklist'
import { toast } from './common/toast'
import { cx } from '../lib/cx'
import './prep.css'

/** Kompakter „so viel ist verplant"-Text je Tag – Kontext für den Lernplan. */
function busyDigest(events: CalEvent[], untilIso: string | null): string {
  const now = Date.now()
  const end = untilIso ? new Date(untilIso).getTime() : now + 21 * 864e5
  const perDay = new Map<string, number>()
  for (const e of events) {
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

export type PrepTab = 'summary' | 'ask' | 'quiz' | 'plan' | 'material'
type Tab = PrepTab

function useMarkdown(md: string): string {
  const [html, setHtml] = useState('')
  useEffect(() => {
    let alive = true
    if (!md.trim()) {
      setHtml('')
      return
    }
    void import('marked').then(({ marked }) => {
      if (!alive) return
      const raw = String(marked.parse(md, { async: false, breaks: true }))
      // einfache Absicherung gegen eingeschleustes HTML aus dem Modell
      const safe = raw
        .replace(/<\/?(script|style|iframe|object|embed)[^>]*>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '')
      setHtml(safe)
    })
    return () => {
      alive = false
    }
  }, [md])
  return html
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
  const [chat, setChat] = useState<{ role: 'user' | 'model'; text: string }[]>([])
  const [question, setQuestion] = useState('')
  const [sources, setSources] = useState<Set<string>>(new Set())
  const [sourcesOpen, setSourcesOpen] = useState(true)
  const [quizIdx, setQuizIdx] = useState(0)
  const [weakMode, setWeakMode] = useState(false)
  const [nextStep, setNextStep] = useState<NextStep | null>(null)
  const [examPickerOpen, setExamPickerOpen] = useState(false)
  const [resTitle, setResTitle] = useState('')
  const [resUrl, setResUrl] = useState('')
  const calStatus = useCalendarStore((s) => s.status)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
    void loadLernplan(semester, kurs).then((p) => {
      setPlan(p)
      const all = courseNoteList(index, semester, kurs)
        .filter((n) => n.hasText || n.ocrable)
        .map((n) => n.relPath)
      const stored = (p.sources ?? []).filter((rp) => all.includes(rp))
      setSources(new Set(stored.length ? stored : all))
    })
    void window.api.llmHasKey().then(setHasKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semester, kurs, loadLernplan])

  const summaryHtml = useMarkdown(plan?.summary ?? '')
  const planHtml = useMarkdown(plan?.plan ?? '')
  const perf = useMemo(() => (plan ? analyzeProgress(plan) : null), [plan])

  if (!plan) {
    return (
      <div className="prep prep--loading">
        <Spinner size={22} />
      </div>
    )
  }

  const persist = (next: Lernplan, immediate = false): void => {
    setPlan(next)
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

  const runPlan = async (): Promise<void> => {
    if (!guardKey() || !guardSources()) return
    try {
      const src = await gatherNotes()
      setBusy('Lernplan wird erstellt …')
      let busy: string | undefined
      if (plan.useCalendar && calStatus === 'authorized') {
        const from = new Date().toISOString()
        const to = new Date(
          plan.examDateIso ? new Date(plan.examDateIso).getTime() : Date.now() + 21 * 864e5
        ).toISOString()
        const evs = await window.api.calEvents(from, to).catch(() => [] as CalEvent[])
        busy = busyDigest(evs, plan.examDateIso ?? null) || undefined
      }
      const perfTxt = perf
        ? perfPromptText(
            perf,
            perf.weakItemIds
              .map(
                (id) =>
                  plan.quizzes.flatMap((q) => q.items).find((it) => it.id === id)?.question ?? ''
              )
              .filter(Boolean)
          )
        : ''
      const { markdown, tasks } = await makeStudyPlan(
        plan.kurs,
        plan.name,
        plan.examDateIso ?? null,
        src,
        busy,
        perfTxt || undefined
      )
      persist({ ...plan, plan: markdown, planTasks: tasks, plannedAt: null }, true)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehlgeschlagen')
    } finally {
      setBusy(null)
    }
  }

  const planToCalendar = async (): Promise<void> => {
    const tasks = plan.planTasks ?? []
    if (!tasks.length) {
      toast.error('Keine planbaren Aufgaben – Lernplan neu erstellen.')
      return
    }
    const cutoff = Date.now() - 3600_000
    const events = tasks
      .map((t) => {
        const start = new Date(`${t.date}T${(t.time ?? '16:00').padStart(5, '0')}:00`)
        const end = new Date(start.getTime() + t.minutes * 60000)
        return {
          title: `📚 ${t.title}`,
          start: start.toISOString(),
          end: end.toISOString(),
          notes: `Lernplan „${plan.name}"${t.topic ? ` · ${t.topic}` : ''}`
        }
      })
      .filter((e) => new Date(e.start).getTime() > cutoff)
    if (!events.length) {
      toast.error('Alle Termine liegen in der Vergangenheit – Lernplan neu erstellen.')
      return
    }
    if (!confirm(`${events.length} Lerntermine in den Studium-Kalender eintragen?`)) return
    setBusy('Kalender wird gefüllt …')
    try {
      const count = await useCalendarStore.getState().addEvents(events)
      if (count > 0) {
        persist({ ...plan, plannedAt: new Date().toISOString() }, true)
        toast.success(`${count} Lerntermine eingetragen.`)
      }
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

  const runQuiz = async (mode: 'new' | 'append', focusTopic?: string): Promise<void> => {
    if (!guardKey() || !guardSources()) return
    setWeakMode(false)
    try {
      const src = await gatherNotes()
      setBusy(mode === 'append' ? 'Weitere Fragen …' : 'Quiz wird erstellt …')
      const avoid = plan.quizzes.flatMap((q) => q.items.map((it) => it.question))
      const items = await makeQuiz(plan.kurs, src, 8, avoid, focusTopic)
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

  const ask = async (): Promise<void> => {
    const q = question.trim()
    if (!q || !guardKey() || !guardSources()) return
    setQuestion('')
    setChat((c) => [...c, { role: 'user', text: q }])
    try {
      const src = await gatherNotes()
      setBusy('Denkt nach …')
      const a = await answerQuestion(plan.kurs, src, chat, q)
      setChat((c) => [...c, { role: 'model', text: a }])
    } catch (e) {
      setChat((c) => [...c, { role: 'model', text: `⚠️ ${e instanceof Error ? e.message : e}` }])
    } finally {
      setBusy(null)
    }
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
            { value: 'material', label: 'Material' }
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
              <div className="prep__md" dangerouslySetInnerHTML={{ __html: summaryHtml }} />
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
            {chat.length === 0 && (
              <p className="prep__muted">
                Stell Fragen zu deinen Notizen – z. B. „Erklär mir den Beweis von …“.
              </p>
            )}
            {chat.map((m, i) => (
              <div key={i} className={cx('prep__msg', m.role === 'user' ? 'is-user' : 'is-model')}>
                {m.text}
              </div>
            ))}
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
                placeholder="Frage zu diesem Fach …"
              />
              <Button variant="primary" disabled={Boolean(busy) || !question.trim()} type="submit">
                Fragen
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
              {perf?.hasData && (
                <Button variant="ghost" onClick={() => void askNext()} disabled={Boolean(busy)}>
                  Nächster Schritt
                </Button>
              )}
            </div>

            {perf && perf.answered > 0 && (
              <div className="prep__perf">
                <div className="prep__perfrow">
                  <span>Gesamt</span>
                  <span className="prep__bar">
                    <i style={{ width: `${Math.round(perf.accuracy * 100)}%` }} />
                  </span>
                  <span className="prep__perfval">
                    {Math.round(perf.accuracy * 100)}% · {perf.answered}/{perf.total}
                  </span>
                </div>
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
                const done = qz.items.filter((it) => plan.progress[it.id]).length
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
                      {done}/{qz.items.length}
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

        {tab === 'plan' && (
          <>
            <div className="prep__actions">
              <Button icon="sparkles" onClick={() => void runPlan()} disabled={Boolean(busy)}>
                {plan.plan ? 'Neu erstellen' : 'Lernplan erstellen'}
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
              <PlanChecklist tasks={plan.planTasks ?? []} onToggle={toggleTask} />
            )}
            {plan.plan ? (
              <details className="prep__plandetails">
                <summary>Begründung des Plans</summary>
                <div className="prep__md" dangerouslySetInnerHTML={{ __html: planHtml }} />
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
      </div>
    </div>
  )
}
