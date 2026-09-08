import { useEffect, useLayoutEffect, useRef } from 'react'
import type { TextAnnotation } from '../pdf/model'
import { cssFontFamily, cssFontStyle, cssFontWeight } from '../pdf/fonts'

/** Inline-Editor für eine Text-Annotation (Overlay-Textarea). */
export function TextEditor({
  annotation: a,
  scale,
  onChange,
  onResize,
  onDone
}: {
  annotation: TextAnnotation
  scale: number
  onChange: (text: string) => void
  onResize: (heightPt: number) => void
  onDone: () => void
}): JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    const needed = el.scrollHeight
    el.style.height = `${needed}px`
    const heightPt = needed / scale
    if (Math.abs(heightPt - a.rect.height) > 1) onResize(heightPt)
  }, [a.text, a.rect.height, scale, onResize])

  // Bei „Text überschreiben" (a.cover gesetzt) die Vorschau so ausrichten,
  // dass sie mit dem späteren Export deckungsgleich ist.
  const isOverwrite = Boolean(a.cover)

  return (
    <textarea
      ref={ref}
      className="anno-textarea"
      value={a.text}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onDone}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onDone()
        }
        e.stopPropagation()
      }}
      style={{
        left: a.rect.x * scale,
        top: a.rect.y * scale,
        width: a.rect.width * scale,
        color: a.style.color,
        fontFamily: cssFontFamily(a.style.font),
        fontWeight: cssFontWeight(a.style.font),
        fontStyle: cssFontStyle(a.style.font),
        fontSize: a.style.size * scale,
        lineHeight: isOverwrite ? 1 : a.style.lineHeight,
        paddingTop: isOverwrite ? a.style.size * 0.2 * scale : undefined,
        paddingLeft: isOverwrite ? 0 : undefined,
        background: isOverwrite ? (a.cover?.color ?? '#ffffff') : undefined,
        textAlign: a.style.align
      }}
    />
  )
}
