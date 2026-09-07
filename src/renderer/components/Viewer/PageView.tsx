import { memo, useEffect, useRef, useState } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import { getCachedPage } from '../../pdf/pageCache'
import { renderPageToCanvas, renderTextLayer } from '../../pdf/render'
import { pageDisplaySize, type PageModel } from '../../pdf/model'
import type { Rect } from '../../lib/geometry'
import { Spinner } from '../common/misc'

export interface PageLayout {
  page: PageModel
  /** 1-basierter Index in doc.pages. */
  index: number
  top: number
  width: number
  height: number
}

interface Props {
  layout: PageLayout
  proxy: PDFDocumentProxy | null
  cssScale: number
  showText: boolean
  onPointerDownPage?: (index: number, e: React.PointerEvent) => void
  overlay?: React.ReactNode
  /** Suchtreffer auf dieser Seite (Rechteck in PDF-Punkten, oben-links). */
  highlights?: { rect: Rect; active: boolean }[]
}

function PageViewImpl({
  layout,
  proxy,
  cssScale,
  showText,
  onPointerDownPage,
  overlay,
  highlights
}: Props): JSX.Element {
  const { page, index, width, height } = layout
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  const pdfPageNumber = page.source.kind === 'original' ? page.source.index + 1 : null

  useEffect(() => {
    let alive = true
    let handle: { cancel: () => void } | null = null
    setReady(false)

    async function run(): Promise<void> {
      const canvas = canvasRef.current
      if (!canvas) return

      if (pdfPageNumber == null || !proxy) {
        // Leere / Bild- / externe Seite: weiß füllen (Inhalt bäckt der Export).
        const ctx = canvas.getContext('2d', { alpha: false })
        canvas.width = Math.ceil(width * dpr())
        canvas.height = Math.ceil(height * dpr())
        canvas.style.width = `${width}px`
        canvas.style.height = `${height}px`
        if (ctx) {
          ctx.fillStyle = '#fff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
        }
        if (alive) setReady(true)
        return
      }

      let pdfPage: PDFPageProxy
      try {
        pdfPage = await getCachedPage(proxy, pdfPageNumber)
      } catch {
        if (alive) setReady(true)
        return
      }
      if (!alive) return

      handle = renderPageToCanvas(pdfPage, canvas, cssScale, { rotation: page.rotation })
      if (alive) setReady(true)

      if (showText && textRef.current) {
        try {
          await renderTextLayer(pdfPage, textRef.current, cssScale, page.rotation)
        } catch {
          /* Textlayer ist optional */
        }
      } else if (textRef.current) {
        textRef.current.replaceChildren()
      }
    }

    void run()
    return () => {
      alive = false
      handle?.cancel()
    }
  }, [proxy, pdfPageNumber, cssScale, page.rotation, showText, width, height])

  return (
    <div
      className="pageview"
      style={{ top: layout.top, width, height }}
      data-page={index}
      onPointerDown={(e) => onPointerDownPage?.(index, e)}
    >
      <canvas ref={canvasRef} className="pageview__canvas" />
      {showText && <div ref={textRef} className="textLayer" />}
      {highlights && highlights.length > 0 && (
        <div className="pageview__finds">
          {highlights.map((h, i) => (
            <div
              key={i}
              className={h.active ? 'find-hit is-active' : 'find-hit'}
              style={{
                left: h.rect.x * cssScale,
                top: h.rect.y * cssScale,
                width: h.rect.width * cssScale,
                height: h.rect.height * cssScale
              }}
            />
          ))}
        </div>
      )}
      <div className="pageview__overlay">{overlay}</div>
      {!ready && (
        <div className="pageview__loading">
          <Spinner />
        </div>
      )}
      <span className="pageview__num">{index}</span>
    </div>
  )
}

function dpr(): number {
  return Math.min(window.devicePixelRatio || 1, 2.5)
}

export const PageView = memo(PageViewImpl)

/** Berechnet das vertikale Layout aller Seiten für einen gegebenen Maßstab. */
export function computeLayout(
  pages: PageModel[],
  cssScale: number,
  gap: number
): { layouts: PageLayout[]; totalHeight: number; maxWidth: number } {
  let top = gap
  let maxWidth = 0
  const layouts: PageLayout[] = pages.map((page, i) => {
    const size = pageDisplaySize(page)
    const width = Math.round(size.width * cssScale)
    const height = Math.round(size.height * cssScale)
    const layout: PageLayout = { page, index: i + 1, top, width, height }
    top += height + gap
    maxWidth = Math.max(maxWidth, width)
    return layout
  })
  return { layouts, totalHeight: top, maxWidth }
}
