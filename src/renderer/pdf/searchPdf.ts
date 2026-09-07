import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { Rect } from '../lib/geometry'
import type { PageModel, Rotation } from './model'
import type { SearchMatch } from '../store/searchStore'
import { getCachedPage } from './pageCache'
import { unionRect } from '../lib/geometry'

const MAX_MATCHES = 800

/** Dreht ein Rechteck aus dem unrotierten Seitenraum in den Anzeigeraum. */
export function rotateRectInPage(
  r: Rect,
  rotation: Rotation,
  unrotW: number,
  unrotH: number
): Rect {
  switch (rotation) {
    case 90:
      return { x: unrotH - (r.y + r.height), y: r.x, width: r.height, height: r.width }
    case 180:
      return {
        x: unrotW - (r.x + r.width),
        y: unrotH - (r.y + r.height),
        width: r.width,
        height: r.height
      }
    case 270:
      return { x: r.y, y: unrotW - (r.x + r.width), width: r.height, height: r.width }
    default:
      return r
  }
}

async function pageTextIndex(
  proxy: PDFDocumentProxy,
  pdfPageNumber: number
): Promise<{ full: string; spans: { start: number; end: number; box: Rect }[]; vw: number; vh: number }> {
  const pdfPage = await getCachedPage(proxy, pdfPageNumber)
  const viewport = pdfPage.getViewport({ scale: 1 })
  const content = await pdfPage.getTextContent()
  let full = ''
  const spans: { start: number; end: number; box: Rect }[] = []
  for (const item of content.items) {
    if (!('str' in item)) continue
    const str = item.str
    if (!str) {
      if (item.hasEOL) full += '\n'
      continue
    }
    const t = item.transform as number[]
    const fh = Math.hypot(t[2], t[3]) || item.height || 10
    spans.push({
      start: full.length,
      end: full.length + str.length,
      box: {
        x: t[4],
        y: viewport.height - t[5] - fh,
        width: item.width || fh * 0.5 * str.length,
        height: fh * 1.2
      }
    })
    full += str
    if (item.hasEOL) full += '\n'
  }
  return { full, spans, vw: viewport.width, vh: viewport.height }
}

function boxFor(
  spans: { start: number; end: number; box: Rect }[],
  from: number,
  to: number
): Rect | null {
  let rect: Rect | null = null
  for (const s of spans) {
    if (s.end <= from || s.start >= to) continue
    rect = rect ? unionRect(rect, s.box) : { ...s.box }
  }
  return rect
}

export async function searchDocument(
  proxy: PDFDocumentProxy,
  pages: PageModel[],
  rawQuery: string
): Promise<SearchMatch[]> {
  const query = rawQuery.trim().toLowerCase()
  if (query.length < 1) return []
  const matches: SearchMatch[] = []
  for (let i = 0; i < pages.length && matches.length < MAX_MATCHES; i++) {
    const page = pages[i]
    if (page.source.kind !== 'original') continue
    let idx
    try {
      idx = await pageTextIndex(proxy, page.source.index + 1)
    } catch {
      continue
    }
    const hay = idx.full.toLowerCase()
    let from = 0
    while (matches.length < MAX_MATCHES) {
      const at = hay.indexOf(query, from)
      if (at < 0) break
      const end = at + query.length
      const rect = boxFor(idx.spans, at, end)
      if (rect) {
        matches.push({
          pageIndex: i + 1,
          rect: rotateRectInPage(rect, page.rotation, idx.vw, idx.vh)
        })
      }
      from = end
    }
  }
  return matches
}

/** Regex-Suche über das Dokument (für den Redaktions-Assistenten). */
export async function searchDocumentRegex(
  proxy: PDFDocumentProxy,
  pages: PageModel[],
  regex: RegExp
): Promise<SearchMatch[]> {
  const matches: SearchMatch[] = []
  const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : regex.flags + 'g')
  for (let i = 0; i < pages.length && matches.length < MAX_MATCHES; i++) {
    const page = pages[i]
    if (page.source.kind !== 'original') continue
    let idx
    try {
      idx = await pageTextIndex(proxy, page.source.index + 1)
    } catch {
      continue
    }
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(idx.full)) && matches.length < MAX_MATCHES) {
      if (m[0].length === 0) {
        re.lastIndex++
        continue
      }
      const rect = boxFor(idx.spans, m.index, m.index + m[0].length)
      if (rect) {
        matches.push({
          pageIndex: i + 1,
          rect: rotateRectInPage(rect, page.rotation, idx.vw, idx.vh)
        })
      }
    }
  }
  return matches
}
