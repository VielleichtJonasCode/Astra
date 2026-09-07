/**
 * Parst Seitenbereiche wie "1-3, 5, 8-10" → 0-basierte Indizes.
 * `max` = Seitenanzahl (Indizes werden auf [0, max-1] begrenzt).
 */
export function parsePageRanges(input: string, max: number): number[] {
  const out = new Set<number>()
  for (const chunk of input.split(/[,;]/)) {
    const part = chunk.trim()
    if (!part) continue
    const m = part.match(/^(\d+)\s*(?:-\s*(\d+))?$/)
    if (!m) continue
    const a = parseInt(m[1], 10)
    const b = m[2] ? parseInt(m[2], 10) : a
    const lo = Math.min(a, b)
    const hi = Math.max(a, b)
    for (let p = lo; p <= hi; p++) {
      if (p >= 1 && p <= max) out.add(p - 1)
    }
  }
  return [...out].sort((x, y) => x - y)
}

export function formatRanges(indices: number[]): string {
  if (indices.length === 0) return ''
  const sorted = [...indices].sort((a, b) => a - b).map((i) => i + 1)
  const parts: string[] = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i <= sorted.length; i++) {
    const cur = sorted[i]
    if (cur === prev + 1) {
      prev = cur
      continue
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`)
    start = cur
    prev = cur
  }
  return parts.join(', ')
}
