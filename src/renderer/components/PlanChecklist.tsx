import { useMemo } from 'react'
import type { PlanTask } from '../studienplaner/prep'
import { Icon } from './common/Icon'
import { cx } from '../lib/cx'
import './plan.css'

const KIND_LABEL: Record<string, string> = {
  lernen: 'Lernen',
  wiederholen: 'Wiederholen',
  quiz: 'Quiz'
}

function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d.getTime() - today.getTime()) / 864e5)
  if (diff === 0) return 'Heute'
  if (diff === 1) return 'Morgen'
  const s = d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  return diff < 0 ? `${s} · überfällig` : s
}

/**
 * Der Tagesplan eines Fachs zum Abhaken: Aufgaben nach Tag gruppiert, je mit
 * Uhrzeit, Dauer, Thema und Art. `onToggle` bekommt die Aufgaben-ID.
 */
export function PlanChecklist({
  tasks,
  onToggle
}: {
  tasks: PlanTask[]
  onToggle: (id: string) => void
}): JSX.Element {
  const { groups, done } = useMemo(() => {
    const sorted = [...tasks].sort((a, b) =>
      a.date === b.date
        ? (a.time ?? '16:00').localeCompare(b.time ?? '16:00')
        : a.date.localeCompare(b.date)
    )
    const g = new Map<string, PlanTask[]>()
    for (const t of sorted) {
      if (!g.has(t.date)) g.set(t.date, [])
      g.get(t.date)!.push(t)
    }
    return { groups: [...g.entries()], done: tasks.filter((t) => t.done).length }
  }, [tasks])

  const todayIso = new Date().toISOString().slice(0, 10)
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  return (
    <div className="plchk">
      <div className="plchk__top">
        <span className="plchk__count">
          {done}/{tasks.length} erledigt
        </span>
        <span className="plchk__bar">
          <i style={{ width: `${pct}%` }} />
        </span>
      </div>

      {groups.map(([date, list]) => (
        <div key={date} className="plchk__day">
          <div className={cx('plchk__daylabel', date < todayIso && 'is-past')}>
            {dayLabel(date)}
          </div>
          {list.map((t) => {
            const overdue = !t.done && t.date < todayIso
            return (
              <label
                key={t.id}
                className={cx('plchk__task', t.done && 'is-done', overdue && 'is-overdue')}
              >
                <input type="checkbox" checked={Boolean(t.done)} onChange={() => onToggle(t.id)} />
                <span className="plchk__box">
                  <Icon name="check" size={12} />
                </span>
                <span className="plchk__info">
                  <span className="plchk__title">{t.title}</span>
                  <span className="plchk__meta">
                    {t.time ?? '16:00'} · {t.minutes} min
                    {t.topic ? ` · ${t.topic}` : ''}
                    {t.kind && KIND_LABEL[t.kind] ? (
                      <em className={cx('plchk__kind', `plchk__kind--${t.kind}`)}>
                        {KIND_LABEL[t.kind]}
                      </em>
                    ) : null}
                  </span>
                </span>
              </label>
            )
          })}
        </div>
      ))}
    </div>
  )
}
