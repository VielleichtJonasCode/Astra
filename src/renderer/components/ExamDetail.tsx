import { useEffect, useMemo, useState } from 'react'
import { useStudienplanerStore } from '../store/studienplanerStore'
import { resultKey, type FachResult } from '../studienplaner/model'
import { analyzeProgress, examKeyOf, getExamLink, type Lernplan } from '../studienplaner/prep'
import { componentGrade, fachGrade, fachPassStatus, gradeLabel } from '../studienplaner/grades'
import { daysUntil, daysLeftLabel } from '../studienplaner/calendar'
import { Button, IconButton } from './common/Button'
import { Spinner } from './common/misc'
import './examdetail.css'

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
}

/** Note (1..5) → Farbe: 1,0 grün … 4,0 rot. */
function gColor(g: number): string {
  const t = Math.min(1, Math.max(0, (g - 1) / 3))
  return `hsl(${Math.round((1 - t) * 130)} 62% 46%)`
}

export function ExamDetail({
  exam,
  onBack,
  onOpenPrep,
  onEnterResult,
  onLink
}: {
  exam: { title: string; start: string }
  onBack: () => void
  onOpenPrep: (semester: string, kurs: string, tab?: 'plan' | 'quiz' | 'result') => void
  onEnterResult: (semester: string, kurs: string) => void
  onLink: (ev: { title: string; start: string }) => void
}): JSX.Element {
  const index = useStudienplanerStore((s) => s.index)
  const loadLernplan = useStudienplanerStore((s) => s.loadLernplan)

  const link = useMemo(
    () => getExamLink(index, examKeyOf(exam.title, exam.start)),
    [index, exam.title, exam.start]
  )
  const result: FachResult | null = link
    ? (index.results?.[resultKey(link.semester, link.kurs)] ?? null)
    : null

  const [plan, setPlan] = useState<Lernplan | null>(null)
  const [loading, setLoading] = useState(Boolean(link))
  useEffect(() => {
    if (!link) return
    let alive = true
    setLoading(true)
    void loadLernplan(link.semester, link.kurs).then((p) => {
      if (alive) {
        setPlan(p)
        setLoading(false)
      }
    })
    return () => {
      alive = false
    }
  }, [link, loadLernplan])

  const grade = result ? fachGrade(result) : null
  const pass = result ? fachPassStatus(result) : null
  const finished = Boolean(result && (grade !== null || pass !== null))

  const n = daysUntil(exam.start)
  const perf = plan ? analyzeProgress(plan) : null
  const tasks = plan?.planTasks ?? []
  const done = tasks.filter((t) => t.done).length

  return (
    <div className="exd">
      <div className="exd__head">
        <IconButton name="chevron-left" label="Zurück" onClick={onBack} />
        <div className="exd__title">
          <h2>{exam.title}</h2>
          <span>
            {fmtDate(exam.start)}
            {link ? ` · ${link.kurs} · ${link.semester}` : ' · noch keinem Fach zugeordnet'}
          </span>
        </div>
        <span className={'exd__count' + (n < 0 ? ' is-past' : n <= 7 ? ' is-soon' : '')}>
          {n < 0 ? 'vorbei' : daysLeftLabel(n)}
        </span>
      </div>

      {!link ? (
        <div className="exd__card">
          <p className="exd__muted">
            Diese Prüfung ist noch keinem Fach zugeordnet. Danach erscheinen hier Countdown und
            Lernplan – und nach der Prüfung Note und Auswertung.
          </p>
          <div className="exd__actions" style={{ marginTop: 10 }}>
            <Button icon="calendar" onClick={() => onLink(exam)}>
              Mit Fach verknüpfen
            </Button>
          </div>
        </div>
      ) : loading ? (
        <div className="exd__card exd__card--load">
          <Spinner size={20} />
        </div>
      ) : finished ? (
        <>
          <div className="exd__card exd__grade">
            <div
              className="exd__gradenum"
              style={{ color: grade ? gColor(grade) : 'var(--text-secondary)' }}
            >
              {grade
                ? gradeLabel(grade)
                : pass === true
                  ? 'bestanden'
                  : pass === false
                    ? 'nicht bestanden'
                    : '–'}
            </div>
            <div className="exd__grademeta">
              <strong>Abgeschlossen</strong>
              <span>{result?.ects ? `${result.ects} ECTS` : 'ECTS nicht hinterlegt'}</span>
            </div>
          </div>

          <div className="exd__card">
            <h3>Teilleistungen</h3>
            <div className="exd__comps">
              {(result?.components ?? []).map((c) => (
                <div key={c.id} className="exd__comp">
                  <span>{c.title}</span>
                  <span className="exd__compval">
                    {c.mode === 'grade' && gradeLabel(c.grade ?? null)}
                    {c.mode === 'points' &&
                      `${c.points ?? '–'} P → ${gradeLabel(componentGrade(c))}`}
                    {c.mode === 'passfail' &&
                      (c.passed === true
                        ? 'bestanden'
                        : c.passed === false
                          ? 'nicht bestanden'
                          : '–')}
                  </span>
                  <span className="exd__compw">{c.weightPct}&thinsp;%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="exd__card">
            <h3>So lief die Vorbereitung</h3>
            {result?.prep ? (
              <div className="exd__prep">
                <div className="exd__prow">
                  <span>Lern-Aufgaben geschafft</span>
                  <span className="exd__pbar">
                    <i
                      style={{
                        width:
                          result.prep.plannedTasks > 0
                            ? `${Math.round((result.prep.doneTasks / result.prep.plannedTasks) * 100)}%`
                            : '0%'
                      }}
                    />
                  </span>
                  <strong>
                    {result.prep.doneTasks}/{result.prep.plannedTasks}
                  </strong>
                </div>
                <div className="exd__prow">
                  <span>Quiz-Trefferquote vor der Prüfung</span>
                  <strong>
                    {result.prep.quizAccuracy !== null
                      ? `${Math.round(result.prep.quizAccuracy * 100)} %`
                      : 'kein Quiz'}
                  </strong>
                </div>
              </div>
            ) : (
              <p className="exd__muted">Kein Vorbereitungs-Schnappschuss gespeichert.</p>
            )}
          </div>

          <div className="exd__actions">
            <Button
              icon="pen"
              variant="ghost"
              onClick={() => onEnterResult(link.semester, link.kurs)}
            >
              Ergebnis bearbeiten
            </Button>
            <Button
              icon="folder-open"
              variant="ghost"
              onClick={() => onOpenPrep(link.semester, link.kurs)}
            >
              Notizen & Zusammenfassung
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="exd__card exd__stats">
            <div className="exd__stat">
              <strong>
                {done}/{tasks.length}
              </strong>
              <span>Lern-Aufgaben erledigt</span>
            </div>
            <div className="exd__stat">
              <strong>{plan?.quizzes.length ?? 0}</strong>
              <span>
                Quizze · {perf?.answered ?? 0}/{perf?.total ?? 0} beantwortet
              </span>
            </div>
            <div className="exd__stat">
              <strong>
                {perf && perf.overallTotal > 0
                  ? `${Math.round(perf.overallAccuracy * 100)} %`
                  : '–'}
              </strong>
              <span>Trefferquote bisher</span>
            </div>
          </div>

          {perf && perf.byTopic.some((t) => t.seen > 0) && (
            <div className="exd__card">
              <h3>Themen-Sicherheit</h3>
              <div className="exd__topics">
                {perf.byTopic
                  .filter((t) => t.seen > 0)
                  .map((t) => (
                    <div key={t.topic} className="exd__topic">
                      <span>{t.topic}</span>
                      <span className={'exd__tbar' + (t.weak ? ' is-weak' : '')}>
                        <i style={{ width: `${Math.round(t.mastery * 100)}%` }} />
                      </span>
                      <span className="exd__tval">{Math.round(t.mastery * 100)} %</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          <div className="exd__card">
            <h3>{plan?.plan?.trim() ? 'Lernplan' : 'Noch kein Lernplan'}</h3>
            {plan?.plan?.trim() ? (
              <p className="exd__muted">
                {tasks.length} Aufgaben bis zur Prüfung, {done} erledigt. Details, Abhaken und
                Kalender-Eintrag im Lernplan.
              </p>
            ) : (
              <p className="exd__muted">
                Erstelle im Lernplan des Fachs einen KI-Plan – er richtet sich nach Prüfungsdatum
                und deiner bisherigen Leistung.
              </p>
            )}
          </div>

          <div className="exd__actions">
            <Button icon="sparkles" onClick={() => onOpenPrep(link.semester, link.kurs, 'plan')}>
              Lernplan öffnen
            </Button>
            {(plan?.quizzes.length ?? 0) > 0 && (
              <Button
                icon="check"
                variant="ghost"
                onClick={() => onOpenPrep(link.semester, link.kurs, 'quiz')}
              >
                Quiz üben
              </Button>
            )}
            <Button
              icon="pen"
              variant="ghost"
              onClick={() => onOpenPrep(link.semester, link.kurs, 'result')}
            >
              Note eintragen
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
