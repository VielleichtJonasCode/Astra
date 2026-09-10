import { useMemo, useState, type CSSProperties } from 'react'
import type { PlanTask } from '../studienplaner/prep'
import { taskScorePct } from '../studienplaner/prep'
import { rateColor } from './CorrectRateBar'
import { Icon } from './common/Icon'
import { cx } from '../lib/cx'
import './plan.css'

const KIND_LABEL: Record<string, string> = {
  lernen: 'Lernen',
  wiederholen: 'Wiederholen',
  quiz: 'Quiz'
}

/** Stabiler Farbton (0…360) aus einem Fachnamen – fürs farbige Trennen. */
export function fachHue(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return h
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

export interface ChecklistItem {
  /** Eindeutiger Schlüssel für die Callbacks (im zentralen Plan Fach-präfixiert). */
  key: string
  task: PlanTask
  /** Fach-Kennzeichnung – nur im zentralen Plan gesetzt. */
  fach?: { label: string; hue: number }
}

/**
 * Aufgaben-Checkliste: nach Tag gruppiert, je mit Uhrzeit, Dauer, Thema, Art,
 * optionaler Fach-Marke, Notiz und angehängten Dateien. Callbacks bekommen den
 * `key` des Items.
 */
export function PlanChecklist({
  items,
  onToggle,
  onRemove,
  onOpenAttachment,
  attachmentName,
  onSetScore
}: {
  items: ChecklistItem[]
  onToggle: (key: string) => void
  onRemove?: (key: string) => void
  onOpenAttachment?: (relPath: string) => void
  attachmentName?: (relPath: string) => string
  /** Ergebnis (richtig/gesamt) einer Aufgabe setzen bzw. löschen (null). */
  onSetScore?: (key: string, score: { correct: number; total: number } | null) => void
}): JSX.Element {
  const [editKey, setEditKey] = useState<string | null>(null)
  const [ec, setEc] = useState('')
  const [et, setEt] = useState('')
  const beginEdit = (key: string, s?: PlanTask['score']): void => {
    setEditKey(key)
    setEc(s ? String(s.correct) : '')
    setEt(s ? String(s.total) : '')
  }
  const saveEdit = (key: string): void => {
    const c = Math.max(0, Math.round(Number(ec) || 0))
    const t = Math.max(0, Math.round(Number(et) || 0))
    onSetScore?.(key, t > 0 ? { correct: Math.min(c, t), total: t } : null)
    setEditKey(null)
  }
  const { groups, done } = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      a.task.date === b.task.date
        ? (a.task.time ?? '16:00').localeCompare(b.task.time ?? '16:00')
        : a.task.date.localeCompare(b.task.date)
    )
    const g = new Map<string, ChecklistItem[]>()
    for (const it of sorted) {
      if (!g.has(it.task.date)) g.set(it.task.date, [])
      g.get(it.task.date)!.push(it)
    }
    return { groups: [...g.entries()], done: items.filter((it) => it.task.done).length }
  }, [items])

  const todayIso = new Date().toISOString().slice(0, 10)
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  return (
    <div className="plchk">
      <div className="plchk__top">
        <span className="plchk__count">
          {done}/{items.length} erledigt
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
          {list.map(({ key, task: t, fach }) => {
            const overdue = !t.done && t.date < todayIso
            return (
              <div
                key={key}
                className={cx('plchk__task', t.done && 'is-done', overdue && 'is-overdue')}
                style={
                  fach ? ({ '--fach': `hsl(${fach.hue} 65% 55%)` } as CSSProperties) : undefined
                }
              >
                <label className="plchk__check">
                  <input type="checkbox" checked={Boolean(t.done)} onChange={() => onToggle(key)} />
                  <span className="plchk__box">
                    <Icon name="check" size={12} />
                  </span>
                </label>
                <span className="plchk__info">
                  <span className="plchk__title">
                    {fach && <span className="plchk__fach">{fach.label}</span>}
                    {t.title}
                    {t.manual && <span className="plchk__manual">eigene</span>}
                  </span>
                  <span className="plchk__meta">
                    {t.time ?? '16:00'} · {t.minutes} min
                    {t.topic ? ` · ${t.topic}` : ''}
                    {t.kind && KIND_LABEL[t.kind] ? (
                      <em className={cx('plchk__kind', `plchk__kind--${t.kind}`)}>
                        {KIND_LABEL[t.kind]}
                      </em>
                    ) : null}
                  </span>
                  {t.note && <span className="plchk__note">{t.note}</span>}

                  {onSetScore &&
                    (editKey === key ? (
                      <span className="plchk__scoreedit">
                        <input
                          type="number"
                          min={0}
                          placeholder="richtig"
                          value={ec}
                          onChange={(e) => setEc(e.target.value)}
                        />
                        <span>von</span>
                        <input
                          type="number"
                          min={0}
                          placeholder="gesamt"
                          value={et}
                          onChange={(e) => setEt(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            saveEdit(key)
                          }}
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            setEditKey(null)
                          }}
                        >
                          ✕
                        </button>
                      </span>
                    ) : t.score && taskScorePct(t.score) !== null ? (
                      <button
                        type="button"
                        className="plchk__score"
                        style={{
                          background: `color-mix(in srgb, ${rateColor(
                            taskScorePct(t.score)!
                          )} 22%, transparent)`,
                          color: rateColor(taskScorePct(t.score)!)
                        }}
                        onClick={(e) => {
                          e.preventDefault()
                          beginEdit(key, t.score)
                        }}
                      >
                        {t.score.correct}/{t.score.total} ·{' '}
                        {Math.round(taskScorePct(t.score)! * 100)}% richtig
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="plchk__scoreadd"
                        onClick={(e) => {
                          e.preventDefault()
                          beginEdit(key)
                        }}
                      >
                        + Ergebnis
                      </button>
                    ))}

                  {(t.attachments?.length ?? 0) > 0 && (
                    <span className="plchk__atts">
                      {t.attachments!.map((rel) => (
                        <button
                          key={rel}
                          type="button"
                          className="plchk__att"
                          onClick={() => onOpenAttachment?.(rel)}
                        >
                          <Icon name="page" size={11} />
                          {attachmentName ? attachmentName(rel) : (rel.split('/').pop() ?? rel)}
                        </button>
                      ))}
                    </span>
                  )}
                </span>
                {onRemove && t.manual && (
                  <button
                    type="button"
                    className="plchk__del"
                    aria-label="Aufgabe löschen"
                    onClick={() => onRemove(key)}
                  >
                    <Icon name="trash" size={13} />
                  </button>
                )}
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
