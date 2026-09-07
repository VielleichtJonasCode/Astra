import type { Annotation } from '../pdf/model'
import { cssFontFamily, cssFontStyle, cssFontWeight } from '../pdf/fonts'
import { bytesToBlob } from '../lib/bytes'
import { useDocStore } from '../store/docStore'
import { useMemo } from 'react'

/** Reine Darstellung einer Annotation im Overlay (PDF-Punkt-Koordinaten × scale). */
export function AnnotationView({
  annotation: a,
  scale,
  docKey
}: {
  annotation: Annotation
  scale: number
  docKey: string
}): JSX.Element | null {
  const px = (v: number): number => v * scale
  const style: React.CSSProperties = {
    left: px(a.rect.x),
    top: px(a.rect.y),
    width: px(a.rect.width),
    height: px(a.rect.height),
    opacity: a.opacity ?? 1
  }

  if (a.kind === 'text') {
    return (
      <div
        className="anno anno--text"
        data-anno={a.id}
        style={{
          ...style,
          color: a.style.color,
          fontFamily: cssFontFamily(a.style.font),
          fontWeight: cssFontWeight(a.style.font),
          fontStyle: cssFontStyle(a.style.font),
          fontSize: px(a.style.size),
          lineHeight: a.style.lineHeight,
          textAlign: a.style.align,
          background: a.cover ? a.cover.color : 'transparent'
        }}
      >
        {a.text || ' '}
      </div>
    )
  }

  if (a.kind === 'note') {
    return (
      <div
        className="anno anno--note"
        data-anno={a.id}
        style={{ ...style, background: a.color }}
        title={a.text}
      >
        <span style={{ fontSize: Math.min(px(a.rect.height) * 0.7, 14) }}>✎</span>
      </div>
    )
  }

  if (a.kind === 'stamp') {
    return (
      <div
        className="anno anno--stamp"
        data-anno={a.id}
        style={{ ...style, color: a.color, fontSize: Math.min(px(a.rect.height) * 0.42, 18) }}
      >
        {a.label}
      </div>
    )
  }

  if (a.kind === 'image') {
    return <ImageAnnoView id={a.id} assetId={a.assetId} docKey={docKey} style={style} />
  }

  return null
}

function ImageAnnoView({
  id,
  assetId,
  docKey,
  style
}: {
  id: string
  assetId: string
  docKey: string
  style: React.CSSProperties
}): JSX.Element | null {
  const asset = useDocStore((s) => s.docs[docKey]?.assets[assetId])
  const url = useMemo(
    () => (asset ? URL.createObjectURL(bytesToBlob(asset.bytes, asset.mime)) : null),
    [asset]
  )
  if (!url) return null
  return (
    <div className="anno anno--image" data-anno={id} style={style}>
      <img src={url} alt="" draggable={false} />
    </div>
  )
}

/** SVG-Darstellung für Formen, Freihand, Markup – in PDF-Punkt-Koordinaten. */
export function AnnotationSvgShape({ a }: { a: Annotation }): JSX.Element | null {
  const r = a.rect

  if (a.kind === 'highlight') {
    return (
      <>
        {(a.quads.length ? a.quads : [r]).map((q, i) => (
          <rect
            key={i}
            x={q.x}
            y={q.y}
            width={q.width}
            height={q.height}
            fill={a.color}
            opacity={a.opacity ?? 0.4}
          />
        ))}
      </>
    )
  }
  if (a.kind === 'underline' || a.kind === 'strikeout') {
    return (
      <>
        {(a.quads.length ? a.quads : [r]).map((q, i) => {
          const y = a.kind === 'underline' ? q.y + q.height - 1 : q.y + q.height * 0.55
          return (
            <line
              key={i}
              x1={q.x}
              y1={y}
              x2={q.x + q.width}
              y2={y}
              stroke={a.color}
              strokeWidth={Math.max(1, q.height * 0.06)}
            />
          )
        })}
      </>
    )
  }
  if (a.kind === 'ink' || a.kind === 'signature') {
    const color = a.kind === 'ink' ? a.color : a.color
    const w = a.kind === 'ink' ? a.width : 1.6
    return (
      <>
        {(a.paths ?? []).map((path, i) => (
          <polyline
            key={i}
            points={path.map((p) => `${r.x + p.x * r.width},${r.y + p.y * r.height}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth={w}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </>
    )
  }
  if (a.kind === 'rect') {
    return (
      <rect
        x={r.x}
        y={r.y}
        width={r.width}
        height={r.height}
        fill={a.fill ?? 'none'}
        stroke={a.stroke}
        strokeWidth={a.strokeWidth}
      />
    )
  }
  if (a.kind === 'ellipse') {
    return (
      <ellipse
        cx={r.x + r.width / 2}
        cy={r.y + r.height / 2}
        rx={r.width / 2}
        ry={r.height / 2}
        fill={a.fill ?? 'none'}
        stroke={a.stroke}
        strokeWidth={a.strokeWidth}
      />
    )
  }
  if (a.kind === 'line' || a.kind === 'arrow') {
    const from = a.from ?? { x: 0, y: 0 }
    const to = a.to ?? { x: 1, y: 1 }
    const p0 = { x: r.x + from.x * r.width, y: r.y + from.y * r.height }
    const p1 = { x: r.x + to.x * r.width, y: r.y + to.y * r.height }
    const ang = Math.atan2(p1.y - p0.y, p1.x - p0.x)
    const head = 7 + a.strokeWidth * 1.6
    return (
      <>
        <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} stroke={a.stroke} strokeWidth={a.strokeWidth} strokeLinecap="round" />
        {a.kind === 'arrow' &&
          [Math.PI - 0.4, Math.PI + 0.4].map((off, i) => (
            <line
              key={i}
              x1={p1.x}
              y1={p1.y}
              x2={p1.x + head * Math.cos(ang + off)}
              y2={p1.y + head * Math.sin(ang + off)}
              stroke={a.stroke}
              strokeWidth={a.strokeWidth}
              strokeLinecap="round"
            />
          ))}
      </>
    )
  }
  return null
}
