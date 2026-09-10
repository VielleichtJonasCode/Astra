import { useState } from 'react'
import { nanoid } from 'nanoid'
import type { PlanTask, CourseNote } from '../studienplaner/prep'
import { Button } from './common/Button'
import { Select, TextArea, TextInput } from './common/controls'
import { cx } from '../lib/cx'
import './plan.css'

const KINDS: { value: NonNullable<PlanTask['kind']>; label: string }[] = [
  { value: 'lernen', label: 'Lernen' },
  { value: 'wiederholen', label: 'Wiederholen' },
  { value: 'quiz', label: 'Quiz' }
]

/**
 * Kompaktes Formular, mit dem man selbst eine Aufgabe anlegt – mit Datum,
 * Uhrzeit, Dauer, Art, Notiz und verknüpften Notizen (Anhängen).
 */
export function AddTaskForm({
  notes = [],
  onAdd,
  onCancel
}: {
  notes?: CourseNote[]
  onAdd: (task: PlanTask) => void
  onCancel: () => void
}): JSX.Element {
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [time, setTime] = useState('16:00')
  const [minutes, setMinutes] = useState(45)
  const [kind, setKind] = useState<NonNullable<PlanTask['kind']>>('lernen')
  const [topic, setTopic] = useState('')
  const [note, setNote] = useState('')
  const [atts, setAtts] = useState<Set<string>>(new Set())

  const submit = (): void => {
    if (!title.trim() || !date) return
    onAdd({
      id: nanoid(6),
      date,
      time: time || undefined,
      title: title.trim().slice(0, 120),
      topic: topic.trim().slice(0, 120),
      minutes: Math.max(5, Math.min(600, Math.round(minutes) || 45)),
      kind,
      done: false,
      manual: true,
      note: note.trim() || undefined,
      attachments: atts.size ? [...atts] : undefined
    })
  }

  return (
    <div className="addtask">
      <TextInput
        autoFocus
        placeholder="Aufgabe – z. B. Übungsblatt 4 rechnen"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
      />
      <div className="addtask__row">
        <label>
          <span>Datum</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label>
          <span>Uhrzeit</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
        <label>
          <span>Minuten</span>
          <input
            type="number"
            min={5}
            step={5}
            value={minutes}
            onChange={(e) => setMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          <span>Art</span>
          <Select
            value={kind}
            onChange={(e) => setKind(e.target.value as NonNullable<PlanTask['kind']>)}
            options={KINDS}
          />
        </label>
      </div>
      <TextInput
        placeholder="Thema (optional)"
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
      />
      <TextArea
        placeholder="Notiz (optional)"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {notes.length > 0 && (
        <div className="addtask__atts">
          <span className="addtask__attslabel">Notizen anhängen</span>
          {notes.map((n) => {
            const on = atts.has(n.relPath)
            return (
              <label key={n.relPath} className={cx('addtask__att', on && 'is-on')}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setAtts((s) => {
                      const next = new Set(s)
                      if (next.has(n.relPath)) next.delete(n.relPath)
                      else next.add(n.relPath)
                      return next
                    })
                  }
                />
                {n.thema || n.name}
              </label>
            )
          })}
        </div>
      )}
      <div className="addtask__actions">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Abbrechen
        </Button>
        <Button size="sm" icon="plus" disabled={!title.trim()} onClick={submit}>
          Aufgabe hinzufügen
        </Button>
      </div>
    </div>
  )
}
