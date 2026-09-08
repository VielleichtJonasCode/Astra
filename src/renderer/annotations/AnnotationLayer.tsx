import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { nanoid } from 'nanoid'
import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'
import { DEFAULT_TEXT_STYLE, type Annotation, type Redaction } from '../pdf/model'
import { rectFromPoints, type Point, type Rect } from '../lib/geometry'
import type { TextItemBox } from '../pdf/pdfjs'
import { selectTextQuads } from '../pdf/textSelection'
import { planCoverRect } from '../pdf/coverRect'
import { createAnnotationFromRect, createInk } from './factory'
import { AnnotationView, AnnotationSvgShape } from './AnnotationView'
import { TextEditor } from './TextEditor'
import './annotations.css'

const EMPTY: Annotation[] = []
const EMPTY_RED: Redaction[] = []
const HTML_KINDS = ['text', 'note', 'stamp', 'image', 'signature']
const MARKUP_TOOLS = new Set(['highlight', 'underline', 'strikeout', 'redact'])
const DRAW_TOOLS = new Set([
  'text',
  'editText',
  'redact',
  'highlight',
  'underline',
  'strikeout',
  'ink',
  'shape-rect',
  'shape-ellipse',
  'shape-line',
  'shape-arrow',
  'note',
  'stamp'
])

export interface TextBlockHit {
  text: string
  rect: Rect
  fontSize: number
}

export interface AnnotationLayerProps {
  docKey: string
  pageId: string
  cssScale: number
  pageWidthPt: number
  pageHeightPt: number
  resolveTextBlock?: (pt: Point) => Promise<TextBlockHit | null>
  getTextBoxes?: () => Promise<TextItemBox[]>
}

type Draft =
  | { kind: 'rect'; start: Point; cur: Point }
  | { kind: 'ink'; points: Point[] }
  | { kind: 'textmark'; start: Point; cur: Point; quads: Rect[] }
  | null

export function AnnotationLayer({
  docKey,
  pageId,
  cssScale,
  pageWidthPt,
  pageHeightPt,
  resolveTextBlock,
  getTextBoxes
}: AnnotationLayerProps): JSX.Element {
  const annotations = useDocStore((s) => s.docs[docKey]?.annotations[pageId] ?? EMPTY)
  const redactions = useDocStore((s) => s.docs[docKey]?.redactions[pageId] ?? EMPTY_RED)
  const addAnnotation = useDocStore((s) => s.addAnnotation)
  const updateAnnotation = useDocStore((s) => s.updateAnnotation)
  const addRedaction = useDocStore((s) => s.addRedaction)
  const removeRedaction = useDocStore((s) => s.removeRedaction)
  const mutate = useDocStore((s) => s.mutate)

  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const toolColor = useUiStore((s) => s.toolColor)
  const toolStrokeWidth = useUiStore((s) => s.toolStrokeWidth)
  const selected = useUiStore((s) => s.selectedAnnotations)
  const selectAnnotations = useUiStore((s) => s.selectAnnotations)
  const editingId = useUiStore((s) => s.editingAnnotationId)
  const setEditingId = useUiStore((s) => s.setEditingAnnotation)

  const rootRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState<Draft>(null)
  const boxesRef = useRef<TextItemBox[] | null>(null)

  const toPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point => {
      const box = rootRef.current!.getBoundingClientRect()
      return {
        x: Math.max(0, Math.min(pageWidthPt, (e.clientX - box.left) / cssScale)),
        y: Math.max(0, Math.min(pageHeightPt, (e.clientY - box.top) / cssScale))
      }
    },
    [cssScale, pageWidthPt, pageHeightPt]
  )

  const ctx = useMemo(
    () => ({ pageId, color: toolColor, strokeWidth: toolStrokeWidth }),
    [pageId, toolColor, toolStrokeWidth]
  )

  /* ---------- Zeichnen ---------- */

  const onCapturePointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toPoint(e)

    if (tool === 'editText') {
      void handleEditTextAt(p)
      return
    }
    if (tool === 'note') {
      const a = createAnnotationFromRect('note', { x: p.x, y: p.y, width: 22, height: 22 }, ctx)
      if (a) commit(a, { select: true, toSelect: true })
      return
    }
    if (tool === 'ink') {
      setDraft({ kind: 'ink', points: [p] })
      return
    }
    if (MARKUP_TOOLS.has(tool)) {
      if (getTextBoxes && !boxesRef.current) {
        void getTextBoxes().then((b) => (boxesRef.current = b))
      }
      setDraft({ kind: 'textmark', start: p, cur: p, quads: [] })
      return
    }
    setDraft({ kind: 'rect', start: p, cur: p })
  }

  /** Liest Hintergrund- und Schriftfarbe der Originalzeile aus dem Seiten-Canvas. */
  const samplePageColors = (r: Rect): { bg: string; ink: string } => {
    const fallback = { bg: '#ffffff', ink: '#000000' }
    const cv = rootRef.current
      ?.closest('.pageview')
      ?.querySelector('canvas.pageview__canvas') as HTMLCanvasElement | null
    if (!cv || !cv.clientWidth) return fallback
    try {
      const ctx = cv.getContext('2d')
      if (!ctx) return fallback
      const k = cv.width / cv.clientWidth // Geräte-Pixel pro CSS-Pixel
      const toPx = (x: number, y: number): [number, number] => [
        Math.round(x * cssScale * k),
        Math.round(y * cssScale * k)
      ]
      const px = (x: number, y: number): [number, number, number] | null => {
        const [cx, cy] = toPx(x, y)
        if (cx < 0 || cy < 0 || cx >= cv.width || cy >= cv.height) return null
        const d = ctx.getImageData(cx, cy, 1, 1).data
        return [d[0], d[1], d[2]]
      }
      const lum = (c: [number, number, number]): number =>
        0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]

      // Hintergrund: Punkte knapp außerhalb der Zeile
      const bgPts: [number, number, number][] = []
      for (let i = 1; i <= 5; i++) {
        const x = r.x + (r.width * i) / 6
        for (const y of [r.y - r.height * 0.6, r.y + r.height * 1.5]) {
          const c = px(x, y)
          if (c) bgPts.push(c)
        }
      }
      bgPts.sort((a, b) => lum(a) - lum(b))
      const bgC = bgPts[Math.floor(bgPts.length / 2)] ?? [255, 255, 255]

      // Schrift: dunkelster Punkt innerhalb der Zeile
      let inkC: [number, number, number] = [0, 0, 0]
      let inkL = Infinity
      for (let gx = 0; gx <= 12; gx++) {
        for (let gy = 1; gy <= 4; gy++) {
          const c = px(r.x + (r.width * gx) / 12, r.y + (r.height * gy) / 5)
          if (c && lum(c) < inkL) {
            inkL = lum(c)
            inkC = c
          }
        }
      }
      const hexc = (c: number[]): string =>
        '#' + c.map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('')
      // Wenn die Zeile praktisch leer ist, lieber Standard-Schwarz.
      if (inkL > lum(bgC) - 40) return { bg: hexc(bgC), ink: '#000000' }
      return { bg: hexc(bgC), ink: hexc(inkC) }
    } catch {
      return fallback
    }
  }

  const handleEditTextAt = async (p: Point): Promise<void> => {
    if (!resolveTextBlock) {
      setTool('select')
      return
    }
    const hit = await resolveTextBlock(p)
    if (!hit) {
      setTool('select')
      return
    }
    const size = hit.fontSize

    // Enge Zeilen-Box + Deckrechteck, das die Nachbarzeilen garantiert nicht berührt.
    const boxes = getTextBoxes
      ? (boxesRef.current ?? (boxesRef.current = await getTextBoxes()))
      : []
    const { tight, cover: coverRect } = planCoverRect(hit.rect, boxes, size)

    const { bg, ink } = samplePageColors(tight)
    const cover = { color: bg, rect: coverRect }
    const a: Annotation = {
      id: nanoid(10),
      pageId,
      kind: 'text',
      rect: {
        x: tight.x,
        y: tight.y,
        width: Math.max(tight.width + size * 4, 80),
        height: size * 1.25
      },
      text: hit.text,
      // lineHeight 1 + Padding im Editor sorgen dafür, dass Vorschau und
      // eingebackener Text auf derselben Grundlinie sitzen wie das Original.
      style: { ...DEFAULT_TEXT_STYLE, size, color: ink, align: 'left', lineHeight: 1 },
      cover
    }
    addAnnotation(docKey, a)
    selectAnnotations([a.id])
    setEditingId(a.id)
    setTool('select')
  }

  const onCapturePointerMove = (e: React.PointerEvent): void => {
    if (!draft) return
    const p = toPoint(e)
    if (draft.kind === 'ink') {
      setDraft({ kind: 'ink', points: [...draft.points, p] })
    } else if (draft.kind === 'textmark') {
      const quads = boxesRef.current ? selectTextQuads(boxesRef.current, draft.start, p) : []
      setDraft({ kind: 'textmark', start: draft.start, cur: p, quads })
    } else {
      setDraft({ kind: 'rect', start: draft.start, cur: p })
    }
  }

  const onCapturePointerUp = (e: React.PointerEvent): void => {
    if (!draft) return
    const p = toPoint(e)

    if (draft.kind === 'ink') {
      finishInk([...draft.points, p])
      setDraft(null)
      return
    }

    if (draft.kind === 'textmark') {
      const quads = boxesRef.current ? selectTextQuads(boxesRef.current, draft.start, p) : []
      setDraft(null)
      if (quads.length > 0) {
        applyMarkupQuads(quads)
      } else {
        // Kein Text getroffen → freie Fläche (z. B. gescanntes Bild)
        const rect = rectFromPoints(draft.start, p)
        if (rect.width < 3 || rect.height < 3) return
        if (tool === 'redact') {
          addRedaction(docKey, { id: nanoid(10), pageId, rect, fill: '#000000' })
        } else {
          const a = createAnnotationFromRect(tool, rect, ctx)
          if (a) commit(a, { select: false, toSelect: false })
        }
      }
      return
    }

    const rect = rectFromPoints(draft.start, p)
    setDraft(null)
    if (tool === 'text' || tool === 'stamp') {
      const a = createAnnotationFromRect(tool, rect, ctx)
      if (a) {
        commit(a, { select: true, toSelect: true })
        if (tool === 'text') setEditingId(a.id)
      }
      return
    }
    if (rect.width < 3 && rect.height < 3) return
    const a = createAnnotationFromRect(tool, rect, ctx)
    if (a) commit(a, { select: false, toSelect: false })
  }

  const applyMarkupQuads = (quads: Rect[]): void => {
    const bounds = quads.reduce((acc, q) => ({
      x: Math.min(acc.x, q.x),
      y: Math.min(acc.y, q.y),
      width: Math.max(acc.x + acc.width, q.x + q.width) - Math.min(acc.x, q.x),
      height: Math.max(acc.y + acc.height, q.y + q.height) - Math.min(acc.y, q.y)
    }))
    if (tool === 'redact') {
      mutate(docKey, 'Text schwärzen', (d) => {
        for (const q of quads) {
          ;(d.redactions[pageId] ??= []).push({
            id: nanoid(10),
            pageId,
            rect: { ...q },
            fill: '#000000'
          })
        }
      })
      return
    }
    const kind =
      tool === 'highlight' ? 'highlight' : tool === 'underline' ? 'underline' : 'strikeout'
    addAnnotation(docKey, {
      id: nanoid(10),
      pageId,
      kind,
      rect: bounds,
      color: toolColor,
      quads: quads.map((q) => ({ ...q })),
      opacity: kind === 'highlight' ? 0.4 : 1
    })
  }

  const finishInk = (pts: Point[]): void => {
    if (pts.length < 2) return
    const xs = pts.map((q) => q.x)
    const ys = pts.map((q) => q.y)
    const bbox: Rect = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
      height: Math.max(1, Math.max(...ys) - Math.min(...ys))
    }
    const norm = pts.map((q) => ({
      x: (q.x - bbox.x) / bbox.width,
      y: (q.y - bbox.y) / bbox.height
    }))
    commit(createInk(pageId, bbox, [norm], toolColor, toolStrokeWidth), {
      select: false,
      toSelect: false
    })
  }

  const commit = (a: Annotation, opts: { select: boolean; toSelect: boolean }): void => {
    addAnnotation(docKey, a)
    if (opts.select) selectAnnotations([a.id])
    if (opts.toSelect) setTool('select')
  }

  /* ---------- Auswahl / Transformieren ---------- */

  const dragState = useRef<{
    id: string
    mode: 'move' | 'resize' | 'endpoint'
    handle?: string
    startRect: Rect
    startPoint: Point
    from?: Point
    to?: Point
  } | null>(null)

  const beginDrag = (
    e: React.PointerEvent,
    a: Annotation,
    mode: 'move' | 'resize' | 'endpoint',
    handle?: string
  ): void => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()
    selectAnnotations([a.id])
    dragState.current = {
      id: a.id,
      mode,
      handle,
      startRect: { ...a.rect },
      startPoint: toPoint(e),
      from: 'from' in a ? a.from : undefined,
      to: 'to' in a ? a.to : undefined
    }
    document.body.style.userSelect = 'none'
    // Fenster-Listener: unabhängig von Re-Renders und Pointer-Capture
    const move = (ev: PointerEvent): void => applyDrag(ev)
    const up = (): void => {
      dragState.current = null
      document.body.style.userSelect = ''
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const applyDrag = (e: { clientX: number; clientY: number }): void => {
    const st = dragState.current
    if (!st) return
    const p = toPoint(e)
    const dx = p.x - st.startPoint.x
    const dy = p.y - st.startPoint.y

    if (st.mode === 'move') {
      updateAnnotation(
        docKey,
        st.id,
        { rect: { ...st.startRect, x: st.startRect.x + dx, y: st.startRect.y + dy } },
        { coalesceKey: `move:${st.id}` }
      )
    } else if (st.mode === 'resize') {
      const r = { ...st.startRect }
      const h = st.handle ?? ''
      if (h.includes('e')) r.width = Math.max(6, st.startRect.width + dx)
      if (h.includes('s')) r.height = Math.max(6, st.startRect.height + dy)
      if (h.includes('w')) {
        r.x = st.startRect.x + dx
        r.width = Math.max(6, st.startRect.width - dx)
      }
      if (h.includes('n')) {
        r.y = st.startRect.y + dy
        r.height = Math.max(6, st.startRect.height - dy)
      }
      updateAnnotation(docKey, st.id, { rect: r }, { coalesceKey: `resize:${st.id}` })
    } else if (st.mode === 'endpoint' && st.from && st.to) {
      const rel = {
        x: st.startRect.width ? (p.x - st.startRect.x) / st.startRect.width : 0,
        y: st.startRect.height ? (p.y - st.startRect.y) / st.startRect.height : 0
      }
      updateAnnotation(docKey, st.id, st.handle === 'from' ? { from: rel } : { to: rel }, {
        coalesceKey: `endpoint:${st.id}`
      })
    }
  }

  const editing = annotations.find((a) => a.id === editingId && a.kind === 'text')

  useLayoutEffect(() => {
    if (!editingId) return
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') setEditingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editingId, setEditingId])

  const showCapture = DRAW_TOOLS.has(tool)
  const interactive = tool === 'select'

  return (
    <div
      ref={rootRef}
      className="anno-root"
      style={{ width: pageWidthPt * cssScale, height: pageHeightPt * cssScale }}
    >
      <svg
        className="anno-svg"
        width={pageWidthPt * cssScale}
        height={pageHeightPt * cssScale}
        viewBox={`0 0 ${pageWidthPt} ${pageHeightPt}`}
      >
        {annotations.map((a) =>
          a.kind === 'text' && a.cover && a.cover.rect ? (
            <rect
              key={`cover-${a.id}`}
              x={a.cover.rect.x}
              y={a.cover.rect.y}
              width={a.cover.rect.width}
              height={a.cover.rect.height}
              fill={a.cover.color}
            />
          ) : null
        )}
        {annotations.map((a) => (
          <g key={a.id} opacity={a.opacity ?? 1}>
            <AnnotationSvgShape a={a} />
          </g>
        ))}
        {redactions.map((r) => (
          <rect
            key={r.id}
            x={r.rect.x}
            y={r.rect.y}
            width={r.rect.width}
            height={r.rect.height}
            fill={r.fill}
          />
        ))}
        {draft?.kind === 'ink' && (
          <polyline
            points={draft.points.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={toolColor}
            strokeWidth={toolStrokeWidth}
            strokeLinecap="round"
          />
        )}
        {draft?.kind === 'textmark' &&
          draft.quads.map((q, i) => (
            <rect
              key={i}
              x={q.x}
              y={q.y}
              width={q.width}
              height={q.height}
              fill={tool === 'redact' ? '#000' : toolColor}
              opacity={tool === 'redact' ? 0.85 : 0.4}
            />
          ))}
      </svg>

      {annotations.map((a) =>
        HTML_KINDS.includes(a.kind) ? (
          <div
            key={a.id}
            className={`anno-hit ${interactive ? 'is-interactive' : ''}`}
            data-anno={a.id}
            style={{
              position: 'absolute',
              left: a.rect.x * cssScale,
              top: a.rect.y * cssScale,
              width: a.rect.width * cssScale,
              height: a.rect.height * cssScale,
              pointerEvents: interactive ? 'auto' : 'none',
              cursor: 'move'
            }}
            onPointerDown={(e) => interactive && beginDrag(e, a, 'move')}
            onDoubleClick={() => a.kind === 'text' && setEditingId(a.id)}
          >
            <AnnotationView annotation={a} scale={cssScale} docKey={docKey} />
          </div>
        ) : null
      )}

      {interactive &&
        annotations
          .filter((a) => !HTML_KINDS.includes(a.kind))
          .map((a) => (
            <div
              key={`hit-${a.id}`}
              data-anno={a.id}
              style={{
                position: 'absolute',
                left: a.rect.x * cssScale,
                top: a.rect.y * cssScale,
                width: Math.max(10, a.rect.width * cssScale),
                height: Math.max(10, a.rect.height * cssScale),
                pointerEvents: 'auto',
                cursor: 'move'
              }}
              onPointerDown={(e) => beginDrag(e, a, 'move')}
            />
          ))}

      {interactive &&
        redactions.map((r) => (
          <div
            key={`red-${r.id}`}
            title="Doppelklick: Schwärzung entfernen"
            style={{
              position: 'absolute',
              left: r.rect.x * cssScale,
              top: r.rect.y * cssScale,
              width: r.rect.width * cssScale,
              height: r.rect.height * cssScale,
              pointerEvents: 'auto',
              cursor: 'pointer'
            }}
            onDoubleClick={() => removeRedaction(docKey, r.id)}
          />
        ))}

      {interactive &&
        selected
          .map((id) => annotations.find((a) => a.id === id))
          .filter((a): a is Annotation => Boolean(a))
          .map((a) => (
            <SelectionFrame key={`sel-${a.id}`} a={a} scale={cssScale} onHandle={beginDrag} />
          ))}

      {showCapture && (
        <div
          className={
            'anno-capture ' +
            (tool === 'ink'
              ? 'anno-capture--pen'
              : MARKUP_TOOLS.has(tool)
                ? 'anno-capture--text'
                : '')
          }
          onPointerDown={onCapturePointerDown}
          onPointerMove={onCapturePointerMove}
          onPointerUp={onCapturePointerUp}
        />
      )}
      {draft?.kind === 'rect' && (
        <div
          className="anno-draft"
          style={{
            left: Math.min(draft.start.x, draft.cur.x) * cssScale,
            top: Math.min(draft.start.y, draft.cur.y) * cssScale,
            width: Math.abs(draft.cur.x - draft.start.x) * cssScale,
            height: Math.abs(draft.cur.y - draft.start.y) * cssScale
          }}
        />
      )}

      {editing && editing.kind === 'text' && (
        <TextEditor
          annotation={editing}
          scale={cssScale}
          onChange={(text) =>
            updateAnnotation(docKey, editing.id, { text }, { coalesceKey: `type:${editing.id}` })
          }
          onResize={(height) =>
            updateAnnotation(
              docKey,
              editing.id,
              { rect: { ...editing.rect, height } },
              {
                coalesceKey: `type:${editing.id}`
              }
            )
          }
          onDone={() => setEditingId(null)}
        />
      )}
    </div>
  )
}

/* ---------- Auswahlrahmen ---------- */

function SelectionFrame({
  a,
  scale,
  onHandle
}: {
  a: Annotation
  scale: number
  onHandle: (
    e: React.PointerEvent,
    a: Annotation,
    mode: 'move' | 'resize' | 'endpoint',
    handle?: string
  ) => void
}): JSX.Element {
  const r = a.rect
  const box = {
    left: r.x * scale,
    top: r.y * scale,
    width: r.width * scale,
    height: r.height * scale
  }

  if (a.kind === 'line' || a.kind === 'arrow') {
    const from = a.from ?? { x: 0, y: 0 }
    const to = a.to ?? { x: 1, y: 1 }
    const pts = [
      { h: 'from', x: (r.x + from.x * r.width) * scale, y: (r.y + from.y * r.height) * scale },
      { h: 'to', x: (r.x + to.x * r.width) * scale, y: (r.y + to.y * r.height) * scale }
    ]
    return (
      <>
        {pts.map((p) => (
          <div
            key={p.h}
            className="anno-handle is-round"
            style={{ left: p.x, top: p.y }}
            onPointerDown={(e) => onHandle(e, a, 'endpoint', p.h)}
          />
        ))}
      </>
    )
  }

  const handles = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
  const pos = (h: string): { left: number; top: number } => ({
    left: box.left + (h.includes('w') ? 0 : h.includes('e') ? box.width : box.width / 2),
    top: box.top + (h.includes('n') ? 0 : h.includes('s') ? box.height : box.height / 2)
  })
  return (
    <>
      {/* Voll-Box zum Verschieben (unter den Griffen) */}
      <div
        className="anno-move"
        style={{ position: 'absolute', ...box }}
        onPointerDown={(e) => onHandle(e, a, 'move')}
      />
      <div
        style={{
          position: 'absolute',
          ...box,
          border: '1px solid var(--accent)',
          pointerEvents: 'none'
        }}
      />
      {handles.map((h) => (
        <div
          key={h}
          className="anno-handle"
          style={{ ...pos(h), cursor: `${h}-resize` }}
          onPointerDown={(e) => onHandle(e, a, 'resize', h)}
        />
      ))}
    </>
  )
}
