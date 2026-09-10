import { useEffect, useMemo, useState } from 'react'
import type { CalEvent } from '@shared/types'
import { useCalendarStore } from '../store/calendarStore'
import { buildAgenda, eventsByDay, eventTime, isExam, monthMatrix } from '../studienplaner/calendar'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Segmented } from './common/controls'
import { EmptyState } from './common/misc'
import './studienkalender.css'

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember'
]

type Mode = 'month' | 'agenda'

export function StudienKalender({
  onBack,
  onOpenExam
}: {
  onBack: () => void
  onOpenExam: (ev: { title: string; start: string }) => void
}): JSX.Element {
  const events = useCalendarStore((s) => s.events)
  const status = useCalendarStore((s) => s.status)
  const demo = useCalendarStore((s) => s.demo)
  const ensureRange = useCalendarStore((s) => s.ensureRange)

  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [mode, setMode] = useState<Mode>('month')

  // Termine des sichtbaren Monats (± eine Woche Rand) nachladen.
  useEffect(() => {
    const from = new Date(cursor.getFullYear(), cursor.getMonth(), -7).toISOString()
    const to = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 14).toISOString()
    void ensureRange(from, to)
  }, [cursor, ensureRange])

  const matrix = useMemo(() => monthMatrix(cursor.getFullYear(), cursor.getMonth()), [cursor])
  const byDay = useMemo(() => eventsByDay(events), [events])
  const agenda = useMemo(() => buildAgenda(events, 180), [events])

  const openIfExam = (ev: CalEvent): void => {
    if (isExam(ev.title, ev.notes)) onOpenExam({ title: ev.title, start: ev.start })
  }

  const shift = (n: number): void =>
    setCursor((c) => new Date(c.getFullYear(), c.getMonth() + n, 1))
  const toToday = (): void => {
    const d = new Date()
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1))
  }

  return (
    <div className="skal">
      <div className="skal__head">
        <IconButton name="chevron-left" label="Zurück" onClick={onBack} />
        <h2>
          <Icon name="calendar" size={16} /> Kalender
        </h2>
        <div className="skal__headright">
          <Segmented<Mode>
            value={mode}
            onChange={setMode}
            options={[
              { value: 'month', label: 'Monat' },
              { value: 'agenda', label: 'Liste' }
            ]}
          />
        </div>
      </div>

      {status !== 'authorized' && !demo && (
        <p className="skal__hint">
          Kein Kalender verbunden – in der Termine-Leiste rechts „Kalender verbinden“.
        </p>
      )}

      {mode === 'month' ? (
        <>
          <div className="skal__nav">
            <IconButton name="chevron-left" label="Vorheriger Monat" onClick={() => shift(-1)} />
            <strong>
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </strong>
            <IconButton name="chevron-right" label="Nächster Monat" onClick={() => shift(1)} />
            <Button size="sm" variant="ghost" onClick={toToday}>
              Heute
            </Button>
          </div>

          <div className="skal__wd">
            {WD.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className="skal__grid">
            {matrix.flat().map((cell) => {
              const list = byDay.get(cell.key) ?? []
              return (
                <div
                  key={cell.key}
                  className={
                    'skal__cell' +
                    (cell.inMonth ? '' : ' is-out') +
                    (cell.isToday ? ' is-today' : '') +
                    (cell.isWeekend ? ' is-we' : '')
                  }
                >
                  <span className="skal__daynum">{cell.day}</span>
                  <div className="skal__evs">
                    {list.slice(0, 3).map((ev) => {
                      const exam = isExam(ev.title, ev.notes)
                      return (
                        <button
                          key={ev.id}
                          className={'skal__ev' + (exam ? ' is-exam' : '')}
                          style={!exam ? { ['--c' as string]: ev.color } : undefined}
                          onClick={() => openIfExam(ev)}
                          disabled={!exam}
                          title={`${ev.allDay ? 'ganztägig' : eventTime(ev)} · ${ev.title}`}
                        >
                          {ev.title}
                        </button>
                      )
                    })}
                    {list.length > 3 && <span className="skal__more">+{list.length - 3}</span>}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="skal__legend">
            <span className="skal__lgexam" /> Prüfung – klick öffnet die Prüfungsseite
          </p>
        </>
      ) : agenda.length === 0 ? (
        <EmptyState icon="calendar" title="Keine Termine" hint="Nichts im geladenen Zeitraum." />
      ) : (
        <div className="skal__agenda">
          {agenda.map((day) => (
            <div key={day.key} className="skal__aday">
              <div className="skal__adaylabel">{day.label}</div>
              <div className="skal__adayevs">
                {day.events.map((ev) => {
                  const exam = isExam(ev.title, ev.notes)
                  return (
                    <button
                      key={ev.id}
                      className={'skal__arow' + (exam ? ' is-exam' : '')}
                      onClick={() => openIfExam(ev)}
                      disabled={!exam}
                    >
                      <span className="skal__atime">{ev.allDay ? 'ganztägig' : eventTime(ev)}</span>
                      <span className="skal__atitle">
                        <span className="skal__adot" style={{ background: ev.color }} />
                        {ev.title}
                      </span>
                      {exam && <Icon name="chevron-right" size={12} />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
