import { app } from 'electron'
import { createHash } from 'crypto'
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

/** Winziges, gültiges 1-Seiten-PDF (nur für den Demo-Ordner). */
function minimalPdf(text: string): string {
  const esc = text.replace(/[()\\]/g, '\\$&')
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>',
    '',
    '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'
  ]
  const stream = `BT /F1 18 Tf 72 760 Td (${esc}) Tj ET`
  objs[3] = `<</Length ${stream.length}>>\nstream\n${stream}\nendstream`
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objs.forEach((o, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xrefStart = body.length
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) body += `${String(off).padStart(10, '0')} 00000 n \n`
  body += `trailer\n<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xrefStart}\n%%EOF`
  return body
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
  },
  {
    sem: 'SS 2025',
    kurs: 'Analysis II',
    file: 'Übungsblatt 3.txt',
    thema: 'Übungsblatt 3',
    text:
      'Aufgabe 1: Konvergenzradius der Potenzreihe sum x^n / (n^2). ' +
      'Aufgabe 2: Zeige Stetigkeit von f(x,y) = (x^2 y)/(x^2 + y^2) mit f(0,0)=0. ' +
      'Aufgabe 3: Untersuche die Reihe sum (-1)^n / sqrt(n) auf Konvergenz.'
  },
  {
    sem: 'WS 2024',
    kurs: 'Lineare Algebra I',
    file: 'Übungsblatt 5.txt',
    thema: 'Übungsblatt 5',
    text:
      'Aufgabe 1: Bestimme eine Basis des Kerns der Matrix A. ' +
      'Aufgabe 2: Zeige, dass die Vektoren v1, v2, v3 linear unabhaengig sind. ' +
      'Aufgabe 3: Berechne die Determinante per Laplace-Entwicklung.'
  }
]

interface PlanSpec {
  file: string // relativer Pfad zur lernplan.json
  data: Record<string, unknown>
}

function buildPlans(): { plans: PlanSpec[]; exams: Record<string, unknown>; events: CalEvent[] } {
  const ana2ExamIso = at(7, 9, 0)
  const ana1ExamIso = at(-190, 9, 0)
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
        done: false,
        calEventId: 'demo-ct-d2'
      },
      {
        id: 'd3',
        date: ymd(1),
        time: '17:00',
        title: 'Reihen: Konvergenzkriterien',
        topic: 'Reihen',
        minutes: 90,
        kind: 'lernen',
        done: false,
        calEventId: 'demo-ct-d3'
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
    plannedAt: at(-1),
    quizzes: [
      { id: 'q1', name: 'Grundlagen', created: at(-3), items: q1items },
      { id: 'q2', name: 'Reihen vertieft', created: at(-1), items: q2items }
    ],
    chat: [
      {
        id: 'c1',
        role: 'user',
        text: 'Warum reicht es beim Grenzwert nicht, nur den Weg y = 0 zu prüfen?',
        at: at(-2)
      },
      {
        id: 'c2',
        role: 'model',
        text:
          'Weil der **Grenzwert im Mehrdimensionalen** nur existiert, wenn er entlang *jeder* ' +
          'Annäherung an den Punkt denselben Wert hat.\n\n' +
          '- Der Weg `y = 0` liefert nur *einen* von unendlich vielen möglichen Wegen.\n' +
          '- Bekommst du auf `y = x` einen anderen Wert, existiert der Grenzwert **nicht** – ' +
          'egal wie schön `y = 0` aussieht.\n\n' +
          'Beispiel: `f(x,y) = xy / (x^2 + y^2)`. Auf `y = 0` ist `f = 0`, auf `y = x` ist ' +
          '`f = 1/2`. Zwei Wege, zwei Werte ⇒ kein Grenzwert.',
        at: at(-2)
      },
      {
        id: 'c3',
        role: 'user',
        text: 'Und wie zeige ich sauber, dass ein Grenzwert doch existiert?',
        at: at(-2)
      },
      {
        id: 'c4',
        role: 'model',
        text:
          'Nicht über einzelne Wege – die können ihn nie *beweisen*, nur widerlegen. Stattdessen:\n\n' +
          '1. **Kandidat raten** (oft `0`) über ein, zwei Wege.\n' +
          '2. **Abschätzen:** zeige `|f(x,y) - L| <= g(x,y)` mit `g(x,y) -> 0` für `(x,y) -> (0,0)`.\n' +
          '3. Häufig hilft Polarkoordinaten: `x = r cos t`, `y = r sin t`, dann `r -> 0` ' +
          'unabhängig von `t` abschätzen.',
        at: at(-2)
      }
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
        id: 'l0',
        date: ymd(-2),
        time: '18:00',
        title: 'Lineare Abbildungen: Kern & Bild',
        topic: 'Lineare Abbildungen',
        minutes: 60,
        kind: 'lernen',
        done: false
      },
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
    planTasks: [
      {
        id: 's-od1',
        date: ymd(-3),
        time: '17:00',
        title: 'Quiz Grundbegriffe wiederholen',
        topic: 'Varianz',
        minutes: 20,
        kind: 'quiz',
        done: false
      }
    ],
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
    // Abgeschlossene Prüfung (mit Ergebnis) – für die Prüfungsseite „abgeschlossen".
    ev('demo-exam-ana1', 'Klausur Analysis I', ana1ExamIso, 120),
    ev('demo-test-ti', 'Test Theoretische Informatik', at(12, 9, 0), 60),
    // Aus dem Analysis-II-Lernplan in den Kalender übernommene Lernblöcke (📚) –
    // ihre IDs stimmen mit `calEventId` der Aufgaben d2/d3 überein (Zwei-Wege-Sync).
    ev('demo-ct-d2', '📚 Stetigkeit: Sätze üben', at(0, 18, 30), 60),
    ev('demo-ct-d3', '📚 Reihen: Konvergenzkriterien', at(1, 17, 0), 90)
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

  // Fach → „Informationen" | „Übungen" wie in der App.
  const subOf = (n: NoteSpec): 'Informationen' | 'Übungen' =>
    /übung|blatt|aufgabe/i.test(`${n.file} ${n.thema}`) ? 'Übungen' : 'Informationen'
  const relOf = (n: NoteSpec): string => `${n.sem}/${n.kurs}/${subOf(n)}/${n.file}`

  // Notizdateien (in die Unterordner)
  for (const n of NOTES) {
    await write(relOf(n), `# ${n.thema}\n\n${n.text}\n`)
  }
  // Jedes Fach bekommt beide Unterordner (auch die leeren Fächer)
  const allCourses = [
    ['WS 2024', 'Analysis I'],
    ['WS 2024', 'Lineare Algebra I'],
    ['WS 2024', 'Programmierung'],
    ['SS 2025', 'Analysis II'],
    ['SS 2025', 'Stochastik'],
    ['SS 2025', 'Theoretische Informatik']
  ]
  for (const [sem, kurs] of allCourses) {
    for (const sub of ['Informationen', 'Übungen']) {
      await mkdir(join(root, sem, kurs, sub), { recursive: true })
    }
  }

  const sha1 = (s: string): string =>
    createHash('sha1').update(Buffer.from(s, 'latin1')).digest('hex')

  // Eingang: eine frische, sinnvoll zuordenbare Scan-Datei …
  await mkdir(join(root, '_Eingang'), { recursive: true })
  await writeFile(
    join(root, '_Eingang/Scan Vorlesung 12.pdf'),
    minimalPdf('Stochastik Vorlesung 12 - Erwartungswert und Varianz, Rechenregeln'),
    'latin1'
  )
  // … und eine, die inhaltlich schon abgelegt ist (Duplikat-Erkennung testen).
  const sammelPdfBody = minimalPdf('Stochastik - Vorlesung 1-10')
  await writeFile(join(root, '_Eingang/Handy-Foto 5.pdf'), sammelPdfBody, 'latin1')
  // … und eine, die als Fortsetzung an eine vorhandene PDF gehört (Anhängen-Vorschlag).
  await writeFile(
    join(root, '_Eingang/Foto Blatt 4.pdf'),
    minimalPdf('Stochastik\nUebungsblatt 4\nAufgabe 1: Berechne die Varianz ...'),
    'latin1'
  )

  // Eine echte PDF im Kurs – Ziel für „An vorhandenes Dokument anhängen" und
  // gleichzeitig das Original, das die Duplikat-Datei im Eingang trifft.
  const sammelPdfRel = 'SS 2025/Stochastik/Informationen/Vorlesung 1-10.pdf'
  await mkdir(join(root, dirname(sammelPdfRel)), { recursive: true })
  await writeFile(join(root, sammelPdfRel), sammelPdfBody, 'latin1')

  // Lernpläne je Fach
  for (const pl of plans) {
    await write(pl.file, JSON.stringify(pl.data, null, 2))
  }

  // Archivierte Fächer aus WS 2023 (Ordner unter _Archiv, Ergebnisse siehe unten).
  const archived: { kurs: string; thema: string; text: string }[] = [
    {
      kurs: 'Grundlagen der Informatik',
      thema: 'Boolesche Algebra',
      text: 'Wahrheitstabellen, KV-Diagramme, DNF/KNF, Schaltnetze.'
    },
    {
      kurs: 'Mathe für Informatiker',
      thema: 'Vollständige Induktion',
      text: 'Induktionsanfang, Induktionsschritt, typische Summenformeln.'
    }
  ]
  for (const a of archived) {
    await write(
      `_Archiv/WS 2023/${a.kurs}/Informationen/${a.thema}.txt`,
      `# ${a.thema}\n\n${a.text}\n`
    )
    await write(
      `_Archiv/WS 2023/${a.kurs}/Prüfungsvorbereitung/lernplan.json`,
      JSON.stringify(
        {
          v: 2,
          name: a.kurs,
          semester: 'WS 2023',
          kurs: a.kurs,
          examKey: null,
          examTitle: null,
          examDateIso: null,
          summary: '',
          plan: 'Abgeschlossen und archiviert.',
          planTasks: [],
          plannedAt: null,
          quizzes: [],
          progress: {},
          resources: [],
          sources: [],
          useCalendar: false,
          created: at(-560),
          updated: at(-520)
        },
        null,
        2
      )
    )
  }

  // Index: Volltext-Einträge (Notizen + Sammel-PDF mit sha1 für den Duplikat-Check).
  const entries: Record<string, unknown> = {}
  for (const n of NOTES) {
    const rel = relOf(n)
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
  entries[sammelPdfRel] = {
    relPath: sammelPdfRel,
    semester: 'SS 2025',
    kurs: 'Stochastik',
    thema: 'Vorlesung 1-10',
    added: at(-10),
    ocrEngine: 'none',
    text: 'Stochastik Vorlesung 1 bis 10 – Sammelmitschrift.',
    sha1: sha1(sammelPdfBody)
  }
  // Vorhandene Übungsblatt-PDF, an die der frische Scan „Foto Blatt 4" angehängt werden soll.
  const blatt4Rel = 'SS 2025/Stochastik/Übungen/Übungsblatt 4.pdf'
  await mkdir(join(root, dirname(blatt4Rel)), { recursive: true })
  await writeFile(join(root, blatt4Rel), minimalPdf('Stochastik Übungsblatt 4 – Seite 1'), 'latin1')
  entries[blatt4Rel] = {
    relPath: blatt4Rel,
    semester: 'SS 2025',
    kurs: 'Stochastik',
    thema: 'Übungsblatt 4',
    added: at(-4),
    ocrEngine: 'vision',
    text: 'Stochastik Übungsblatt 4 Aufgabe 1 Erwartungswert'
  }

  const grComp = (
    id: string,
    title: string,
    grade: number,
    weightPct: number,
    days: number
  ): Record<string, unknown> => ({
    id,
    title,
    mode: 'grade',
    grade,
    weightPct,
    dateIso: at(days).slice(0, 10)
  })

  // Ergebnisse: WS 2023 (archiviert, alle Varianten) + WS 2024 (frisch abgeschlossen).
  const results: Record<string, unknown> = {
    'WS 2023//Grundlagen der Informatik': {
      semester: 'WS 2023',
      kurs: 'Grundlagen der Informatik',
      ects: 8,
      archivedAt: at(-515),
      components: [
        {
          id: 'w1',
          title: 'Klausur',
          mode: 'points',
          points: 11,
          weightPct: 100,
          dateIso: at(-540).slice(0, 10)
        }
      ],
      prep: {
        plannedTasks: 12,
        doneTasks: 10,
        quizAccuracy: 0.71,
        examDateIso: at(-540).slice(0, 10)
      }
    },
    'WS 2023//Mathe für Informatiker': {
      semester: 'WS 2023',
      kurs: 'Mathe für Informatiker',
      ects: 8,
      archivedAt: at(-515),
      components: [grComp('w2', 'Klausur', 2.7, 100, -536)],
      prep: {
        plannedTasks: 18,
        doneTasks: 12,
        quizAccuracy: 0.58,
        examDateIso: at(-536).slice(0, 10)
      }
    },
    'WS 2023//Rechnerarchitektur': {
      semester: 'WS 2023',
      kurs: 'Rechnerarchitektur',
      // absichtlich ohne ECTS → Warnhinweis „zählt nicht mit"
      archivedAt: at(-515),
      components: [grComp('w3', 'Klausur', 1.7, 100, -530)]
    },
    'WS 2023//Programmierpraktikum': {
      semester: 'WS 2023',
      kurs: 'Programmierpraktikum',
      ects: 4,
      archivedAt: at(-515),
      components: [
        { id: 'w4', title: 'Projektabnahme', mode: 'passfail', passed: true, weightPct: 100 }
      ]
      // kein prep → zeigt „kein Vorbereitungs-Schnappschuss" im Detail
    },
    'WS 2024//Analysis I': {
      semester: 'WS 2024',
      kurs: 'Analysis I',
      ects: 9,
      components: [grComp('g1', 'Klausur', 2.3, 100, -190)],
      prep: {
        plannedTasks: 14,
        doneTasks: 11,
        quizAccuracy: 0.72,
        examDateIso: at(-190).slice(0, 10)
      }
    },
    'WS 2024//Lineare Algebra I': {
      semester: 'WS 2024',
      kurs: 'Lineare Algebra I',
      ects: 9,
      components: [grComp('g2', 'Klausur', 1.7, 100, -183)],
      prep: {
        plannedTasks: 16,
        doneTasks: 16,
        quizAccuracy: 0.88,
        examDateIso: at(-183).slice(0, 10)
      }
    },
    'WS 2024//Programmierung': {
      semester: 'WS 2024',
      kurs: 'Programmierung',
      ects: 6,
      components: [
        grComp('g3a', 'Midterm', 3.0, 30, -205),
        grComp('g3b', 'Endklausur', 2.0, 70, -178)
      ],
      prep: {
        plannedTasks: 10,
        doneTasks: 6,
        quizAccuracy: 0.6,
        examDateIso: at(-178).slice(0, 10)
      }
    }
  }

  // Rückgängig-Verlauf: zwei kürzlich einsortierte Dateien (echte Pfade im Ordner).
  const undo = [
    {
      id: 'undo1',
      when: at(-1),
      kind: 'file',
      destRelPath: 'WS 2024/Lineare Algebra I/Übungen/Übungsblatt 5.txt',
      originalName: 'Foto Blatt 5.jpg',
      fromInbox: true
    },
    {
      id: 'undo2',
      when: at(-3),
      kind: 'file',
      destRelPath: 'SS 2025/Analysis II/Übungen/Übungsblatt 3.txt',
      originalName: 'Scan UB3.pdf',
      fromInbox: true
    }
  ]

  const tactics = {
    at: at(-1),
    basis: 6,
    text:
      '## Was gut läuft\n' +
      '- **Lineare Algebra I** (1,7) zeigt das Muster: alle 16 Lernaufgaben erledigt, Quiz-Sicherheit 88 % – hier stimmt die Vorbereitung.\n' +
      '- Die Note zieht über die Semester leicht an (WS 2023: 2,4 → WS 2024: 2,1).\n' +
      '- Mehrteilige Prüfungen (Programmierung: Midterm + Endklausur) hast du im Griff.\n\n' +
      '## Woran es hakt\n' +
      '- **Klarer Zusammenhang Aufwand ↔ Note:** Fächer mit < 70 % erledigten Lernaufgaben (Programmierung 6/10, Rechnerarchitektur) liegen bei 2,3–2,7; Fächer mit ~100 % bei 1,7–2,0.\n' +
      '- **Quiz-Sicherheit sagt die Note fast voraus:** 60 % Quiz → 2,3 (Programmierung), 88 % → 1,7. Unter ~75 % vor der Prüfung wird es selten besser als 2,3.\n' +
      '- **Analysis I**: viel Aufwand (11/14 Aufgaben), aber nur 2,3 bei 72 % Quiz – die Übungsaufgaben allein haben nicht gereicht, das Verständnis war noch wackelig.\n' +
      '- **Rechnerarchitektur** hat keine ECTS hinterlegt und zählt nicht in den Schnitt – Datenlücke.\n\n' +
      '## Konkret ändern\n' +
      '1. Setz dir je Fach die Marke **Quiz-Sicherheit ≥ 80 % zwei Tage vor der Klausur** und plane den Puffer so, dass du das erreichst – zuerst in Analysis II.\n' +
      '2. In rechenlastigen Fächern (Analysis) **zusätzlich zu den Übungsblättern 2–3 Altklausuren unter Zeit**, statt nur Blätter zu wiederholen.\n' +
      '3. Bei Fächern, in denen du zuletzt unter 70 % der Lernaufgaben geschafft hast: **Plan früher starten** oder die Blöcke kürzer/häufiger legen, damit weniger liegen bleibt.\n' +
      '4. Trag bei **Rechnerarchitektur die ECTS nach**, damit die Auswertung vollständig ist.\n' +
      '5. Nutz die mehrteilige Bewertung aktiv: wo es Midterms gibt, die frühe Teilleistung ernst nehmen – sie stützt die Endnote (siehe Programmierung).'
  }

  await write(
    '.astra-studienplaner.json',
    JSON.stringify(
      { v: 1, updated: new Date().toISOString(), entries, exams, results, undo, tactics },
      null,
      2
    )
  )

  return { dir: root, calendarEvents: events }
}
