import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { usePdfProxy } from '../../pdf/pdfProxy'
import { pageDisplaySize } from '../../pdf/model'
import { Button, IconButton } from '../common/Button'
import { EmptyState, Spinner } from '../common/misc'
import { openViaDialog } from '../../lib/fileActions'
import { PageView, computeLayout, type PageLayout } from './PageView'
import { AnnotationLayer } from '../../annotations/AnnotationLayer'
import { FindBar } from './FindBar'
import { useSearchStore } from '../../store/searchStore'
import { registerViewerScroll } from '../../lib/viewerBus'
import { getTextBlocks, blockAtPoint } from '../../pdf/textBlocks'
import type { Point } from '../../lib/geometry'
import './viewer.css'

const PT = 96 / 72
const PAD = 32
const GAP = 20
const OVERSCAN = 900

export function Viewer(): JSX.Element {
  const activeKey = useDocStore((s) => s.activeKey)
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))
  const revision = doc?.revision ?? 0
  const { proxy, loading, error } = usePdfProxy(activeKey)

  const zoom = useUiStore((s) => s.zoom)
  const zoomMode = useUiStore((s) => s.zoomMode)
  const viewMode = useUiStore((s) => s.viewMode)
  const nightMode = useUiStore((s) => s.nightMode)
  const setCurrentPage = useUiStore((s) => s.setCurrentPage)
  const currentPage = useUiStore((s) => s.currentPage)
  const setZoom = useUiStore((s) => s.setZoom)
  const searchOpen = useUiStore((s) => s.search.open)
  const searchMatches = useSearchStore((s) => s.matches)
  const searchActive = useSearchStore((s) => s.active)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [scrollTop, setScrollTop] = useState(0)

  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el
    setScrollEl(el)
  }, [])

  // Containergröße beobachten (Callback-Ref, damit es beim tatsächlichen Mount greift)
  useEffect(() => {
    if (!scrollEl) return
    const measure = (): void => setBox({ w: scrollEl.clientWidth, h: scrollEl.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(scrollEl)
    measure()
    return () => ro.disconnect()
  }, [scrollEl])

  const pages = doc?.pages ?? []

  const { maxWpt, curWpt, curHpt } = useMemo(() => {
    let maxW = 1
    for (const p of pages) maxW = Math.max(maxW, pageDisplaySize(p).width)
    const cur = pages[currentPage - 1] ? pageDisplaySize(pages[currentPage - 1]) : { width: 1, height: 1 }
    return { maxWpt: maxW, curWpt: cur.width, curHpt: cur.height }
  }, [pages, currentPage])

  const cssScale = useMemo(() => {
    const availW = Math.max(1, box.w - PAD * 2)
    const availH = Math.max(1, box.h - PAD * 2)
    if (zoomMode === 'fit-width') return clamp(availW / maxWpt, 0.08, 8 * PT)
    if (zoomMode === 'fit-page') return clamp(Math.min(availW / curWpt, availH / curHpt), 0.08, 8 * PT)
    return zoom * PT
  }, [zoomMode, zoom, box.w, box.h, maxWpt, curWpt, curHpt])

  // % -Anzeige für Fit-Modi mitführen
  useEffect(() => {
    if (zoomMode !== 'custom') {
      const v = cssScale / PT
      if (Math.abs(v - useUiStore.getState().zoom) > 0.001) {
        useUiStore.setState({ zoom: v })
      }
    }
  }, [cssScale, zoomMode])

  const { layouts, totalHeight, maxWidth } = useMemo(
    () => computeLayout(pages, cssScale, GAP),
    [pages, cssScale]
  )

  // Zoom-Anker: Mittelpunkt (bzw. Cursor bei Strg+Wheel) stabil halten
  const prevScale = useRef(0)
  const anchor = useRef<{ clientY: number } | null>(null)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !box.w) return // noch nicht vermessen – nichts anfassen
    // Erste echte Skalierung nur merken, nicht scrollen.
    if (prevScale.current === 0 || prevScale.current === cssScale) {
      prevScale.current = cssScale
      return
    }
    const ratio = cssScale / prevScale.current
    const focusY = anchor.current
      ? anchor.current.clientY - el.getBoundingClientRect().top
      : el.clientHeight / 2
    const focusX = el.clientWidth / 2
    el.scrollTop = Math.max(0, (el.scrollTop + focusY) * ratio - focusY)
    el.scrollLeft = Math.max(0, (el.scrollLeft + focusX) * ratio - focusX)
    prevScale.current = cssScale
    anchor.current = null
    setScrollTop(el.scrollTop)
  }, [cssScale, box.w])

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setScrollTop(el.scrollTop)
    // sichtbarste Seite bestimmen
    const mid = el.scrollTop + el.clientHeight / 2
    let best = 1
    let bestDist = Infinity
    for (const l of layoutsRef.current) {
      const center = l.top + l.height / 2
      const d = Math.abs(center - mid)
      if (d < bestDist) {
        bestDist = d
        best = l.index
      }
    }
    if (best !== useUiStore.getState().currentPage) setCurrentPage(best)
  }, [setCurrentPage])

  const layoutsRef = useRef<PageLayout[]>(layouts)
  layoutsRef.current = layouts

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      anchor.current = { clientY: e.clientY }
      const factor = Math.exp(-e.deltaY * 0.0022)
      const next = clamp((useUiStore.getState().zoom || 1) * factor, 0.1, 8)
      setZoom(next, 'custom')
    },
    [setZoom]
  )

  // Bei Moduswechsel / Seitenwechsel im Single-Modus scrollen
  useEffect(() => {
    const el = scrollRef.current
    if (!el || viewMode !== 'single') return
    const l = layoutsRef.current[currentPage - 1]
    if (l) el.scrollTo({ top: l.top - PAD, behavior: 'auto' })
  }, [viewMode, currentPage])

  // Sprünge aus der Sidebar / Toolbar
  useEffect(() => {
    registerViewerScroll((pageIndex1) => {
      const el = scrollRef.current
      const l = layoutsRef.current[pageIndex1 - 1]
      if (el && l) el.scrollTo({ top: Math.max(0, l.top - PAD), behavior: 'smooth' })
    })
    return () => registerViewerScroll(null)
  }, [])

  if (!doc) {
    return (
      <div className="viewer">
        <div className="viewer__state">
          <EmptyState
            icon="file-plus"
            title="Kein Dokument geöffnet"
            hint={
              <>
                Zieh ein PDF in dieses Fenster oder öffne eines über <kbd>⌘</kbd> <kbd>O</kbd>.
              </>
            }
            action={
              <Button variant="primary" icon="upload" onClick={() => void openViaDialog()}>
                PDF öffnen …
              </Button>
            }
          />
        </div>
      </div>
    )
  }

  const visible =
    viewMode === 'single'
      ? layouts.filter((l) => l.index === currentPage)
      : layouts.filter(
          (l) => l.top + l.height > scrollTop - OVERSCAN && l.top < scrollTop + box.h + OVERSCAN
        )

  return (
    <div className={nightMode ? 'viewer is-night' : 'viewer'}>
      {searchOpen && (
        <FindBar proxy={proxy} layouts={layouts} cssScale={cssScale} scrollRef={scrollRef} />
      )}
      <div className="viewer__scroll" ref={attachScroll} onScroll={onScroll} onWheel={onWheel}>
        {error ? (
          <div className="viewer__state">
            <EmptyState icon="info" title="Kann nicht angezeigt werden" hint={error} />
          </div>
        ) : (
          <div
            className="viewer__inner"
            style={{ width: Math.max(maxWidth + PAD * 2, box.w), height: totalHeight + PAD }}
          >
            {visible.map((l) => (
              <PageView
                key={`${doc.pages[l.index - 1].id}:${revision}`}
                layout={l}
                proxy={proxy}
                cssScale={cssScale}
                showText={!nightMode}
                highlights={searchMatches
                  .map((m, mi) => ({ m, mi }))
                  .filter(({ m }) => m.pageIndex === l.index)
                  .map(({ m, mi }) => ({ rect: m.rect, active: mi === searchActive }))}
                overlay={
                  <AnnotationLayer
                    docKey={doc.key}
                    pageId={doc.pages[l.index - 1].id}
                    cssScale={cssScale}
                    pageWidthPt={pageDisplaySize(doc.pages[l.index - 1]).width}
                    pageHeightPt={pageDisplaySize(doc.pages[l.index - 1]).height}
                    resolveTextBlock={async (pt: Point) => {
                      const pm = doc.pages[l.index - 1]
                      if (!proxy || pm.source.kind !== 'original') return null
                      const blocks = await getTextBlocks(proxy, pm.source.index + 1, pm.rotation)
                      return blockAtPoint(blocks, pt.x, pt.y)
                    }}
                  />
                }
              />
            ))}
          </div>
        )}
        {loading && !error && (
          <div className="viewer__state">
            <Spinner size={24} />
          </div>
        )}
      </div>

      <div className="viewer__hud no-drag">
        <IconButton name="zoom-out" label="Verkleinern" onClick={() => useUiStore.getState().zoomOut()} />
        <span className="zoomval">{Math.round((cssScale / PT) * 100)} %</span>
        <IconButton name="zoom-in" label="Vergrößern" onClick={() => useUiStore.getState().zoomIn()} />
      </div>
    </div>
  )
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v))
}
