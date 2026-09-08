import type { CalEvent, SpTree } from '@shared/types'
import { detectSemester, safeName, searchIndex, suggestFiling, emptyIndex } from './model'
import { buildAgenda, daysLeftLabel, isExam, upcomingExams } from './calendar'
import {
  analyzeProgress,
  courseNoteList,
  courseNotesText,
  emptyLernplan,
  examKeyOf,
  lernplanMeta,
  mergeProgress,
  parseLernplan,
  perfPromptText,
  weakQuiz
} from './prep'

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

  const noHit = suggestFiling('Einkaufszettel Milch Eier Brot', tree)
  checks.push(['no false course', noHit.kurs === undefined])

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
  const agenda = buildAgenda(evs, 28)
  checks.push(['agenda within window', agenda.every((d) => d.events.length > 0)])
  checks.push([
    'agenda excludes far event',
    !agenda.some((d) => d.events.some((e) => e.id === 'c'))
  ])

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

  const failedNames = checks.filter(([, ok]) => !ok).map(([n]) => n)
  if (failedNames.length === 0) {
    console.log(`SPTEST OK (${checks.length} Prüfungen)`)
  } else {
    console.log('SPTEST FAIL: ' + failedNames.join(', '))
  }
  return { ok: failedNames.length === 0, total: checks.length, failed: failedNames }
}
