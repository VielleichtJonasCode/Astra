import { useState } from 'react'
import { nanoid } from 'nanoid'
import type { FachResult, GradeComponent } from '../studienplaner/model'
import { fachGrade, gradeLabel } from '../studienplaner/grades'
import { rateColor } from './CorrectRateBar'
import { useStudienplanerStore } from '../store/studienplanerStore'
import { Button, IconButton } from './common/Button'
import { Segmented, NumberInput, TextInput, Checkbox } from './common/controls'
import './examform.css'

type Mode = GradeComponent['mode']

function freshComponent(title = 'Klausur'): GradeComponent {
  return { id: nanoid(6), title, mode: 'grade', grade: 2.0, weightPct: 100 }
}

/** Note (1,0–5,0) auf eine Ampelfarbe abbilden: 1,0 grün … 4,0 rot, 5,0 dunkelrot. */
function gradeColor(g: number | null): string {
  if (g === null) return 'var(--text-tertiary)'
  // 1,0 → 0 ; 4,0 → 1
  return rateColor(1 - Math.min(1, Math.max(0, (g - 1) / 3)))
}

export function ExamResultForm({
  semester,
  kurs,
  initial,
  onSaved
}: {
  semester: string
  kurs: string
  initial?: FachResult | null
  onSaved?: () => void
}): JSX.Element {
  const saveExamResult = useStudienplanerStore((s) => s.saveExamResult)
  const busy = useStudienplanerStore((s) => s.busy)

  const [ects, setEcts] = useState<number>(initial?.ects ?? 5)
  const [components, setComponents] = useState<GradeComponent[]>(
    initial?.components?.length ? initial.components.map((c) => ({ ...c })) : [freshComponent()]
  )
  const [archive, setArchive] = useState(false)
  const [excludeFromGpa, setExcludeFromGpa] = useState(initial?.excludeFromGpa ?? false)

  const patch = (id: string, p: Partial<GradeComponent>): void =>
    setComponents((cs) => cs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  const remove = (id: string): void => setComponents((cs) => cs.filter((c) => c.id !== id))
  /** Modus wechseln und den Standardwert des neuen Modus setzen, falls noch leer. */
  const setMode = (c: GradeComponent, mode: Mode): void => {
    const seed: Partial<GradeComponent> = { mode }
    if (mode === 'grade' && typeof c.grade !== 'number') seed.grade = 2.0
    if (mode === 'points' && typeof c.points !== 'number') seed.points = 10
    if (mode === 'passfail' && typeof c.passed !== 'boolean') seed.passed = true
    patch(c.id, seed)
  }

  const fg = fachGrade({ components })
  const weightSum = components.reduce((n, c) => n + (c.weightPct || 0), 0)

  const save = async (): Promise<void> => {
    await saveExamResult(semester, kurs, {
      components,
      ects: ects > 0 ? ects : undefined,
      archive,
      excludeFromGpa
    })
    onSaved?.()
  }

  return (
    <div className="examform">
      <label className="sp-field sp-field--row">
        <span>Leistungspunkte (ECTS)</span>
        <NumberInput value={ects} onChange={setEcts} min={0} max={30} step={1} width={72} />
      </label>

      <div className="examform__comps">
        {components.map((c, i) => (
          <div key={c.id} className="examform__comp">
            <div className="examform__comprow">
              <TextInput
                value={c.title}
                onChange={(e) => patch(c.id, { title: e.target.value })}
                placeholder={`Teilleistung ${i + 1}`}
              />
              {components.length > 1 && (
                <IconButton name="trash" label="Entfernen" onClick={() => remove(c.id)} />
              )}
            </div>
            <div className="examform__comprow">
              <Segmented<Mode>
                value={c.mode}
                onChange={(mode) => setMode(c, mode)}
                options={[
                  { value: 'grade', label: 'Note' },
                  { value: 'points', label: 'Punkte' },
                  { value: 'passfail', label: 'best./nicht' }
                ]}
              />
              {c.mode === 'grade' && (
                <NumberInput
                  value={c.grade ?? 2.0}
                  onChange={(v) => patch(c.id, { grade: Math.round(v * 10) / 10 })}
                  min={1}
                  max={5}
                  step={0.1}
                  width={72}
                />
              )}
              {c.mode === 'points' && (
                <NumberInput
                  value={c.points ?? 10}
                  onChange={(v) => patch(c.id, { points: Math.round(v) })}
                  min={0}
                  max={15}
                  step={1}
                  suffix=" P"
                  width={72}
                />
              )}
              {c.mode === 'passfail' && (
                <Checkbox checked={c.passed === true} onChange={(v) => patch(c.id, { passed: v })}>
                  bestanden
                </Checkbox>
              )}
              <label className="examform__weight">
                <NumberInput
                  value={c.weightPct}
                  onChange={(v) => patch(c.id, { weightPct: Math.max(0, Math.round(v)) })}
                  min={0}
                  max={100}
                  step={5}
                  suffix=" %"
                  width={72}
                />
              </label>
            </div>
            <label className="examform__date">
              <span>Datum</span>
              <input
                type="date"
                className="input"
                value={c.dateIso ?? ''}
                onChange={(e) => patch(c.id, { dateIso: e.target.value || undefined })}
              />
            </label>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="examform__add"
        onClick={() => setComponents((cs) => [...cs, freshComponent(`Teil ${cs.length + 1}`)])}
      >
        + Teilleistung
      </button>

      {components.length > 1 && weightSum !== 100 && (
        <p className="examform__hint">
          Gewichte ergeben {weightSum} % – wird für die Fach-Note auf 100 % normiert.
        </p>
      )}

      <div className="examform__result" style={{ color: gradeColor(fg) }}>
        Fach-Note: <strong>{gradeLabel(fg)}</strong>
        {fg === null && <em> (noch keine benotete Teilleistung)</em>}
      </div>

      <div className="examform__archive">
        <Checkbox checked={excludeFromGpa} onChange={setExcludeFromGpa}>
          Zählt nicht für den Bachelor-Schnitt (z.&nbsp;B. Vorkurs)
        </Checkbox>
      </div>
      <div className="examform__archive">
        <Checkbox checked={archive} onChange={setArchive}>
          Fach danach archivieren (Lernplan bleibt erhalten)
        </Checkbox>
      </div>

      <Button variant="primary" disabled={Boolean(busy)} onClick={() => void save()}>
        Ergebnis speichern
      </Button>
    </div>
  )
}
