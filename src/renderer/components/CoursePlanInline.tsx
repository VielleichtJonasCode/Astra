import { useEffect, useState } from 'react'
import { useStudienplanerStore } from '../store/studienplanerStore'
import type { Lernplan } from '../studienplaner/prep'
import { analyzeProgress } from '../studienplaner/prep'
import { daysLeftLabel, daysUntil } from '../studienplaner/calendar'
import { PlanChecklist } from './PlanChecklist'
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
  const [plan, setPlan] = useState<Lernplan | null>(null)

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

  const toggle = (id: string): void => {
    const now = new Date().toISOString()
    const planTasks = (plan.planTasks ?? []).map((t) =>
      t.id === id ? { ...t, done: !t.done, doneAt: now } : t
    )
    const next = { ...plan, planTasks }
    setPlan(next)
    void saveLernplan(semester, kurs, next)
  }

  const perf = analyzeProgress(plan)
  const tasks = plan.planTasks ?? []
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
          {perf.answered > 0 && <span>{Math.round(perf.accuracy * 100)}% richtig</span>}
          {(plan.resources?.length ?? 0) > 0 && <span>{plan.resources!.length} Material</span>}
        </div>
        <Button size="sm" icon="graduation" onClick={() => onOpen('plan')}>
          Lernplan bearbeiten
        </Button>
      </div>

      {tasks.length > 0 ? (
        <PlanChecklist tasks={tasks} onToggle={toggle} />
      ) : (
        <div className="cpi__empty">
          <p>
            Noch kein Tagesplan für {kurs}. Im Lernplan-Editor baut Gemini einen – mit Zeiten zum
            Abhaken, angepasst an deine Quiz-Leistung.
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
