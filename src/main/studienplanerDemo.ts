import { app } from 'electron'
import { mkdir, rm, stat, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { CalEvent } from '../shared/types'

/**
 * Demo-Modus: legt unter dem App-Datenordner einen kompletten Beispiel-
 * Studienordner an (Semester, Kurse, Notizen, Lernpläne mit Quizzes, Aufgaben,
 * Zusammenfassungen, Material) plus ein paar Fake-Kalendertermine. Alles läuft
 * über dieselben Codepfade wie echte Daten – nur eben in einem Sandbox-Ordner.
 */

export function demoDir(): string {
  return join(app.getPath('userData'), 'Studienplaner-Demo')
}

const DEMO_CAL_ID = 'astra-demo-cal'
const DEMO_CAL_TITLE = 'Studium (Demo)'
const DEMO_CAL_COLOR = '#5b8cff'

/** ISO-Zeitpunkt in `offset` Tagen ab jetzt, auf hh:mm gesetzt. */
function at(offsetDays: number, hour = 16, min = 0): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  d.setHours(hour, min, 0, 0)
  return d.toISOString()
}
function ymd(offsetDays: number): string {
  return at(offsetDays, 12).slice(0, 10)
}

/** Muss identisch zu `examKeyOf` in src/renderer/studienplaner/prep.ts sein. */
function examKey(title: string, dateIso: string): string {
  const norm = title
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9]+/gi, ' ')
    .trim()
  return `${norm}|${new Date(dateIso).toISOString().slice(0, 10)}`
}

function ev(
  id: string,
  title: string,
  startIso: string,
  minutes: number,
  allDay = false
): CalEvent {
  return {
    id,
    title,
    start: startIso,
    end: new Date(new Date(startIso).getTime() + minutes * 60000).toISOString(),
    allDay,
    calendarId: DEMO_CAL_ID,
    calendarTitle: DEMO_CAL_TITLE,
    color: DEMO_CAL_COLOR
  }
}

interface NoteSpec {
  sem: string
  kurs: string
  file: string
  thema: string
  text: string
}

const NOTES: NoteSpec[] = [
  {
    sem: 'WS 2024',
    kurs: 'Analysis I',
    file: 'Konvergenz.txt',
    thema: 'Konvergenz von Folgen',
    text:
      'Eine Folge a_n konvergiert gegen a, wenn es zu jedem epsilon > 0 ein N gibt, sodass |a_n - a| < epsilon fuer alle n >= N. ' +
      'Beispiel: 1/n konvergiert gegen 0. Monotone und beschraenkte Folgen konvergieren (Satz von der monotonen Konvergenz).'
  },
  {
    sem: 'WS 2024',
    kurs: 'Analysis I',
    file: 'Ableitungen.txt',
    thema: 'Ableitungsregeln',
    text:
      'Produktregel: Ableitung von f mal g ist f-Strich mal g plus f mal g-Strich. ' +
      'Kettenregel: aeussere Ableitung an der inneren Funktion mal innere Ableitung. ' +
      'Mittelwertsatz: es gibt ein xi mit Steigung gleich (f(b)-f(a))/(b-a).'
  },
  {
    sem: 'WS 2024',
    kurs: 'Lineare Algebra I',
    file: 'Vektorraeume.txt',
    thema: 'Vektorräume und Basen',
    text:
      'Ein Vektorraum ueber einem Koerper K erfuellt die Axiome fuer Addition und Skalarmultiplikation. ' +
      'Eine Basis ist ein linear unabhaengiges Erzeugendensystem; die Dimension ist die Anzahl der Basisvektoren.'
  },
  {
    sem: 'WS 2024',
    kurs: 'Lineare Algebra I',
    file: 'Determinanten.txt',
    thema: 'Determinanten',
    text:
      'Die Determinante ist multilinear und alternierend. det(AB) = det(A) det(B). ' +
      'Eine Matrix ist genau dann invertierbar, wenn ihre Determinante ungleich 0 ist.'
  },
  {
    sem: 'WS 2024',
    kurs: 'Programmierung',
    file: 'Rekursion.txt',
    thema: 'Rekursion',
    text:
      'Eine rekursive Funktion ruft sich selbst mit kleinerer Eingabe auf und braucht einen Basisfall. ' +
      'Beispiel Fakultaet: fac(0) = 1, fac(n) = n * fac(n-1). Achtung vor unbeschraenkter Rekursion (Stackoverflow).'
  },
  {
    sem: 'SS 2025',
    kurs: 'Analysis II',
    file: 'Grenzwerte.txt',
    thema: 'Grenzwerte mehrdimensional',
    text:
      'Fuer Funktionen f: R^n -> R^m bedeutet Grenzwert: f(x) -> L, wenn x -> x0 laengs jeder Kurve. ' +
      'Existiert der Grenzwert entlang zweier Wege verschieden, so existiert er nicht. Polarkoordinaten helfen bei (x,y) -> (0,0).'
  },
  {
    sem: 'SS 2025',
    kurs: 'Analysis II',
    file: 'Stetigkeit.txt',
    thema: 'Stetigkeit und Kompaktheit',
    text:
      'Stetige Funktionen auf kompakten Mengen nehmen Maximum und Minimum an (Satz von Weierstrass). ' +
      'Gleichmaessige Stetigkeit auf Kompakta folgt aus Stetigkeit (Satz von Heine).'
  },
  {
    sem: 'SS 2025',
    kurs: 'Analysis II',
    file: 'Reihen.txt',
    thema: 'Reihen und Konvergenzkriterien',
    text:
      'Quotientenkriterium: konvergiert, wenn limsup |a_{n+1}/a_n| < 1. Wurzelkriterium mit limsup |a_n|^{1/n}. ' +
      'Leibniz-Kriterium fuer alternierende Reihen. Absolute Konvergenz impliziert Konvergenz. Potenzreihen haben einen Konvergenzradius.'
  },
  {
    sem: 'SS 2025',
    kurs: 'Stochastik',
    file: 'Zufallsvariablen.txt',
    thema: 'Zufallsvariablen',
    text:
      'Erwartungswert E[X] = Summe x * P(X = x). Varianz Var(X) = E[X^2] - E[X]^2. ' +
      'Linearitaet des Erwartungswerts gilt immer, Var(X+Y) = Var(X) + Var(Y) nur bei Unabhaengigkeit.'
  },
  {
    sem: 'SS 2025',
    kurs: 'Theoretische Informatik',
    file: 'Automaten.txt',
    thema: 'Endliche Automaten',
    text:
      'Ein DFA akzeptiert regulaere Sprachen. NFA und DFA sind gleich maechtig (Potenzmengenkonstruktion). ' +
      'Das Pumping-Lemma zeigt, dass Sprachen wie {a^n b^n} nicht regulaer sind.'
  }
]

interface PlanSpec {
  file: string // relativer Pfad zur lernplan.json
  data: Record<string, unknown>
}

function buildPlans(): { plans: PlanSpec[]; exams: Record<string, unknown>; events: CalEvent[] } {
  const ana2ExamIso = at(7, 9, 0)
  const ana1ExamIso = at(-40, 9, 0)
  const praesiIso = at(3, 11, 0)

  const ana2Key = examKey('Klausur Analysis II', ana2ExamIso)
  const ana1Key = examKey('Klausur Analysis I', ana1ExamIso)

  const q1items = [
    {
      id: 'q1i1',
      question: 'Wann konvergiert eine Reihe nach dem Quotientenkriterium?',
      choices: [
        'wenn limsup |a_{n+1}/a_n| < 1',
        'wenn a_n -> 0',
        'immer bei alternierenden Reihen',
        'wenn a_n monoton faellt'
      ],
      answer: 0,
      explanation: 'Grenzwert des Quotienten strikt kleiner 1.',
      topic: 'Reihen'
    },
    {
      id: 'q1i2',
      question: 'Was besagt der Satz von Weierstrass?',
      choices: [
        'Stetige Funktionen auf Kompakta nehmen Max und Min an',
        'Jede Folge hat einen Grenzwert',
        'Differenzierbarkeit folgt aus Stetigkeit',
        'Reihen konvergieren absolut'
      ],
      answer: 0,
      explanation: 'Extrema werden auf kompakten Mengen angenommen.',
      topic: 'Stetigkeit'
    },
    {
      id: 'q1i3',
      question: 'Der Grenzwert von (x*y)/(x^2+y^2) fuer (x,y) -> (0,0) …',
      choices: ['existiert nicht (wegabhaengig)', 'ist 0', 'ist 1/2', 'ist unendlich'],
      answer: 0,
      explanation: 'Entlang y = x ergibt sich 1/2, entlang y = 0 ergibt sich 0.',
      topic: 'Grenzwerte'
    },
    {
      id: 'q1i4',
      question: 'Absolute Konvergenz einer Reihe …',
      choices: [
        'impliziert Konvergenz',
        'ist schwaecher als Konvergenz',
        'gilt nur fuer endliche Reihen',
        'ist aequivalent zu a_n -> 0'
      ],
      answer: 0,
      explanation: 'Absolute Konvergenz ist die staerkere Eigenschaft.',
      topic: 'Reihen'
    },
    {
      id: 'q1i5',
      question: 'Was liefert das Wurzelkriterium?',
      choices: [
        'Konvergenz, wenn limsup |a_n|^{1/n} < 1',
        'Divergenz, wenn a_n > 0',
        'Konvergenz bei jeder Nullfolge',
        'nichts Verwertbares'
      ],
      answer: 0,
      explanation: 'n-te Wurzel des Betrags, limsup < 1.',
      topic: 'Reihen'
    },
    {
      id: 'q1i6',
      question: 'Heine-Satz: gleichmaessige Stetigkeit gilt …',
      choices: [
        'fuer stetige Funktionen auf kompakten Mengen',
        'nie',
        'nur fuer lineare Funktionen',
        'fuer alle differenzierbaren Funktionen'
      ],
      answer: 0,
      explanation: 'Stetig auf Kompaktum => gleichmaessig stetig.',
      topic: 'Stetigkeit'
    }
  ]
  const q2items = [
    {
      id: 'q2i1',
      question: 'Konvergenzradius von Summe x^n / n! …',
      choices: ['unendlich', '1', '0', 'e'],
      answer: 0,
      explanation: 'Das ist exp(x), ueberall konvergent.',
      topic: 'Reihen'
    },
    {
      id: 'q2i2',
      question: 'Leibniz-Kriterium braucht …',
      choices: [
        'monoton fallende Nullfolge, alternierend',
        'positive Glieder',
        'absolute Konvergenz',
        'beschraenkte Partialsummen'
      ],
      answer: 0,
      explanation: 'Alternierend + monoton fallend gegen 0.',
      topic: 'Reihen'
    },
    {
      id: 'q2i3',
      question: 'Umordnung einer nur bedingt konvergenten Reihe …',
      choices: [
        'kann den Grenzwert aendern (Riemann)',
        'aendert nie etwas',
        'ist verboten',
        'macht sie divergent'
      ],
      answer: 0,
      explanation: 'Riemannscher Umordnungssatz.',
      topic: 'Reihen'
    },
    {
      id: 'q2i4',
      question: 'Potenzreihe ist im Innern des Konvergenzkreises …',
      choices: ['gliedweise differenzierbar', 'nur stetig', 'divergent', 'konstant'],
      answer: 0,
      explanation: 'Innerhalb des Radius darf man gliedweise ableiten.',
      topic: 'Reihen'
    }
  ]

  const now = at(-1)
  const p = (ok: boolean): Record<string, unknown> => ({
    seen: 2,
    correct: ok ? 2 : 0,
    lastCorrect: ok,
    updated: now
  })

  const ana2 = {
    v: 2,
    id: 'demo-ana2',
    name: 'Analysis II',
    semester: 'SS 2025',
    kurs: 'Analysis II',
    examKey: ana2Key,
    examTitle: 'Klausur Analysis II',
    examDateIso: ana2ExamIso,
    summary:
      '## Grenzwerte (mehrdimensional)\n' +
      '**Grenzwert existiert** nur, wenn er entlang *jeder* Kurve gleich ist. Klassischer Test: Wege `y=0` und `y=x`.\n\n' +
      '## Stetigkeit & Kompaktheit\n' +
      '- **Weierstrass:** stetig auf kompakt ⇒ Max/Min werden angenommen.\n' +
      '- **Heine:** stetig auf kompakt ⇒ gleichmäßig stetig.\n\n' +
      '## Reihen\n' +
      '- **Quotientenkriterium:** `limsup |a_{n+1}/a_n| < 1`.\n' +
      '- **Wurzelkriterium:** `limsup |a_n|^{1/n} < 1`.\n' +
      '- **Leibniz:** alternierend + monoton fallende Nullfolge.\n\n' +
      '## Häufige Fallstricke\n' +
      '- Grenzwert nur entlang *einer* Kurve geprüft.\n' +
      '- `a_n → 0` mit Konvergenz verwechselt (notwendig, nicht hinreichend).\n' +
      '- Umordnung bedingt konvergenter Reihen.',
    plan:
      'Schwerpunkt liegt auf **Reihen** – das ist mit ~40 % dein schwächstes Thema. ' +
      'Grenzwerte und Stetigkeit sitzen schon gut und werden nur kurz aufgefrischt. ' +
      'Zwei Tage vor der Klausur eine Altklausur, am Vortag Generalprobe.\n\n' +
      '| Tag | Fokus | Dauer |\n|---|---|---|\n' +
      '| Heute | Grenzwerte auffrischen, Stetigkeitssätze | 105 min |\n' +
      '| Morgen | Reihen: Konvergenzkriterien | 90 min |\n' +
      '| +2 | Übungsquiz Reihen | 30 min |\n' +
      '| +4 | Altklausur unter Zeit | 120 min |\n' +
      '| +6 | Generalprobe & Zusammenfassung | 90 min |',
    planTasks: [
      {
        id: 'd1',
        date: ymd(0),
        time: '16:00',
        title: 'Grenzwerte auffrischen',
        topic: 'Grenzwerte',
        minutes: 45,
        kind: 'wiederholen',
        done: true
      },
      {
        id: 'd2',
        date: ymd(0),
        time: '18:30',
        title: 'Stetigkeit: Sätze üben',
        topic: 'Stetigkeit',
        minutes: 60,
        kind: 'lernen',
        done: false
      },
      {
        id: 'd3',
        date: ymd(1),
        time: '17:00',
        title: 'Reihen: Konvergenzkriterien',
        topic: 'Reihen',
        minutes: 90,
        kind: 'lernen',
        done: false
      },
      {
        id: 'd4',
        date: ymd(2),
        time: '17:00',
        title: 'Übungsquiz Reihen',
        topic: 'Reihen',
        minutes: 30,
        kind: 'quiz',
        done: false
      },
      {
        id: 'd5',
        date: ymd(4),
        time: '16:00',
        title: 'Altklausur unter Zeit rechnen',
        topic: 'Gemischt',
        minutes: 120,
        kind: 'wiederholen',
        done: false
      },
      {
        id: 'd6',
        date: ymd(6),
        time: '15:00',
        title: 'Generalprobe & Zusammenfassung',
        topic: 'Gemischt',
        minutes: 90,
        kind: 'wiederholen',
        done: false
      }
    ],
    plannedAt: null,
    quizzes: [
      { id: 'q1', name: 'Grundlagen', created: at(-3), items: q1items },
      { id: 'q2', name: 'Reihen vertieft', created: at(-1), items: q2items }
    ],
    progress: {
      q1i1: p(false),
      q1i2: p(true),
      q1i3: p(true),
      q1i4: p(false),
      q1i5: p(false),
      q1i6: p(true),
      q2i1: p(true),
      q2i2: p(false)
    },
    resources: [
      {
        id: 'r1',
        title: '3Blue1Brown – Essence of Calculus',
        url: 'https://www.youtube.com/watch?v=WUvTyaaNkzM'
      },
      {
        id: 'r2',
        title: 'Vorlesungsskript Analysis II (PDF)',
        url: 'https://example.org/skript-analysis-2.pdf'
      }
    ],
    sources: [],
    useCalendar: true,
    created: at(-12),
    updated: at(-1)
  }

  const ana1 = {
    v: 2,
    id: 'demo-ana1',
    name: 'Analysis I',
    semester: 'WS 2024',
    kurs: 'Analysis I',
    examKey: ana1Key,
    examTitle: 'Klausur Analysis I',
    examDateIso: ana1ExamIso,
    summary:
      '## Folgen & Konvergenz\n**epsilon-N-Definition**, monotone beschränkte Folgen konvergieren.\n\n' +
      '## Ableitung\nProdukt-, Ketten-, Quotientenregel; Mittelwertsatz.\n\n## Häufige Fallstricke\n- Grenzwert raten statt zeigen.',
    plan:
      'Rückblick: Plan wurde vollständig abgearbeitet, Klausur ist geschrieben. Dient hier als Beispiel für einen **abgeschlossenen** Lernplan.\n\n' +
      '- Folgen & Reihen\n- Stetigkeit\n- Ableitung & Kurvendiskussion\n- Altklausuren',
    planTasks: [
      {
        id: 'a1',
        date: ymd(-45),
        time: '16:00',
        title: 'Folgen & Grenzwerte',
        topic: 'Folgen',
        minutes: 90,
        kind: 'lernen',
        done: true
      },
      {
        id: 'a2',
        date: ymd(-44),
        time: '16:00',
        title: 'Stetigkeit',
        topic: 'Stetigkeit',
        minutes: 90,
        kind: 'lernen',
        done: true
      },
      {
        id: 'a3',
        date: ymd(-43),
        time: '16:00',
        title: 'Ableitungsregeln üben',
        topic: 'Ableitung',
        minutes: 75,
        kind: 'lernen',
        done: true
      },
      {
        id: 'a4',
        date: ymd(-42),
        time: '15:00',
        title: 'Altklausur',
        topic: 'Gemischt',
        minutes: 120,
        kind: 'wiederholen',
        done: true
      }
    ],
    plannedAt: at(-46),
    quizzes: [
      {
        id: 'aq1',
        name: 'Grundlagen',
        created: at(-46),
        items: [
          {
            id: 'aq1i1',
            question: 'Konvergiert 1/n?',
            choices: ['ja, gegen 0', 'nein', 'gegen 1', 'nur für gerade n'],
            answer: 0,
            explanation: 'Klassische Nullfolge.',
            topic: 'Folgen'
          },
          {
            id: 'aq1i2',
            question: 'Kettenregel für f(g(x)):',
            choices: ["f'(g(x)) * g'(x)", "f'(x) * g'(x)", "f'(g'(x))", "f(g'(x))"],
            answer: 0,
            explanation: 'Äußere mal innere Ableitung.',
            topic: 'Ableitung'
          },
          {
            id: 'aq1i3',
            question: 'Monoton + beschränkt ⇒',
            choices: ['konvergent', 'divergent', 'periodisch', 'unbeschränkt'],
            answer: 0,
            explanation: 'Satz von der monotonen Konvergenz.',
            topic: 'Folgen'
          }
        ]
      }
    ],
    progress: {
      aq1i1: p(true),
      aq1i2: p(true),
      aq1i3: p(true)
    },
    resources: [],
    sources: [],
    useCalendar: false,
    created: at(-50),
    updated: at(-41)
  }

  const linalg = {
    v: 2,
    id: 'demo-linalg',
    name: 'Lineare Algebra I',
    semester: 'WS 2024',
    kurs: 'Lineare Algebra I',
    examKey: null,
    examTitle: null,
    examDateIso: null,
    summary: '',
    plan:
      'Noch keine Prüfung verknüpft – der Plan läuft auf 14 Tage. Beispiel für „**Plan, aber noch keine Quizze**".\n\n' +
      '- Vektorräume & Basen\n- Lineare Abbildungen & Matrizen\n- Determinanten\n- Eigenwerte',
    planTasks: [
      {
        id: 'l1',
        date: ymd(0),
        time: '19:00',
        title: 'Vektorräume & Basen wiederholen',
        topic: 'Vektorräume',
        minutes: 60,
        kind: 'wiederholen',
        done: false
      },
      {
        id: 'l2',
        date: ymd(2),
        time: '18:00',
        title: 'Determinanten: Rechenregeln',
        topic: 'Determinanten',
        minutes: 75,
        kind: 'lernen',
        done: false
      },
      {
        id: 'l3',
        date: ymd(5),
        time: '17:00',
        title: 'Eigenwerte & Diagonalisierung',
        topic: 'Eigenwerte',
        minutes: 90,
        kind: 'lernen',
        done: false
      }
    ],
    plannedAt: null,
    quizzes: [],
    progress: {},
    resources: [
      {
        id: 'lr1',
        title: '3Blue1Brown – Essence of Linear Algebra',
        url: 'https://www.youtube.com/watch?v=fNk_zzaMoSs'
      }
    ],
    sources: [],
    useCalendar: false,
    created: at(-8),
    updated: at(-2)
  }

  const stoch = {
    v: 2,
    id: 'demo-stoch',
    name: 'Stochastik',
    semester: 'SS 2025',
    kurs: 'Stochastik',
    examKey: null,
    examTitle: null,
    examDateIso: null,
    summary:
      '## Erwartungswert & Varianz\n`E[X] = Σ x·P(X=x)`, `Var(X) = E[X²] − E[X]²`.\n' +
      '**Linearität** von E gilt immer; `Var(X+Y)=Var(X)+Var(Y)` nur bei Unabhängigkeit.',
    plan: '',
    planTasks: [],
    plannedAt: null,
    quizzes: [
      {
        id: 'sq1',
        name: 'Grundbegriffe',
        created: at(-2),
        items: [
          {
            id: 'sq1i1',
            question: 'E[aX + b] =',
            choices: ['a·E[X] + b', 'a·E[X]', 'E[X] + b', 'a·E[X] + a·b'],
            answer: 0,
            explanation: 'Linearität des Erwartungswerts.',
            topic: 'Erwartungswert'
          },
          {
            id: 'sq1i2',
            question: 'Var(X) lässt sich schreiben als',
            choices: ['E[X²] − E[X]²', 'E[X]² − E[X²]', 'E[X²]', 'E[|X|]'],
            answer: 0,
            explanation: 'Verschiebungssatz.',
            topic: 'Varianz'
          },
          {
            id: 'sq1i3',
            question: 'Var(X+Y) = Var(X) + Var(Y) gilt',
            choices: ['bei Unabhängigkeit', 'immer', 'nie', 'nur wenn E[X]=E[Y]'],
            answer: 0,
            explanation: 'Kovarianz muss 0 sein.',
            topic: 'Varianz'
          }
        ]
      }
    ],
    progress: {
      sq1i1: p(true),
      sq1i2: p(false)
    },
    resources: [],
    sources: [],
    useCalendar: false,
    created: at(-4),
    updated: at(-1)
  }

  const plans: PlanSpec[] = [
    { file: 'SS 2025/Analysis II/Prüfungsvorbereitung/lernplan.json', data: ana2 },
    { file: 'WS 2024/Analysis I/Prüfungsvorbereitung/lernplan.json', data: ana1 },
    { file: 'WS 2024/Lineare Algebra I/Prüfungsvorbereitung/lernplan.json', data: linalg },
    { file: 'SS 2025/Stochastik/Prüfungsvorbereitung/lernplan.json', data: stoch }
  ]

  const exams: Record<string, unknown> = {
    [ana2Key]: {
      examKey: ana2Key,
      title: 'Klausur Analysis II',
      dateIso: ana2ExamIso,
      semester: 'SS 2025',
      kurs: 'Analysis II'
    },
    [ana1Key]: {
      examKey: ana1Key,
      title: 'Klausur Analysis I',
      dateIso: ana1ExamIso,
      semester: 'WS 2024',
      kurs: 'Analysis I'
    }
  }

  const events: CalEvent[] = [
    ev('demo-l1', 'Analysis II – Vorlesung', at(1, 10, 0), 90),
    ev('demo-l2', 'Analysis II – Übung', at(2, 14, 0), 90),
    ev('demo-l3', 'Stochastik – Vorlesung', at(1, 8, 15), 90),
    ev('demo-l4', 'Theoretische Informatik – Vorlesung', at(3, 10, 0), 90),
    ev('demo-l5', 'Analysis II – Vorlesung', at(6, 10, 0), 90),
    ev('demo-l6', 'Stochastik – Vorlesung', at(8, 8, 15), 90),
    ev('demo-praesi', 'Präsentation Stochastik-Projekt', praesiIso, 45),
    ev('demo-exam-ana2', 'Klausur Analysis II', ana2ExamIso, 120),
    ev('demo-test-ti', 'Test Theoretische Informatik', at(12, 9, 0), 60)
  ]

  return { plans, exams, events }
}

export interface DemoSeedResult {
  dir: string
  calendarEvents: CalEvent[]
}

/**
 * Legt den Demo-Ordner an (falls noch nicht vorhanden) oder baut ihn bei
 * `reset` komplett neu. Gibt Ordnerpfad + Fake-Kalendertermine zurück.
 */
export async function seedDemoStudienplaner(reset: boolean): Promise<DemoSeedResult> {
  const root = demoDir()
  const { plans, exams, events } = buildPlans()

  const marker = join(root, '.astra-studienplaner.json')
  if (reset) {
    await rm(root, { recursive: true, force: true }).catch(() => undefined)
  } else {
    try {
      await stat(marker)
      return { dir: root, calendarEvents: events } // schon da – Fortschritt behalten
    } catch {
      /* neu anlegen */
    }
  }

  const write = async (rel: string, data: string): Promise<void> => {
    const full = join(root, rel)
    await mkdir(dirname(full), { recursive: true })
    await writeFile(full, data, 'utf8')
  }

  // Notizdateien
  for (const n of NOTES) {
    await write(`${n.sem}/${n.kurs}/${n.file}`, `# ${n.thema}\n\n${n.text}\n`)
  }
  // Ein Kurs ganz ohne Notiz/Vorbereitung braucht wenigstens den Ordner
  await mkdir(join(root, 'SS 2025', 'Theoretische Informatik'), { recursive: true })
  await mkdir(join(root, 'WS 2024', 'Programmierung'), { recursive: true })

  // Eingang: eine noch nicht einsortierte „Scan"-Datei
  await write(
    '_Eingang/Scan Vorlesung 12.txt',
    '# Mitschrift\n\nStochastik: Erwartungswert und Varianz, Rechenregeln, Beispiel Wuerfel.\n'
  )

  // Lernpläne je Fach
  for (const pl of plans) {
    await write(pl.file, JSON.stringify(pl.data, null, 2))
  }

  // Index (Volltext-Suche + Prüfungs-Verknüpfungen)
  const entries: Record<string, unknown> = {}
  for (const n of NOTES) {
    const rel = `${n.sem}/${n.kurs}/${n.file}`
    entries[rel] = {
      relPath: rel,
      semester: n.sem,
      kurs: n.kurs,
      thema: n.thema,
      added: at(-6),
      ocrEngine: 'vision',
      text: n.text
    }
  }
  await write(
    '.astra-studienplaner.json',
    JSON.stringify({ v: 1, updated: new Date().toISOString(), entries, exams }, null, 2)
  )

  return { dir: root, calendarEvents: events }
}
