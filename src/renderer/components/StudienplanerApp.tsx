import { useEffect, useMemo, useRef, useState } from 'react'
import type { OcrResult, SpFile, SpSemester } from '@shared/types'
import { useShellStore } from '../store/shellStore'
import { useSettingsStore } from '../store/settingsStore'
import { useStudienplanerStore, joinPath, type FilingTarget } from '../store/studienplanerStore'
import { useCalendarStore } from '../store/calendarStore'
import { requestDialog } from '../store/dialogStore'
import { safeName, searchIndex, suggestFiling, type IndexExam } from '../studienplaner/model'
import { examKeyOf, getExamLink, type LernplanMeta } from '../studienplaner/prep'
import { PrepPanel, type PrepTab } from './PrepPanel'
import { CoursePlanInline } from './CoursePlanInline'
import { ErrorBoundary } from './common/ErrorBoundary'
import {
  buildAgenda,
  courseNamesFromEvents,
  daysLeftLabel,
  daysUntil,
  eventTime,
  isExam,
  suggestSemesterName,
  upcomingExams
} from '../studienplaner/calendar'
import { Icon } from './common/Icon'
import { AstraMark } from './AstraMark'
import { Tooltip } from './common/Tooltip'
import { Button, IconButton } from './common/Button'
import { Sheet } from './common/Sheet'
import { Select, TextInput, Toggle } from './common/controls'
import { Spinner, EmptyState } from './common/misc'
import { cx } from '../lib/cx'
import { toast } from './common/toast'
import './studienplaner.css'

const NEW = '__new__'
const NOTE_ACCEPT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp'])

let selfTestRan = false
if (typeof location !== 'undefined' && /[#&]sptest=1/.test(location.hash) && !selfTestRan) {
  selfTestRan = true
  void import('../studienplaner/selftest').then((m) => m.runStudienplanerSelfTest())
}

function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/* ── Einsortier-Dialog ─────────────────────────────────────────────────── */

function FilingSheet({ file, onClose }: { file: SpFile; onClose: () => void }): JSX.Element {
  const tree = useStudienplanerStore((s) => s.tree)
  const busy = useStudienplanerStore((s) => s.busy)
  const ocrFile = useStudienplanerStore((s) => s.ocrFile)
  const fileItem = useStudienplanerStore((s) => s.fileItem)

  const [ocr, setOcr] = useState<OcrResult | null>(null)
  const [ranOcr, setRanOcr] = useState(false)
  const [showText, setShowText] = useState(false)

  const [semester, setSemester] = useState('')
  const [newSemester, setNewSemester] = useState('')
  const [kurs, setKurs] = useState('')
  const [newKurs, setNewKurs] = useState('')
  const [thema, setThema] = useState(file.name.replace(/\.[^.]+$/, ''))
  const [makeSearchable, setMakeSearchable] = useState(true)

  const semesters = tree?.semesters ?? []
  const activeSemesterName = semester === NEW ? '' : semester
  const courses = semesters.find((s) => s.name === activeSemesterName)?.courses ?? []

  const runOcr = async (): Promise<void> => {
    const result = await ocrFile(file)
    setOcr(result)
    setRanOcr(true)
    if (!result?.text) {
      toast.info('Kein Text erkannt – bitte von Hand einsortieren.')
      return
    }
    const s = suggestFiling(result.text, tree!)
    if (s.semester) setSemester(semesters.some((x) => x.name === s.semester) ? s.semester : NEW)
    if (s.semester && !semesters.some((x) => x.name === s.semester)) setNewSemester(s.semester)
    if (s.kurs) {
      const semObj = semesters.find((x) => x.name === s.semester)
      if (semObj?.courses.some((c) => c.name === s.kurs)) setKurs(s.kurs)
      else {
        setKurs(NEW)
        setNewKurs(s.kurs)
      }
    }
    if (s.thema) setThema(s.thema)
    toast.success(
      s.kurs ? `Vorschlag: ${s.kurs}${s.semester ? ` · ${s.semester}` : ''}` : 'Text erkannt.'
    )
  }

  const submit = async (): Promise<void> => {
    const target: FilingTarget = {
      semester: semester === NEW ? newSemester : semester,
      kurs: kurs === NEW ? newKurs : kurs,
      thema,
      makeSearchable
    }
    await fileItem(file, target, ocr)
    onClose()
  }

  return (
    <Sheet
      title="Notiz einsortieren"
      subtitle={file.name}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            icon="folder"
            disabled={Boolean(busy)}
            onClick={() => void submit()}
          >
            Ablegen
          </Button>
        </>
      }
    >
      <div className="sp-file__ocr">
        {!ranOcr ? (
          <Button icon="scan" disabled={Boolean(busy)} onClick={() => void runOcr()}>
            {busy ?? 'Text erkennen & Vorschlag holen'}
          </Button>
        ) : ocr?.text ? (
          <div className="sp-file__ocrbox">
            <button className="sp-file__ocrtoggle" onClick={() => setShowText((v) => !v)}>
              <Icon name={showText ? 'chevron-down' : 'chevron-right'} size={13} />
              Erkannter Text ({ocr.engine === 'vision' ? 'Apple Vision' : 'tesseract'})
            </button>
            {showText && <pre className="sp-file__ocrtext">{ocr.text}</pre>}
          </div>
        ) : (
          <p className="sp-file__hint">Kein Text erkannt.</p>
        )}
      </div>

      <label className="sp-field">
        <span>Semester</span>
        <Select
          value={semester}
          onChange={(e) => {
            setSemester(e.target.value)
            setKurs('')
          }}
          options={[
            { value: '', label: '— wählen —' },
            ...semesters.map((s) => ({ value: s.name, label: s.name })),
            { value: NEW, label: '＋ Neues Semester' }
          ]}
        />
      </label>
      {semester === NEW && (
        <TextInput
          autoFocus
          placeholder="z. B. 3. Semester oder WS 2025"
          value={newSemester}
          onChange={(e) => setNewSemester(e.target.value)}
        />
      )}

      <label className="sp-field">
        <span>Kurs</span>
        <Select
          value={kurs}
          disabled={!semester}
          onChange={(e) => setKurs(e.target.value)}
          options={[
            { value: '', label: '— wählen —' },
            ...courses.map((c) => ({ value: c.name, label: c.name })),
            { value: NEW, label: '＋ Neuer Kurs' }
          ]}
        />
      </label>
      {kurs === NEW && (
        <TextInput
          placeholder="z. B. Analysis II"
          value={newKurs}
          onChange={(e) => setNewKurs(e.target.value)}
        />
      )}

      <label className="sp-field">
        <span>Thema / Dateiname</span>
        <TextInput value={thema} onChange={(e) => setThema(e.target.value)} />
      </label>

      <label className="sp-field sp-field--row">
        <Toggle checked={makeSearchable} onChange={setMakeSearchable} label="Durchsuchbares PDF" />
        <span>
          Als durchsuchbares PDF ablegen
          <em>
            Bild wird zu PDF, der erkannte Text liegt unsichtbar darüber (auch am iPhone findbar).
          </em>
        </span>
      </label>
    </Sheet>
  )
}

/* ── Prüfung ↔ Fach verknüpfen ────────────────────────────────────────── */

function ExamLinkSheet({
  exam,
  onClose,
  onLinked
}: {
  exam: { title: string; startIso: string | null }
  onClose: () => void
  onLinked: (target: { semester: string; kurs: string }) => void
}): JSX.Element {
  const tree = useStudienplanerStore((s) => s.tree)
  const linkExamToCourse = useStudienplanerStore((s) => s.linkExamToCourse)
  const semesters = tree?.semesters ?? []
  const guess = tree ? suggestFiling(exam.title, tree) : null

  const [semester, setSemester] = useState(guess?.semester ?? '')
  const [newSemester, setNewSemester] = useState('')
  const [kurs, setKurs] = useState(guess?.kurs ?? '')
  const [newKurs, setNewKurs] = useState('')
  const [pending, setPending] = useState(false)

  const courses =
    semesters.find((s) => s.name === (semester === NEW ? '' : semester))?.courses ?? []

  const submit = async (): Promise<void> => {
    const sem = semester === NEW ? newSemester : semester
    const k = kurs === NEW ? newKurs : kurs
    if (!sem.trim() || !k.trim()) {
      toast.error('Bitte Semester und Kurs angeben.')
      return
    }
    setPending(true)
    if (sem === newSemester) await useStudienplanerStore.getState().createSemester(sem)
    if (k === newKurs) await useStudienplanerStore.getState().createCourse(sem, k)
    await linkExamToCourse(
      { examKey: examKeyOf(exam.title, exam.startIso), title: exam.title, dateIso: exam.startIso },
      sem,
      k
    )
    setPending(false)
    onLinked({ semester: safeName(sem), kurs: safeName(k) })
  }

  return (
    <Sheet
      title="Prüfung → Fach"
      subtitle={exam.title}
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
            Verknüpfen
          </Button>
        </>
      }
    >
      <p className="sp-file__hint">
        Die Prüfung wird mit dem Lernplan dieses Fachs verknüpft (Countdown + adaptive Planung).
      </p>
      <label className="sp-field">
        <span>Semester</span>
        <Select
          value={semester}
          onChange={(e) => {
            setSemester(e.target.value)
            setKurs('')
          }}
          options={[
            { value: '', label: '— wählen —' },
            ...semesters.map((s) => ({ value: s.name, label: s.name })),
            { value: NEW, label: '＋ Neues Semester' }
          ]}
        />
      </label>
      {semester === NEW && (
        <TextInput
          autoFocus
          placeholder="z. B. 4. Semester"
          value={newSemester}
          onChange={(e) => setNewSemester(e.target.value)}
        />
      )}
      <label className="sp-field">
        <span>Kurs</span>
        <Select
          value={kurs}
          disabled={!semester}
          onChange={(e) => setKurs(e.target.value)}
          options={[
            { value: '', label: '— wählen —' },
            ...courses.map((c) => ({ value: c.name, label: c.name })),
            { value: NEW, label: '＋ Neuer Kurs' }
          ]}
        />
      </label>
      {kurs === NEW && (
        <TextInput
          placeholder="Kursname"
          value={newKurs}
          onChange={(e) => setNewKurs(e.target.value)}
        />
      )}
    </Sheet>
  )
}

/* ── Fächer aus dem Stundenplan-Kalender anlegen ─────────────────────── */

function TimetableSheet({
  onClose,
  onDone
}: {
  onClose: () => void
  onDone: () => void
}): JSX.Element {
  const events = useCalendarStore((s) => s.events)
  const calStatus = useCalendarStore((s) => s.status)
  const scaffoldCourses = useStudienplanerStore((s) => s.scaffoldCourses)

  const detected = useMemo(() => courseNamesFromEvents(events), [events])
  const [semester, setSemester] = useState(suggestSemesterName())
  const [drop, setDrop] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [pending, setPending] = useState(false)

  const chosen = detected.filter((c) => !drop.has(c))
  const extraList = extra
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const total = new Set([...chosen, ...extraList]).size

  const submit = async (): Promise<void> => {
    if (!semester.trim() || total === 0) {
      toast.error('Semestername und mindestens ein Fach nötig.')
      return
    }
    setPending(true)
    const n = await scaffoldCourses(semester.trim(), [...chosen, ...extraList])
    setPending(false)
    toast.success(`${n} Fach-Ordner in „${semester.trim()}" angelegt (je mit Wichtig & Übungen).`)
    onDone()
  }

  return (
    <Sheet
      title="Fächer aus Stundenplan"
      subtitle="Semester & Kurse aus dem verbundenen Kalender übernehmen"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            variant="primary"
            icon="folder"
            disabled={pending || total === 0}
            onClick={() => void submit()}
          >
            {total} Ordner anlegen
          </Button>
        </>
      }
    >
      <p className="sp-file__hint">
        Jedes Fach bekommt einen Ordner unter dem Semester, darin je einen Unterordner{' '}
        <strong>Wichtig</strong> und <strong>Übungen</strong>. Vorhandene Ordner bleiben unberührt.
      </p>

      <label className="sp-field">
        <span>Semester</span>
        <TextInput
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          placeholder="z. B. WS 2025"
        />
      </label>

      {calStatus !== 'authorized' ? (
        <p className="sp__empty">
          Kein Kalender verbunden – in der Termine-Leiste rechts verbinden, oder Fächer unten von
          Hand eintragen.
        </p>
      ) : detected.length === 0 ? (
        <p className="sp__empty">
          Keine Fächer im Kalender erkannt (nur Klausuren/ganztägige Termine?). Trag sie unten von
          Hand ein.
        </p>
      ) : (
        <div className="sp__ttlist">
          {detected.map((c) => {
            const on = !drop.has(c)
            return (
              <label key={c} className={cx('sp__ttrow', on && 'is-on')}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() =>
                    setDrop((d) => {
                      const next = new Set(d)
                      if (next.has(c)) next.delete(c)
                      else next.add(c)
                      return next
                    })
                  }
                />
                <span>{c}</span>
              </label>
            )
          })}
        </div>
      )}

      <label className="sp-field">
        <span>Weitere Fächer (mit Komma trennen)</span>
        <TextInput
          value={extra}
          onChange={(e) => setExtra(e.target.value)}
          placeholder="z. B. Statistik, Englisch"
        />
      </label>
    </Sheet>
  )
}

/* ── Zentraler Lernplan: eine Karte je Fach + gemeinsame Aufgaben-Timeline ── */

function CentralLernplan({
  onOpen,
  reloadKey
}: {
  onOpen: (semester: string, kurs: string) => void
  reloadKey: number
}): JSX.Element {
  const allLernplaene = useStudienplanerStore((s) => s.allLernplaene)
  const tree = useStudienplanerStore((s) => s.tree)
  const courseSig = (tree?.semesters ?? [])
    .map((s) => `${s.name}:${s.courses.map((c) => c.name).join(',')}`)
    .join('|')
  const [rows, setRows] = useState<LernplanMeta[] | null>(null)
  const [showPast, setShowPast] = useState<boolean>(() => {
    try {
      return localStorage.getItem('astra.sp.showPast') === '1'
    } catch {
      return false
    }
  })
  const toggleShowPast = (): void => {
    setShowPast((v) => {
      const next = !v
      try {
        localStorage.setItem('astra.sp.showPast', next ? '1' : '0')
      } catch {
        /* egal */
      }
      return next
    })
  }

  useEffect(() => {
    void allLernplaene().then(setRows)
  }, [allLernplaene, reloadKey, courseSig])

  if (rows === null) return <div className="sp__nocourse">…</div>
  if (rows.length === 0) {
    return (
      <div className="sp__nocourse">
        <EmptyState
          icon="graduation"
          title="Lernplan"
          hint="Erst Semester und Kurse anlegen (links). Dann bekommt jedes Fach hier einen Bereich mit Quizzes, Zusammenfassung, Material und adaptivem Plan."
        />
      </div>
    )
  }

  // Fächer mit bereits vergangener Prüfung werden standardmäßig ausgeblendet
  // (der Lernplan bleibt gespeichert und über die Seitenleiste erreichbar).
  const isPast = (r: LernplanMeta): boolean =>
    Boolean(r.examDateIso) && daysUntil(r.examDateIso!) < 0
  const pastCount = rows.filter(isPast).length
  const visibleRows = showPast ? rows : rows.filter((r) => !isPast(r))

  const bySem = new Map<string, LernplanMeta[]>()
  for (const r of visibleRows) {
    if (!bySem.has(r.semester)) bySem.set(r.semester, [])
    bySem.get(r.semester)!.push(r)
  }

  const fmtDate = (iso: string): string =>
    new Date(iso).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' })
  const urgencyOf = (iso: string | null | undefined): 'past' | 'high' | 'soon' | 'ok' | 'none' => {
    if (!iso) return 'none'
    const n = daysUntil(iso)
    if (n < 0) return 'past'
    if (n <= 3) return 'high'
    if (n <= 10) return 'soon'
    return 'ok'
  }

  const nextExam =
    rows
      .filter((r) => r.examDateIso && daysUntil(r.examDateIso) >= 0)
      .sort((a, b) => (a.examDateIso ?? '').localeCompare(b.examDateIso ?? ''))[0] ?? null

  return (
    <div className="sp__central">
      <h2 className="sp__h2">
        <Icon name="graduation" size={15} /> Lernplan
        <span className="sp__count">
          {visibleRows.filter((r) => r.exists).length}/{visibleRows.length} Fächer
        </span>
        {pastCount > 0 && (
          <button className="sp__pasttoggle" onClick={toggleShowPast}>
            {showPast
              ? `${pastCount} vergangene ausblenden`
              : `${pastCount} vergangene Prüfung${pastCount === 1 ? '' : 'en'} anzeigen`}
          </button>
        )}
      </h2>

      {visibleRows.length === 0 && (
        <p className="sp__nocourse">
          Alle Fächer haben eine vergangene Prüfung. Über „{pastCount} vergangene …" oben wieder
          einblenden – gespeichert bleibt alles.
        </p>
      )}

      {nextExam && (
        <div className={cx('sp__nextexam', `is-${urgencyOf(nextExam.examDateIso)}`)}>
          🗓 <strong>{nextExam.examTitle ?? nextExam.kurs}</strong>
          <span>
            {nextExam.kurs} · {fmtDate(nextExam.examDateIso!)}
          </span>
          <span className="sp__nextexamdays">
            {daysLeftLabel(daysUntil(nextExam.examDateIso!))}
          </span>
        </div>
      )}

      {[...bySem.entries()].map(([sem, list]) => (
        <div key={sem} className="sp__csem">
          <div className="sp__csemhead">{sem}</div>
          <div className="sp__plangrid">
            {list.map((r) => {
              const n = r.examDateIso ? daysUntil(r.examDateIso) : null
              const urg = urgencyOf(r.examDateIso)
              // Ein Fortschrittswert: Plan-Aufgaben, sonst Quiz-Sicherheit.
              const prog =
                r.taskTotal > 0
                  ? {
                      pct: Math.round((r.taskDone / r.taskTotal) * 100),
                      label: `${r.taskDone}/${r.taskTotal} Aufgaben`
                    }
                  : r.answered > 0
                    ? {
                        pct: Math.round(r.progress * 100),
                        label: `${Math.round(r.progress * 100)}% Quiz`
                      }
                    : null
              return (
                <button
                  key={`${r.semester}/${r.kurs}`}
                  className={cx('sp__plancard', !r.exists && 'is-empty', `sp__plancard--${urg}`)}
                  onClick={() => onOpen(r.semester, r.kurs)}
                >
                  <span className="sp__planrow1">
                    <span className="sp__planname">{r.kurs}</span>
                    {n !== null && (
                      <span className={cx('sp__planchip', `is-${urg}`)}>{daysLeftLabel(n)}</span>
                    )}
                  </span>

                  {!r.exists ? (
                    <span className="sp__planempty">
                      <Icon name="sparkles" size={13} /> Lernplan anlegen
                    </span>
                  ) : (
                    <>
                      {prog ? (
                        <span className="sp__planprog">
                          <span className="sp__planbar">
                            <i style={{ width: `${prog.pct}%` }} />
                          </span>
                          <span className="sp__planprogval">{prog.label}</span>
                        </span>
                      ) : (
                        <span className="sp__planmeta">noch nichts geübt</span>
                      )}
                      <span className="sp__planfoot">
                        {r.examDateIso
                          ? `🗓 ${fmtDate(r.examDateIso)}`
                          : r.quizCount > 0
                            ? `${r.quizCount} Quiz · ${r.questionCount} Fragen`
                            : 'kein Termin'}
                      </span>
                    </>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Seitenleiste: Semester → Kurs ─────────────────────────────────────── */

function Tree({
  semesters,
  selected,
  onSelect,
  onAddSemester,
  onAddCourse,
  onImportTimetable
}: {
  semesters: SpSemester[]
  selected: { semester: string; kurs: string } | null
  onSelect: (semester: string, kurs: string) => void
  onAddSemester: (name: string) => void
  onAddCourse: (semester: string, name: string) => void
  onImportTimetable: () => void
}): JSX.Element {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [addingSem, setAddingSem] = useState(false)
  const [semName, setSemName] = useState('')
  const [addCourseFor, setAddCourseFor] = useState<string | null>(null)
  const [courseName, setCourseName] = useState('')

  return (
    <aside className="sp__side">
      <div className="sp__sidehead">
        <span>Semester</span>
        <span className="sp__sideheadbtns">
          <IconButton
            name="calendar"
            label="Fächer aus Stundenplan anlegen"
            onClick={onImportTimetable}
          />
          <IconButton name="plus" label="Neues Semester" onClick={() => setAddingSem((v) => !v)} />
        </span>
      </div>

      {addingSem && (
        <form
          className="sp__add"
          onSubmit={(e) => {
            e.preventDefault()
            if (semName.trim()) {
              onAddSemester(semName.trim())
              setSemName('')
              setAddingSem(false)
            }
          }}
        >
          <TextInput
            autoFocus
            placeholder="z. B. 1. Semester"
            value={semName}
            onChange={(e) => setSemName(e.target.value)}
          />
        </form>
      )}

      <div className="sp__tree">
        {semesters.length === 0 && !addingSem && (
          <p className="sp__treeempty">Noch keine Semester. Oben mit ＋ anlegen.</p>
        )}
        {semesters.map((sem) => {
          const isCollapsed = collapsed[sem.path]
          return (
            <div key={sem.path} className="sp__sem">
              <button
                className="sp__semrow"
                onClick={() => setCollapsed((c) => ({ ...c, [sem.path]: !c[sem.path] }))}
              >
                <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={13} />
                <Icon name="graduation" size={14} />
                <span className="sp__semname">{sem.name}</span>
                <span className="sp__count">{sem.courses.length}</span>
              </button>
              {!isCollapsed && (
                <div className="sp__courses">
                  {sem.courses.map((c) => (
                    <button
                      key={c.path}
                      className={cx(
                        'sp__course',
                        selected?.semester === sem.name && selected?.kurs === c.name && 'is-active'
                      )}
                      onClick={() => onSelect(sem.name, c.name)}
                    >
                      <Icon name="folder" size={13} />
                      <span>{c.name}</span>
                      <span className="sp__count">{c.files.length}</span>
                    </button>
                  ))}
                  {addCourseFor === sem.name ? (
                    <form
                      className="sp__add sp__add--course"
                      onSubmit={(e) => {
                        e.preventDefault()
                        if (courseName.trim()) {
                          onAddCourse(sem.name, courseName.trim())
                          setCourseName('')
                          setAddCourseFor(null)
                        }
                      }}
                    >
                      <TextInput
                        autoFocus
                        placeholder="Kursname"
                        value={courseName}
                        onChange={(e) => setCourseName(e.target.value)}
                      />
                    </form>
                  ) : (
                    <button
                      className="sp__course sp__course--add"
                      onClick={() => setAddCourseFor(sem.name)}
                    >
                      <Icon name="plus" size={13} /> <span>Kurs</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

/* ── Kalender-Leiste ──────────────────────────────────────────────────── */

function CalendarRail({
  onOpenPrep
}: {
  onOpenPrep: (ev: { title: string; start: string }) => void
}): JSX.Element {
  const {
    status,
    calendars,
    events,
    loading,
    creating,
    lastSync,
    demo,
    init,
    requestAccess,
    setCalendar,
    createStudiumCalendar,
    refresh
  } = useCalendarStore()
  const calId = useSettingsStore((s) => s.studienplanerCalendarId)
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    void init()
    const iv = setInterval(() => void useCalendarStore.getState().refresh(), 10 * 60 * 1000)
    const onFocus = (): void => {
      const last = useCalendarStore.getState().lastSync ?? 0
      if (Date.now() - last > 60_000) void useCalendarStore.getState().refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(iv)
      window.removeEventListener('focus', onFocus)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const activeCal = calendars.find((c) => c.id === calId) ?? (demo ? (calendars[0] ?? null) : null)
  const exams = useMemo(() => upcomingExams(events, 8), [events])
  const agenda = useMemo(() => buildAgenda(events, 28), [events])

  // Lernplan-Status je Prüfung (Quiz-Anzahl, „sicher"-Quote) für die Übersicht.
  const index = useStudienplanerStore((s) => s.index)
  const loadLernplan = useStudienplanerStore((s) => s.loadLernplan)
  const [prepInfo, setPrepInfo] = useState<
    Record<string, { quizzes: number; questions: number; sure: number }>
  >({})
  useEffect(() => {
    let alive = true
    const linked = exams
      .map((ev) => getExamLink(index, examKeyOf(ev.title, ev.start)))
      .filter((l): l is IndexExam => Boolean(l))
    void Promise.all(
      linked.map(async (l) => {
        const p = await loadLernplan(l.semester, l.kurs)
        const questions = p.quizzes.reduce((s, q) => s + q.items.length, 0)
        const sure = Object.values(p.progress).filter((x) => x.correct > 0).length
        return [l.examKey, { quizzes: p.quizzes.length, questions, sure }] as const
      })
    ).then((entries) => {
      if (alive) setPrepInfo(Object.fromEntries(entries))
    })
    return () => {
      alive = false
    }
  }, [exams, index, loadLernplan])

  if (status === null || status === 'unavailable') return <></>

  return (
    <aside className="sp__cal">
      <div className="sp__calhead">
        <span>Termine</span>
        {status === 'authorized' && (
          <IconButton name="rotate-cw" label="Aktualisieren" onClick={() => void refresh()} />
        )}
      </div>

      {status === 'notDetermined' && (
        <div className="sp__calconnect">
          <p>Vorlesungen und Klausuren aus deinem iCloud-Kalender hier anzeigen.</p>
          <Button variant="primary" icon="graduation" onClick={() => void requestAccess()}>
            Kalender verbinden
          </Button>
        </div>
      )}
      {(status === 'denied' || status === 'restricted') && (
        <p className="sp__calhint">
          Kalenderzugriff ist blockiert. In{' '}
          <strong>Systemeinstellungen → Datenschutz &amp; Sicherheit → Kalender</strong> für Astra
          erlauben, dann „Aktualisieren“.
        </p>
      )}

      {status === 'authorized' && (
        <div className="sp__calbody">
          {/* Studium-Kalender wählen / anlegen */}
          <div className="sp__calpickwrap">
            <button className="sp__calpick" onClick={() => setPickerOpen((v) => !v)}>
              <Icon name={pickerOpen ? 'chevron-down' : 'chevron-right'} size={12} />
              {activeCal ? (
                <>
                  <span className="sp__aevdot" style={{ background: activeCal.color }} />
                  {activeCal.title}
                </>
              ) : (
                <span className="sp__calpickhint">Studium-Kalender wählen …</span>
              )}
            </button>
            {pickerOpen && (
              <div className="sp__callist">
                {calendars.map((c) => (
                  <button
                    key={c.id}
                    className={cx('sp__calrow', c.id === calId && 'is-active')}
                    onClick={() => {
                      void setCalendar(c.id)
                      setPickerOpen(false)
                    }}
                  >
                    <span className="sp__aevdot" style={{ background: c.color }} />
                    {c.title}
                    {c.id === calId && <Icon name="check" size={12} />}
                  </button>
                ))}
                {!demo && (
                  <button
                    className="sp__calrow sp__calrow--new"
                    disabled={creating}
                    onClick={() => void createStudiumCalendar()}
                  >
                    <Icon name="plus" size={13} />
                    {creating ? 'wird angelegt …' : 'Studium-Kalender in iCloud anlegen'}
                  </button>
                )}
                {calId && !demo && (
                  <button
                    className="sp__calrow sp__calrow--new"
                    onClick={() => {
                      void setCalendar(null)
                      setPickerOpen(false)
                    }}
                  >
                    alle Kalender anzeigen
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Agenda */}
          <section className="sp__agenda">
            <h3>Nächste Wochen</h3>
            {agenda.length === 0 ? (
              <p className="sp__calmuted">Keine Termine in den nächsten 4 Wochen.</p>
            ) : (
              agenda.map((day) => (
                <div key={day.key} className="sp__aday">
                  <div className="sp__adaylabel">{day.label}</div>
                  {day.events.map((ev) => (
                    <div
                      key={ev.id}
                      className={cx('sp__aev', isExam(ev.title, ev.notes) && 'is-exam')}
                    >
                      <span className="sp__aevdot" style={{ background: ev.color }} />
                      <span className="sp__aevtime">{ev.allDay ? '—' : eventTime(ev)}</span>
                      <span className="sp__aevtitle">{ev.title}</span>
                    </div>
                  ))}
                </div>
              ))
            )}
          </section>

          {/* Prüfungen / Tests / Präsentationen – Countdown + Sprung zur Vorbereitung */}
          <section className="sp__exams">
            <h3>Prüfungen, Tests &amp; Präsis</h3>
            {exams.length === 0 ? (
              <p className="sp__calmuted">Nichts in Sicht – frei durchatmen. 🎉</p>
            ) : (
              exams.map((ev, examIdx) => {
                const n = daysUntil(ev.start)
                const info = prepInfo[examKeyOf(ev.title, ev.start)]
                return (
                  <button
                    key={ev.id}
                    className={cx(
                      'sp__exam',
                      'sp__exam--btn',
                      n <= 7 && 'is-soon',
                      examIdx === 0 && 'is-next'
                    )}
                    onClick={() => onOpenPrep({ title: ev.title, start: ev.start })}
                    title="Zur Prüfungsvorbereitung"
                  >
                    <span className="sp__examleft">{daysLeftLabel(n)}</span>
                    <span className="sp__exambody">
                      <strong>{ev.title}</strong>
                      <span>
                        {new Date(ev.start).toLocaleDateString('de-DE', {
                          weekday: 'short',
                          day: 'numeric',
                          month: 'short'
                        })}
                        {!ev.allDay && ` · ${eventTime(ev)}`}
                      </span>
                      {info ? (
                        <span className="sp__examprep">
                          {examIdx === 0 && <em>als Nächstes · </em>}
                          {info.questions > 0
                            ? `${info.quizzes} Quiz · ${info.questions} Fragen · ${info.sure} sicher`
                            : 'Vorbereitung öffnen'}
                        </span>
                      ) : (
                        examIdx === 0 && (
                          <span className="sp__examprep">
                            <em>als Nächstes</em>
                          </span>
                        )
                      )}
                    </span>
                    <Icon name="chevron-right" size={13} className="sp__examgo" />
                  </button>
                )
              })
            )}
          </section>

          <span className="sp__calsync">
            {loading
              ? 'wird geladen …'
              : lastSync
                ? `Stand ${new Date(lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
          </span>
        </div>
      )}
    </aside>
  )
}

/* ── Hauptansicht ─────────────────────────────────────────────────────── */

export function StudienplanerApp(): JSX.Element {
  const setView = useShellStore((s) => s.setView)
  const {
    path,
    tree,
    index,
    busy,
    error,
    open,
    close,
    choosePath,
    refresh,
    createSemester,
    createCourse,
    deleteFile,
    openInEditor
  } = useStudienplanerStore()

  const [selected, setSelected] = useState<{ semester: string; kurs: string } | null>(null)
  const [filing, setFiling] = useState<SpFile | null>(null)
  const [query, setQuery] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [openPlan, setOpenPlan] = useState<{
    semester: string
    kurs: string
    tab?: PrepTab
  } | null>(null)
  const [linkSheet, setLinkSheet] = useState<{ title: string; startIso: string | null } | null>(
    null
  )
  const [timetableOpen, setTimetableOpen] = useState(false)
  const [planReloadKey, setPlanReloadKey] = useState(0)
  const dropInput = useRef<HTMLInputElement>(null)

  const closePlan = (): void => {
    setOpenPlan(null)
    setPlanReloadKey((k) => k + 1)
  }

  /** Zurück zur Studienplaner-Startseite (zentraler Lernplan). */
  const goHome = (): void => {
    setOpenPlan(null)
    setSelected(null)
    setQuery('')
    setPlanReloadKey((k) => k + 1)
  }
  const atHome = !selected && !openPlan && !query.trim()

  const demo = useSettingsStore((s) => s.studienplanerDemo)
  const [demoBusy, setDemoBusy] = useState(false)

  const startDemo = async (): Promise<void> => {
    setDemoBusy(true)
    try {
      const { dir, calendarEvents } = await window.api.spSeedDemo({ reset: false })
      useSettingsStore.getState().enterStudienplanerDemo(dir)
      useCalendarStore.getState().enterDemo(calendarEvents)
      useStudienplanerStore.setState({ path: dir })
      await open()
      setSelected(null)
      setQuery('')
      setPlanReloadKey((k) => k + 1)
      toast.success('Demo-Modus – Beispieldaten geladen.')
    } catch {
      toast.error('Demo konnte nicht geladen werden.')
    } finally {
      setDemoBusy(false)
    }
  }

  const resetDemo = async (): Promise<void> => {
    setDemoBusy(true)
    try {
      const { dir, calendarEvents } = await window.api.spSeedDemo({ reset: true })
      useStudienplanerStore.setState({ path: dir })
      await open()
      useCalendarStore.getState().enterDemo(calendarEvents)
      setSelected(null)
      setQuery('')
      setOpenPlan(null)
      setPlanReloadKey((k) => k + 1)
      toast.success('Demo zurückgesetzt.')
    } finally {
      setDemoBusy(false)
    }
  }

  const stopDemo = async (): Promise<void> => {
    useCalendarStore.getState().exitDemo()
    const real = useSettingsStore.getState().exitStudienplanerDemo()
    setSelected(null)
    setQuery('')
    setOpenPlan(null)
    setPlanReloadKey((k) => k + 1)
    useStudienplanerStore.setState({ path: real ?? null })
    if (real) await open()
    else close()
  }

  const openPrep = (ev: { title: string; start: string }): void => {
    const link = getExamLink(index, examKeyOf(ev.title, ev.start))
    if (link) setOpenPlan({ semester: link.semester, kurs: link.kurs })
    else setLinkSheet({ title: ev.title, startIso: ev.start })
  }

  useEffect(() => {
    // Nur für die visuelle Verifikation: #spdir=<pfad> setzt den Ordner direkt.
    const dbg = /[#&]spdir=([^&]+)/.exec(location.hash)?.[1]
    if (dbg) {
      const decoded = decodeURIComponent(dbg)
      useSettingsStore.getState().setStudienplanerPath(decoded)
      useStudienplanerStore.setState({ path: decoded })
    }
    const sc = /[#&]spcourse=([^&]+)/.exec(location.hash)?.[1]
    if (sc) {
      const [sem, ku] = decodeURIComponent(sc.replace(/\+/g, ' ')).split('/')
      if (sem && ku) setTimeout(() => setSelected({ semester: sem, kurs: ku }), 500)
    }
    void open()
    // Demo-Modus aus einer früheren Sitzung: Fake-Kalender wieder herstellen.
    if (useSettingsStore.getState().studienplanerDemo) {
      void window.api
        .spSeedDemo({ reset: false })
        .then(({ calendarEvents }) => useCalendarStore.getState().enterDemo(calendarEvents))
        .catch(() => undefined)
    } else if (/[#&]spdemo=1/.test(location.hash)) {
      setTimeout(() => void startDemo(), 300)
    }
    if (/[#&]spsheet=tt/.test(location.hash)) setTimeout(() => setTimetableOpen(true), 900)
    return () => close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const results = useMemo(() => (query.trim() ? searchIndex(index, query) : []), [index, query])

  const selectedCourse = tree?.semesters
    .find((s) => s.name === selected?.semester)
    ?.courses.find((c) => c.name === selected?.kurs)

  const stashInInbox = async (files: { name: string; bytes: Uint8Array }[]): Promise<void> => {
    if (!path) return
    let n = 0
    for (const f of files) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
      if (!NOTE_ACCEPT.has(ext)) continue
      await window.api.spWrite(joinPath(path, '_Eingang', f.name), f.bytes)
      n++
    }
    if (n) {
      toast.success(`${n} Datei${n > 1 ? 'en' : ''} in den Eingang gelegt.`)
      await refresh()
    } else {
      toast.info('Nur PDF- oder Bilddateien werden angenommen.')
    }
  }

  const onDropFiles = async (list: FileList): Promise<void> => {
    const files = await Promise.all(
      Array.from(list).map(async (f) => ({
        name: f.name,
        bytes: new Uint8Array(await f.arrayBuffer())
      }))
    )
    await stashInInbox(files)
  }

  const pickScans = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles()
    if (!picked?.length) return
    const files: { name: string; bytes: Uint8Array }[] = []
    for (const p of picked) {
      const lf = await window.api.readFile(p.path)
      files.push({ name: lf.name, bytes: lf.bytes })
    }
    await stashInInbox(files)
  }

  /* — kein Ordner gesetzt — */
  if (!path) {
    return (
      <div className="sp">
        <div className="sp__glow" aria-hidden />
        <header className="sp__bar drag-region">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
          <div className="sp__title">Studienplaner</div>
          <div style={{ width: 92 }} />
        </header>
        <div className="sp__setup">
          <EmptyState
            icon="graduation"
            title="Wähle deinen Studien-Ordner"
            hint={
              <>
                Am besten ein Ordner in <strong>iCloud Drive</strong> (z. B.
                <code> iCloud Drive / Studium</code>) – dann liegen deine Notizen auf allen Geräten
                und du kannst sie am iPhone scannen. Astra legt darin die Struktur Semester → Kurs →
                Themen an.
              </>
            }
            action={
              <div className="sp__setupactions">
                <Button variant="primary" icon="folder-open" onClick={() => void choosePath()}>
                  iCloud-Ordner wählen …
                </Button>
                <Button
                  variant="ghost"
                  icon="sparkles"
                  disabled={demoBusy}
                  onClick={() => void startDemo()}
                >
                  {demoBusy ? 'lädt …' : 'Demo mit Beispieldaten starten'}
                </Button>
              </div>
            }
          />
          <p className="sp__setupdemo">
            Der Demo-Modus legt einen Beispiel-Ordner an (Semester, Kurse, Notizen, Lernpläne mit
            Quizzes &amp; Aufgaben, Fake-Kalender) – zum Ausprobieren ohne eigenen Ordner. Du kannst
            ihn jederzeit wieder verlassen.
          </p>
        </div>
      </div>
    )
  }

  const shortPath = path
    .replace(/^.*Mobile Documents\/com~apple~CloudDocs\//, 'iCloud Drive / ')
    .replace(/^.*\/Users\/[^/]+\//, '~/')

  return (
    <div
      className="sp"
      onDragEnter={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragOver(true)
        }
      }}
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDragLeave={(e) => e.currentTarget === e.target && setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files.length) void onDropFiles(e.dataTransfer.files)
      }}
    >
      <div className="sp__glow" aria-hidden />
      <header className="sp__bar drag-region">
        <button className="titlebar__back no-drag" onClick={() => setView('home')}>
          <Icon name="chevron-left" size={15} />
          <AstraMark size={18} />
          <span>Astra</span>
        </button>
        <div className="sp__title">Studienplaner</div>
        <div className="sp__baractions no-drag">
          <Tooltip label="Zur Studienplaner-Startseite">
            <IconButton name="home" label="Startseite" disabled={atHome} onClick={goHome} />
          </Tooltip>
          <Tooltip label="Ordner im Finder zeigen">
            <IconButton
              name="folder-open"
              label="Im Finder"
              onClick={() => window.api.spReveal(path)}
            />
          </Tooltip>
          <Tooltip
            label={
              demo ? 'Im Demo-Modus nicht verfügbar' : `Studien-Ordner wechseln · ${shortPath}`
            }
          >
            <IconButton
              name="folder"
              label="Ordner wechseln"
              disabled={demo}
              onClick={() => void choosePath()}
            />
          </Tooltip>
          {!demo && (
            <Tooltip label="Demo-Modus mit Beispieldaten">
              <IconButton
                name="sparkles"
                label="Demo-Modus"
                disabled={demoBusy}
                onClick={() => void startDemo()}
              />
            </Tooltip>
          )}
          <Tooltip label="Einstellungen (⌘,)">
            <IconButton
              name="gear"
              label="Einstellungen"
              onClick={() => requestDialog('preferences')}
            />
          </Tooltip>
        </div>
      </header>

      {demo && (
        <div className="sp__demobar">
          <Icon name="sparkles" size={13} />
          <span>
            <strong>Demo-Modus</strong> – alles hier sind Beispieldaten in einem Sandbox-Ordner.
          </span>
          <button disabled={demoBusy} onClick={() => void resetDemo()}>
            Zurücksetzen
          </button>
          <button className="is-primary" disabled={demoBusy} onClick={() => void stopDemo()}>
            Demo beenden
          </button>
        </div>
      )}

      <div className="sp__body">
        <Tree
          semesters={tree?.semesters ?? []}
          selected={selected}
          onSelect={(semester, kurs) => {
            setSelected({ semester, kurs })
            setQuery('')
          }}
          onAddSemester={(name) => void createSemester(name)}
          onAddCourse={(semester, name) => void createCourse(semester, name)}
          onImportTimetable={() => setTimetableOpen(true)}
        />

        {openPlan ? (
          <ErrorBoundary
            key={`${openPlan.semester}/${openPlan.kurs}`}
            label="Der Lernplan"
            fallback={(reset, error) => (
              <div className="errbound">
                <div className="errbound__box">
                  <strong>Der Lernplan konnte nicht geöffnet werden.</strong>
                  <pre>{error.message}</pre>
                  <div className="errbound__row">
                    <button onClick={reset}>Nochmal versuchen</button>
                    <button onClick={closePlan}>Zurück</button>
                  </div>
                </div>
              </div>
            )}
          >
            <PrepPanel
              semester={openPlan.semester}
              kurs={openPlan.kurs}
              initialTab={openPlan.tab}
              onClose={closePlan}
            />
          </ErrorBoundary>
        ) : (
          <main className="sp__main">
            <div className="sp__toolrow">
              <label className="sp__search">
                <Icon name="search" size={15} />
                <input
                  type="text"
                  placeholder="Alle Notizen durchsuchen (Volltext) …"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button onClick={() => setQuery('')} aria-label="Leeren">
                    <Icon name="x" size={12} />
                  </button>
                )}
              </label>
              <Button icon="camera" onClick={() => void pickScans()}>
                Scan hinzufügen …
              </Button>
            </div>

            {query.trim() ? (
              <section className="sp__panel">
                <h2 className="sp__h2">
                  {results.length} Treffer für „{query.trim()}"
                </h2>
                <div className="sp__results">
                  {results.map((hit) => (
                    <button
                      key={hit.entry.relPath}
                      className="sp__result"
                      onClick={() => {
                        const f = findFile(tree?.semesters ?? [], hit.entry.relPath, path)
                        if (f) void openInEditor(f)
                      }}
                    >
                      <Icon name="page" size={14} />
                      <span className="sp__resulthead">
                        <strong>{hit.entry.thema}</strong>
                        <span>
                          {hit.entry.semester} · {hit.entry.kurs}
                        </span>
                      </span>
                      <span className="sp__snippet">{hit.snippet}</span>
                    </button>
                  ))}
                  {results.length === 0 && <p className="sp__empty">Nichts gefunden.</p>}
                </div>
              </section>
            ) : (
              <>
                {tree && tree.inbox.length > 0 && (
                  <section className="sp__panel sp__panel--inbox">
                    <h2 className="sp__h2">
                      <Icon name="inbox" size={15} /> Eingang · {tree.inbox.length}
                    </h2>
                    <p className="sp__paneldesc">
                      Frisch gescannt (z. B. vom iPhone). „Einsortieren" liest den Text und schlägt
                      Semester &amp; Kurs vor.
                    </p>
                    <div className="sp__inbox">
                      {tree.inbox.map((f) => (
                        <div key={f.path} className="sp__inboxitem">
                          <Icon name={f.ext === 'pdf' ? 'page' : 'image'} size={15} />
                          <span className="sp__inboxname">{f.name}</span>
                          <span className="sp__inboxmeta">{fmtSize(f.size)}</span>
                          <Button size="sm" variant="primary" onClick={() => setFiling(f)}>
                            Einsortieren …
                          </Button>
                          <IconButton
                            name="trash"
                            label="Löschen"
                            onClick={() => void deleteFile(f)}
                          />
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="sp__panel">
                  {selectedCourse && selected ? (
                    <>
                      <div className="sp__coursehead">
                        <div>
                          <h2>{selected.kurs}</h2>
                          <span>{selected.semester} · Lernplan &amp; Notizen</span>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          icon="graduation"
                          onClick={() =>
                            setOpenPlan({
                              semester: selected.semester,
                              kurs: selected.kurs,
                              tab: 'plan'
                            })
                          }
                        >
                          Lernplan-Editor
                        </Button>
                      </div>

                      <CoursePlanInline
                        semester={selected.semester}
                        kurs={selected.kurs}
                        reloadKey={planReloadKey}
                        onOpen={(tab) =>
                          setOpenPlan({ semester: selected.semester, kurs: selected.kurs, tab })
                        }
                      />

                      <h2 className="sp__h2">
                        <Icon name="folder-open" size={15} /> Notizen
                        <span className="sp__count">{selectedCourse.files.length}</span>
                      </h2>
                      <div className="sp__files">
                        {selectedCourse.files.map((f) => (
                          <div key={f.path} className="sp__fileitem">
                            <Icon name={f.ext === 'pdf' ? 'page' : 'image'} size={15} />
                            <button className="sp__filename" onClick={() => void openInEditor(f)}>
                              {f.name}
                            </button>
                            <span className="sp__inboxmeta">{fmtSize(f.size)}</span>
                            <IconButton
                              name="folder-open"
                              label="Im Finder"
                              onClick={() => window.api.spReveal(f.path)}
                            />
                            <IconButton
                              name="trash"
                              label="Löschen"
                              onClick={() => void deleteFile(f)}
                            />
                          </div>
                        ))}
                        {selectedCourse.files.length === 0 && (
                          <p className="sp__empty">Noch keine Notizen in diesem Kurs.</p>
                        )}
                      </div>
                    </>
                  ) : error ? (
                    <div className="sp__nocourse">
                      <EmptyState icon="folder" title="Ordner nicht lesbar" hint={error} />
                    </div>
                  ) : (
                    <CentralLernplan
                      reloadKey={planReloadKey}
                      onOpen={(semester, kurs) => setOpenPlan({ semester, kurs })}
                    />
                  )}
                </section>
              </>
            )}
          </main>
        )}

        <CalendarRail onOpenPrep={openPrep} />
      </div>

      {dragOver && (
        <div className="sp__dropzone">
          <Icon name="inbox" size={30} />
          <span>Notizen in den Eingang legen</span>
        </div>
      )}
      {busy && (
        <div className="sp__busy">
          <Spinner size={22} />
          <span>{busy}</span>
        </div>
      )}
      <input
        ref={dropInput}
        type="file"
        hidden
        multiple
        accept=".pdf,image/*"
        onChange={(e) => e.target.files && void onDropFiles(e.target.files)}
      />

      {filing && <FilingSheet file={filing} onClose={() => setFiling(null)} />}
      {timetableOpen && (
        <TimetableSheet
          onClose={() => setTimetableOpen(false)}
          onDone={() => {
            setTimetableOpen(false)
            setPlanReloadKey((k) => k + 1)
          }}
        />
      )}
      {linkSheet && (
        <ExamLinkSheet
          exam={linkSheet}
          onClose={() => setLinkSheet(null)}
          onLinked={(target) => {
            setLinkSheet(null)
            setPlanReloadKey((k) => k + 1)
            setOpenPlan(target)
          }}
        />
      )}
    </div>
  )
}

function findFile(semesters: SpSemester[], relPath: string, root: string): SpFile | null {
  const abs = `${root.replace(/\/$/, '')}/${relPath}`
  for (const s of semesters) {
    for (const c of s.courses) {
      const hit = c.files.find((f) => f.path === abs)
      if (hit) return hit
    }
    const loose = s.looseFiles.find((f) => f.path === abs)
    if (loose) return loose
  }
  return null
}
