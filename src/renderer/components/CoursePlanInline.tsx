import { useEffect, useState } from 'react'
import { useStudienplanerStore, joinPath } from '../store/studienplanerStore'
import type { Lernplan, PlanTask } from '../studienplaner/prep'
import { analyzeProgress, courseNoteList } from '../studienplaner/prep'
import { daysLeftLabel, daysUntil } from '../studienplaner/calendar'
import { openPaths } from '../lib/fileActions'
import { PlanChecklist } from './PlanChecklist'
import { AddTaskForm } from './AddTaskForm'
import { CorrectRateBar } from './CorrectRateBar'
import type { PrepTab } from './PrepPanel'
import { Button } from './common/Button'
import { Icon } from './common/Icon'
import { Spinner } from './common/misc'
import './plan.css'

/**
 * Der fach-spezifische Lernplan direkt in der Kursansicht: Countdown, Tagesplan
 * zum Abhaken, kurze Statistik und Sprünge in den vollen Lernplan-Editor.
 */
export function CoursePlanInline({
  semester,
  kurs,
  reloadKey,
  onOpen
}: {
  semester: string
  kurs: string
  reloadKey: number
  onOpen: (tab: PrepTab) => void
}): JSX.Element {
  const loadLernplan = useStudienplanerStore((s) => s.loadLernplan)
  const saveLernplan = useStudienplanerStore((s) => s.saveLernplan)
  const index = useStudienplanerStore((s) => s.index)
  const [plan, setPlan] = useState<Lernplan | null>(null)
  const [addingTask, setAddingTask] = useState(false)

  useEffect(() => {
    let live = true
    void loadLernplan(semester, kurs).then((p) => {
      if (live) setPlan(p)
    })
    return () => {
      live = false
    }
  }, [semester, kurs, loadLernplan, reloadKey])

  if (!plan) {
    return (
      <div className="cpi cpi--loading">
        <Spinner size={18} />
      </div>
    )
  }

  const commit = (planTasks: PlanTask[]): void => {
    const next = { ...plan, planTasks }
    setPlan(next)
    void saveLernplan(semester, kurs, next)
  }
  const toggle = (id: string): void => {
    const now = new Date().toISOString()
    commit(
      (plan.planTasks ?? []).map((t) => (t.id === id ? { ...t, done: !t.done, doneAt: now } : t))
    )
  }
  const removeTask = (id: string): void => commit((plan.planTasks ?? []).filter((t) => t.id !== id))
  const addTask = (task: PlanTask): void => {
    commit([...(plan.planTasks ?? []), task])
    setAddingTask(false)
  }
  const openAttachment = (rel: string): void => {
    const root = useStudienplanerStore.getState().path
    if (!root) return
    const abs = joinPath(root, rel)
    if (rel.toLowerCase().endsWith('.pdf')) void openPaths([abs])
    else window.api.spReveal(abs)
  }

  const perf = analyzeProgress(plan)
  const tasks = plan.planTasks ?? []
  const noteList = courseNoteList(index, semester, kurs)
  const n = plan.examDateIso ? daysUntil(plan.examDateIso) : null

  return (
    <div className="cpi">
      <div className="cpi__row">
        <div className="cpi__stats">
          {plan.examTitle && (
            <span className="cpi__badge">
              🗓 {plan.examTitle}
              {n !== null ? ` · ${daysLeftLabel(n)}` : ''}
            </span>
          )}
          <span>
            {plan.quizzes.length} {plan.quizzes.length === 1 ? 'Quiz' : 'Quizze'}
          </span>
          {(plan.resources?.length ?? 0) > 0 && <span>{plan.resources!.length} Material</span>}
        </div>
        <div className="cpi__rowbtns">
          <Button size="sm" variant="ghost" icon="plus" onClick={() => setAddingTask((v) => !v)}>
            Aufgabe
          </Button>
          <Button size="sm" icon="graduation" onClick={() => onOpen('plan')}>
            Lernplan bearbeiten
          </Button>
        </div>
      </div>

      {perf.overallTotal > 0 && (
        <CorrectRateBar correct={perf.overallCorrect} total={perf.overallTotal} />
      )}

      {addingTask && (
        <AddTaskForm notes={noteList} onAdd={addTask} onCancel={() => setAddingTask(false)} />
      )}

      {tasks.length > 0 ? (
        <PlanChecklist
          items={tasks.map((t) => ({ key: t.id, task: t }))}
          onToggle={toggle}
          onRemove={removeTask}
          onOpenAttachment={openAttachment}
          attachmentName={(rel) =>
            rel
              .split('/')
              .pop()
              ?.replace(/\.[^.]+$/, '') ?? rel
          }
          onSetScore={(id, score) =>
            commit(
              (plan.planTasks ?? []).map((t) =>
                t.id === id ? { ...t, score: score ?? undefined } : t
              )
            )
          }
        />
      ) : (
        <div className="cpi__empty">
          <p>
            Noch kein Tagesplan für {kurs}. „Aufgabe" fügt eine eigene hinzu, oder Gemini baut im
            Lernplan-Editor einen – mit Zeiten zum Abhaken.
          </p>
          <Button size="sm" icon="sparkles" onClick={() => onOpen('plan')}>
            Lernplan erstellen
          </Button>
        </div>
      )}

      <div className="cpi__tabs">
        <button onClick={() => onOpen('summary')}>
          <Icon name="page" size={13} /> Zusammenfassung{plan.summary ? ' ✓' : ''}
        </button>
        <button onClick={() => onOpen('quiz')}>
          <Icon name="sparkles" size={13} /> Quiz ({plan.quizzes.length})
        </button>
        <button onClick={() => onOpen('ask')}>
          <Icon name="sparkles" size={13} /> Fragen
        </button>
        <button onClick={() => onOpen('material')}>
          <Icon name="play" size={13} /> Material ({plan.resources?.length ?? 0})
        </button>
      </div>
    </div>
  )
}
