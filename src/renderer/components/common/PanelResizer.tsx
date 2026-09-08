import { useRef } from 'react'

/**
 * Zieh-Griff am Rand einer Seitenleiste zum Verbreitern/Verschmälern.
 * `edge='right'` → Griff sitzt rechts (Sidebar), `edge='left'` → links (Inspector).
 */
export function PanelResizer({
  edge,
  width,
  onChange
}: {
  edge: 'left' | 'right'
  width: number
  onChange: (next: number) => void
}): JSX.Element {
  const start = useRef<{ x: number; w: number } | null>(null)

  const onPointerDown = (e: React.PointerEvent): void => {
    e.preventDefault()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, w: width }
    document.body.style.cursor = 'col-resize'
  }
  const onPointerMove = (e: React.PointerEvent): void => {
    if (!start.current) return
    const d = e.clientX - start.current.x
    onChange(start.current.w + (edge === 'right' ? d : -d))
  }
  const onPointerUp = (e: React.PointerEvent): void => {
    start.current = null
    document.body.style.cursor = ''
    ;(e.target as Element).releasePointerCapture(e.pointerId)
  }

  return (
    <div
      className={`panel-resizer panel-resizer--${edge}`}
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => onChange(edge === 'right' ? 232 : 288)}
    />
  )
}
