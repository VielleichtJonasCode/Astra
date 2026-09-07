import type { PDFPageProxy } from 'pdfjs-dist'
import { pdfjs } from './pdfjs'

export interface RenderHandle {
  cancel: () => void
}

/**
 * Rendert eine pdf.js-Seite in ein Canvas. `cssScale` = CSS-Pixel pro PDF-Punkt.
 * Gibt ein Handle zum Abbrechen zurück (wichtig bei schnellem Zoomen/Scrollen).
 */
export function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssScale: number,
  opts: { dpr?: number; rotation?: number } = {}
): RenderHandle {
  const dpr = opts.dpr ?? Math.min(window.devicePixelRatio || 1, 2.5)
  const viewport = page.getViewport({ scale: cssScale * dpr, rotation: opts.rotation })
  const cssViewport = page.getViewport({ scale: cssScale, rotation: opts.rotation })

  canvas.width = Math.max(1, Math.ceil(viewport.width))
  canvas.height = Math.max(1, Math.ceil(viewport.height))
  canvas.style.width = `${Math.floor(cssViewport.width)}px`
  canvas.style.height = `${Math.floor(cssViewport.height)}px`

  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return { cancel: () => undefined }

  const task = page.render({ canvasContext: ctx, viewport })
  let cancelled = false
  task.promise.catch((err: unknown) => {
    if (!cancelled && !(err instanceof Error && err.name === 'RenderingCancelledException')) {
      // eslint-disable-next-line no-console
      console.error('render error', err)
    }
  })
  return {
    cancel: () => {
      cancelled = true
      try {
        task.cancel()
      } catch {
        /* egal */
      }
    }
  }
}

/** Rendert eine Seite als PNG-Data-URL (für Miniaturen). */
export async function renderThumbnail(
  page: PDFPageProxy,
  maxWidthPx: number,
  rotation = 0
): Promise<string> {
  const base = page.getViewport({ scale: 1, rotation })
  const scale = maxWidthPx / base.width
  const viewport = page.getViewport({ scale, rotation })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return ''
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport }).promise
  return canvas.toDataURL('image/png')
}

let textLayerCtor: typeof import('pdfjs-dist').TextLayer | null = null

/** Baut den auswählbaren Textlayer über einer Seite auf. */
export async function renderTextLayer(
  page: PDFPageProxy,
  container: HTMLElement,
  cssScale: number,
  rotation?: number
): Promise<void> {
  if (!textLayerCtor) {
    textLayerCtor = (pdfjs as unknown as { TextLayer: typeof import('pdfjs-dist').TextLayer })
      .TextLayer
  }
  const viewport = page.getViewport({ scale: cssScale, rotation })
  container.replaceChildren()
  container.style.setProperty('--scale-factor', String(cssScale))
  container.style.width = `${Math.floor(viewport.width)}px`
  container.style.height = `${Math.floor(viewport.height)}px`
  if (!textLayerCtor) return
  const layer = new textLayerCtor({
    textContentSource: await page.getTextContent(),
    container,
    viewport
  })
  await layer.render()
}
