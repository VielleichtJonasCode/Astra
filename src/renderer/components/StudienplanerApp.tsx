import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as RPointerEvent
} from 'react'
import type { CalEvent, OcrResult, SpFile, SpSemester } from '@shared/types'
import { useShellStore } from '../store/shellStore'
import { useSettingsStore } from '../store/settingsStore'
import { useStudienplanerStore, joinPath, type FilingTarget } from '../store/studienplanerStore'
import { useCalendarStore } from '../store/calendarStore'
import { requestDialog } from '../store/dialogStore'
import {
  COURSE_SUBFOLDERS,
  relPathOf,
  resultKey,
  safeName,
  searchIndex,
  smartNoteName,
  suggestFiling,
  type CourseSubfolder,
  type FilingSuggestion,
  type IndexExam
} from '../studienplaner/model'
import {
  courseNoteList,
  examKeyOf,
  getExamLink,
  type LernplanMeta,
  type PlanTask
} from '../studienplaner/prep'
import { PrepPanel, type PrepTab } from './PrepPanel'
import { CoursePlanInline } from './CoursePlanInline'
import { PlanChecklist, fachHue } from './PlanChecklist'
import { AddTaskForm } from './AddTaskForm'
import { CorrectRateBar } from './CorrectRateBar'
import { StudienErgebnisse } from './StudienErgebnisse'
import { StudienKalender } from './StudienKalender'
import { ExamDetail } from './ExamDetail'
import { ErrorBoundary } from './common/ErrorBoundary'
import { recognizeNotes } from '../studienplaner/ocr'
import {
  buildAgenda,
  busyDigest,
  courseNamesFromEvents,
  daysLeftLabel,
  daysUntil,
  eventTime,
  isExam,
  pastExams,
  suggestSemesterName,
  upcomingExams
} from '../studienplaner/calendar'
import { Icon } from './common/Icon'
import { AstraMark } from './AstraMark'
import { Tooltip } from './common/Tooltip'
import { Button, IconButton } from './common/Button'
import { Sheet } from './common/Sheet'
import { Segmented, Select, TextInput, Toggle } from './common/controls'
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
  const storedHint = useStudienplanerStore((s) => s.inboxHints[file.path])

  const [ocr, setOcr] = useState<OcrResult | null>(null)
  const [ranOcr, setRanOcr] = useState(false)
  const [showText, setShowText] = useState(false)
  const [sugg, setSugg] = useState<FilingSuggestion | null>(null)

  const [semester, setSemester] = useState('')
  const [newSemester, setNewSemester] = useState('')
  const [kurs, setKurs] = useState('')
  const [newKurs, setNewKurs] = useState('')
  // Nur für Screenshots: #spcourse=<Semester>/<Kurs> vorbelegen.
  useEffect(() => {
    const m = /[#&]spcourse=([^&]+)/.exec(location.hash)
    if (!m) return
    const [sem, ku] = decodeURIComponent(m[1].replace(/\+/g, ' ')).split('/')
    if (sem) setSemester(sem)
    if (ku) setKurs(ku)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [thema, setThema] = useState(() => smartNoteName(file.name.replace(/\.[^.]+$/, '')))
  const [subfolder, setSubfolder] = useState<CourseSubfolder>('Informationen')
  const [append, setAppend] = useState(false)
  /** Pfad der vorhandenen PDF, an die angehängt werden soll (leer = keine gewählt). */
  const [appendPath, setAppendPath] = useState('')
  const [makeSearchable, setMakeSearchable] = useState(true)

  const semesters = tree?.semesters ?? []
  const activeSemesterName = semester === NEW ? '' : semester
  const courses = semesters.find((s) => s.name === activeSemesterName)?.courses ?? []

  const canAttach = NOTE_ACCEPT.has(file.ext)
  // Vorhandene PDF im Zielordner mit passendem Namen → „anhängen" anbieten.
  const norm = (x: string): string => safeName(x).toLowerCase()
  const targetCourse = semesters
    .find((s) => s.name === activeSemesterName)
    ?.courses.find((c) => c.name === kurs)
  const targetFiles = useMemo(
    () =>
      targetCourse
        ? [
            ...(targetCourse.groups?.find((g) => g.name === subfolder)?.files ?? []),
            ...targetCourse.files
          ]
        : [],
    [targetCourse, subfolder]
  )
  // Alle PDFs im Zielordner, an die man anhängen könnte (die Datei selbst ausgenommen).
  const targetPdfs = useMemo(
    () => targetFiles.filter((f) => f.ext === 'pdf' && f.name !== file.name),
    [targetFiles, file.name]
  )
  const existingMatch =
    canAttach && thema.trim()
      ? (targetPdfs.find((f) => norm(f.name.replace(/\.[^.]+$/, '')) === norm(thema)) ?? null)
      : null

  // Passende PDF gefunden → Anhängen automatisch vorschlagen (an-/abwählbar).
  const matchPath = existingMatch?.path ?? ''
  useEffect(() => {
    if (matchPath) {
      setAppend(true)
      setAppendPath(matchPath)
    }
  }, [matchPath])
  // Ziel-PDF nicht mehr gültig (Kurs/Ordner gewechselt) → Auswahl zurücknehmen.
  useEffect(() => {
    if (appendPath && !targetPdfs.some((f) => f.path === appendPath)) {
      setAppendPath('')
      setAppend(false)
    }
  }, [appendPath, targetPdfs])

  const appendFile = append && appendPath ? targetPdfs.find((f) => f.path === appendPath) : null

  // Sicherheits-Anzeige: Kandidaten aus dem frischen OCR-Lauf oder aus dem
  // Eingang-Vorabscan; jeweils mit Prozent + Trefferwörtern.
  const cands: { semester: string; kurs: string; pct: number; matched: string[] }[] = sugg
    ? sugg.candidates.map((c) => ({
        semester: c.semester,
        kurs: c.kurs,
        pct: Math.round(c.score * 100),
        matched: c.matched
      }))
    : (storedHint?.candidates ?? [])
  const semSrc = sugg?.semesterFrom ?? storedHint?.semesterFrom ?? 'none'
  const semSrcLabel =
    semSrc === 'match' ? 'aus Fachname' : semSrc === 'text' ? 'aus dem Text' : 'unklar'
  const ocrChars = (ocr?.text ?? '').trim().length || storedHint?.ocrChars || 0

  const applyCandidate = (c: { semester: string; kurs: string }): void => {
    const semObj = semesters.find((x) => x.name === c.semester)
    setSemester(semObj ? c.semester : NEW)
    if (!semObj) setNewSemester(c.semester)
    if (semObj?.courses.some((x) => x.name === c.kurs)) setKurs(c.kurs)
    else {
      setKurs(NEW)
      setNewKurs(c.kurs)
    }
  }

  // Wahrscheinliches Duplikat: gleiche Größe wie eine vorhandene Datei im Zielordner.
  const sizeDup =
    file.size > 0
      ? (targetFiles.find((f) => f.size === file.size && f.name !== file.name) ?? null)
      : null

  const runOcr = async (): Promise<void> => {
    const result = await ocrFile(file)
    setOcr(result)
    setRanOcr(true)
    if (!result?.text) {
      toast.info('Kein Text erkannt – bitte von Hand einsortieren.')
      return
    }
    const s = suggestFiling(result.text, tree!)
    setSugg(s)
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
    setSubfolder(s.subfolder)
    toast.success(
      s.kurs ? `Vorschlag: ${s.kurs}${s.semester ? ` · ${s.semester}` : ''}` : 'Text erkannt.'
    )
  }

  const submit = async (): Promise<void> => {
    if (
      sizeDup &&
      !append &&
      !confirm(
        `„${sizeDup.name}" hat exakt die gleiche Größe – vermutlich dasselbe Dokument. Trotzdem als neue Datei ablegen?`
      )
    ) {
      return
    }
    const root = useStudienplanerStore.getState().path
    const target: FilingTarget = {
      semester: semester === NEW ? newSemester : semester,
      kurs: kurs === NEW ? newKurs : kurs,
      thema,
      subfolder,
      makeSearchable,
      appendToRelPath: appendFile && root ? relPathOf(root, appendFile.path) : undefined
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

      {cands.length > 0 && (
        <div className="sp-file__ai">
          <div className="sp-file__ailabel">
            Wie sicher der Vorschlag ist <em>tippen zum Übernehmen</em>
          </div>
          {cands.map((c) => (
            <button
              key={c.semester + '//' + c.kurs}
              type="button"
              className={cx(
                'sp-file__aicand',
                kurs === c.kurs && semester === c.semester && 'is-active'
              )}
              onClick={() => applyCandidate(c)}
            >
              <span className="sp-file__aibar">
                <i
                  className={c.pct >= 60 ? 'is-hi' : c.pct >= 34 ? 'is-mid' : 'is-lo'}
                  style={{ width: Math.max(6, c.pct) + '%' }}
                />
              </span>
              <span className="sp-file__aikurs">{c.kurs}</span>
              <span className="sp-file__aisem">{c.semester}</span>
              <span className="sp-file__aipct">{c.pct}%</span>
              {c.matched.length > 0 && (
                <span className="sp-file__aiwords">Treffer: {c.matched.join(' · ')}</span>
              )}
            </button>
          ))}
          <p className="sp-file__aimeta">
            Semester {semSrcLabel} · {ocrChars.toLocaleString('de-DE')} Zeichen erkannt
            {storedHint?.duplicateOf ? ' · ⚠ evtl. Duplikat' : ''}
            {storedHint?.warn ? ` · ⚠ ${storedHint.warn}` : ''}
          </p>
        </div>
      )}

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
        <span>Ablage im Fach</span>
        <Segmented
          value={subfolder}
          onChange={(v) => setSubfolder(v as CourseSubfolder)}
          options={COURSE_SUBFOLDERS.map((s) => ({ value: s, label: s }))}
        />
      </label>

      {canAttach && kurs && kurs !== NEW && targetPdfs.length > 0 && (
        <div className={cx('sp-file__append', append && 'is-on')}>
          <div className="sp-file__appendhead">
            <Toggle
              checked={append}
              onChange={(v) => {
                setAppend(v)
                setAppendPath(v ? matchPath || appendPath || targetPdfs[0].path : '')
              }}
              label="An vorhandenes Dokument anhängen"
            />
            <span>
              An vorhandenes Dokument anhängen
              <em>
                {existingMatch && !append
                  ? `Gleicher Name wie „${existingMatch.name}" – ein Klick hängt die Seiten hinten an.`
                  : 'Die Seiten kommen hinten an eine PDF im Kurs – es entsteht keine neue Datei.'}
              </em>
            </span>
          </div>
          {append && (
            <Select
              value={appendPath}
              onChange={(e) => setAppendPath(e.target.value)}
              options={targetPdfs.map((f) => ({
                value: f.path,
                label: f.name.replace(/\.[^.]+$/, '')
              }))}
            />
          )}
        </div>
      )}

      {sizeDup && !append && (
        <p className="sp-file__dup">
          ⚠︎ „{sizeDup.name}" ist exakt gleich groß – wahrscheinlich dasselbe Dokument. Beim Ablegen
          wird nachgefragt.
        </p>
      )}

      {!append && (
        <label className="sp-field">
          <span>Thema / Dateiname</span>
          <TextInput value={thema} onChange={(e) => setThema(e.target.value)} />
        </label>
      )}

      {!append && (
        <label className="sp-field sp-field--row">
          <Toggle
            checked={makeSearchable}
            onChange={setMakeSearchable}
            label="Durchsuchbares PDF"
          />
          <span>
            Als durchsuchbares PDF ablegen
            <em>
              Bild wird zu PDF, der erkannte Text liegt unsichtbar darüber (auch am iPhone findbar).
            </em>
          </span>
        </label>
      )}
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

/* ── Semester einrichten: Fächer aus Stundenplan-Kalender ODER aus einer Datei ── */

interface SetupCourse {
  name: string
  ects?: number
  examDateIso?: string
}

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
  const setFachResult = useStudienplanerStore((s) => s.setFachResult)
  const linkExamToCourse = useStudienplanerStore((s) => s.linkExamToCourse)

  const detected = useMemo(() => courseNamesFromEvents(events), [events])
  const [semester, setSemester] = useState(suggestSemesterName())
  const [drop, setDrop] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState('')
  const [pending, setPending] = useState(false)
  const [reading, setReading] = useState(false)
  // Aus einer Datei gezogene Fächer (mit ECTS) – ersetzen die Kalender-Liste, wenn gesetzt.
  const [fileCourses, setFileCourses] = useState<SetupCourse[] | null>(null)

  const chosen = detected.filter((c) => !drop.has(c))
  const extraList = extra
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const courseList: SetupCourse[] = fileCourses
    ? [...fileCourses, ...extraList.map((name) => ({ name }))]
    : [...chosen.map((name) => ({ name })), ...extraList.map((name) => ({ name }))]
  const total = new Set(courseList.map((c) => c.name)).size

  const importFromFile = async (): Promise<void> => {
    const picked = await window.api.openAnyFiles().catch(() => null)
    const first = picked?.[0]
    if (!first) return
    setReading(true)
    try {
      const loaded = await window.api.readFile(first.path)
      const ext = first.name.split('.').pop()?.toLowerCase() ?? 'pdf'
      const ocr = await recognizeNotes(loaded.bytes, ext)
      const text = (ocr?.text ?? '').trim()
      if (!text) {
        toast.error('Kein Text in der Datei erkannt.')
        return
      }
      const { extractSemesterSetup } = await import('../studienplaner/ai')
      const setup = await extractSemesterSetup(text)
      if (!setup.courses.length) {
        toast.error('Keine Fächer in der Datei gefunden.')
        return
      }
      if (setup.semester) setSemester(setup.semester)
      setFileCourses(setup.courses)
      toast.success(`${setup.courses.length} Fächer aus der Datei übernommen – bitte prüfen.`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Datei konnte nicht gelesen werden.')
    } finally {
      setReading(false)
    }
  }

  const submit = async (): Promise<void> => {
    if (!semester.trim() || total === 0) {
      toast.error('Semestername und mindestens ein Fach nötig.')
      return
    }
    setPending(true)
    try {
      const sem = semester.trim()
      const n = await scaffoldCourses(
        sem,
        courseList.map((c) => c.name)
      )
      for (const c of courseList) {
        if (c.ects) await setFachResult(sem, c.name, { ects: c.ects })
        if (c.examDateIso) {
          await linkExamToCourse(
            {
              examKey: examKeyOf(`Klausur ${c.name}`, c.examDateIso),
              title: `Klausur ${c.name}`,
              dateIso: c.examDateIso
            },
            sem,
            c.name
          ).catch(() => undefined)
        }
      }
      toast.success(`${n} Fach-Ordner in „${sem}" angelegt (je mit Wichtig & Übungen).`)
      onDone()
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet
      title="Semester einrichten"
      subtitle="Fächer aus dem Kalender oder aus einem Modulhandbuch / Stundenplan"
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
        <strong>Informationen</strong> und <strong>Übungen</strong>. Vorhandene Ordner bleiben
        unberührt.
      </p>

      <div className="sp__ttactions">
        <Button
          variant="ghost"
          icon="file-plus"
          disabled={reading}
          onClick={() => void importFromFile()}
        >
          {reading ? 'Datei wird gelesen …' : 'Aus Datei (Modulhandbuch / Stundenplan)'}
        </Button>
        {fileCourses && (
          <Button
            variant="ghost"
            onClick={() => {
              setFileCourses(null)
            }}
          >
            zurück zum Kalender
          </Button>
        )}
      </div>

      <label className="sp-field">
        <span>Semester</span>
        <TextInput
          value={semester}
          onChange={(e) => setSemester(e.target.value)}
          placeholder="z. B. WS 2025"
        />
      </label>

      {fileCourses ? (
        <div className="sp__ttlist">
          {fileCourses.map((c, i) => (
            <div key={`${c.name}-${i}`} className="sp__ttrow is-on sp__ttrow--file">
              <span className="sp__ttname">{c.name}</span>
              <label className="sp__ttects">
                ECTS
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={c.ects ?? ''}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setFileCourses((cs) =>
                      (cs ?? []).map((x, j) =>
                        j === i ? { ...x, ects: v > 0 ? v : undefined } : x
                      )
                    )
                  }}
                />
              </label>
              {c.examDateIso && <span className="sp__ttexam">🗓 {c.examDateIso}</span>}
              <button
                className="sp__ttdrop"
                aria-label="Entfernen"
                onClick={() => setFileCourses((cs) => (cs ?? []).filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : calStatus !== 'authorized' ? (
        <p className="sp__empty">
          Kein Kalender verbunden – oben „Aus Datei" nutzen, in der Termine-Leiste rechts verbinden,
          oder Fächer unten von Hand eintragen.
        </p>
      ) : detected.length === 0 ? (
        <p className="sp__empty">
          Keine Fächer im Kalender erkannt (nur Klausuren/ganztägige Termine?). Trag sie unten von
          Hand ein oder nutze „Aus Datei".
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
  const allPlanTasks = useStudienplanerStore((s) => s.allPlanTasks)
  const addPlanTask = useStudienplanerStore((s) => s.addPlanTask)
  const patchPlanTask = useStudienplanerStore((s) => s.patchPlanTask)
  const removePlanTask = useStudienplanerStore((s) => s.removePlanTask)
  const rescheduleOverdueForCourse = useStudienplanerStore((s) => s.rescheduleOverdueForCourse)
  const index = useStudienplanerStore((s) => s.index)
  const tree = useStudienplanerStore((s) => s.tree)
  const calEvents = useCalendarStore((s) => s.events)
  const courseSig = (tree?.semesters ?? [])
    .map((s) => `${s.name}:${s.courses.map((c) => c.name).join(',')}`)
    .join('|')
  const [rows, setRows] = useState<LernplanMeta[] | null>(null)
  const [taskItems, setTaskItems] = useState<{ semester: string; kurs: string; task: PlanTask }[]>(
    []
  )
  const [taskReload, setTaskReload] = useState(0)
  const [addFor, setAddFor] = useState<{ semester: string; kurs: string } | null>(null)
  const [rescheduling, setRescheduling] = useState(false)
  const [overdueDone, setOverdueDone] = useState<string | null>(null)
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

  useEffect(() => {
    void allPlanTasks().then(setTaskItems)
  }, [allPlanTasks, reloadKey, courseSig, taskReload])

  const bump = (): void => setTaskReload((k) => k + 1)
  const toggleCentral = (key: string): void => {
    const [semester, kurs, id] = key.split('//')
    const cur = taskItems.find(
      (x) => x.semester === semester && x.kurs === kurs && x.task.id === id
    )
    void patchPlanTask(semester, kurs, id, {
      done: !cur?.task.done,
      doneAt: new Date().toISOString()
    }).then(bump)
  }
  const removeCentral = (key: string): void => {
    const [semester, kurs, id] = key.split('//')
    void removePlanTask(semester, kurs, id).then(bump)
  }

  // Überfällige, noch offene Aufgaben je Fach – für den „Später einplanen"-Hinweis.
  const todayIso0 = new Date().toISOString().slice(0, 10)
  const overdueByCourse = new Map<
    string,
    { semester: string; kurs: string; count: number; hasQuiz: boolean }
  >()
  for (const { semester, kurs, task } of taskItems) {
    if (task.done || task.date >= todayIso0) continue
    const k = `${semester}//${kurs}`
    const cur = overdueByCourse.get(k) ?? { semester, kurs, count: 0, hasQuiz: false }
    cur.count += 1
    if (task.kind === 'quiz') cur.hasQuiz = true
    overdueByCourse.set(k, cur)
  }
  const overdueList = [...overdueByCourse.values()]
  const overdueTotal = overdueList.reduce((n, c) => n + c.count, 0)
  const overdueSig = overdueList.map((c) => `${c.semester}//${c.kurs}:${c.count}`).join('|')

  const runReschedule = async (): Promise<void> => {
    const onlyQuiz = overdueList.every((c) => c.hasQuiz && c.count === 1)
    const ask = onlyQuiz
      ? 'Soll das Quiz später nochmal rankommen? Gemini plant es auf die nächsten freien Tage ein, ohne andere Lernsachen auszulassen.'
      : `${overdueTotal} überfällige Aufgabe${overdueTotal === 1 ? '' : 'n'} später einplanen? ` +
        'Gemini verteilt sie auf die nächsten freien Tage – die bereits geplanten Aufgaben bleiben, nichts fällt weg.'
    if (!confirm(ask)) {
      setOverdueDone(overdueSig)
      return
    }
    setRescheduling(true)
    try {
      let moved = 0
      for (const c of overdueList) {
        const busy = busyDigest(calEvents, new Date(Date.now() + 21 * 864e5).toISOString())
        moved += await rescheduleOverdueForCourse(c.semester, c.kurs, busy)
      }
      setOverdueDone(overdueSig)
      bump()
      if (moved > 0) toast.success(`${moved} Aufgabe${moved === 1 ? '' : 'n'} neu eingeplant.`)
      else toast.info('Konnte nichts umplanen – bitte später erneut versuchen.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Umplanen fehlgeschlagen.')
    } finally {
      setRescheduling(false)
    }
  }

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

      {overdueTotal > 0 && overdueDone !== overdueSig && (
        <div className="sp__overdue">
          <span className="sp__overdueicon">⏰</span>
          <div className="sp__overduetxt">
            <strong>
              {overdueTotal} überfällige Aufgabe{overdueTotal === 1 ? '' : 'n'}
            </strong>
            <span>
              {overdueList.map((c) => c.kurs).join(', ')} – automatisch nie, nur auf deinen Wunsch.
            </span>
          </div>
          <div className="sp__overduebtns">
            <Button size="sm" variant="ghost" onClick={() => setOverdueDone(overdueSig)}>
              Später
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={rescheduling}
              onClick={() => void runReschedule()}
            >
              {rescheduling ? 'Gemini plant um …' : 'Später einplanen'}
            </Button>
          </div>
        </div>
      )}

      {/* Aufgaben aller Fächer nach Tagen, farblich je Fach getrennt */}
      {(() => {
        const todayIso = new Date().toISOString().slice(0, 10)
        const horizon = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10)
        const items = taskItems
          .filter(({ task }) => task.date <= horizon && (!task.done || task.date >= todayIso))
          .map(({ semester, kurs, task }) => ({
            key: `${semester}//${kurs}//${task.id}`,
            task,
            fach: { label: kurs, hue: fachHue(kurs) }
          }))
        return (
          <section className="sp__tasksec">
            <div className="sp__tasksechead">
              <h3>Aufgaben</h3>
              <Button
                size="sm"
                variant="ghost"
                icon="plus"
                onClick={() =>
                  setAddFor(
                    addFor
                      ? null
                      : rows[0]
                        ? { semester: rows[0].semester, kurs: rows[0].kurs }
                        : null
                  )
                }
              >
                Aufgabe
              </Button>
            </div>

            {addFor && (
              <div className="sp__taskadd">
                <label className="sp-field">
                  <span>Fach</span>
                  <Select
                    value={`${addFor.semester}//${addFor.kurs}`}
                    onChange={(e) => {
                      const [s, k] = e.target.value.split('//')
                      setAddFor({ semester: s, kurs: k })
                    }}
                    options={rows.map((r) => ({
                      value: `${r.semester}//${r.kurs}`,
                      label: `${r.kurs} · ${r.semester}`
                    }))}
                  />
                </label>
                <AddTaskForm
                  key={`${addFor.semester}/${addFor.kurs}`}
                  notes={courseNoteList(index, addFor.semester, addFor.kurs)}
                  onAdd={(task) => {
                    void addPlanTask(addFor.semester, addFor.kurs, task).then(bump)
                    setAddFor(null)
                  }}
                  onCancel={() => setAddFor(null)}
                />
              </div>
            )}

            {items.length === 0 ? (
              <p className="sp__calmuted">
                Keine offenen Aufgaben. Mit „Aufgabe" eine hinzufügen oder im Fach einen Lernplan
                erstellen.
              </p>
            ) : (
              <PlanChecklist
                items={items}
                onToggle={toggleCentral}
                onRemove={removeCentral}
                attachmentName={(rel) =>
                  rel
                    .split('/')
                    .pop()
                    ?.replace(/\.[^.]+$/, '') ?? rel
                }
                onSetScore={(key, score) => {
                  const [s, k, id] = key.split('//')
                  void patchPlanTask(s, k, id, { score: score ?? undefined }).then(bump)
                }}
              />
            )}
          </section>
        )
      })()}

      <h3 className="sp__facheshead">Fächer</h3>
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
                      {r.gradedCount > 0 && (
                        <CorrectRateBar size="sm" correct={r.correctCount} total={r.gradedCount} />
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
  onImportTimetable,
  onDeleteSemester,
  onDeleteCourse
}: {
  semesters: SpSemester[]
  selected: { semester: string; kurs: string } | null
  onSelect: (semester: string, kurs: string) => void
  onAddSemester: (name: string) => void
  onAddCourse: (semester: string, name: string) => void
  onImportTimetable: () => void
  onDeleteSemester: (semester: string) => void
  onDeleteCourse: (semester: string, kurs: string) => void
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
              <div className="sp__semrow">
                <button
                  className="sp__semrow__btn"
                  onClick={() => setCollapsed((c) => ({ ...c, [sem.path]: !c[sem.path] }))}
                >
                  <Icon name={isCollapsed ? 'chevron-right' : 'chevron-down'} size={13} />
                  <Icon name="graduation" size={14} />
                  <span className="sp__semname">{sem.name}</span>
                  <span className="sp__count">{sem.courses.length}</span>
                </button>
                <IconButton
                  name="trash"
                  label={`Semester „${sem.name}" löschen`}
                  onClick={() => onDeleteSemester(sem.name)}
                />
              </div>
              {!isCollapsed && (
                <div className="sp__courses">
                  {sem.courses.map((c) => (
                    <div
                      key={c.path}
                      className={cx(
                        'sp__course',
                        selected?.semester === sem.name && selected?.kurs === c.name && 'is-active'
                      )}
                    >
                      <button
                        className="sp__course__btn"
                        onClick={() => onSelect(sem.name, c.name)}
                      >
                        <Icon name="folder" size={13} />
                        <span>{c.name}</span>
                        <span className="sp__count">
                          {c.files.length +
                            (c.groups ?? []).reduce((n, g) => n + g.files.length, 0)}
                        </span>
                      </button>
                      <IconButton
                        name="trash"
                        label={`Kurs „${c.name}" löschen`}
                        onClick={() => onDeleteCourse(sem.name, c.name)}
                      />
                    </div>
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
  const past = useMemo(() => pastExams(events, 20), [events])
  const [showPastExams, setShowPastExams] = useState(false)
  const agenda = useMemo(() => {
    const days = buildAgenda(events, 21)
    // „Heute" immer als erste Zeile – auch wenn nichts ansteht.
    return days[0]?.label === 'Heute'
      ? days
      : [{ key: 'today', label: 'Heute', events: [] as CalEvent[] }, ...days]
  }, [events])

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

          {/* Agenda – nach Tagen gruppiert, Tag links, Termine rechts */}
          <section className="sp__agenda">
            <h3>Nächste 3 Wochen</h3>
            {agenda.map((day) => (
              <div key={day.key} className="sp__aday">
                <div className="sp__adaylabel">{day.label}</div>
                <div className="sp__adayevents">
                  {day.events.length === 0 ? (
                    <span className="sp__aevnone">nichts geplant</span>
                  ) : (
                    day.events.map((ev) => (
                      <div
                        key={ev.id}
                        className={cx('sp__aev', isExam(ev.title, ev.notes) && 'is-exam')}
                      >
                        <span className="sp__aevtime">
                          {ev.allDay ? 'ganztägig' : eventTime(ev)}
                        </span>
                        <span className="sp__aevtitle">
                          <span className="sp__aevdot" style={{ background: ev.color }} />
                          {ev.title}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
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

            {past.length > 0 && (
              <>
                <button className="sp__pastexambtn" onClick={() => setShowPastExams((v) => !v)}>
                  <Icon name={showPastExams ? 'chevron-down' : 'chevron-right'} size={12} />
                  {past.length} vergangene {past.length === 1 ? 'Prüfung' : 'Prüfungen'}
                </button>
                {showPastExams &&
                  past.map((ev) => {
                    const dayN = daysUntil(ev.start)
                    return (
                      <button
                        key={ev.id}
                        className="sp__exam sp__exam--btn sp__exam--past"
                        onClick={() => onOpenPrep({ title: ev.title, start: ev.start })}
                        title="Zur Prüfungsseite – Note eintragen"
                      >
                        <span className="sp__examleft">vor {Math.abs(dayN)} T.</span>
                        <span className="sp__exambody">
                          <strong>{ev.title}</strong>
                          <span>
                            {new Date(ev.start).toLocaleDateString('de-DE', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </span>
                        </span>
                        <Icon name="chevron-right" size={13} className="sp__examgo" />
                      </button>
                    )
                  })}
              </>
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
    deleteSemester,
    deleteCourse,
    deleteFile,
    openInEditor,
    linkExamToCourse,
    pullCalendarMoves,
    inboxHints,
    fileFromHint,
    undoFiling
  } = useStudienplanerStore()
  const calEvents = useCalendarStore((s) => s.events)

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
  const [showUndo, setShowUndo] = useState(false)
  const [planReloadKey, setPlanReloadKey] = useState(0)
  const [page, setPage] = useState<'planner' | 'ergebnisse' | 'kalender'>('planner')
  const [examView, setExamView] = useState<{ title: string; start: string } | null>(null)
  const dropInput = useRef<HTMLInputElement>(null)

  // Verschiebbare Seitenleisten (Breite gemerkt in localStorage).
  const readW = (k: string, def: number): number => {
    const n = Number(localStorage.getItem(k))
    return Number.isFinite(n) && n > 0 ? n : def
  }
  const [sideW, setSideW] = useState(() => readW('astra.sp.sideW', 244))
  const [calW, setCalW] = useState(() => readW('astra.sp.calW', 320))
  const startResize =
    (which: 'side' | 'cal') =>
    (e: RPointerEvent): void => {
      e.preventDefault()
      const startX = e.clientX
      const startW = which === 'side' ? sideW : calW
      const key = which === 'side' ? 'astra.sp.sideW' : 'astra.sp.calW'
      const [min, max] = which === 'side' ? [180, 460] : [240, 520]
      let latest = startW
      document.body.classList.add('sp-resizing')
      const move = (ev: PointerEvent): void => {
        const delta = which === 'side' ? ev.clientX - startX : startX - ev.clientX
        latest = Math.max(min, Math.min(max, startW + delta))
        if (which === 'side') setSideW(latest)
        else setCalW(latest)
      }
      const up = (): void => {
        document.body.classList.remove('sp-resizing')
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        try {
          localStorage.setItem(key, String(Math.round(latest)))
        } catch {
          /* egal */
        }
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    }

  const closePlan = (): void => {
    setOpenPlan(null)
    setPlanReloadKey((k) => k + 1)
  }

  /** Zurück zur Studienplaner-Startseite (zentraler Lernplan). */
  const goHome = (): void => {
    setOpenPlan(null)
    setSelected(null)
    setQuery('')
    setExamView(null)
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

  /** Öffnet die eigene Seite einer Prüfung (Countdown + Vorbereitung, nach der Prüfung Note). */
  const openExam = (ev: { title: string; start: string }): void => {
    setExamView({ title: ev.title, start: ev.start })
  }
  const overlayOpen = page !== 'planner' || Boolean(examView)

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
    // #spprep=<Semester>/<Kurs>/<tab> öffnet direkt den Lernplan eines Fachs.
    const sp = /[#&]spprep=([^&]+)/.exec(location.hash)?.[1]
    if (sp) {
      const [sem, ku, tab] = decodeURIComponent(sp.replace(/\+/g, ' ')).split('/')
      if (sem && ku)
        setTimeout(
          () => setOpenPlan({ semester: sem, kurs: ku, tab: (tab as PrepTab) || 'summary' }),
          700
        )
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
    if (/[#&]sppage=ergebnisse/.test(location.hash)) setTimeout(() => setPage('ergebnisse'), 700)
    if (/[#&]sppage=kalender/.test(location.hash)) setTimeout(() => setPage('kalender'), 700)
    // #spexam=next|done öffnet die Prüfungsseite der nächsten bzw. einer abgeschlossenen Prüfung.
    {
      const m = /[#&]spexam=(next|done)/.exec(location.hash)?.[1]
      if (m)
        setTimeout(() => {
          const st = useStudienplanerStore.getState()
          const evs = useCalendarStore.getState().events
          if (m === 'next') {
            const ex = upcomingExams(evs, 1)[0]
            if (ex) setExamView({ title: ex.title, start: ex.start })
          } else {
            const withResult = evs.find((e) => {
              if (!isExam(e.title, e.notes)) return false
              const l = getExamLink(st.index, examKeyOf(e.title, e.start))
              return l && st.index.results?.[resultKey(l.semester, l.kurs)]
            })
            if (withResult) setExamView({ title: withResult.title, start: withResult.start })
          }
        }, 1100)
    }
    if (/[#&]spsheet=tt/.test(location.hash)) setTimeout(() => setTimetableOpen(true), 900)
    if (/[#&]spsheet=file/.test(location.hash)) {
      setTimeout(() => {
        const f = useStudienplanerStore.getState().tree?.inbox[0]
        if (f) setFiling(f)
      }, 1200)
    }
    return () => close()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Klausuren aus dem Kalender automatisch mit dem passenden Fach verknüpfen.
  const autoLinkTried = useRef<Set<string>>(new Set())
  useEffect(() => {
    if (!tree || !path) return
    const norm = (s: string): string =>
      s
        .toLowerCase()
        .replace(/\b(klausur|prüfung|pruefung|test|exam|nachklausur|wiederholungsklausur)\b/g, '')
        .replace(/[^a-zà-ÿ0-9]+/gi, ' ')
        .trim()
    const courses = tree.semesters.flatMap((s) =>
      s.courses.map((c) => ({ semester: s.name, kurs: c.name, n: norm(c.name) }))
    )
    for (const ev of calEvents) {
      if (!isExam(ev.title, ev.notes) || daysUntil(ev.start) < -1) continue
      const key = examKeyOf(ev.title, ev.start)
      if (getExamLink(index, key) || autoLinkTried.current.has(key)) continue
      const t = norm(ev.title)
      // längster Fachname, der im Termintitel vorkommt (oder umgekehrt)
      const hit = courses
        .filter((c) => c.n.length >= 3 && (t.includes(c.n) || c.n.includes(t)))
        .sort((a, b) => b.n.length - a.n.length)[0]
      autoLinkTried.current.add(key)
      if (hit) {
        void linkExamToCourse(
          { examKey: key, title: ev.title, dateIso: ev.start },
          hit.semester,
          hit.kurs
        ).then(() => setPlanReloadKey((k) => k + 1))
      }
    }
  }, [calEvents, tree, index, path, linkExamToCourse])

  // Gegenrichtung: im Kalender verschobene Lerntermine (📚) zurück in die Pläne.
  useEffect(() => {
    if (!tree || !path) return
    const study = calEvents.filter((e) => e.title.startsWith('📚'))
    if (!study.length) return
    const h = setTimeout(() => {
      void pullCalendarMoves(study.map((e) => ({ id: e.id, start: e.start, title: e.title }))).then(
        (n) => {
          if (n > 0) setPlanReloadKey((k) => k + 1)
        }
      )
    }, 600)
    return () => clearTimeout(h)
  }, [calEvents, tree, path, pullCalendarMoves])

  const results = useMemo(() => (query.trim() ? searchIndex(index, query) : []), [index, query])

  const selectedCourse = tree?.semesters
    .find((s) => s.name === selected?.semester)
    ?.courses.find((c) => c.name === selected?.kurs)

  const onCourse = Boolean(selectedCourse && selected)
  // Eingang: auf der Hauptseite alle Dateien, auf einer Fach-Seite nur die, für
  // die ein Treffer auf genau dieses Fach vermutet wird.
  const inboxFiles = tree?.inbox ?? []
  const shownInbox =
    onCourse && selected
      ? inboxFiles.filter((f) => {
          const h = inboxHints[f.path]
          const c0 = h?.candidates?.[0]
          return (
            (h?.kurs === selected.kurs && h?.semester === selected.semester) ||
            (c0?.kurs === selected.kurs && c0?.semester === selected.semester)
          )
        })
      : inboxFiles

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
            <IconButton
              name="home"
              label="Startseite"
              disabled={atHome && page === 'planner'}
              onClick={() => {
                setPage('planner')
                goHome()
              }}
            />
          </Tooltip>
          <Tooltip label="Ganzer Kalender">
            <IconButton
              name="calendar"
              label="Kalender"
              disabled={page === 'kalender'}
              onClick={() => {
                setExamView(null)
                setPage('kalender')
              }}
            />
          </Tooltip>
          <Tooltip label="Studienergebnisse (Noten & Schnitt)">
            <IconButton
              name="presentation"
              label="Studienergebnisse"
              disabled={page === 'ergebnisse'}
              onClick={() => {
                setExamView(null)
                setPage('ergebnisse')
              }}
            />
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

      {page === 'ergebnisse' && !examView && (
        <StudienErgebnisse onBack={() => setPage('planner')} />
      )}
      {page === 'kalender' && !examView && (
        <StudienKalender onBack={() => setPage('planner')} onOpenExam={openExam} />
      )}
      {examView && (
        <ExamDetail
          exam={examView}
          onBack={() => setExamView(null)}
          onOpenPrep={(semester, kurs, tab) => {
            setExamView(null)
            setPage('planner')
            setOpenPlan({ semester, kurs, tab })
          }}
          onEnterResult={(semester, kurs) => {
            setExamView(null)
            setPage('planner')
            setOpenPlan({ semester, kurs, tab: 'result' })
          }}
          onLink={(ev) => setLinkSheet({ title: ev.title, startIso: ev.start })}
        />
      )}

      <div
        className={cx('sp__body', overlayOpen && 'sp__body--hidden')}
        style={{ '--sp-side-w': `${sideW}px`, '--sp-cal-w': `${calW}px` } as CSSProperties}
      >
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
          onDeleteSemester={(semester) => {
            if (
              !confirm(
                `Semester „${semester}" mit allen Kursen und Dateien in den Papierkorb verschieben?`
              )
            ) {
              return
            }
            if (selected?.semester === semester) setSelected(null)
            void deleteSemester(semester)
          }}
          onDeleteCourse={(semester, kurs) => {
            if (!confirm(`Kurs „${kurs}" mit allen Dateien in den Papierkorb verschieben?`)) return
            if (selected?.semester === semester && selected?.kurs === kurs) setSelected(null)
            void deleteCourse(semester, kurs)
          }}
        />
        <div
          className="sp__resize"
          onPointerDown={startResize('side')}
          role="separator"
          aria-label="Seitenleiste breiter/schmaler ziehen"
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
                {shownInbox.length > 0 && (
                  <section className="sp__panel sp__panel--inbox">
                    <h2 className="sp__h2">
                      <Icon name="inbox" size={15} /> Eingang · {shownInbox.length}
                      {onCourse && <span className="sp__count">zu diesem Fach</span>}
                    </h2>
                    {!onCourse && (
                      <p className="sp__paneldesc">
                        Frisch gescannt (z. B. vom iPhone). Astra liest den Text automatisch und
                        schlägt die Ablage vor – „Direkt ablegen" übernimmt sie in einem Klick.
                      </p>
                    )}
                    <div className="sp__inbox">
                      {shownInbox.map((f) => {
                        const hint = inboxHints[f.path]
                        return (
                          <div key={f.path} className="sp__inboxitem">
                            <Icon name={f.ext === 'pdf' ? 'page' : 'image'} size={15} />
                            <span className="sp__inboxname">
                              {f.name}
                              {hint &&
                                (() => {
                                  const c0 = hint.candidates?.[0]
                                  const c1 = hint.candidates?.[1]
                                  const semSrc =
                                    hint.semesterFrom === 'match'
                                      ? 'aus Fachname'
                                      : hint.semesterFrom === 'text'
                                        ? 'aus Text'
                                        : 'unklar'
                                  return (
                                    <em className="sp__inboxhint">
                                      {hint.appendTo
                                        ? `→ an „${hint.appendTo.name}" anhängen (${hint.kurs})`
                                        : hint.ready
                                          ? `→ ${hint.kurs} / ${hint.subfolder} · ${hint.thema}`
                                          : c0
                                            ? `Vorschlag: ${c0.kurs} / ${hint.subfolder}`
                                            : 'Kein Fach erkannt – von Hand'}
                                      {c0 && !hint.appendTo && (
                                        <span
                                          className={cx(
                                            'sp__conf',
                                            c0.pct >= 60
                                              ? 'is-hi'
                                              : c0.pct >= 34
                                                ? 'is-mid'
                                                : 'is-lo'
                                          )}
                                          title={`Trefferwörter: ${c0.matched.join(', ') || '–'} · Semester ${semSrc} · ${hint.ocrChars ?? 0} Zeichen erkannt`}
                                        >
                                          {c0.pct}%
                                        </span>
                                      )}
                                      {!hint.appendTo && c1 && c1.pct >= 20 && (
                                        <span className="sp__confalt">
                                          auch möglich: {c1.kurs} {c1.pct}%
                                        </span>
                                      )}
                                    </em>
                                  )
                                })()}
                              {hint?.duplicateOf && (
                                <em className="sp__inboxwarn">
                                  ⚠ möglicherweise schon abgelegt als „
                                  {hint.duplicateOf
                                    .split('/')
                                    .pop()
                                    ?.replace(/\.[^.]+$/, '')}
                                  "
                                </em>
                              )}
                              {hint?.warn && !hint.duplicateOf && (
                                <em className="sp__inboxwarn">⚠ {hint.warn}</em>
                              )}
                            </span>
                            <span className="sp__inboxmeta">{fmtSize(f.size)}</span>
                            {hint?.appendTo ? (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => void fileFromHint(f, 'append')}
                                disabled={Boolean(busy)}
                              >
                                Anhängen
                              </Button>
                            ) : (
                              hint?.ready && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  onClick={() => void fileFromHint(f)}
                                  disabled={Boolean(busy)}
                                >
                                  Direkt ablegen
                                </Button>
                              )
                            )}
                            <Button
                              size="sm"
                              variant={hint?.ready || hint?.appendTo ? 'ghost' : 'primary'}
                              onClick={() => setFiling(f)}
                            >
                              Einsortieren …
                            </Button>
                            <IconButton
                              name="trash"
                              label="Löschen"
                              onClick={() => void deleteFile(f)}
                            />
                          </div>
                        )
                      })}
                    </div>
                  </section>
                )}

                {!onCourse && (index.undo ?? []).length > 0 && (
                  <section className="sp__panel sp__undopanel">
                    <button
                      className="sp__undohead"
                      onClick={() => setShowUndo((v) => !v)}
                      aria-expanded={showUndo}
                    >
                      <Icon name={showUndo ? 'chevron-down' : 'chevron-right'} size={13} />
                      <Icon name="undo" size={13} /> Zuletzt einsortiert (
                      {(index.undo ?? []).length})
                    </button>
                    {showUndo && (
                      <div className="sp__undolist">
                        {(index.undo ?? []).slice(0, 6).map((u) => (
                          <div key={u.id} className="sp__undoitem">
                            <span className="sp__undotxt">
                              {u.kind === 'append' ? 'angehängt an ' : ''}
                              <strong>
                                {u.destRelPath
                                  .split('/')
                                  .pop()
                                  ?.replace(/\.[^.]+$/, '')}
                              </strong>
                              <em> · {u.destRelPath.split('/').slice(-2, -1)[0] ?? ''}</em>
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              disabled={Boolean(busy)}
                              onClick={() => void undoFiling(u.id)}
                            >
                              Rückgängig
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
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

                      {(() => {
                        const groups = selectedCourse.groups ?? []
                        const sections: { name: string; files: SpFile[] }[] = [
                          ...groups.map((g) => ({ name: g.name, files: g.files })),
                          ...(selectedCourse.files.length
                            ? [{ name: 'Sonstiges', files: selectedCourse.files }]
                            : [])
                        ]
                        const total = sections.reduce((s, x) => s + x.files.length, 0)
                        return (
                          <>
                            <h2 className="sp__h2">
                              <Icon name="folder-open" size={15} /> Notizen
                              <span className="sp__count">{total}</span>
                            </h2>
                            {sections.length === 0 ? (
                              <p className="sp__empty">
                                Dieses Fach hat noch keine Unterordner. „Scan hinzufügen" legt die
                                Notiz in Informationen oder Übungen ab.
                              </p>
                            ) : (
                              sections.map((sec) => (
                                <div key={sec.name} className="sp__notesgroup">
                                  <div className="sp__notesgrouphead">
                                    {sec.name}
                                    <span className="sp__count">{sec.files.length}</span>
                                  </div>
                                  <div className="sp__files">
                                    {sec.files.map((f) => (
                                      <div key={f.path} className="sp__fileitem">
                                        <Icon name={f.ext === 'pdf' ? 'page' : 'image'} size={15} />
                                        <button
                                          className="sp__filename"
                                          onClick={() => void openInEditor(f)}
                                        >
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
                                    {sec.files.length === 0 && (
                                      <p className="sp__empty">Noch nichts hier.</p>
                                    )}
                                  </div>
                                </div>
                              ))
                            )}
                          </>
                        )
                      })()}
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

        <div
          className="sp__resize"
          onPointerDown={startResize('cal')}
          role="separator"
          aria-label="Termine-Leiste breiter/schmaler ziehen"
        />
        <CalendarRail onOpenPrep={openExam} />
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
      const hit =
        c.files.find((f) => f.path === abs) ??
        c.groups?.flatMap((g) => g.files).find((f) => f.path === abs)
      if (hit) return hit
    }
    const loose = s.looseFiles.find((f) => f.path === abs)
    if (loose) return loose
  }
  return null
}
