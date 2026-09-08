/** Text-Transformationen für das Text-Werkzeug. Alle rein lokal, ohne Abhängigkeiten. */

export type OpGroup = 'Groß/Klein' | 'Zeilen' | 'Bereinigen' | 'Kodieren' | 'Format' | 'Prüfsumme'

export interface TextOp {
  id: string
  label: string
  group: OpGroup
  run: (input: string) => string | Promise<string>
}

const lines = (s: string): string[] => s.split(/\r\n|\r|\n/)
const joinLines = (a: string[]): string => a.join('\n')

function titleCase(s: string): string {
  return s.replace(/\b\p{L}[\p{L}']*/gu, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
}
function sentenceCase(s: string): string {
  return s.toLowerCase().replace(/(^\s*\p{L})|([.!?]\s+\p{L})/gu, (m) => m.toUpperCase())
}
function swapCase(s: string): string {
  return s.replace(/\p{L}/gu, (c) => (c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()))
}
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g')
const INVISIBLE = new RegExp('[\\u200b-\\u200d\\u2060\\ufeff\\u00ad]', 'g')

function slugify(s: string): string {
  return s
    .replace(/[äÄ]/g, 'ae')
    .replace(/[öÖ]/g, 'oe')
    .replace(/[üÜ]/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(COMBINING, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
function rot13(s: string): string {
  return s.replace(/[a-z]/gi, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

const HTML_ENT: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}

function csvToJson(s: string): string {
  const rows = parseCsv(s.trim())
  if (rows.length === 0) return '[]'
  const [head, ...body] = rows
  const out = body.map((r) => {
    const o: Record<string, string> = {}
    head.forEach((h, i) => (o[h] = r[i] ?? ''))
    return o
  })
  return JSON.stringify(out, null, 2)
}
function jsonToCsv(s: string): string {
  const data = JSON.parse(s)
  const arr: Record<string, unknown>[] = Array.isArray(data) ? data : [data]
  const cols = Array.from(new Set(arr.flatMap((o) => Object.keys(o ?? {}))))
  const esc = (v: unknown): string => {
    const t = v == null ? '' : String(v)
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  return [cols.join(','), ...arr.map((o) => cols.map((c) => esc(o?.[c])).join(','))].join('\n')
}
function csvToMarkdown(s: string): string {
  const rows = parseCsv(s.trim())
  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((r) => r.length))
  const pad = (r: string[]): string =>
    `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`
  return [
    pad(rows[0]),
    `| ${Array.from({ length: width }, () => '---').join(' | ')} |`,
    ...rows.slice(1).map(pad)
  ].join('\n')
}

/** Kleiner CSV-Parser mit Anführungszeichen-Unterstützung. */
function parseCsv(s: string): string[][] {
  const out: string[][] = []
  let row: string[] = []
  let cur = ''
  let quoted = false
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"'
          i++
        } else quoted = false
      } else cur += c
    } else if (c === '"') {
      quoted = true
    } else if (c === ',') {
      row.push(cur)
      cur = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++
      row.push(cur)
      out.push(row)
      row = []
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur !== '' || row.length) {
    row.push(cur)
    out.push(row)
  }
  return out
}

async function digest(algo: 'SHA-1' | 'SHA-256' | 'SHA-512', s: string): Promise<string> {
  const buf = await crypto.subtle.digest(algo, new TextEncoder().encode(s))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export const TEXT_OPS: TextOp[] = [
  // Groß/Klein
  { id: 'upper', label: 'GROSSBUCHSTABEN', group: 'Groß/Klein', run: (s) => s.toUpperCase() },
  { id: 'lower', label: 'kleinbuchstaben', group: 'Groß/Klein', run: (s) => s.toLowerCase() },
  { id: 'title', label: 'Wortanfänge Groß', group: 'Groß/Klein', run: titleCase },
  { id: 'sentence', label: 'Satzanfänge groß', group: 'Groß/Klein', run: sentenceCase },
  { id: 'swap', label: 'Groß/klein tauschen', group: 'Groß/Klein', run: swapCase },

  // Zeilen
  {
    id: 'sortAsc',
    label: 'Zeilen A→Z',
    group: 'Zeilen',
    run: (s) => joinLines([...lines(s)].sort((a, b) => a.localeCompare(b, 'de')))
  },
  {
    id: 'sortDesc',
    label: 'Zeilen Z→A',
    group: 'Zeilen',
    run: (s) => joinLines([...lines(s)].sort((a, b) => b.localeCompare(a, 'de')))
  },
  {
    id: 'sortNum',
    label: 'Zeilen numerisch',
    group: 'Zeilen',
    run: (s) => joinLines([...lines(s)].sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0)))
  },
  {
    id: 'reverse',
    label: 'Zeilen umkehren',
    group: 'Zeilen',
    run: (s) => joinLines(lines(s).reverse())
  },
  {
    id: 'shuffle',
    label: 'Zeilen mischen',
    group: 'Zeilen',
    run: (s) => joinLines(shuffle(lines(s)))
  },
  {
    id: 'dedupe',
    label: 'Duplikate entfernen',
    group: 'Zeilen',
    run: (s) => joinLines(Array.from(new Set(lines(s))))
  },
  {
    id: 'dropEmpty',
    label: 'Leerzeilen entfernen',
    group: 'Zeilen',
    run: (s) => joinLines(lines(s).filter((l) => l.trim() !== ''))
  },
  {
    id: 'trimLines',
    label: 'Zeilen trimmen',
    group: 'Zeilen',
    run: (s) => joinLines(lines(s).map((l) => l.trim()))
  },
  {
    id: 'number',
    label: 'Zeilen nummerieren',
    group: 'Zeilen',
    run: (s) => joinLines(lines(s).map((l, i) => `${i + 1}. ${l}`))
  },
  {
    id: 'joinComma',
    label: 'Zeilen → Komma-Liste',
    group: 'Zeilen',
    run: (s) =>
      lines(s)
        .filter((l) => l.trim() !== '')
        .join(', ')
  },
  {
    id: 'splitComma',
    label: 'Komma-Liste → Zeilen',
    group: 'Zeilen',
    run: (s) => joinLines(s.split(',').map((x) => x.trim()))
  },

  // Bereinigen
  {
    id: 'collapseSpace',
    label: 'Mehrfach-Leerzeichen',
    group: 'Bereinigen',
    run: (s) => s.replace(/[ \t]{2,}/g, ' ')
  },
  {
    id: 'collapseBlank',
    label: 'Mehrfach-Leerzeilen',
    group: 'Bereinigen',
    run: (s) => s.replace(/\n{3,}/g, '\n\n')
  },
  {
    id: 'tabsToSpaces',
    label: 'Tabs → 2 Leerzeichen',
    group: 'Bereinigen',
    run: (s) => s.replace(/\t/g, '  ')
  },
  {
    id: 'straightQuotes',
    label: 'Typo-Anführung → gerade',
    group: 'Bereinigen',
    run: (s) => s.replace(/[‘’‚‛]/g, "'").replace(/[“”„‟]/g, '"')
  },
  {
    id: 'stripAccents',
    label: 'Akzente entfernen',
    group: 'Bereinigen',
    run: (s) => s.normalize('NFD').replace(COMBINING, '')
  },
  {
    id: 'stripInvisible',
    label: 'Unsichtbare Zeichen',
    group: 'Bereinigen',
    run: (s) => s.replace(INVISIBLE, '')
  },
  {
    id: 'stripHtml',
    label: 'HTML-Tags entfernen',
    group: 'Bereinigen',
    run: (s) => s.replace(/<[^>]*>/g, '')
  },
  { id: 'slug', label: 'In Slug umwandeln', group: 'Bereinigen', run: slugify },

  // Kodieren
  {
    id: 'b64enc',
    label: 'Base64 kodieren',
    group: 'Kodieren',
    run: (s) => btoa(unescape(encodeURIComponent(s)))
  },
  {
    id: 'b64dec',
    label: 'Base64 dekodieren',
    group: 'Kodieren',
    run: (s) => decodeURIComponent(escape(atob(s.trim())))
  },
  { id: 'urlenc', label: 'URL kodieren', group: 'Kodieren', run: (s) => encodeURIComponent(s) },
  { id: 'urldec', label: 'URL dekodieren', group: 'Kodieren', run: (s) => decodeURIComponent(s) },
  {
    id: 'htmlenc',
    label: 'HTML-Entities kodieren',
    group: 'Kodieren',
    run: (s) => s.replace(/[&<>"']/g, (c) => HTML_ENT[c])
  },
  { id: 'htmldec', label: 'HTML-Entities dekodieren', group: 'Kodieren', run: decodeHtml },
  { id: 'rot13', label: 'ROT13', group: 'Kodieren', run: rot13 },

  // Format
  {
    id: 'jsonPretty',
    label: 'JSON einrücken',
    group: 'Format',
    run: (s) => JSON.stringify(JSON.parse(s), null, 2)
  },
  {
    id: 'jsonMin',
    label: 'JSON minimieren',
    group: 'Format',
    run: (s) => JSON.stringify(JSON.parse(s))
  },
  {
    id: 'jsonSort',
    label: 'JSON-Schlüssel sortieren',
    group: 'Format',
    run: (s) => JSON.stringify(sortKeys(JSON.parse(s)), null, 2)
  },
  { id: 'csv2json', label: 'CSV → JSON', group: 'Format', run: csvToJson },
  { id: 'json2csv', label: 'JSON → CSV', group: 'Format', run: jsonToCsv },
  { id: 'csv2md', label: 'CSV → Markdown-Tabelle', group: 'Format', run: csvToMarkdown },

  // Prüfsumme
  { id: 'sha1', label: 'SHA-1', group: 'Prüfsumme', run: (s) => digest('SHA-1', s) },
  { id: 'sha256', label: 'SHA-256', group: 'Prüfsumme', run: (s) => digest('SHA-256', s) },
  { id: 'sha512', label: 'SHA-512', group: 'Prüfsumme', run: (s) => digest('SHA-512', s) }
]

function shuffle<T>(a: T[]): T[] {
  const r = [...a]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])])
    )
  }
  return v
}
function decodeHtml(s: string): string {
  const el = document.createElement('textarea')
  el.innerHTML = s
  return el.value
}

export const OP_GROUPS: OpGroup[] = [
  'Groß/Klein',
  'Zeilen',
  'Bereinigen',
  'Kodieren',
  'Format',
  'Prüfsumme'
]

/* ---------- Statistik ---------- */

export interface TextStats {
  chars: number
  charsNoSpace: number
  words: number
  linesCount: number
  paragraphs: number
  sentences: number
  bytes: number
  readMin: number
}

export function analyze(s: string): TextStats {
  const words = (s.match(/\p{L}[\p{L}'-]*|\d+/gu) ?? []).length
  return {
    chars: [...s].length,
    charsNoSpace: [...s.replace(/\s/g, '')].length,
    words,
    linesCount: s === '' ? 0 : lines(s).length,
    paragraphs: s.trim() === '' ? 0 : s.trim().split(/\n\s*\n/).length,
    sentences: (s.match(/[.!?]+(\s|$)/g) ?? []).length,
    bytes: new TextEncoder().encode(s).length,
    readMin: Math.max(1, Math.round(words / 200))
  }
}

export function topWords(s: string, n = 8): { word: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const w of s.toLowerCase().match(/\p{L}[\p{L}'-]{2,}/gu) ?? []) {
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([word, count]) => ({ word, count }))
}
