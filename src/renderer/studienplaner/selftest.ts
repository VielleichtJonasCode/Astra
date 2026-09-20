import type { CalEvent, SpTree } from '@shared/types'
import {
  detectSemester,
  findAppendTarget,
  findDuplicate,
  guessSubfolder,
  hammingHex,
  normName,
  safeName,
  searchIndex,
  smartNoteName,
  splitUndo,
  suggestFiling,
  emptyIndex,
  type IndexEntry,
  type UndoRecord
} from './model'
import {
  buildAgenda,
  busyDigest,
  courseNamesFromEvents,
  daysLeftLabel,
  eventsByDay,
  isExam,
  monthMatrix,
  pastExams,
  semesterSortKey,
  upcomingExams
} from './calendar'
import {
  buildTacticsDigest,
  componentGrade,
  fachGrade,
  fachPassStatus,
  gradeLabel,
  overallGpa,
  pointsToGrade,
  semesterGpa
} from './grades'
import type { FachResult, GradeComponent } from './model'
import {
  analyzeProgress,
  carryDoneByTitle,
  courseNoteList,
  courseNotesText,
  emptyLernplan,
  examKeyOf,
  lernplanMeta,
  mergeChat,
  mergeProgress,
  parseLernplan,
  perfPromptText,
  trimChat,
  weakQuiz,
  CHAT_LIMIT,
  type ChatMessage,
  type PlanTask
} from './prep'
import {
  parseJsonLoose,
  parseNextStep,
  parseQuizItems,
  parseRescheduleMoves,
  parseSemesterSetup,
  parseStudyPlan
} from './aiParse'
import { buildWidgetSnapshot, daysBetween, shortTip, type WidgetInputs } from './widget'

export interface SelfTestResult {
  ok: boolean
  total: number
  failed: string[]
}

/**
 * Headless-Selbsttest der Studienplaner-Logik. Läuft im Renderer über
 * `#sptest=1` und in CI über `npm test` (scripts/run-selftest.mjs).
 * Gibt das Ergebnis zurück UND loggt es.
 */
export function runStudienplanerSelfTest(): SelfTestResult {
  const checks: [string, boolean][] = []

  // safeName
  checks.push([
    'safeName strips slashes',
    safeName('Analysis II / Blatt 3') === 'Analysis II Blatt 3'
  ])
  checks.push(['safeName fallback', safeName('///') === 'Notiz'])

  // detectSemester
  checks.push([
    'detectSemester ordinal',
    detectSemester('Mitschrift 3. Semester', ['1. Semester', '3. Semester']) === '3. Semester'
  ])
  checks.push(['detectSemester term', detectSemester('Vorlesung WS 2025', []) === 'WS 2025'])

  const tree: SpTree = {
    root: '/x',
    looseFiles: [],
    inbox: [],
    semesters: [
      {
        name: '3. Semester',
        path: '/x/3. Semester',
        looseFiles: [],
        courses: [
          { name: 'Analysis II', path: '/x/3. Semester/Analysis II', files: [] },
          { name: 'Lineare Algebra', path: '/x/3. Semester/Lineare Algebra', files: [] }
        ]
      }
    ]
  }

  const s = suggestFiling(
    'Analysis II\nGrenzwerte und Stetigkeit\n3. Semester\nDefinition: Eine Folge konvergiert ...',
    tree
  )
  checks.push(['suggest course', s.kurs === 'Analysis II'])
  checks.push(['suggest semester', s.semester === '3. Semester'])
  checks.push(['suggest thema non-empty', Boolean(s.thema)])
  checks.push(['suggest confidence', s.confidence > 0])
  checks.push([
    'suggest candidates ranked + matched words',
    s.candidates.length >= 1 &&
      s.candidates[0].kurs === 'Analysis II' &&
      s.candidates[0].score === s.confidence &&
      s.candidates[0].matched.includes('analysis') &&
      s.candidates.every((c, i) => i === 0 || c.score <= s.candidates[i - 1].score)
  ])
  checks.push(['suggest semesterFrom', s.semesterFrom === 'match'])
  checks.push([
    'suggest semesterFrom text-only',
    suggestFiling('Nur WS 2025 steht hier, kein Fachname', tree).semesterFrom === 'text'
  ])

  const noHit = suggestFiling('Einkaufszettel Milch Eier Brot', tree)
  checks.push(['no false course', noHit.kurs === undefined])
  checks.push([
    'no candidates when nothing matches',
    noHit.candidates.length === 0 && noHit.confidence === 0 && noHit.semesterFrom === 'none'
  ])

  // Aktuelles Semester bevorzugt: gleiches Fachwort in altem UND neuem Semester
  {
    const t2: SpTree = {
      root: '/x',
      looseFiles: [],
      inbox: [],
      semesters: [
        {
          name: 'WS 2023',
          path: '/x/WS 2023',
          looseFiles: [],
          courses: [{ name: 'Analysis I', path: '/x/WS 2023/Analysis I', files: [] }]
        },
        {
          name: 'SS 2025',
          path: '/x/SS 2025',
          looseFiles: [],
          courses: [{ name: 'Analysis III', path: '/x/SS 2025/Analysis III', files: [] }]
        }
      ]
    }
    const cur = suggestFiling('Analysis Blatt zu Grenzwerten und Reihen', t2)
    checks.push([
      'suggestFiling prefers current semester',
      cur.focusSemester === 'SS 2025' &&
        cur.semester === 'SS 2025' &&
        cur.kurs === 'Analysis III' &&
        cur.candidates[1]?.semester === 'WS 2023' // altes Fach nur als Alternative
    ])
    const oldOne = suggestFiling('Analysis Klausur aus WS 2023, Altklausur', t2)
    checks.push([
      'suggestFiling honours explicit past semester in text',
      oldOne.focusSemester === 'WS 2023' &&
        oldOne.semester === 'WS 2023' &&
        oldOne.kurs === 'Analysis I'
    ])
  }

  // normName + findAppendTarget: neues Foto an vorhandene PDF anhängen
  {
    checks.push([
      'normName drops extension + lowercases + collapses spaces',
      normName('  Übungsblatt   4.PDF ') === 'übungsblatt 4'
    ])
    checks.push(['normName ext-only leaves stem', normName('Serie 12.pdf') === 'serie 12'])

    const appIdx = emptyIndex()
    const mkE = (p: string): IndexEntry => ({
      relPath: p,
      semester: 'SS 2025',
      kurs: 'Stochastik',
      thema: p.split('/').pop() ?? p,
      added: '',
      ocrEngine: 'none',
      text: ''
    })
    appIdx.entries['SS 2025/Stochastik/Übungen/Übungsblatt 4.pdf'] = mkE(
      'SS 2025/Stochastik/Übungen/Übungsblatt 4.pdf'
    )
    appIdx.entries['SS 2025/Stochastik/Notizen.txt'] = mkE('SS 2025/Stochastik/Notizen.txt')

    const hit = findAppendTarget(appIdx, 'SS 2025', 'Stochastik', 'Übungsblatt 4')
    checks.push([
      'findAppendTarget matches same normalised name across subfolders',
      hit?.relPath === 'SS 2025/Stochastik/Übungen/Übungsblatt 4.pdf' &&
        hit?.name === 'Übungsblatt 4'
    ])
    checks.push([
      'findAppendTarget ignores non-pdf entries',
      findAppendTarget(appIdx, 'SS 2025', 'Stochastik', 'Notizen') === null
    ])
    checks.push([
      'findAppendTarget null on different thema',
      findAppendTarget(appIdx, 'SS 2025', 'Stochastik', 'Übungsblatt 5') === null
    ])
    checks.push([
      'findAppendTarget null on other course',
      findAppendTarget(appIdx, 'SS 2025', 'Analysis III', 'Übungsblatt 4') === null
    ])
    checks.push([
      'findAppendTarget null on too-short thema',
      findAppendTarget(appIdx, 'SS 2025', 'Stochastik', 'ab') === null
    ])
  }

  // Unterordner raten + smarter Dateiname
  checks.push([
    'guessSubfolder übung',
    guessSubfolder('Übungsblatt 3 – Aufgabe 1: zeige ...') === 'Übungen'
  ])
  checks.push([
    'guessSubfolder info',
    guessSubfolder('Vorlesung: Definition und Beweis des Satzes') === 'Informationen'
  ])
  checks.push([
    'smartNoteName blatt',
    smartNoteName('Analysis II\nÜbungsblatt 3\n...') === 'Übungsblatt 3'
  ])
  checks.push(['smartNoteName serie', smartNoteName('Serie 12 Lineare Algebra') === 'Serie 12'])
  checks.push(['smartNoteName vorlesung', smartNoteName('Vorlesung 7 – Reihen') === 'Vorlesung 7'])
  checks.push([
    'smartNoteName fallback line',
    smartNoteName('Grenzwerte und Stetigkeit\nweiterer Text') === 'Grenzwerte und Stetigkeit'
  ])

  // searchIndex
  const index = emptyIndex()
  index.entries['3. Semester/Analysis II/Grenzwerte.pdf'] = {
    relPath: '3. Semester/Analysis II/Grenzwerte.pdf',
    semester: '3. Semester',
    kurs: 'Analysis II',
    thema: 'Grenzwerte',
    added: new Date().toISOString(),
    ocrEngine: 'vision',
    text: 'Eine Folge a_n konvergiert gegen den Grenzwert L wenn ...'
  }
  const hits = searchIndex(index, 'grenzwert konvergiert')
  checks.push(['search finds entry', hits.length === 1 && hits[0].entry.thema === 'Grenzwerte'])
  checks.push(['search miss', searchIndex(index, 'integralrechnung').length === 0])

  // Kalender-Logik
  checks.push(['isExam klausur', isExam('Klausur Analysis II')])
  checks.push(['isExam präsentation', isExam('Präsentation Projektarbeit')])
  checks.push(['isExam vortrag', isExam('Referat / Vortrag Thema 4')])
  checks.push(['isExam negativ', !isExam('Vorlesung Lineare Algebra')])
  checks.push(['daysLeftLabel heute', daysLeftLabel(0) === 'heute'])
  checks.push(['daysLeftLabel morgen', daysLeftLabel(1) === 'morgen'])
  checks.push(['daysLeftLabel n', daysLeftLabel(12) === 'noch 12 Tage'])

  const iso = (dayOffset: number, h = 10): string => {
    const d = new Date()
    d.setHours(h, 0, 0, 0)
    d.setDate(d.getDate() + dayOffset)
    return d.toISOString()
  }
  const evs: CalEvent[] = [
    {
      id: 'a',
      title: 'Vorlesung Analysis',
      start: iso(1, 8),
      end: iso(1, 10),
      allDay: false,
      calendarId: 'c',
      calendarTitle: 'Uni',
      color: '#f00'
    },
    {
      id: 'b',
      title: 'Klausur Lineare Algebra',
      start: iso(9, 9),
      end: iso(9, 11),
      allDay: false,
      calendarId: 'c',
      calendarTitle: 'Uni',
      color: '#f00'
    },
    {
      id: 'c',
      title: 'Vorlesung DB',
      start: iso(40, 8),
      end: iso(40, 10),
      allDay: false,
      calendarId: 'c',
      calendarTitle: 'Uni',
      color: '#f00'
    },
    {
      id: 'd',
      title: 'Präsentation Seminar',
      start: iso(3, 14),
      end: iso(3, 15),
      allDay: false,
      calendarId: 'c',
      calendarTitle: 'Uni',
      color: '#f00'
    }
  ]
  const nextExams = upcomingExams(evs, 5)
  checks.push(['upcomingExams count', nextExams.length === 2])
  checks.push(['upcomingExams sorted', nextExams[0].id === 'd' && nextExams[1].id === 'b'])
  {
    const withPast: CalEvent[] = [
      ...evs,
      { ...evs[1], id: 'p1', title: 'Klausur Alt 1', start: iso(-30, 9), end: iso(-30, 11) },
      { ...evs[1], id: 'p2', title: 'Test Alt 2', start: iso(-3, 9), end: iso(-3, 10) }
    ]
    const pe = pastExams(withPast, 10)
    checks.push([
      'pastExams only past exams, newest first',
      pe.map((e) => e.id).join(',') === 'p2,p1'
    ])
    checks.push([
      'pastExams excludes upcoming + non-exams',
      !pe.some((e) => e.id === 'a' || e.id === 'b' || e.id === 'd')
    ])
  }
  const agenda = buildAgenda(evs, 28)
  checks.push(['agenda within window', agenda.every((d) => d.events.length > 0)])
  checks.push([
    'agenda excludes far event',
    !agenda.some((d) => d.events.some((e) => e.id === 'c'))
  ])

  // Monatsraster für die Kalender-Seite (März 2026: 1. = Sonntag)
  {
    const grid = monthMatrix(2026, 2, new Date('2026-03-15T12:00:00'))
    checks.push(['monthMatrix shape', grid.length === 6 && grid.every((w) => w.length === 7)])
    checks.push([
      'monthMatrix mon-first leading days from Feb',
      grid[0][0].key === '2026-02-23' && grid[0][0].inMonth === false && grid[0][6].day === 1
    ])
    checks.push([
      'monthMatrix marks today + weekend',
      grid.flat().find((c) => c.key === '2026-03-15')?.isToday === true &&
        grid[0][5].isWeekend === true &&
        grid[0][0].isWeekend === false
    ])
    checks.push([
      'monthMatrix inMonth only March',
      grid.flat().filter((c) => c.inMonth).length === 31
    ])
    const eb = eventsByDay([
      { ...evs[0], id: 'x1', start: '2026-03-10T09:00:00Z' },
      { ...evs[0], id: 'x2', start: '2026-03-10T07:00:00Z' },
      { ...evs[0], id: 'x3', start: '2026-03-11T08:00:00Z' }
    ] as CalEvent[])
    checks.push([
      'eventsByDay buckets + sorts by start',
      eb
        .get('2026-03-10')
        ?.map((e) => e.id)
        .join(',') === 'x2,x1' && eb.get('2026-03-11')?.length === 1
    ])
  }

  // busyDigest – Zeilen je Tag, weit entfernte + eigene 📚-Blöcke draußen
  {
    const dig = busyDigest(evs, iso(21))
    checks.push(['busyDigest has lines', dig.split('\n').length >= 2])
    checks.push(['busyDigest sorted', dig === dig.split('\n').sort().join('\n')])
    checks.push(['busyDigest excludes far event', !dig.includes(iso(40).slice(0, 10))])
    checks.push(['busyDigest empty', busyDigest([], null) === ''])
    const study: CalEvent[] = [
      {
        id: 's',
        title: '📚 Reihen üben',
        start: iso(5, 16),
        end: iso(5, 17),
        allDay: false,
        calendarId: 'c',
        calendarTitle: 'x',
        color: '#000'
      }
    ]
    checks.push(['busyDigest ignores study blocks', busyDigest(study, iso(21)) === ''])
    checks.push([
      'courseNamesFromEvents ignores study blocks',
      courseNamesFromEvents([...study, ...evs]).every((n) => !n.includes('📚'))
    ])
  }

  // semesterSortKey – deutsches Studienjahr: SS vor WS desselben Jahres
  {
    const order = ['WS 2024', 'SS 2024', 'SS 2025', 'WS 2023', '3. Semester', '1. Semester']
      .slice()
      .sort((a, b) => semesterSortKey(a) - semesterSortKey(b))
    checks.push([
      'semesterSortKey chronological',
      order.join(' | ') === '1. Semester | 3. Semester | WS 2023 | SS 2024 | WS 2024 | SS 2025'
    ])
    checks.push([
      'semesterSortKey SS before WS same year',
      semesterSortKey('SS 2024') < semesterSortKey('WS 2024')
    ])
    checks.push([
      'semesterSortKey WS before next SS',
      semesterSortKey('WS 2024') < semesterSortKey('SS 2025')
    ])
    checks.push(['semesterSortKey unknown large', semesterSortKey('Irgendwas') >= 9e6])
    checks.push(['semesterSortKey SoSe form', semesterSortKey('SoSe 2025') === 2025])
  }

  // Prüfungsvorbereitung
  checks.push([
    'examKey stable',
    examKeyOf('Klausur Analysis II', '2026-02-10T09:00:00Z') === 'klausur analysis ii|2026-02-10'
  ])

  const idx2 = emptyIndex()
  idx2.entries['3. Semester/Analysis II/Grenzwerte.pdf'] = {
    relPath: '3. Semester/Analysis II/Grenzwerte.pdf',
    semester: '3. Semester',
    kurs: 'Analysis II',
    thema: 'Grenzwerte',
    added: new Date().toISOString(),
    ocrEngine: 'vision',
    text: 'Der Grenzwert einer Folge ...'
  }
  idx2.entries['3. Semester/Lineare Algebra/Basis.pdf'] = {
    relPath: '3. Semester/Lineare Algebra/Basis.pdf',
    semester: '3. Semester',
    kurs: 'Lineare Algebra',
    thema: 'Basis',
    added: new Date().toISOString(),
    ocrEngine: 'vision',
    text: 'Eine Basis ist ...'
  }
  const ctx = courseNotesText(idx2, '3. Semester', 'Analysis II')
  checks.push(['courseNotesText scoped', ctx.includes('Grenzwert') && !ctx.includes('Basis ist')])
  checks.push([
    'courseNoteList entries',
    courseNoteList(idx2, '3. Semester', 'Analysis II').length === 1
  ])
  checks.push([
    'courseNotesText empty selection = nichts',
    courseNotesText(idx2, '3. Semester', 'Analysis II', []) === ''
  ])
  checks.push([
    'courseNotesText selection filter',
    courseNotesText(idx2, '3. Semester', 'Analysis II', [
      '3. Semester/Analysis II/Grenzwerte.pdf'
    ]).includes('Grenzwert')
  ])

  const packA = emptyLernplan('3. Semester', 'Analysis II')
  const packB: typeof packA = JSON.parse(JSON.stringify(packA))
  packA.progress['q1'] = { seen: 1, correct: 1, lastCorrect: true, updated: '2026-01-01T10:00:00Z' }
  packB.progress['q1'] = {
    seen: 3,
    correct: 2,
    lastCorrect: false,
    updated: '2026-01-02T10:00:00Z'
  }
  packB.progress['q2'] = {
    seen: 1,
    correct: 0,
    lastCorrect: false,
    updated: '2026-01-02T11:00:00Z'
  }
  packB.updated = '2026-01-02T12:00:00Z'
  packA.updated = '2026-01-01T12:00:00Z'
  const merged = mergeProgress(packA, packB)
  checks.push(['mergeProgress newer wins', merged.progress['q1'].seen === 3])
  checks.push(['mergeProgress keeps extra', merged.progress['q2'] !== undefined])

  // Abgehakte Aufgaben überleben den Merge, egal welche Seite neuer ist
  const tA = emptyLernplan('S', 'K')
  const tB: typeof tA = JSON.parse(JSON.stringify(tA))
  tA.planTasks = [{ id: 'x1', date: '2026-02-01', title: 'A', topic: '', minutes: 60, done: false }]
  tB.planTasks = [{ id: 'x1', date: '2026-02-01', title: 'A', topic: '', minutes: 60, done: true }]
  tA.updated = '2026-02-10T00:00:00Z' // A ist neuer, hat die Aufgabe aber NICHT abgehakt
  tB.updated = '2026-02-01T00:00:00Z'
  checks.push([
    'mergeProgress keeps checked task (no timestamp)',
    mergeProgress(tA, tB).planTasks![0].done === true
  ])

  // Mit Zeitstempel gewinnt die NEUERE Abhak-Änderung – auch das Abwählen
  const uA = emptyLernplan('S', 'K')
  const uB: typeof uA = JSON.parse(JSON.stringify(uA))
  uA.planTasks = [
    {
      id: 'u1',
      date: '2026-02-01',
      title: 'A',
      topic: '',
      minutes: 60,
      done: false,
      doneAt: '2026-02-12T00:00:00Z'
    }
  ]
  uB.planTasks = [
    {
      id: 'u1',
      date: '2026-02-01',
      title: 'A',
      topic: '',
      minutes: 60,
      done: true,
      doneAt: '2026-02-05T00:00:00Z'
    }
  ]
  uA.updated = '2026-02-01T00:00:00Z'
  uB.updated = '2026-02-20T00:00:00Z' // uB ist Struktur-Basis, aber uA hat den neueren Haken-Stand
  checks.push([
    'mergeProgress uncheck wins by timestamp',
    mergeProgress(uA, uB).planTasks![0].done === false
  ])

  // parseLernplan vergibt fehlende Task-IDs
  const noId = parseLernplan(
    JSON.stringify({
      ...emptyLernplan('S', 'K'),
      planTasks: [{ date: '2026-02-01', title: 'A', topic: '', minutes: 60 }]
    })
  )
  checks.push([
    'parseLernplan adds task id',
    !!noId && typeof noId.planTasks![0].id === 'string' && noId.planTasks![0].id.length > 0
  ])

  // parseLernplan übernimmt calEventId (Kalender-Verknüpfung), verwirft Leerwerte
  const withCal = parseLernplan(
    JSON.stringify({
      ...emptyLernplan('S', 'K'),
      planTasks: [
        { id: 'c1', date: '2026-02-01', title: 'A', topic: '', minutes: 60, calEventId: 'EV-1' },
        { id: 'c2', date: '2026-02-02', title: 'B', topic: '', minutes: 60, calEventId: '' }
      ]
    })
  )
  checks.push([
    'parseLernplan keeps calEventId',
    !!withCal &&
      withCal.planTasks![0].calEventId === 'EV-1' &&
      withCal.planTasks![1].calEventId === undefined
  ])

  // mergeProgress verliert die Kalender-Verknüpfung nicht, wenn das Handy (ohne
  // calEventId) die neuere Struktur-Basis ist
  const cA = emptyLernplan('S', 'K')
  const cB: typeof cA = JSON.parse(JSON.stringify(cA))
  cA.planTasks = [
    { id: 'x1', date: '2026-02-01', title: 'A', topic: '', minutes: 60, calEventId: 'EV-9' }
  ]
  cB.planTasks = [{ id: 'x1', date: '2026-02-01', title: 'A', topic: '', minutes: 60 }]
  cA.updated = '2026-02-01T00:00:00Z'
  cB.updated = '2026-02-20T00:00:00Z'
  checks.push([
    'mergeProgress keeps calEventId from other side',
    mergeProgress(cA, cB).planTasks![0].calEventId === 'EV-9'
  ])

  // lernplanMeta zählt Aufgaben
  const metaPack = emptyLernplan('S', 'K')
  metaPack.planTasks = [
    { id: 'a', date: '2026-02-01', title: 'A', topic: '', minutes: 60, done: true },
    { id: 'b', date: '2026-02-02', title: 'B', topic: '', minutes: 60, done: false }
  ]
  const meta = lernplanMeta('S', 'K', metaPack)
  checks.push([
    'lernplanMeta task counts',
    meta.taskTotal === 2 && meta.taskDone === 1 && meta.nextTask === 'B'
  ])

  // parseLernplan: neue v2-Form + Migration vom alten v1-„lernpaket"
  const legacy = parseLernplan(
    JSON.stringify({
      v: 1,
      examKey: 'k',
      examTitle: 'Klausur A',
      examDateIso: null,
      semester: 'S',
      kurs: 'K',
      summary: '',
      plan: '',
      progress: {},
      updated: '2026-01-01T00:00:00Z',
      quiz: [{ id: 'a', question: 'x', choices: ['1', '2'], answer: 0, explanation: '' }]
    })
  )
  checks.push([
    'parseLernplan migrates v1',
    !!legacy &&
      legacy.v === 2 &&
      legacy.quizzes.length === 1 &&
      legacy.quizzes[0].items.length === 1 &&
      legacy.name === 'Klausur A'
  ])
  const modern = parseLernplan(
    JSON.stringify({
      ...emptyLernplan('S', 'K'),
      quizzes: [{ id: 'z', name: 'Quiz 1', created: '', items: [] }]
    })
  )
  checks.push([
    'parseLernplan keeps v2',
    !!modern && modern.quizzes.length === 1 && modern.name === 'K'
  ])
  checks.push(['parseLernplan rejects junk', parseLernplan('{bad') === null])

  // Leistungs-Auswertung
  const pp = emptyLernplan('S', 'K')
  pp.quizzes = [
    {
      id: 'z',
      name: 'Q',
      created: '',
      items: [
        {
          id: 'i1',
          question: 'q1',
          choices: ['a', 'b'],
          answer: 0,
          explanation: '',
          topic: 'Grenzwerte'
        },
        {
          id: 'i2',
          question: 'q2',
          choices: ['a', 'b'],
          answer: 0,
          explanation: '',
          topic: 'Grenzwerte'
        },
        {
          id: 'i3',
          question: 'q3',
          choices: ['a', 'b'],
          answer: 0,
          explanation: '',
          topic: 'Reihen'
        },
        {
          id: 'i4',
          question: 'q4',
          choices: ['a', 'b'],
          answer: 0,
          explanation: '',
          topic: 'Reihen'
        }
      ]
    }
  ]
  pp.progress = {
    i1: { seen: 3, correct: 0, lastCorrect: false, updated: 'x' },
    i2: { seen: 2, correct: 1, lastCorrect: false, updated: 'x' },
    i3: { seen: 2, correct: 2, lastCorrect: true, updated: 'x' },
    i4: { seen: 3, correct: 3, lastCorrect: true, updated: 'x' }
  }
  const perf = analyzeProgress(pp)
  checks.push(['analyzeProgress answered', perf.answered === 4 && perf.total === 4])
  checks.push(['analyzeProgress accuracy', Math.abs(perf.accuracy - 0.5) < 1e-9])
  const grenz = perf.byTopic.find((t) => t.topic === 'Grenzwerte')
  const reihen = perf.byTopic.find((t) => t.topic === 'Reihen')
  checks.push(['analyzeProgress weak topic', !!grenz && grenz.weak === true])
  checks.push(['analyzeProgress strong topic', !!reihen && reihen.weak === false])
  checks.push(['analyzeProgress weak sorted first', perf.byTopic[0].topic === 'Grenzwerte'])
  checks.push([
    'weakItemIds has i1',
    perf.weakItemIds.includes('i1') && perf.weakItemIds.includes('i2')
  ])
  checks.push(['perfPromptText mentions SCHWACH', perfPromptText(perf).includes('SCHWACH')])
  checks.push([
    'weakQuiz builds items',
    weakQuiz(pp, perf.weakItemIds).items.length === perf.weakItemIds.length
  ])
  checks.push([
    'analyzeProgress no data',
    analyzeProgress(emptyLernplan('S', 'K')).hasData === false
  ])

  // Duplikat-Erkennung
  checks.push(['hammingHex identical', hammingHex('00ff', '00ff') === 0])
  checks.push(['hammingHex one bit', hammingHex('0000', '0001') === 1])
  checks.push(['hammingHex length mismatch', hammingHex('ff', 'ffff') > 1000])
  {
    const dupIdx = emptyIndex()
    const mk = (p: string, x: Partial<IndexEntry>): IndexEntry => ({
      relPath: p,
      semester: 'S',
      kurs: 'K',
      thema: p,
      added: '',
      ocrEngine: 'none',
      text: '',
      ...x
    })
    dupIdx.entries['a.pdf'] = mk('a.pdf', {
      sha1: 'aaa',
      textHash: 'ttt',
      ahash: '0000000000000000'
    })
    checks.push([
      'findDuplicate by sha1',
      findDuplicate(dupIdx, { sha1: 'aaa' })?.relPath === 'a.pdf'
    ])
    checks.push([
      'findDuplicate by textHash',
      findDuplicate(dupIdx, { textHash: 'ttt' })?.relPath === 'a.pdf'
    ])
    checks.push([
      'findDuplicate by close ahash',
      findDuplicate(dupIdx, { ahash: '0000000000000003' })?.relPath === 'a.pdf'
    ])
    checks.push([
      'findDuplicate far ahash misses',
      findDuplicate(dupIdx, { ahash: 'ffffffffffffffff' }) === null
    ])
    checks.push(['findDuplicate nothing', findDuplicate(dupIdx, { sha1: 'zzz' }) === null])
  }

  // Noten & ECTS-Schnitt
  checks.push(['pointsToGrade 15', pointsToGrade(15) === 1.0])
  checks.push(['pointsToGrade 10', pointsToGrade(10) === 2.3])
  checks.push(['pointsToGrade 5', pointsToGrade(5) === 4.0])
  checks.push(['pointsToGrade fail', pointsToGrade(3) === 5.0])
  checks.push([
    'fachGrade weighted mean',
    fachGrade({
      components: [
        { id: 'a', title: 'T', mode: 'grade', grade: 1.0, weightPct: 30 },
        { id: 'b', title: 'K', mode: 'grade', grade: 3.0, weightPct: 70 }
      ]
    }) === 2.4
  ])
  checks.push([
    'fachGrade normalizes weights',
    fachGrade({
      components: [
        { id: 'a', title: 'T', mode: 'grade', grade: 2.0, weightPct: 1 },
        { id: 'b', title: 'K', mode: 'grade', grade: 4.0, weightPct: 1 }
      ]
    }) === 3.0
  ])
  checks.push([
    'fachGrade ignores passfail',
    fachGrade({
      components: [
        { id: 'a', title: 'K', mode: 'grade', grade: 2.0, weightPct: 100 },
        { id: 'b', title: 'Ü', mode: 'passfail', passed: true, weightPct: 100 }
      ]
    }) === 2.0
  ])
  checks.push([
    'fachGrade none graded',
    fachGrade({
      components: [{ id: 'b', title: 'Ü', mode: 'passfail', passed: true, weightPct: 100 }]
    }) === null
  ])
  checks.push(['gradeLabel comma', gradeLabel(1.7) === '1,7'])
  checks.push(['gradeLabel null', gradeLabel(null) === '–'])
  {
    const results: FachResult[] = [
      {
        semester: 'WS 2024',
        kurs: 'A',
        ects: 6,
        components: [{ id: '1', title: 'K', mode: 'grade', grade: 2.0, weightPct: 100 }]
      },
      {
        semester: 'WS 2024',
        kurs: 'B',
        ects: 9,
        components: [{ id: '2', title: 'K', mode: 'grade', grade: 3.0, weightPct: 100 }]
      },
      {
        semester: 'SS 2025',
        kurs: 'C',
        // kein ECTS – darf NICHT zählen, muss gemeldet werden
        components: [{ id: '3', title: 'K', mode: 'grade', grade: 1.0, weightPct: 100 }]
      },
      {
        semester: 'SS 2025',
        kurs: 'Vorkurs',
        // bewusst ausgeschlossen – auch ohne ECTS nicht in missingEcts melden
        excludeFromGpa: true,
        components: [{ id: '4', title: 'K', mode: 'grade', grade: 5.0, weightPct: 100 }]
      }
    ]
    const g = overallGpa(results)
    checks.push([
      'overallGpa ects-weighted',
      g.gpa === 2.6 && g.credits === 15 && g.counted === 2 && g.missingEcts.join() === 'C'
    ])
    checks.push([
      'overallGpa ignores excludeFromGpa entirely (not counted, not missingEcts)',
      !g.missingEcts.includes('Vorkurs')
    ])
    checks.push(['semesterGpa scoped', semesterGpa(results, 'WS 2024').gpa === 2.6])
    checks.push(['semesterGpa other', semesterGpa(results, 'SS 2025').gpa === null])
    checks.push(['overallGpa empty', overallGpa([]).gpa === null && overallGpa([]).credits === 0])
  }

  // pointsToGrade – volle Tabelle + Ränder
  checks.push([
    'pointsToGrade table',
    [14, 13, 12, 11, 9, 8, 7, 6].map(pointsToGrade).join(',') === '1,1.3,1.7,2,2.7,3,3.3,3.7'
  ])
  checks.push(['pointsToGrade >15', pointsToGrade(99) === 1.0])
  checks.push(['pointsToGrade 0', pointsToGrade(0) === 5.0])
  checks.push(['pointsToGrade rounds', pointsToGrade(9.6) === 2.3])

  // componentGrade – alle Modi + ungültige Werte
  const cg = (c: Partial<GradeComponent>): number | null =>
    componentGrade({ id: 'x', title: 't', weightPct: 100, mode: 'grade', ...c } as GradeComponent)
  checks.push(['componentGrade grade ok', cg({ mode: 'grade', grade: 2.3 }) === 2.3])
  checks.push(['componentGrade grade out of range', cg({ mode: 'grade', grade: 6 }) === null])
  checks.push(['componentGrade grade missing', cg({ mode: 'grade' }) === null])
  checks.push(['componentGrade points', cg({ mode: 'points', points: 13 }) === 1.3])
  checks.push(['componentGrade points bad', cg({ mode: 'points', points: 20 }) === null])
  checks.push(['componentGrade passfail null', cg({ mode: 'passfail', passed: true }) === null])

  // fachGrade – Gewicht 0, leere Liste, Rundung
  checks.push(['fachGrade empty', fachGrade({ components: [] }) === null])
  checks.push([
    'fachGrade weight zero skipped',
    fachGrade({
      components: [
        { id: 'a', title: 'x', mode: 'grade', grade: 1.0, weightPct: 0 },
        { id: 'b', title: 'y', mode: 'grade', grade: 3.0, weightPct: 100 }
      ]
    }) === 3.0
  ])

  // fachPassStatus – alle bestanden / eine durchgefallen / nicht ausgefüllt / mit Note
  const pf = (comps: Partial<GradeComponent>[]): boolean | null =>
    fachPassStatus({
      components: comps.map((c, i) => ({
        id: `p${i}`,
        title: 't',
        weightPct: 100,
        mode: 'passfail',
        ...c
      })) as GradeComponent[]
    })
  checks.push(['fachPassStatus all passed', pf([{ passed: true }, { passed: true }]) === true])
  checks.push(['fachPassStatus one failed', pf([{ passed: true }, { passed: false }]) === false])
  checks.push(['fachPassStatus not filled', pf([{ passed: true }, {}]) === null])
  checks.push([
    'fachPassStatus with grade -> null',
    fachPassStatus({
      components: [
        { id: 'g', title: 'K', mode: 'grade', grade: 2.0, weightPct: 100 },
        { id: 'p', title: 'Ü', mode: 'passfail', passed: false, weightPct: 100 }
      ]
    }) === null
  ])

  // Rückgängig-Verlauf kappen (jüngste 20)
  {
    const mkU = (i: number): UndoRecord => ({
      id: `u${i}`,
      when: '',
      kind: 'file',
      destRelPath: `x/${i}.pdf`,
      originalName: `${i}.pdf`,
      fromInbox: true
    })
    const many = Array.from({ length: 25 }, (_, i) => mkU(i))
    const { kept, dropped } = splitUndo(many)
    checks.push([
      'splitUndo caps at 20',
      kept.length === 20 && dropped.length === 5 && kept[0].id === 'u0' && dropped[0].id === 'u20'
    ])
    checks.push(['splitUndo short list', splitUndo(many.slice(0, 3)).dropped.length === 0])
  }

  /* ── Umgang mit Gemini-Antworten (aiParse.ts) ──────────────────────────
   * Gemini bekommt zwar responseMimeType application/json, liefert aber in der
   * Praxis auch Code-Zäune, Fließtext drumherum, falsche Typen, halluzinierte
   * IDs oder Vergangenheitsdaten. Diese Parser müssen daraus entweder saubere
   * Daten machen oder kontrolliert leer zurückgeben – nie werfen. */

  // parseJsonLoose: Zäune, Prosa, Müll
  checks.push(['parseJsonLoose plain object', parseJsonLoose<{ a: number }>('{"a":1}')?.a === 1])
  checks.push([
    'parseJsonLoose plain array',
    JSON.stringify(parseJsonLoose('[1,2,3]')) === '[1,2,3]'
  ])
  checks.push([
    'parseJsonLoose ```json fence',
    parseJsonLoose<{ ok: boolean }>('```json\n{"ok":true}\n```')?.ok === true
  ])
  checks.push([
    'parseJsonLoose bare fence',
    parseJsonLoose<{ n: number }>('```\n{"n":5}\n```')?.n === 5
  ])
  checks.push([
    'parseJsonLoose prose around json',
    parseJsonLoose<{ x: number }>('Klar! Hier ist das JSON:\n{"x":9}\nViel Erfolg!')?.x === 9
  ])
  checks.push([
    'parseJsonLoose braces inside strings',
    parseJsonLoose<{ s: string }>('vortext {"s":"a}{b"} nachtext')?.s === 'a}{b'
  ])
  checks.push(['parseJsonLoose garbage -> null', parseJsonLoose('das ist kein json') === null])
  checks.push(['parseJsonLoose empty -> null', parseJsonLoose('') === null])
  checks.push(['parseJsonLoose whitespace -> null', parseJsonLoose('   \n  ') === null])

  // parseQuizItems
  {
    const good = JSON.stringify([
      {
        question: 'Was ist eine Cauchy-Folge?',
        choices: ['A', 'B', 'C', 'D'],
        answer: 2,
        explanation: 'weil ...',
        topic: 'Folgen'
      },
      { question: 'Grenzwert von 1/n?', choices: ['0', '1'], answer: 0, explanation: '' }
    ])
    const q = parseQuizItems(good)
    checks.push([
      'parseQuizItems valid array',
      q.length === 2 && q[0].answer === 2 && q[0].choices.length === 4 && q[0].topic === 'Folgen'
    ])
    checks.push([
      'parseQuizItems assigns ids',
      q.every((it) => typeof it.id === 'string' && it.id.length > 0) && q[0].id !== q[1].id
    ])
    checks.push([
      'parseQuizItems {questions:[…]} envelope',
      parseQuizItems(`{"questions": ${good}}`).length === 2
    ])
    checks.push([
      'parseQuizItems fenced',
      parseQuizItems('```json\n' + good + '\n```').length === 2
    ])
    checks.push([
      'parseQuizItems clamps answer over range',
      parseQuizItems(
        JSON.stringify([{ question: 'x', choices: ['a', 'b'], answer: 9, explanation: '' }])
      )[0].answer === 1
    ])
    checks.push([
      'parseQuizItems clamps negative answer',
      parseQuizItems(
        JSON.stringify([{ question: 'x', choices: ['a', 'b'], answer: -3, explanation: '' }])
      )[0].answer === 0
    ])
    checks.push([
      'parseQuizItems string answer',
      parseQuizItems(
        JSON.stringify([{ question: 'x', choices: ['a', 'b', 'c'], answer: '2', explanation: '' }])
      )[0].answer === 2
    ])
    checks.push([
      'parseQuizItems drops <2 choices / missing question',
      parseQuizItems(
        JSON.stringify([
          { question: 'nur eine', choices: ['a'], answer: 0 },
          { choices: ['a', 'b'], answer: 0 }
        ])
      ).length === 0
    ])
    checks.push([
      'parseQuizItems focus topic fallback',
      parseQuizItems(
        JSON.stringify([{ question: 'x', choices: ['a', 'b'], answer: 0 }]),
        'Reihen'
      )[0].topic === 'Reihen'
    ])
    checks.push(['parseQuizItems garbage -> []', parseQuizItems('kein json').length === 0])
    checks.push(['parseQuizItems object (not array) -> []', parseQuizItems('{"a":1}').length === 0])
  }

  // parseStudyPlan
  {
    const plan = parseStudyPlan(
      JSON.stringify({
        markdown: '# Plan\nErst Grundlagen …',
        tasks: [
          {
            date: '2026-02-01',
            time: '9:00',
            title: 'Kap. 1',
            topic: 'Basis',
            minutes: 90,
            kind: 'lernen'
          },
          { date: 'Montag', title: 'kaputt', minutes: 60 },
          { date: '2026-02-03', title: '', minutes: 60 },
          { date: '2026-02-04', title: 'zu lang', minutes: 999, kind: 'bogus' },
          { date: '2026-02-05', title: 'zu kurz', minutes: 2, kind: 'quiz' }
        ]
      })
    )
    checks.push(['parseStudyPlan keeps markdown', plan.markdown.startsWith('# Plan')])
    checks.push(['parseStudyPlan drops bad rows', plan.tasks.length === 3])
    checks.push([
      'parseStudyPlan pads time',
      plan.tasks[0].time === '09:00' && plan.tasks[0].kind === 'lernen'
    ])
    checks.push([
      'parseStudyPlan clamps minutes high',
      plan.tasks[1].minutes === 240 && plan.tasks[1].kind === 'lernen'
    ])
    checks.push([
      'parseStudyPlan clamps minutes low',
      plan.tasks[2].minutes === 15 && plan.tasks[2].kind === 'quiz'
    ])
    checks.push([
      'parseStudyPlan fresh ids + not done',
      plan.tasks.every((t) => t.id && t.done === false) && plan.tasks[0].id !== plan.tasks[1].id
    ])
    checks.push([
      'parseStudyPlan garbage -> text + no tasks',
      parseStudyPlan('Hier ist dein Plan …').tasks.length === 0 &&
        parseStudyPlan('Hier ist dein Plan …').markdown === 'Hier ist dein Plan …'
    ])
    checks.push([
      'parseStudyPlan tasks not array',
      parseStudyPlan('{"markdown":"x","tasks":"nein"}').tasks.length === 0
    ])
    const many = parseStudyPlan(
      JSON.stringify({
        markdown: 'm',
        tasks: Array.from({ length: 90 }, (_, i) => ({
          date: '2026-03-01',
          title: `T${i}`,
          minutes: 60
        }))
      })
    )
    checks.push(['parseStudyPlan caps oversized list', many.tasks.length === 60])
    checks.push([
      'parseStudyPlan fenced',
      parseStudyPlan('```json\n{"markdown":"m","tasks":[]}\n```').markdown === 'm'
    ])
  }

  // parseNextStep
  checks.push([
    'parseNextStep valid',
    parseNextStep('{"text":"Mach ein Quiz zu Reihen.","action":"quiz","topic":"Reihen"}').action ===
      'quiz'
  ])
  checks.push([
    'parseNextStep bad action -> review',
    parseNextStep('{"text":"x","action":"panik"}').action === 'review'
  ])
  checks.push([
    'parseNextStep garbage -> review + text',
    (() => {
      const n = parseNextStep('Du bist fast bereit, wiederhol nur noch Kap. 3.')
      return n.action === 'review' && n.text.startsWith('Du bist fast bereit')
    })()
  ])
  checks.push([
    'parseNextStep missing text -> default',
    parseNextStep('{"action":"ready"}').text === 'Weiter üben.'
  ])
  checks.push([
    'parseNextStep empty topic -> undefined',
    parseNextStep('{"text":"x","action":"ready","topic":""}').topic === undefined
  ])

  // parseRescheduleMoves
  {
    const today = '2026-01-10'
    const overdueIds = ['t1', 't2', 't3']
    const moves = parseRescheduleMoves(
      JSON.stringify([
        { id: 't1', date: '2026-01-12', time: '16:00' },
        { id: 't2', date: '2026-01-05', time: '16:00' }, // Vergangenheit -> raus
        { id: 't1', date: '2026-01-20', time: '17:00' }, // Dublette -> raus
        { id: 'fremd', date: '2026-01-15' }, // unbekannte id -> raus
        { id: 't3', date: '2026-01-14', time: 'abends' } // Zeit ungültig -> undefined
      ]),
      overdueIds,
      today
    )
    checks.push([
      'parseRescheduleMoves keeps only valid future known ids',
      moves.length === 2 &&
        moves[0].id === 't1' &&
        moves[0].date === '2026-01-12' &&
        moves[1].id === 't3' &&
        moves[1].time === undefined
    ])
    checks.push([
      'parseRescheduleMoves {moves:[…]} envelope',
      parseRescheduleMoves('{"moves":[{"id":"t1","date":"2026-02-01"}]}', overdueIds, today)
        .length === 1
    ])
    checks.push([
      'parseRescheduleMoves today itself excluded',
      parseRescheduleMoves(JSON.stringify([{ id: 't1', date: today }]), overdueIds, today)
        .length === 0
    ])
    checks.push([
      'parseRescheduleMoves garbage -> []',
      parseRescheduleMoves('nichts', overdueIds, today).length === 0
    ])
    checks.push([
      'parseRescheduleMoves fenced',
      parseRescheduleMoves(
        '```json\n[{"id":"t2","date":"2026-01-30","time":"9:30"}]\n```',
        overdueIds,
        today
      )[0].time === '09:30'
    ])
  }

  // parseSemesterSetup
  {
    const setup = parseSemesterSetup(
      JSON.stringify({
        semester: 'WS 2025',
        courses: [
          { name: '  Analysis   I  ', ects: 9, examDateIso: '2026-02-10' },
          { name: 'Lineare Algebra', ects: 0 }, // ects ungültig -> weg
          { name: 'analysis i', ects: 9 }, // Dublette (case-insensitive) -> weg
          { name: 'Technische Informatik', ects: 50 }, // ects ausserhalb -> undefined
          { name: 'X', ects: 5 }, // Name zu kurz -> weg
          { name: 'Datenbanken', examDateIso: '10.02.2026' } // Datum falsch -> undefined
        ]
      })
    )
    checks.push(['parseSemesterSetup semester', setup.semester === 'WS 2025'])
    checks.push([
      'parseSemesterSetup normalizes + dedupes names',
      setup.courses.length === 4 && setup.courses[0].name === 'Analysis I'
    ])
    checks.push([
      'parseSemesterSetup keeps valid ects only',
      setup.courses[0].ects === 9 &&
        setup.courses.find((c) => c.name === 'Lineare Algebra')?.ects === undefined &&
        setup.courses.find((c) => c.name === 'Technische Informatik')?.ects === undefined
    ])
    checks.push([
      'parseSemesterSetup validates exam date',
      setup.courses[0].examDateIso === '2026-02-10' &&
        setup.courses.find((c) => c.name === 'Datenbanken')?.examDateIso === undefined
    ])
    checks.push([
      'parseSemesterSetup garbage -> empty',
      parseSemesterSetup('kein json').semester === '' &&
        parseSemesterSetup('kein json').courses.length === 0
    ])
    checks.push([
      'parseSemesterSetup fenced + prose',
      parseSemesterSetup(
        'Hier:\n```json\n{"semester":"SS 2026","courses":[{"name":"Stochastik","ects":6}]}\n```'
      ).courses[0].name === 'Stochastik'
    ])
    const big = parseSemesterSetup(
      JSON.stringify({
        semester: 'S',
        courses: Array.from({ length: 60 }, (_, i) => ({ name: `Modul ${i}`, ects: 5 }))
      })
    )
    checks.push(['parseSemesterSetup caps at 40', big.courses.length === 40])
  }

  /* ── „Fragen"-Dialog: bleibt erhalten und übersteht den iCloud-Merge ──── */
  {
    const cm = (id: string, role: 'user' | 'model', at: string): ChatMessage => ({
      id,
      role,
      text: `${role} ${id}`,
      at
    })
    checks.push([
      'trimChat caps at CHAT_LIMIT',
      trimChat(
        Array.from({ length: CHAT_LIMIT + 8 }, (_, i) =>
          cm(`m${i}`, i % 2 ? 'model' : 'user', `2026-01-01T00:${String(i).padStart(2, '0')}:00Z`)
        )
      ).length === CHAT_LIMIT
    ])
    checks.push([
      'trimChat keeps newest',
      trimChat([cm('a', 'user', '2026-01-01T00:00:00Z'), cm('b', 'model', '2026-01-01T00:01:00Z')])
        .length === 2
    ])

    const macSide = [
      cm('q1', 'user', '2026-01-01T10:00:00Z'),
      cm('a1', 'model', '2026-01-01T10:00:05Z')
    ]
    const phoneSide = [
      cm('q1', 'user', '2026-01-01T10:00:00Z'), // dieselbe Frage, beide Geräte
      cm('a1', 'model', '2026-01-01T10:00:05Z'),
      cm('q2', 'user', '2026-01-01T11:00:00Z'), // nur auf dem Handy gestellt
      cm('a2', 'model', '2026-01-01T11:00:04Z')
    ]
    const mc = mergeChat(macSide, phoneSide)
    checks.push([
      'mergeChat unions by id, chronological',
      mc.map((m) => m.id).join(',') === 'q1,a1,q2,a2'
    ])
    checks.push([
      'mergeChat newer timestamp wins on id clash',
      mergeChat(
        [{ id: 'x', role: 'model', text: 'alt', at: '2026-01-01T00:00:00Z' }],
        [{ id: 'x', role: 'model', text: 'neu', at: '2026-01-02T00:00:00Z' }]
      )[0].text === 'neu'
    ])
    checks.push([
      'mergeChat keeps input order when timestamps tie',
      mergeChat(
        [
          { id: 'q1', role: 'user', text: 'Q1', at: '2026-01-01T00:00:00Z' },
          { id: 'a1', role: 'model', text: 'A1', at: '2026-01-01T00:00:00Z' },
          { id: 'q2', role: 'user', text: 'Q2', at: '2026-01-01T00:00:00Z' },
          { id: 'a2', role: 'model', text: 'A2', at: '2026-01-01T00:00:00Z' }
        ],
        null
      )
        .map((m) => m.id)
        .join(',') === 'q1,a1,q2,a2'
    ])
    checks.push([
      'mergeChat drops junk',
      mergeChat([{ id: '', role: 'user', text: 'x', at: '' }] as ChatMessage[], null).length === 0
    ])
    checks.push(['mergeChat both empty', mergeChat(null, undefined).length === 0])
    // Speichern liest die Datei erneut und merged sie mit sich selbst – die
    // Reihenfolge einer Q/A/Q/A-Unterhaltung mit identischen Zeitstempeln (Demo!)
    // darf dabei nicht zu Q/Q/A/A verrutschen.
    {
      const convo = [
        cm('m1', 'user', '2026-03-01T09:00:00Z'),
        cm('m2', 'model', '2026-03-01T09:00:00Z'),
        cm('m3', 'user', '2026-03-01T09:00:00Z'),
        cm('m4', 'model', '2026-03-01T09:00:00Z')
      ]
      checks.push([
        'mergeChat self-merge keeps conversation order',
        mergeChat(convo, [...convo])
          .map((m) => m.id)
          .join(',') === 'm1,m2,m3,m4'
      ])
    }

    // Der Verlauf überlebt mergeProgress (Struktur-Basis ist das Handy ohne die
    // jüngste Mac-Frage).
    const gA = emptyLernplan('S', 'K')
    const gB: typeof gA = JSON.parse(JSON.stringify(gA))
    gA.chat = [...macSide, cm('q3', 'user', '2026-01-01T12:00:00Z')]
    gA.updated = '2026-01-01T09:00:00Z'
    gB.chat = phoneSide
    gB.updated = '2026-01-02T00:00:00Z'
    const gm = mergeProgress(gA, gB)
    checks.push([
      'mergeProgress keeps chat from both sides',
      (gm.chat ?? []).map((m) => m.id).join(',') === 'q1,a1,q2,a2,q3'
    ])

    // parseLernplan liest den Verlauf und vergibt fehlende IDs.
    const pl = parseLernplan(
      JSON.stringify({
        ...emptyLernplan('S', 'K'),
        chat: [
          { role: 'user', text: 'Was ist eine Basis?', at: '2026-01-01T00:00:00Z' },
          { role: 'model', text: 'Eine **Basis** ist …', at: '2026-01-01T00:00:03Z' },
          { role: 'bogus', text: 'ignorier mich' },
          { role: 'user' }
        ]
      })
    )
    checks.push([
      'parseLernplan reads chat, drops invalid',
      !!pl && (pl.chat ?? []).length === 2 && (pl.chat ?? []).every((m) => m.id.length > 0)
    ])
    checks.push([
      'parseLernplan chat missing -> []',
      Array.isArray(parseLernplan(JSON.stringify(emptyLernplan('S', 'K')))?.chat)
    ])
  }

  /* ── Lernplan-Entwurf übernehmen: erledigte Aufgaben bleiben erhalten ─── */
  {
    let idc = 0
    const t = (title: string, done?: boolean, extra?: Partial<PlanTask>): PlanTask => ({
      id: `ct${idc++}`,
      date: '2026-02-01',
      title,
      topic: '',
      minutes: 60,
      done,
      ...extra
    })
    const prev = [
      t('Kapitel 1: Grundlagen', true, { doneAt: '2026-01-20T10:00:00Z' }),
      t('Kapitel 2: Reihen', true, { score: { correct: 8, total: 10 } }),
      t('Altklausur', false)
    ]
    const next = [
      t('kapitel 1: grundlagen'), // andere Groß-/Kleinschreibung → trotzdem als erledigt erkannt
      t('Kapitel 2: Reihen'),
      t('Kapitel 3: Konvergenz'), // neu → offen
      t('Altklausur') // war offen → bleibt offen
    ]
    const merged = carryDoneByTitle(prev, next)
    checks.push([
      'carryDoneByTitle marks matching titles done',
      merged[0].done === true &&
        merged[0].doneAt === '2026-01-20T10:00:00Z' &&
        merged[1].done === true
    ])
    checks.push([
      'carryDoneByTitle carries score',
      merged[1].score?.correct === 8 && merged[1].score?.total === 10
    ])
    checks.push([
      'carryDoneByTitle leaves new/open tasks untouched',
      !merged[2].done && !merged[3].done
    ])
    checks.push([
      'carryDoneByTitle empty prev = no change',
      carryDoneByTitle([], next).every((x) => !x.done)
    ])
  }

  /* ── Lernstrategie-Digest für die KI-Auswertung ──────────────────────── */
  {
    checks.push(['buildTacticsDigest empty when nothing graded', buildTacticsDigest([]) === ''])
    const rs: FachResult[] = [
      {
        semester: 'WS 2023',
        kurs: 'Mathe I',
        ects: 8,
        components: [{ id: '1', title: 'Klausur', mode: 'grade', grade: 2.7, weightPct: 100 }],
        prep: {
          plannedTasks: 10,
          doneTasks: 5,
          quizAccuracy: 0.55,
          examDateIso: '2024-02-10'
        }
      },
      {
        semester: 'WS 2024',
        kurs: 'Lineare Algebra',
        ects: 9,
        components: [
          { id: '2', title: 'Midterm', mode: 'grade', grade: 2.0, weightPct: 30 },
          { id: '3', title: 'Endklausur', mode: 'grade', grade: 1.7, weightPct: 70 }
        ],
        prep: { plannedTasks: 12, doneTasks: 12, quizAccuracy: 0.9, examDateIso: '2025-02-12' }
      },
      {
        semester: 'WS 2024',
        kurs: 'Ohne Prep',
        ects: 5,
        components: [{ id: '4', title: 'K', mode: 'grade', grade: 3.0, weightPct: 100 }]
      }
    ]
    const dig = buildTacticsDigest(rs)
    checks.push([
      'buildTacticsDigest has overall line',
      /Gesamtschnitt \(ECTS-gewichtet\)/.test(dig)
    ])
    checks.push([
      'buildTacticsDigest lists semesters chronologically',
      dig.indexOf('WS 2023') < dig.indexOf('WS 2024')
    ])
    checks.push([
      'buildTacticsDigest shows effort + quiz per Fach',
      dig.includes('Lernaufgaben 5/10 erledigt (50 %)') && dig.includes('Quiz-Sicherheit 55 %')
    ])
    checks.push([
      'buildTacticsDigest notes missing snapshot',
      dig.includes('Ohne Prep') && dig.includes('kein Lernplan-Schnappschuss')
    ])
    checks.push([
      'buildTacticsDigest names multi-component weighting',
      dig.includes('2 Teilleistungen') &&
        dig.includes('Midterm 30 %') &&
        dig.includes('Endklausur 70 %')
    ])
    checks.push([
      'buildTacticsDigest orders Fächer by date (Mathe I before Lineare Algebra)',
      dig.lastIndexOf('- Mathe I (') < dig.lastIndexOf('- Lineare Algebra (')
    ])
  }

  /* ── macOS-Widget-Schnappschuss ─────────────────────────────────────── */
  {
    const now = new Date('2026-03-01T09:00:00Z')
    checks.push(['daysBetween today', daysBetween(now, '2026-03-01T20:00:00Z') === 0])
    checks.push(['daysBetween future', daysBetween(now, '2026-03-11T06:00:00Z') === 10])
    checks.push(['daysBetween past', daysBetween(now, '2026-02-27T12:00:00Z') === -2])
    checks.push([
      'shortTip picks the actionable line',
      shortTip('## Was gut läuft\nAlles super hier.\n## Woran es hakt\nZu wenig Aufwand.') ===
        'Zu wenig Aufwand.'
    ])
    checks.push([
      'shortTip caps length',
      shortTip('x'.repeat(400), 50).length === 50 && shortTip('x'.repeat(400), 50).endsWith('…')
    ])

    const empty: WidgetInputs = {
      configured: false,
      studienordner: null,
      now,
      results: [],
      exams: [],
      tactics: null,
      metas: [],
      todayTasks: [],
      todayEvents: [],
      overdueCount: 0
    }
    const es = buildWidgetSnapshot(empty)
    checks.push([
      'widget snapshot empty is safe',
      es.v === 1 &&
        es.configured === false &&
        es.gpa === null &&
        es.gpaLabel === '–' &&
        es.nextExam === null &&
        es.today.tasks.length === 0 &&
        es.tip === null
    ])

    const full: WidgetInputs = {
      configured: true,
      studienordner: '/Users/x/Studium',
      now,
      results: [
        {
          semester: 'WS 2025',
          kurs: 'Analysis I',
          ects: 9,
          components: [{ id: '1', title: 'K', mode: 'grade', grade: 2.0, weightPct: 100 }]
        },
        {
          semester: 'SS 2026',
          kurs: 'Stochastik',
          ects: 6,
          components: [{ id: '2', title: 'K', mode: 'grade', grade: 1.7, weightPct: 100 }]
        }
      ],
      exams: [
        {
          examKey: 'a',
          title: 'Klausur Stochastik',
          dateIso: '2026-03-15T09:00:00Z',
          semester: 'SS 2026',
          kurs: 'Stochastik'
        },
        {
          examKey: 'b',
          title: 'Nachklausur Analysis',
          dateIso: '2026-02-01T09:00:00Z', // Vergangenheit -> ignoriert
          semester: 'WS 2025',
          kurs: 'Analysis I'
        }
      ],
      tactics: {
        text: '## Was gut läuft\nStark.\n## Woran es hakt\nReihen üben.',
        at: '2026-02-20'
      },
      metas: [
        {
          semester: 'SS 2026',
          kurs: 'Stochastik',
          taskTotal: 10,
          taskDone: 4,
          correctRate: 0.7,
          gradedCount: 20
        }
      ],
      todayTasks: [
        {
          semester: 'SS 2026',
          kurs: 'Stochastik',
          id: 't1',
          title: 'Verteilungen',
          time: '9:30',
          minutes: 60,
          kind: 'lernen',
          done: false
        },
        {
          semester: 'SS 2026',
          kurs: 'Stochastik',
          id: 't2',
          title: 'Quiz',
          kind: 'quiz',
          done: true
        }
      ],
      todayEvents: [{ time: '08:15', title: 'Stochastik – Vorlesung' }],
      overdueCount: 3
    }
    const s = buildWidgetSnapshot(full)
    checks.push(['widget gpa ects-weighted', s.gpaLabel === '1,9' && s.credits === 15])
    checks.push([
      'widget next exam = earliest future',
      s.nextExam?.title === 'Klausur Stochastik' && s.nextExam?.daysLeft === 14
    ])
    checks.push([
      'widget today tasks normalised',
      s.today.tasks.length === 2 && s.today.tasks[0].time === '09:30' && s.today.openCount === 1
    ])
    checks.push(['widget overdue carried', s.overdueCount === 3])
    checks.push([
      'widget quiz accuracy from metas',
      s.quizAccuracy !== null && Math.abs(s.quizAccuracy - 0.7) < 1e-9
    ])
    checks.push([
      'widget trend chronological',
      s.gradeTrend.map((r) => r.label).join(',') === 'WS 2025,SS 2026' &&
        s.currentSemesterLabel === 'SS 2026'
    ])
    checks.push(['widget tip shortened', s.tip === 'Reihen üben.' && s.tipDateIso === '2026-02-20'])
  }

  const failedNames = checks.filter(([, ok]) => !ok).map(([n]) => n)
  if (failedNames.length === 0) {
    console.log(`SPTEST OK (${checks.length} Prüfungen)`)
  } else {
    console.log('SPTEST FAIL: ' + failedNames.join(', '))
  }
  return { ok: failedNames.length === 0, total: checks.length, failed: failedNames }
}
