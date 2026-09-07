import { createWorker, type Worker } from 'tesseract.js'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { nanoid } from 'nanoid'
import type { Annotation, PageModel } from '../model'
import { getCachedPage } from '../pageCache'

export interface OcrLine {
  text: string
  /** PDF-Punkte, Overlay-Koordinaten (oben-links). */
  x: number
  y: number
  width: number
  height: number
}

export interface OcrPageResult {
  pageIndex: number // 1-basiert in doc.pages
  text: string
  lines: OcrLine[]
}

export interface OcrProgress {
  page: number
  total: number
  status: string
  progress: number
}

let cachedWorker: { key: string; worker: Worker } | null = null

async function getWorker(langs: string, base: string): Promise<Worker> {
  if (cachedWorker?.key === langs) return cachedWorker.worker
  if (cachedWorker) await cachedWorker.worker.terminate()
  const worker = await createWorker(langs, 1, {
    workerPath: new URL('tesseract/worker.min.js', location.href).href,
    corePath: new URL('tesseract/core/', location.href).href,
    langPath: base,
    gzip: false,
    cacheMethod: 'none'
  })
  cachedWorker = { key: langs, worker }
  return worker
}

export async function ocrDocument(
  proxy: PDFDocumentProxy,
  pages: PageModel[],
  opts: {
    langs: string[]
    scale?: number
    pageIndices?: number[]
    onProgress?: (p: OcrProgress) => void
  }
): Promise<OcrPageResult[]> {
  const base = await window.api.prepareOcr(opts.langs)
  const worker = await getWorker(opts.langs.join('+'), base)
  const scale = opts.scale ?? 2
  const targets =
    opts.pageIndices ?? pages.map((_, i) => i).filter((i) => pages[i].source.kind === 'original')

  const out: OcrPageResult[] = []
  let done = 0
  for (const i of targets) {
    const pm = pages[i]
    if (pm.source.kind !== 'original') continue
    opts.onProgress?.({
      page: done + 1,
      total: targets.length,
      status: 'Seite wird erkannt',
      progress: 0
    })
    const page = await getCachedPage(proxy, pm.source.index + 1)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise

    const { data } = await worker.recognize(canvas)
    const lines: OcrLine[] = (data.lines ?? []).map((ln) => ({
      text: ln.text.replace(/\n/g, ' ').trim(),
      x: ln.bbox.x0 / scale,
      y: ln.bbox.y0 / scale,
      width: (ln.bbox.x1 - ln.bbox.x0) / scale,
      height: (ln.bbox.y1 - ln.bbox.y0) / scale
    }))
    out.push({ pageIndex: i + 1, text: data.text, lines: lines.filter((l) => l.text) })
    done++
  }
  return out
}

/** Wandelt OCR-Zeilen in (nahezu) unsichtbare, durchsuchbare Text-Annotationen. */
export function ocrLinesToAnnotations(result: OcrPageResult, pageId: string): Annotation[] {
  return result.lines.map((ln) => ({
    id: nanoid(10),
    pageId,
    kind: 'text' as const,
    rect: { x: ln.x, y: ln.y, width: Math.max(ln.width, 4), height: Math.max(ln.height, 6) },
    text: ln.text,
    style: {
      font: 'Helvetica' as const,
      size: Math.max(6, ln.height * 0.8),
      color: '#000000',
      align: 'left' as const,
      lineHeight: 1
    },
    cover: null,
    opacity: 0.001
  }))
}
