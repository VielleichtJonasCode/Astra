import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'
import type { Annotation } from '../pdf/model'
import { rectFromPoints, type Point, type Rect } from '../lib/geometry'
import { bytesToBlob } from '../lib/bytes'
import { nanoid } from 'nanoid'
import { DEFAULT_TEXT_STYLE, type Redaction } from '../pdf/model'
import { createAnnotationFromRect, createInk, createImageAnnotation } from './factory'
import { AnnotationView, AnnotationSvgShape } from './AnnotationView'
import { TextEditor } from './TextEditor'
import './annotations.css'

const EMPTY: Annotation[] = []
const EMPTY_RED: Redaction[] = []
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
  'stamp',
  'image'
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
}

type Draft =
  | { kind: 'rect'; start: Point; cur: Point }
  | { kind: 'ink'; points: Point[] }
  | null

export function AnnotationLayer({
  docKey,
  pageId,
  cssScale,
  pageWidthPt,
  pageHeightPt,
  resolveTextBlock
}: AnnotationLayerProps): JSX.Element {
  const annotations = useDocStore((s) => s.docs[docKey]?.annotations[pageId] ?? EMPTY)
  const redactions = useDocStore((s) => s.docs[docKey]?.redactions[pageId] ?? EMPTY_RED)
  const addAnnotation = useDocStore((s) => s.addAnnotation)
  const updateAnnotation = useDocStore((s) => s.updateAnnotation)
  const addRedaction = useDocStore((s) => s.addRedaction)
  const removeRedaction = useDocStore((s) => s.removeRedaction)
  const addAsset = useDocStore((s) => s.addAsset)

  const tool = useUiStore((s) => s.tool)
  const setTool = useUiStore((s) => s.setTool)
  const toolColor = useUiStore((s) => s.toolColor)
  const toolStrokeWidth = useUiStore((s) => s.toolStrokeWidth)
  const selected = useUiStore((s) => s.selectedAnnotations)
  const selectAnnotations = useUiStore((s) => s.selectAnnotations)
  const editingId = useUiStore((s) => s.editingAnnotationId)
  const setEditingId = useUiStore((s) => s.setEditingAnnotation)

  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [draft, setDraft] = useState<Draft>(null)

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

  /* ---------- Zeichnen (Capture-Layer) ---------- */

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
    if (tool === 'image') {
      fileRef.current?.click()
      return
    }
    if (tool === 'ink') {
      setDraft({ kind: 'ink', points: [p] })
      return
    }
    setDraft({ kind: 'rect', start: p, cur: p })
  }

  const handleEditTextAt = async (p: Point): Promise<void> => {
    if (!resolveTextBlock) return
    const hit = await resolveTextBlock(p)
    if (!hit) {
      useUiStore.getState().setTool('select')
      return
    }
    const pad = Math.max(2, hit.fontSize * 0.18)
    const a: Annotation = {
      id: nanoid(10),
      pageId,
      kind: 'text',
      rect: {
        x: hit.rect.x - pad,
        y: hit.rect.y - pad,
        width: hit.rect.width + pad * 2 + hit.fontSize,
        height: hit.rect.height + pad * 2
      },
      text: hit.text,
      style: {
        ...DEFAULT_TEXT_STYLE,
        size: hit.fontSize,
        color: '#000000',
        align: 'left',
        lineHeight: 1.15
      },
      cover: { color: '#ffffff' }
    }
    addAnnotation(docKey, a)
    selectAnnotations([a.id])
    setEditingId(a.id)
    useUiStore.getState().setTool('select')
  }

  const onCapturePointerMove = (e: React.PointerEvent): void => {
    if (!draft) return
    const p = toPoint(e)
    setDraft((d) =>
      d?.kind === 'ink'
        ? { kind: 'ink', points: [...d.points, p] }
        : d
          ? { kind: 'rect', start: d.start, cur: p }
          : d
    )
  }

  const onCapturePointerUp = (e: React.PointerEvent): void => {
    if (!draft) return
    const p = toPoint(e)

    if (draft.kind === 'ink') {
      const pts = [...draft.points, p]
      const xs = pts.map((q) => q.x)
      const ys = pts.map((q) => q.y)
      const bbox: Rect = {
        x: Math.min(...xs),
        y: Math.min(...ys),
        width: Math.max(1, Math.max(...xs) - Math.min(...xs)),
        height: Math.max(1, Math.max(...ys) - Math.min(...ys))
      }
      if (pts.length > 1) {
        const norm = pts.map((q) => ({
          x: (q.x - bbox.x) / bbox.width,
          y: (q.y - bbox.y) / bbox.height
        }))
        commit(createInk(pageId, bbox, [norm], toolColor, toolStrokeWidth), {
          select: false,
          toSelect: false
        })
      }
      setDraft(null)
      return
    }

    const rect = rectFromPoints(draft.start, p)
    setDraft(null)

    if (tool === 'redact') {
      if (rect.width < 3 || rect.height < 3) return
      addRedaction(docKey, { id: nanoid(10), pageId, rect, fill: '#000000' })
      return
    }
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

  const commit = (a: Annotation, opts: { select: boolean; toSelect: boolean }): void => {
    addAnnotation(docKey, a)
    if (opts.select) selectAnnotations([a.id])
    if (opts.toSelect) setTool('select')
  }

  const onImageFile = async (file: File): Promise<void> => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = file.type || 'image/png'
    const url = URL.createObjectURL(bytesToBlob(bytes, mime))
    const img = new Image()
    img.src = url
    await img.decode().catch(() => undefined)
    URL.revokeObjectURL(url)
    const natW = img.naturalWidth || 200
    const natH = img.naturalHeight || 150
    const w = 220
    const h = (natH / natW) * w
    const assetId = addAsset(docKey, { type: 'image', mime, bytes })
    const rect: Rect = {
      x: Math.max(0, pageWidthPt / 2 - w / 2),
      y: Math.max(0, pageHeightPt / 2 - h / 2),
      width: w,
      height: h
    }
    commit(createImageAnnotation(pageId, rect, assetId), { select: true, toSelect: true })
  }

  /* ---------- Auswahl / Verschieben / Größe ---------- */

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
    e.stopPropagation()
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
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
  }

  const onDragMove = (e: React.PointerEvent): void => {
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
      updateAnnotation(
        docKey,
        st.id,
        st.handle === 'from' ? { from: rel } : { to: rel },
        { coalesceKey: `endpoint:${st.id}` }
      )
    }
  }

  const endDrag = (): void => {
    dragState.current = null
  }

  /* ---------- Textbearbeitung: Auto-Höhe ---------- */

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
    <div ref={rootRef} className="anno-root" style={{ width: pageWidthPt * cssScale, height: pageHeightPt * cssScale }}>
      <svg
        className="anno-svg"
        width={pageWidthPt * cssScale}
        height={pageHeightPt * cssScale}
        viewBox={`0 0 ${pageWidthPt} ${pageHeightPt}`}
      >
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
      </svg>

      {annotations.map((a) =>
        a.kind === 'text' || a.kind === 'note' || a.kind === 'stamp' || a.kind === 'image' ? (
          <div
            key={a.id}
            className={`anno-hit ${interactive ? 'is-interactive' : ''}`}
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
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onDoubleClick={() => a.kind === 'text' && setEditingId(a.id)}
          >
            <AnnotationView annotation={a} scale={cssScale} docKey={docKey} />
          </div>
        ) : null
      )}

      {/* Auswahl-Hitbox für SVG-Formen */}
      {interactive &&
        annotations
          .filter((a) => !['text', 'note', 'stamp', 'image'].includes(a.kind))
          .map((a) => (
            <div
              key={`hit-${a.id}`}
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
              onPointerMove={onDragMove}
              onPointerUp={endDrag}
            />
          ))}

      {/* Schwärzungen: im Auswahlmodus per Doppelklick entfernbar */}
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

      {/* Auswahl-Rahmen + Griffe */}
      {interactive &&
        selected
          .map((id) => annotations.find((a) => a.id === id))
          .filter((a): a is Annotation => Boolean(a))
          .map((a) => <SelectionFrame key={`sel-${a.id}`} a={a} scale={cssScale} onHandle={beginDrag} onMove={onDragMove} onUp={endDrag} />)}

      {/* Zeichenfläche */}
      {showCapture && (
        <div
          className="anno-capture"
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
            updateAnnotation(docKey, editing.id, { rect: { ...editing.rect, height } }, {
              coalesceKey: `type:${editing.id}`
            })
          }
          onDone={() => setEditingId(null)}
        />
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImageFile(f)
          e.target.value = ''
        }}
      />
    </div>
  )
}

/* ---------- Auswahlrahmen ---------- */

function SelectionFrame({
  a,
  scale,
  onHandle,
  onMove,
  onUp
}: {
  a: Annotation
  scale: number
  onHandle: (e: React.PointerEvent, a: Annotation, mode: 'resize' | 'endpoint', handle?: string) => void
  onMove: (e: React.PointerEvent) => void
  onUp: () => void
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
            onPointerMove={onMove}
            onPointerUp={onUp}
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
          onPointerMove={onMove}
          onPointerUp={onUp}
        />
      ))}
    </>
  )
}
