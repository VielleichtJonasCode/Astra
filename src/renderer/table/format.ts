/** Tabellen-Serialisierung/Deserialisierung für den Tabellen-Editor. */

export type Grid = string[][]

export type ExportFmt = 'csv' | 'csvSemi' | 'tsv' | 'json' | 'markdown' | 'html' | 'latex'

export const EXPORT_LABEL: Record<ExportFmt, string> = {
  csv: 'CSV (Komma)',
  csvSemi: 'CSV (Semikolon)',
  tsv: 'TSV',
  json: 'JSON',
  markdown: 'Markdown',
  html: 'HTML',
  latex: 'LaTeX'
}
export const EXPORT_EXT: Record<ExportFmt, string> = {
  csv: 'csv',
  csvSemi: 'csv',
  tsv: 'tsv',
  json: 'json',
  markdown: 'md',
  html: 'html',
  latex: 'tex'
}

/* ---------- Parsen ---------- */

/** Trennt Zeichenketten mit optionalen Anführungszeichen (CSV/TSV). */
export function parseDelimited(text: string, delim: string): Grid {
  const out: Grid = []
  let row: string[] = []
  let cur = ''
  let q = false
  const s = text.replace(/\r\n?/g, '\n')
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += c
    } else if (c === '"') {
      q = true
    } else if (c === delim) {
      row.push(cur)
      cur = ''
    } else if (c === '\n') {
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
  return normalize(out)
}

export function guessAndParse(text: string): Grid {
  const t = text.trim()
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      return fromJson(t)
    } catch {
      /* fällt auf Trennzeichen zurück */
    }
  }
  const firstLine = t.split('\n')[0] ?? ''
  const count = (d: string): number => firstLine.split(d).length - 1
  const delim = (['\t', ';', ','] as const).reduce(
    (best, d) => (count(d) > count(best) ? d : best),
    ','
  )
  return parseDelimited(text, delim)
}

function fromJson(text: string): Grid {
  const data = JSON.parse(text)
  const arr: unknown[] = Array.isArray(data) ? data : [data]
  if (arr.every((x) => Array.isArray(x)))
    return normalize(arr.map((r) => (r as unknown[]).map(cell)))
  const objs = arr.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  const cols = Array.from(new Set(objs.flatMap((o) => Object.keys(o))))
  return normalize([cols, ...objs.map((o) => cols.map((c) => cell(o[c])))])
}

const cell = (v: unknown): string =>
  v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Alle Zeilen auf gleiche Spaltenzahl bringen. */
export function normalize(g: Grid): Grid {
  const w = Math.max(1, ...g.map((r) => r.length))
  return (g.length ? g : [['']]).map((r) => {
    const copy = [...r]
    while (copy.length < w) copy.push('')
    return copy.slice(0, w)
  })
}

/* ---------- Serialisieren ---------- */

const needsQuote = (v: string, d: string): boolean =>
  v.includes(d) || v.includes('"') || v.includes('\n')
const q = (v: string, d: string): string => (needsQuote(v, d) ? `"${v.replace(/"/g, '""')}"` : v)

export function serialize(grid: Grid, fmt: ExportFmt, hasHeader: boolean): string {
  const g = normalize(grid)
  switch (fmt) {
    case 'csv':
      return g.map((r) => r.map((c) => q(c, ',')).join(',')).join('\n')
    case 'csvSemi':
      return g.map((r) => r.map((c) => q(c, ';')).join(';')).join('\n')
    case 'tsv':
      return g.map((r) => r.map((c) => c.replace(/\t/g, ' ')).join('\t')).join('\n')
    case 'json': {
      if (!hasHeader) return JSON.stringify(g, null, 2)
      const [head, ...body] = g
      return JSON.stringify(
        body.map((r) => Object.fromEntries(head.map((h, i) => [h || `col${i + 1}`, r[i] ?? '']))),
        null,
        2
      )
    }
    case 'markdown': {
      const esc = (c: string): string => c.replace(/\|/g, '\\|').replace(/\n/g, ' ')
      const rows = g.map((r) => `| ${r.map(esc).join(' | ')} |`)
      const sep = `| ${g[0].map(() => '---').join(' | ')} |`
      if (hasHeader) return [rows[0], sep, ...rows.slice(1)].join('\n')
      return [sep.replace(/---/g, '   '), sep, ...rows].join('\n')
    }
    case 'html': {
      const esc = (c: string): string =>
        c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const tr = (r: string[], tag: 'td' | 'th'): string =>
        `    <tr>${r.map((c) => `<${tag}>${esc(c)}</${tag}>`).join('')}</tr>`
      const body = hasHeader ? g.slice(1) : g
      return [
        '<table>',
        ...(hasHeader ? [`  <thead>`, tr(g[0], 'th'), `  </thead>`] : []),
        '  <tbody>',
        ...body.map((r) => tr(r, 'td')),
        '  </tbody>',
        '</table>'
      ].join('\n')
    }
    case 'latex': {
      const esc = (c: string): string => c.replace(/([&%$#_{}])/g, '\\$1')
      const spec = g[0].map(() => 'l').join(' ')
      const lines = g.map((r) => `  ${r.map(esc).join(' & ')} \\\\`)
      const withRule = hasHeader ? [lines[0], '  \\hline', ...lines.slice(1)] : lines
      return [
        '\\begin{tabular}{' + spec + '}',
        '  \\hline',
        ...withRule,
        '  \\hline',
        '\\end{tabular}'
      ].join('\n')
    }
  }
}
