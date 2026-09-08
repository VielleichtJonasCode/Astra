import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useImageStore } from '../store/imageStore'
import { composite } from '../image/compose'
import {
  annoBounds,
  makeBoxAnno,
  makeDrawAnno,
  makeLineAnno,
  makeStepAnno,
  makeTextAnno,
  type Anno,
  type BoxAnno,
  type ImgTool
} from '../image/model'
import { Button } from './common/Button'

interface CtxSrc {
  color: string
  strokeWidth: number
  fontSize: number
  strength: number
}
const toolCtx = (s: CtxSrc): CtxSrc => ({
  color: s.color,
  strokeWidth: s.strokeWidth,
  fontSize: s.fontSize,
  strength: s.strength
})

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'p1' | 'p2'
const BOX_HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const BOX_TOOLS = new Set<ImgTool>(['rect', 'ellipse', 'redact', 'highlight', 'pixelate', 'blur'])

interface Pt {
  x: number
  y: number
}
type Drag =
  | { kind: 'move'; id: string; start: Pt; orig: Anno }
  | { kind: 'resize'; id: string; handle: Handle; start: Pt; orig: Anno }
  | { kind: 'draft-box'; start: Pt; cur: Pt }
  | { kind: 'draft-line'; start: Pt; cur: Pt }
  | { kind: 'draft-draw'; points: number[] }
  | { kind: 'draft-crop'; start: Pt; cur: Pt }
  | null

export function ImageCanvas({ zoom }: { zoom: 'fit' | number }): JSX.Element {
  const base = useImageStore((s) => s.base)
  const annos = useImageStore((s) => s.annos)
  const adjust = useImageStore((s) => s.adjust)
  const rev = useImageStore((s) => s.rev)
  const tool = useImageStore((s) => s.tool)
  const selectedId = useImageStore((s) => s.selectedId)
  const editingId = useImageStore((s) => s.editingId)

  const st = useImageStore
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [drag, setDrag] = useState<Drag>(null)
  const [cropRect, setCropRect] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null
  )

  const iw = base?.width ?? 1
  const ih = base?.height ?? 1

  useEffect(() => {
    if (!stageEl) return
    const ro = new ResizeObserver(() => setBox({ w: stageEl.clientWidth, h: stageEl.clientHeight }))
    ro.observe(stageEl)
    setBox({ w: stageEl.clientWidth, h: stageEl.clientHeight })
    return () => ro.disconnect()
  }, [stageEl])

  const fitScale = Math.min((box.w - 48) / iw, (box.h - 48) / ih, 1) || 0.1
  const scale = zoom === 'fit' ? Math.max(0.05, fitScale) : zoom
  const hideAnnos = drag?.kind === 'draft-crop'

  useLayoutEffect(() => {
    const cv = canvasRef.current
    if (!cv || !base) return
    const dispW = Math.max(1, Math.round(iw * scale))
    const dispH = Math.max(1, Math.round(ih * scale))
    cv.width = dispW
    cv.height = dispH
    const ctx = cv.getContext('2d')
    if (!ctx) return
    const composed = composite(base, hideAnnos ? [] : annos, adjust)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(composed, 0, 0, dispW, dispH)
  }, [base, annos, adjust, scale, iw, ih, rev, hideAnnos])

  useEffect(() => {
    if (tool !== 'crop') setCropRect(null)
  }, [tool])

  if (!base) return <div className="imged__stage" ref={setStageEl} />

  const toImg = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(iw, (e.clientX - r.left) / scale)),
      y: Math.max(0, Math.min(ih, (e.clientY - r.top) / scale))
    }
  }

  const handlesFor = (a: Anno): { id: Handle; x: number; y: number }[] => {
    if (a.type === 'line' || a.type === 'arrow') {
      return [
        { id: 'p1', x: a.x1, y: a.y1 },
        { id: 'p2', x: a.x2, y: a.y2 }
      ]
    }
    if (a.type === 'draw' || a.type === 'step') return []
    const b = annoBounds(a)
    const mx = b.x + b.w / 2
    const my = b.y + b.h / 2
    const map: Record<Exclude<Handle, 'p1' | 'p2'>, Pt> = {
      nw: { x: b.x, y: b.y },
      n: { x: mx, y: b.y },
      ne: { x: b.x + b.w, y: b.y },
      e: { x: b.x + b.w, y: my },
      se: { x: b.x + b.w, y: b.y + b.h },
      s: { x: mx, y: b.y + b.h },
      sw: { x: b.x, y: b.y + b.h },
      w: { x: b.x, y: my }
    }
    const list: Handle[] = a.type === 'text' ? ['w', 'e'] : BOX_HANDLES
    return list.map((id) => ({ id, ...map[id as Exclude<Handle, 'p1' | 'p2'>] }))
  }

  const hitAnno = (p: Pt): Anno | null => {
    for (let i = annos.length - 1; i >= 0; i--) {
      const a = annos[i]
      const b = annoBounds(a)
      const pad = a.type === 'draw' || a.type === 'line' || a.type === 'arrow' ? 10 : 2
      if (
        p.x >= b.x - pad &&
        p.x <= b.x + b.w + pad &&
        p.y >= b.y - pad &&
        p.y <= b.y + b.h + pad
      ) {
        return a
      }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    ;(e.target as Element).setPointerCapture(e.pointerId)
    const p = toImg(e)
    const s = st.getState()

    if (tool === 'select') {
      if (selectedId) {
        const sel = annos.find((a) => a.id === selectedId)
        if (sel) {
          const hit = handlesFor(sel).find(
            (h) => Math.hypot((h.x - p.x) * scale, (h.y - p.y) * scale) <= 11
          )
          if (hit) {
            s.pushHistory('drag:' + sel.id)
            setDrag({ kind: 'resize', id: sel.id, handle: hit.id, start: p, orig: { ...sel } })
            return
          }
        }
      }
      const hit = hitAnno(p)
      if (hit) {
        s.select(hit.id)
        s.pushHistory('drag:' + hit.id)
        setDrag({ kind: 'move', id: hit.id, start: p, orig: { ...hit } })
      } else {
        s.select(null)
      }
      return
    }

    if (tool === 'text') {
      const a = makeTextAnno(
        p.x,
        Math.max(0, p.y - s.fontSize / 2),
        Math.min(320, iw - p.x),
        toolCtx(s)
      )
      s.addAnno(a)
      s.setEditing(a.id)
      s.setTool('select')
      return
    }
    if (tool === 'step') {
      const a = makeStepAnno(p.x, p.y, s.nextStep(), toolCtx(s))
      s.addAnno(a)
      s.setTool('select')
      return
    }
    if (tool === 'draw') {
      setDrag({ kind: 'draft-draw', points: [p.x, p.y] })
      return
    }
    if (tool === 'line' || tool === 'arrow') {
      setDrag({ kind: 'draft-line', start: p, cur: p })
      return
    }
    if (tool === 'crop') {
      setDrag({ kind: 'draft-crop', start: p, cur: p })
      return
    }
    if (BOX_TOOLS.has(tool)) {
      setDrag({ kind: 'draft-box', start: p, cur: p })
    }
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    if (!drag) return
    const p = toImg(e)
    const s = st.getState()

    if (drag.kind === 'move') {
      const dx = p.x - drag.start.x
      const dy = p.y - drag.start.y
      const o = drag.orig
      if (o.type === 'line' || o.type === 'arrow') {
        s.updateAnno(o.id, { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy })
      } else if (o.type === 'draw') {
        s.updateAnno(o.id, { points: o.points.map((v, i) => v + (i % 2 ? dy : dx)) })
      } else if (o.type === 'step') {
        s.updateAnno(o.id, { x: o.x + dx, y: o.y + dy })
      } else {
        const bo = o as BoxAnno
        s.updateAnno(o.id, { x: bo.x + dx, y: bo.y + dy })
      }
      return
    }
    if (drag.kind === 'resize') {
      const o = drag.orig
      if (
        (o.type === 'line' || o.type === 'arrow') &&
        (drag.handle === 'p1' || drag.handle === 'p2')
      ) {
        s.updateAnno(o.id, drag.handle === 'p1' ? { x1: p.x, y1: p.y } : { x2: p.x, y2: p.y })
        return
      }
      const b = o as BoxAnno
      let x = b.x
      let y = b.y
      let w = b.w
      let h = b.h
      const right = x + w
      const bottom = y + h
      const H = drag.handle
      if (H.includes('w')) {
        x = Math.min(p.x, right - 6)
        w = right - x
      }
      if (H.includes('e')) w = Math.max(6, p.x - x)
      if (o.type === 'text') {
        s.updateAnno(o.id, { x, w })
        return
      }
      if (H.includes('n')) {
        y = Math.min(p.y, bottom - 6)
        h = bottom - y
      }
      if (H.includes('s')) h = Math.max(6, p.y - y)
      s.updateAnno(o.id, { x, y, w, h })
      return
    }
    if (drag.kind === 'draft-draw') {
      setDrag({ kind: 'draft-draw', points: [...drag.points, p.x, p.y] })
      return
    }
    setDrag({ ...drag, cur: p })
  }

  const onPointerUp = (): void => {
    if (!drag) return
    const s = st.getState()
    const ctx = toolCtx(s)

    if (drag.kind === 'draft-box') {
      const x = Math.min(drag.start.x, drag.cur.x)
      const y = Math.min(drag.start.y, drag.cur.y)
      const w = Math.abs(drag.start.x - drag.cur.x)
      const h = Math.abs(drag.start.y - drag.cur.y)
      if (w > 5 && h > 5) {
        s.addAnno(makeBoxAnno(tool as BoxAnno['type'], x, y, w, h, ctx))
        s.setTool('select')
      }
    } else if (drag.kind === 'draft-line') {
      const d = Math.hypot(drag.start.x - drag.cur.x, drag.start.y - drag.cur.y)
      if (d > 6) {
        s.addAnno(
          makeLineAnno(
            tool as 'line' | 'arrow',
            drag.start.x,
            drag.start.y,
            drag.cur.x,
            drag.cur.y,
            ctx
          )
        )
        s.setTool('select')
      }
    } else if (drag.kind === 'draft-draw') {
      if (drag.points.length >= 4) s.addAnno(makeDrawAnno(drag.points, ctx))
    } else if (drag.kind === 'draft-crop') {
      const x = Math.min(drag.start.x, drag.cur.x)
      const y = Math.min(drag.start.y, drag.cur.y)
      const w = Math.abs(drag.start.x - drag.cur.x)
      const h = Math.abs(drag.start.y - drag.cur.y)
      if (w > 8 && h > 8) setCropRect({ x, y, w, h })
    } else if (drag.kind === 'resize' || drag.kind === 'move') {
      const a = s.annos.find((x) => x.id === drag.id)
      if (a && 'w' in a && 'h' in a && ((a as BoxAnno).w < 0 || (a as BoxAnno).h < 0)) {
        const bb = a as BoxAnno
        s.updateAnno(a.id, {
          x: bb.w < 0 ? bb.x + bb.w : bb.x,
          y: bb.h < 0 ? bb.y + bb.h : bb.y,
          w: Math.abs(bb.w),
          h: Math.abs(bb.h)
        })
      }
    }
    setDrag(null)
  }

  const S = (v: number): number => v * scale
  const selected = annos.find((a) => a.id === selectedId) ?? null
  const cursor = tool === 'select' ? 'default' : tool === 'text' ? 'text' : 'crosshair'

  return (
    <div className="imged__stage" ref={setStageEl}>
      <div className="imged__paper" style={{ width: S(iw), height: S(ih) }}>
        <canvas ref={canvasRef} className="imged__bitmap" />
        <div
          className="imged__overlay"
          style={{ cursor }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <svg className="imged__vec" width={S(iw)} height={S(ih)}>
            {selected &&
              !editingId &&
              (() => {
                const b = annoBounds(selected)
                return (
                  <g>
                    <rect
                      className="imged__selbox"
                      x={S(b.x)}
                      y={S(b.y)}
                      width={S(b.w)}
                      height={S(b.h)}
                    />
                    {handlesFor(selected).map((h) => (
                      <rect
                        key={h.id}
                        className="imged__handle"
                        x={S(h.x) - 5}
                        y={S(h.y) - 5}
                        width={10}
                        height={10}
                      />
                    ))}
                  </g>
                )
              })()}

            {drag?.kind === 'draft-box' && (
              <rect
                className="imged__draft"
                x={S(Math.min(drag.start.x, drag.cur.x))}
                y={S(Math.min(drag.start.y, drag.cur.y))}
                width={S(Math.abs(drag.start.x - drag.cur.x))}
                height={S(Math.abs(drag.start.y - drag.cur.y))}
              />
            )}
            {drag?.kind === 'draft-line' && (
              <line
                className="imged__draft"
                x1={S(drag.start.x)}
                y1={S(drag.start.y)}
                x2={S(drag.cur.x)}
                y2={S(drag.cur.y)}
              />
            )}
            {drag?.kind === 'draft-draw' && (
              <polyline
                className="imged__draft"
                points={drag.points.map((v) => S(v)).join(' ')}
                fill="none"
              />
            )}
            {(drag?.kind === 'draft-crop' || cropRect) &&
              (() => {
                const r =
                  drag?.kind === 'draft-crop'
                    ? {
                        x: Math.min(drag.start.x, drag.cur.x),
                        y: Math.min(drag.start.y, drag.cur.y),
                        w: Math.abs(drag.start.x - drag.cur.x),
                        h: Math.abs(drag.start.y - drag.cur.y)
                      }
                    : cropRect!
                return (
                  <g>
                    <path
                      className="imged__cropmask"
                      d={`M0 0H${S(iw)}V${S(ih)}H0Z M${S(r.x)} ${S(r.y)}V${S(r.y + r.h)}H${S(
                        r.x + r.w
                      )}V${S(r.y)}Z`}
                      fillRule="evenodd"
                    />
                    <rect
                      className="imged__cropbox"
                      x={S(r.x)}
                      y={S(r.y)}
                      width={S(r.w)}
                      height={S(r.h)}
                    />
                  </g>
                )
              })()}
          </svg>

          {editingId && <TextEditor id={editingId} scale={scale} />}
        </div>
      </div>

      {tool === 'crop' && cropRect && (
        <div className="imged__cropbar">
          <span>
            {Math.round(cropRect.w)} × {Math.round(cropRect.h)} px
          </span>
          <Button
            variant="primary"
            icon="crop"
            onClick={() => {
              st.getState().crop(cropRect.x, cropRect.y, cropRect.w, cropRect.h)
              st.getState().setTool('select')
            }}
          >
            Zuschneiden
          </Button>
          <Button onClick={() => setCropRect(null)}>Abbrechen</Button>
        </div>
      )}
    </div>
  )
}

function TextEditor({ id, scale }: { id: string; scale: number }): JSX.Element | null {
  const anno = useImageStore((s) => s.annos.find((a) => a.id === id))
  const st = useImageStore
  const ref = useRef<HTMLTextAreaElement>(null)
  const began = useRef(false)

  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])

  if (!anno || anno.type !== 'text') return null
  const a = anno

  return (
    <textarea
      ref={ref}
      className="imged__textedit"
      value={a.text}
      style={{
        left: a.x * scale,
        top: a.y * scale,
        width: Math.max(40, a.w * scale),
        fontSize: a.fontSize * scale,
        lineHeight: 1.32,
        color: a.color,
        fontWeight: a.bold ? 600 : 400,
        textAlign: a.align,
        background: a.bg ?? 'transparent'
      }}
      onChange={(e) => {
        if (!began.current) {
          st.getState().pushHistory('text:' + id)
          began.current = true
        }
        st.getState().updateAnno(id, { text: e.target.value })
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.currentTarget.blur()
        e.stopPropagation()
      }}
      onBlur={() => {
        const cur = st.getState().annos.find((x) => x.id === id)
        if (cur && cur.type === 'text' && cur.text.trim() === '') st.getState().removeAnno(id)
        st.getState().setEditing(null)
      }}
    />
  )
}
