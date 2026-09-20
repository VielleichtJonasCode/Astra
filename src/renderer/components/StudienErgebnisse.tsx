import { useEffect, useMemo, useRef, useState } from 'react'
import { useStudienplanerStore } from '../store/studienplanerStore'
import { resultKey, safeName, type FachResult } from '../studienplaner/model'
import {
  buildTacticsDigest,
  componentGrade,
  fachGrade,
  fachPassStatus,
  gradeLabel,
  overallGpa,
  semesterGpa,
  type GpaSummary
} from '../studienplaner/grades'
import { semesterSortKey } from '../studienplaner/calendar'
import { analyzeStudyTactics } from '../studienplaner/ai'
import { fachHue } from './PlanChecklist'
import { Icon } from './common/Icon'
import { Button, IconButton } from './common/Button'
import { Segmented, Select, TextInput } from './common/controls'
import { Sheet } from './common/Sheet'
import { EmptyState, Spinner } from './common/misc'
import { Markdown } from './common/Markdown'
import { toast } from './common/toast'
import { ExamResultForm } from './ExamResultForm'
import './studienergebnisse.css'

/** Sentinel für „neues Semester/Kurs anlegen" in den Auswahlfeldern unten. */
const NEW = '__new__'

type SortMode = 'semester' | 'grade' | 'date'

/** Jüngstes Datum eines Fach-Ergebnisses (Teilleistung oder Prüfungstermin). */
function resultDate(r: FachResult): string {
  const ds = [
    ...r.components.map((c) => c.dateIso).filter((d): d is string => Boolean(d)),
    r.prep?.examDateIso ?? ''
  ].filter(Boolean)
  return ds.sort().pop() ?? ''
}

/* ── kleine SVG-Bausteine (kein Chart-Framework) ─────────────────────── */

interface Pt {
  x: number
  y: number
  hue: number
  label: string
}

/** Note (1..5) → Farbe: 1,0 grün … 4,0 rot. */
function gColor(g: number): string {
  const t = Math.min(1, Math.max(0, (g - 1) / 3))
  return `hsl(${Math.round((1 - t) * 130)} 62% 46%)`
}

function Scatter({
  points,
  xDomain,
  xLabel,
  trend
}: {
  points: Pt[]
  xDomain: [number, number]
  xLabel: string
  trend?: boolean
}): JSX.Element {
  const W = 300
  const H = 132
  const pad = { l: 30, r: 10, t: 10, b: 22 }
  const [x0, x1] = xDomain
  const sx = (x: number): number =>
    pad.l + ((x - x0) / Math.max(1e-9, x1 - x0)) * (W - pad.l - pad.r)
  const sy = (g: number): number => pad.t + ((g - 1) / 4) * (H - pad.t - pad.b)

  let line: { a: number; b: number } | null = null
  if (trend && points.length >= 2) {
    const n = points.length
    const mx = points.reduce((s, p) => s + p.x, 0) / n
    const my = points.reduce((s, p) => s + p.y, 0) / n
    const denom = points.reduce((s, p) => s + (p.x - mx) ** 2, 0)
    if (denom > 1e-9) {
      const b = points.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / denom
      line = { a: my - b * mx, b }
    }
  }

  return (
    <svg className="se-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={xLabel}>
      {[1, 2, 3, 4, 5].map((g) => (
        <g key={g}>
          <line className="se-grid" x1={pad.l} x2={W - pad.r} y1={sy(g)} y2={sy(g)} />
          <text className="se-axis" x={pad.l - 6} y={sy(g) + 3} textAnchor="end">
            {g}
          </text>
        </g>
      ))}
      {line && (
        <line
          className="se-trend"
          x1={sx(x0)}
          y1={sy(Math.min(5, Math.max(1, line.a + line.b * x0)))}
          x2={sx(x1)}
          y2={sy(Math.min(5, Math.max(1, line.a + line.b * x1)))}
        />
      )}
      {points.map((p, i) => (
        <circle
          key={i}
          cx={sx(p.x)}
          cy={sy(Math.min(5, Math.max(1, p.y)))}
          r={4.5}
          fill={`hsl(${p.hue} 60% 55%)`}
          stroke="var(--bg-content)"
          strokeWidth={1.5}
        >
          <title>{`${p.label}: Note ${gradeLabel(p.y)}`}</title>
        </circle>
      ))}
      <text
        className="se-axis se-axis--x"
        x={(W + pad.l - pad.r) / 2}
        y={H - 6}
        textAnchor="middle"
      >
        {xLabel}
      </text>
    </svg>
  )
}

function Bars({
  rows
}: {
  rows: { label: string; gpa: number | null; credits: number }[]
}): JSX.Element {
  return (
    <div className="se-bars">
      {rows.map((r) => (
        <div key={r.label} className="se-bar">
          <span className="se-bar__lbl">{r.label}</span>
          <span className="se-bar__track">
            <i
              style={{
                width: r.gpa ? `${((r.gpa - 1) / 4) * 100}%` : '0%',
                background: r.gpa ? gColor(r.gpa) : 'var(--border-strong)'
              }}
            />
          </span>
          <span className="se-bar__val">
            {gradeLabel(r.gpa)}
            <em>{r.credits} ECTS</em>
          </span>
        </div>
      ))}
    </div>
  )
}

/* ── Seite ──────────────────────────────────────────────────────────── */

export function StudienErgebnisse({ onBack }: { onBack: () => void }): JSX.Element {
  const index = useStudienplanerStore((s) => s.index)
  const tree = useStudienplanerStore((s) => s.tree)
  const results = useMemo<FachResult[]>(() => Object.values(index.results ?? {}), [index.results])
  const [edit, setEdit] = useState<{ semester: string; kurs: string } | null>(null)
  const [adding, setAdding] = useState(false)
  const [detail, setDetail] = useState<{ semester: string; kurs: string } | null>(null)
  const [sortBy, setSortBy] = useState<SortMode>('semester')
  const [analyzing, setAnalyzing] = useState(false)
  const [hasKey, setHasKey] = useState(true)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    void window.api.llmHasKey().then(setHasKey)
  }, [])
  // Nur für Screenshots: #sescroll=1 scrollt, #sesort=<mode>, #sedetail=<Sem>/<Kurs>,
  // #seedit=<Sem>/<Kurs>, #seadd=1 öffnet „Ergebnis hinzufügen".
  useEffect(() => {
    const sc = /[#&]sescroll=(\d+)/.exec(location.hash)
    if (sc) {
      const y = sc[1] === '1' ? 99999 : Number(sc[1])
      setTimeout(() => rootRef.current?.scrollTo(0, y), 300)
    }
    const s = /[#&]sesort=(semester|date|grade)/.exec(location.hash)
    if (s) setSortBy(s[1] as SortMode)
    const d = /[#&]sedetail=([^&]+)/.exec(location.hash)
    if (d) {
      const [sem, ku] = decodeURIComponent(d[1].replace(/\+/g, ' ')).split('/')
      if (sem && ku) setTimeout(() => setDetail({ semester: sem, kurs: ku }), 400)
    }
    const ed = /[#&]seedit=([^&]+)/.exec(location.hash)
    if (ed) {
      const [sem, ku] = decodeURIComponent(ed[1].replace(/\+/g, ' ')).split('/')
      if (sem && ku) setTimeout(() => setEdit({ semester: sem, kurs: ku }), 400)
    }
    if (/[#&]seadd=1/.test(location.hash)) setTimeout(() => setAdding(true), 400)
  }, [])

  // Fächer, die bewusst nicht in den Bachelor-Schnitt eingehen (z. B. Vorkurs),
  // bleiben als Karte sichtbar, fließen aber nicht in Diagramme/Auswertung ein.
  const graded = results.filter((r) => fachGrade(r) !== null && !r.excludeFromGpa)
  const overall: GpaSummary = overallGpa(results)

  const tactics = index.tactics ?? null
  const staleCount = tactics ? Math.max(0, graded.length - tactics.basis) : 0

  const runAnalyze = async (): Promise<void> => {
    if (!hasKey) {
      toast.error('Erst einen Gemini-Schlüssel in den Einstellungen eintragen.')
      return
    }
    const digest = buildTacticsDigest(results)
    if (!digest) {
      toast.error('Noch keine benoteten Fächer zum Auswerten.')
      return
    }
    setAnalyzing(true)
    try {
      const text = await analyzeStudyTactics(digest)
      await useStudienplanerStore.getState().saveTacticsAnalysis(text)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Auswertung fehlgeschlagen')
    } finally {
      setAnalyzing(false)
    }
  }

  // Chronologisch, unbekannte Semester nach Baum-Reihenfolge einsortiert.
  const semKey = (name: string): number => {
    const k = semesterSortKey(name)
    if (k < 9e6) return k
    const i = (tree?.semesters ?? []).findIndex((s) => s.name === name)
    return i === -1 ? 9e6 : 8e6 + i
  }
  const semSort = (a: string, b: string): number => semKey(a) - semKey(b) || a.localeCompare(b)
  // aufsteigend (ältestes zuerst) – für das Balkendiagramm „Schnitt je Semester"
  const semesters = [...new Set(results.map((r) => r.semester))].sort(semSort)

  // Aufgaben-Schnitt über alle Fächer mit Vorbereitungs-Schnappschuss (für den Vergleich).
  const prepped = results.filter((r) => r.prep && r.prep.plannedTasks > 0)
  const avgDoneTasks = prepped.length
    ? prepped.reduce((n, r) => n + (r.prep?.doneTasks ?? 0), 0) / prepped.length
    : 0

  // Sortierte Fächer-Liste (jüngstes zuerst bei „Datum", beste Note zuerst bei „Note").
  const sortedResults = [...results].sort((a, b) => {
    if (sortBy === 'grade') {
      const ga = fachGrade(a)
      const gb = fachGrade(b)
      if (ga === null && gb === null) return semSort(a.semester, b.semester)
      if (ga === null) return 1
      if (gb === null) return -1
      return ga - gb
    }
    if (sortBy === 'date') {
      return resultDate(b).localeCompare(resultDate(a)) || a.kurs.localeCompare(b.kurs)
    }
    // 'semester' – neuestes Semester zuerst, darin alphabetisch
    return -semSort(a.semester, b.semester) || a.kurs.localeCompare(b.kurs)
  })
  const detailResult = detail
    ? (index.results?.[resultKey(detail.semester, detail.kurs)] ?? null)
    : null

  const timeline: Pt[] = graded
    .map((r) => {
      const g = fachGrade(r)!
      const d =
        r.components
          .map((c) => c.dateIso)
          .filter(Boolean)
          .sort()[0] ??
        r.prep?.examDateIso ??
        undefined
      return d ? { x: new Date(d).getTime(), y: g, hue: fachHue(r.kurs), label: r.kurs } : null
    })
    .filter((p): p is Pt => p !== null)
    .sort((a, b) => a.x - b.x)

  const effortPts: Pt[] = graded
    .filter((r) => r.prep && r.prep.plannedTasks > 0)
    .map((r) => ({
      x: r.prep!.doneTasks,
      y: fachGrade(r)!,
      hue: fachHue(r.kurs),
      label: r.kurs
    }))

  const quizPts: Pt[] = graded
    .filter((r) => r.prep && r.prep.quizAccuracy !== null)
    .map((r) => ({
      x: Math.round((r.prep!.quizAccuracy as number) * 100),
      y: fachGrade(r)!,
      hue: fachHue(r.kurs),
      label: r.kurs
    }))

  if (results.length === 0) {
    return (
      <div className="se">
        <div className="se__head">
          <IconButton name="chevron-left" label="Zurück" onClick={onBack} />
          <h2>
            <Icon name="graduation" size={16} /> Studienergebnisse
          </h2>
        </div>
        <EmptyState
          icon="graduation"
          title="Noch keine Ergebnisse"
          hint={
            'Trag eine Note ein – direkt hier oder beim jeweiligen Fach unter „Ergebnis“. ECTS legen den Notenschnitt fest, der dann hier mit Diagrammen erscheint.'
          }
          action={
            <Button variant="primary" icon="plus" onClick={() => setAdding(true)}>
              Ergebnis hinzufügen
            </Button>
          }
        />
        {adding && (
          <AddResultSheet
            onClose={() => setAdding(false)}
            onCreate={(sem, k) => {
              setAdding(false)
              setEdit({ semester: sem, kurs: k })
            }}
          />
        )}
        {edit && (
          <Sheet
            title={`Ergebnis · ${edit.kurs}`}
            subtitle={edit.semester}
            onClose={() => setEdit(null)}
          >
            <ExamResultForm
              semester={edit.semester}
              kurs={edit.kurs}
              initial={index.results?.[resultKey(edit.semester, edit.kurs)] ?? null}
              onSaved={() => setEdit(null)}
            />
          </Sheet>
        )}
      </div>
    )
  }

  return (
    <div className="se" ref={rootRef}>
      <div className="se__head">
        <IconButton name="chevron-left" label="Zurück" onClick={onBack} />
        <h2>
          <Icon name="graduation" size={16} /> Studienergebnisse
        </h2>
      </div>

      <div className="se__gpa">
        <div
          className="se__gpanum"
          style={{ color: overall.gpa ? gColor(overall.gpa) : undefined }}
        >
          {gradeLabel(overall.gpa)}
        </div>
        <div className="se__gpameta">
          <strong>Gesamtschnitt (ECTS-gewichtet)</strong>
          <span>
            {overall.gpa === null
              ? 'noch keine Noten eingetragen'
              : `${overall.counted} ${overall.counted === 1 ? 'Fach' : 'Fächer'} · ${overall.credits} ECTS`}
          </span>
          {overall.missingEcts.length > 0 && (
            <span className="se__warn">
              Bei {overall.missingEcts.length}{' '}
              {overall.missingEcts.length === 1 ? 'Fach' : 'Fächern'} fehlen ECTS – zählt nicht mit
              ({overall.missingEcts.join(', ')})
            </span>
          )}
        </div>
      </div>

      <div className="se__grid">
        {timeline.length > 0 && (
          <section className="se__card">
            <h3>Notenverlauf</h3>
            <Scatter
              points={timeline}
              xDomain={[timeline[0].x, timeline[timeline.length - 1].x || timeline[0].x + 1]}
              xLabel="Prüfungsdatum"
              trend
            />
          </section>
        )}

        {semesters.length > 0 && (
          <section className="se__card">
            <h3>Schnitt je Semester</h3>
            <Bars
              rows={[
                ...semesters.map((s) => {
                  const g = semesterGpa(results, s)
                  return { label: s, gpa: g.gpa, credits: g.credits }
                }),
                { label: 'Gesamt', gpa: overall.gpa, credits: overall.credits }
              ]}
            />
          </section>
        )}

        {effortPts.length > 0 && (
          <section className="se__card">
            <h3>Lernaufwand ↔ Note</h3>
            <Scatter
              points={effortPts}
              xDomain={[0, Math.max(4, ...effortPts.map((p) => p.x))]}
              xLabel="erledigte Lern-Aufgaben"
              trend
            />
          </section>
        )}

        {quizPts.length > 0 && (
          <section className="se__card">
            <h3>Quiz-Sicherheit ↔ Note</h3>
            <Scatter
              points={quizPts}
              xDomain={[0, 100]}
              xLabel="Quiz-Trefferquote % vor der Prüfung"
              trend
            />
          </section>
        )}
      </div>

      <section className="se__analysis">
        <div className="se__analysishead">
          <div>
            <h3>Lernstrategie</h3>
            <p className="se__analysissub">
              Wertet Noten, Lernaufwand und Quiz-Sicherheit über alle Fächer aus und gibt dir
              konkrete Tipps.
            </p>
          </div>
          <Button
            icon="sparkles"
            onClick={() => void runAnalyze()}
            disabled={analyzing || graded.length === 0}
          >
            {analyzing ? 'Analysiert …' : tactics ? 'Neu analysieren' : 'Analysieren'}
          </Button>
        </div>

        {analyzing && (
          <p className="se__analysisbusy">
            <Spinner size={16} /> Deine Lerndaten werden ausgewertet …
          </p>
        )}

        {!analyzing && tactics && (
          <div className="se__analysisout">
            {staleCount > 0 && (
              <p className="se__warn">
                Seit dieser Auswertung sind {staleCount}{' '}
                {staleCount === 1 ? 'neues Ergebnis' : 'neue Ergebnisse'} dazugekommen – neu
                analysieren für den aktuellen Stand.
              </p>
            )}
            <Markdown md={tactics.text} className="se__analysismd" />
            <p className="se__analysismeta">
              Stand {new Date(tactics.at).toLocaleDateString('de-DE')} · Basis {tactics.basis}{' '}
              {tactics.basis === 1 ? 'benotetes Fach' : 'benotete Fächer'}
            </p>
          </div>
        )}

        {!analyzing && !tactics && graded.length === 0 && (
          <p className="se__analysisbusy">
            Noch keine benoteten Fächer – trag erst Ergebnisse ein.
          </p>
        )}
      </section>

      <div className="se__fachhead">
        <h3>Fächer</h3>
        <div className="se__fachheadright">
          <Segmented<SortMode>
            value={sortBy}
            onChange={setSortBy}
            options={[
              { value: 'semester', label: 'Semester' },
              { value: 'date', label: 'Datum' },
              { value: 'grade', label: 'Note' }
            ]}
          />
          <Button size="sm" icon="plus" onClick={() => setAdding(true)}>
            Ergebnis
          </Button>
        </div>
      </div>

      {sortBy === 'semester' ? (
        [...semesters].reverse().map((sem) => (
          <div key={sem} className="se__semgroup">
            <div className="se__semhead">
              {sem}
              <em>{gradeLabel(semesterGpa(results, sem).gpa)} ø</em>
            </div>
            <div className="se__fachgrid">
              {sortedResults
                .filter((r) => r.semester === sem)
                .map((r) => (
                  <FachCard
                    key={r.kurs}
                    r={r}
                    onOpen={() => setDetail({ semester: r.semester, kurs: r.kurs })}
                  />
                ))}
            </div>
          </div>
        ))
      ) : (
        <div className="se__fachgrid">
          {sortedResults.map((r) => (
            <FachCard
              key={`${r.semester}//${r.kurs}`}
              r={r}
              onOpen={() => setDetail({ semester: r.semester, kurs: r.kurs })}
            />
          ))}
        </div>
      )}

      {detail && detailResult && (
        <Sheet
          title={detailResult.kurs}
          subtitle={`${detailResult.semester}${detailResult.ects ? ` · ${detailResult.ects} ECTS` : ''}`}
          onClose={() => setDetail(null)}
        >
          <FachDetail
            r={detailResult}
            avgDoneTasks={avgDoneTasks}
            onEdit={() => {
              setEdit({ semester: detailResult.semester, kurs: detailResult.kurs })
              setDetail(null)
            }}
          />
        </Sheet>
      )}

      {edit && (
        <Sheet
          title={`Ergebnis · ${edit.kurs}`}
          subtitle={edit.semester}
          onClose={() => setEdit(null)}
        >
          <ExamResultForm
            semester={edit.semester}
            kurs={edit.kurs}
            initial={index.results?.[resultKey(edit.semester, edit.kurs)] ?? null}
            onSaved={() => setEdit(null)}
          />
        </Sheet>
      )}

      {adding && (
        <AddResultSheet
          onClose={() => setAdding(false)}
          onCreate={(sem, k) => {
            setAdding(false)
            setEdit({ semester: sem, kurs: k })
          }}
        />
      )}
    </div>
  )
}

/* ── Fach-Karte + Detail ────────────────────────────────────────────── */

function FachCard({ r, onOpen }: { r: FachResult; onOpen: () => void }): JSX.Element {
  const g = fachGrade(r)
  const pass = fachPassStatus(r)
  return (
    <button
      className="se__fach"
      style={{ ['--fh' as string]: `hsl(${fachHue(r.kurs)} 60% 55%)` }}
      onClick={onOpen}
    >
      <div className="se__fachtop">
        <span className="se__fachname">{r.kurs}</span>
        <span className="se__fachgrade" style={{ color: g ? gColor(g) : 'var(--text-secondary)' }}>
          {g ? gradeLabel(g) : pass === true ? 'best.' : pass === false ? 'n. best.' : '–'}
        </span>
      </div>
      <div className="se__fachmeta">
        {r.semester}
        {r.ects ? ` · ${r.ects} ECTS` : ' · ECTS fehlt'}
      </div>
      {r.excludeFromGpa && <span className="se__fachexcl">zählt nicht zum Schnitt</span>}
      {r.prep && (
        <div className="se__fachprep">
          {r.prep.doneTasks}/{r.prep.plannedTasks} Aufgaben
          {r.prep.quizAccuracy !== null && ` · Quiz ${Math.round(r.prep.quizAccuracy * 100)} %`}
        </div>
      )}
      <span className="se__fachopen">
        Details ansehen <Icon name="chevron-right" size={12} />
      </span>
    </button>
  )
}

function FachDetail({
  r,
  avgDoneTasks,
  onEdit
}: {
  r: FachResult
  avgDoneTasks: number
  onEdit: () => void
}): JSX.Element {
  const g = fachGrade(r)
  const pass = fachPassStatus(r)
  const done = r.prep?.doneTasks ?? 0
  const planned = r.prep?.plannedTasks ?? 0
  const donePct = planned > 0 ? Math.round((done / planned) * 100) : 0
  const vsAvg = avgDoneTasks > 0 ? done - avgDoneTasks : 0

  return (
    <div className="se-detail">
      <div className="se-detail__grade" style={{ color: g ? gColor(g) : 'var(--text-secondary)' }}>
        {g ? gradeLabel(g) : pass === true ? 'bestanden' : pass === false ? 'nicht bestanden' : '–'}
        <em>Fach-Note</em>
      </div>
      {r.excludeFromGpa && (
        <p className="se__warn">
          Zählt nicht für den Bachelor-Schnitt (z.&nbsp;B. Vorkurs) – erscheint deshalb nicht in
          Gesamtschnitt oder Diagrammen.
        </p>
      )}

      <h4 className="se-detail__h">Teilleistungen</h4>
      <div className="se-detail__comps">
        {r.components.map((c) => {
          const cg = componentGrade(c)
          return (
            <div key={c.id} className="se-detail__comp">
              <span className="se-detail__ctitle">{c.title}</span>
              <span className="se-detail__cval">
                {c.mode === 'grade' && gradeLabel(c.grade ?? null)}
                {c.mode === 'points' && `${c.points ?? '–'} P → ${gradeLabel(cg)}`}
                {c.mode === 'passfail' &&
                  (c.passed === true ? 'bestanden' : c.passed === false ? 'nicht bestanden' : '–')}
              </span>
              <span className="se-detail__cweight">{c.weightPct}&thinsp;%</span>
              <span className="se-detail__cdate">{c.dateIso ?? ''}</span>
            </div>
          )
        })}
      </div>

      <h4 className="se-detail__h">Lernvorbereitung</h4>
      {r.prep ? (
        <div className="se-detail__prep">
          <div className="se-detail__prow">
            <span>Aufgaben geschafft</span>
            <span className="se-detail__pbar">
              <i style={{ width: `${donePct}%` }} />
            </span>
            <strong>
              {done}/{planned}
            </strong>
          </div>
          <div className="se-detail__prow">
            <span>Quiz-Trefferquote vor der Prüfung</span>
            <strong>
              {r.prep.quizAccuracy !== null
                ? `${Math.round(r.prep.quizAccuracy * 100)} %`
                : 'kein Quiz'}
            </strong>
          </div>
          {r.prep.examDateIso && (
            <div className="se-detail__prow">
              <span>Prüfungstermin</span>
              <strong>{r.prep.examDateIso}</strong>
            </div>
          )}
          {avgDoneTasks > 0 &&
            Math.abs(vsAvg) >= 1 &&
            (() => {
              const n = Math.round(Math.abs(vsAvg))
              const word = n === 1 ? 'Aufgabe' : 'Aufgaben'
              return (
                <p className="se-detail__cmp">
                  {vsAvg > 0
                    ? `Du hast hier ${n} ${word} mehr geschafft als im Schnitt deiner Fächer.`
                    : `Hier hast du ${n} ${word} weniger geschafft als im Schnitt deiner Fächer.`}
                </p>
              )
            })()}
        </div>
      ) : (
        <p className="se-detail__none">
          Kein Vorbereitungs-Schnappschuss – wurde vor dem Ergebnis-Feature eingetragen.
        </p>
      )}

      <Button variant="ghost" icon="pen" onClick={onEdit}>
        Ergebnis bearbeiten
      </Button>
    </div>
  )
}

/* ── Neues Ergebnis anlegen (ohne Umweg über Lernplan/Prüfungs-Verknüpfung) ────── */

function AddResultSheet({
  onClose,
  onCreate
}: {
  onClose: () => void
  onCreate: (semester: string, kurs: string) => void
}): JSX.Element {
  const tree = useStudienplanerStore((s) => s.tree)
  const semesters = tree?.semesters ?? []

  const [semester, setSemester] = useState(semesters[0]?.name ?? NEW)
  const [newSemester, setNewSemester] = useState('')
  const [kurs, setKurs] = useState('')
  const [newKurs, setNewKurs] = useState('')
  const [pending, setPending] = useState(false)

  const courses = semesters.find((s) => s.name === semester)?.courses ?? []

  const submit = async (): Promise<void> => {
    const sem = (semester === NEW ? newSemester : semester).trim()
    const k = (kurs === NEW || !kurs ? newKurs : kurs).trim()
    if (!sem || !k) {
      toast.error('Bitte Semester und Kurs/Thema angeben.')
      return
    }
    setPending(true)
    try {
      if (semester === NEW) await useStudienplanerStore.getState().createSemester(sem)
      if (kurs === NEW || !kurs) await useStudienplanerStore.getState().createCourse(sem, k)
      onCreate(safeName(sem), safeName(k))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      title="Ergebnis hinzufügen"
      subtitle="Note für ein Fach eintragen – auch ohne Lernplan oder verknüpfte Prüfung"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            icon="graduation"
            disabled={pending}
            onClick={() => void submit()}
          >
            Weiter
          </Button>
        </>
      }
    >
      <label className="sp-field">
        <span>Semester</span>
        <Select
          value={semester}
          onChange={(e) => {
            setSemester(e.target.value)
            setKurs('')
          }}
          options={[
            ...semesters.map((s) => ({ value: s.name, label: s.name })),
            { value: NEW, label: '＋ Neues Semester' }
          ]}
        />
      </label>
      {semester === NEW && (
        <TextInput
          autoFocus
          placeholder="z. B. WS 2022"
          value={newSemester}
          onChange={(e) => setNewSemester(e.target.value)}
        />
      )}
      {semester !== NEW && courses.length > 0 ? (
        <>
          <label className="sp-field">
            <span>Kurs / Thema</span>
            <Select
              value={kurs}
              onChange={(e) => setKurs(e.target.value)}
              options={[
                { value: '', label: '— wählen —' },
                ...courses.map((c) => ({ value: c.name, label: c.name })),
                { value: NEW, label: '＋ Neuer Kurs' }
              ]}
            />
          </label>
          {(kurs === NEW || !kurs) && (
            <TextInput
              placeholder="Kursname"
              value={newKurs}
              onChange={(e) => setNewKurs(e.target.value)}
            />
          )}
        </>
      ) : (
        <label className="sp-field">
          <span>Kurs / Thema</span>
          <TextInput
            placeholder="z. B. Vorkurs Mathematik"
            value={newKurs}
            onChange={(e) => setNewKurs(e.target.value)}
          />
        </label>
      )}
    </Sheet>
  )
}
