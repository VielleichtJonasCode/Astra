import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

const DELAY = 450

/**
 * Zeigt beim Hovern (nach kurzer Verzögerung) einen Hinweistext.
 * Legt einen unsichtbaren inline-flex-Wrapper um die Kinder – keine Ref-Konflikte.
 */
export function Tooltip({
  label,
  children,
  placement = 'bottom',
  className
}: {
  label: string
  children: ReactNode
  placement?: 'bottom' | 'top'
  className?: string
}): JSX.Element {
  const [pos, setPos] = useState<{ x: number; y: number; top: boolean } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const ref = useRef<HTMLSpanElement>(null)

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    setPos(null)
  }, [])

  const show = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const el = ref.current
      if (!el) return
      const r = el.getBoundingClientRect()
      const top = placement === 'top' || r.bottom + 36 > window.innerHeight
      setPos({
        x: Math.round(r.left + r.width / 2),
        y: Math.round(top ? r.top - 6 : r.bottom + 6),
        top
      })
    }, DELAY)
  }, [placement])

  useEffect(() => () => timer.current && clearTimeout(timer.current), [])

  if (!label) return <>{children}</>

  return (
    <span
      ref={ref}
      className={className}
      style={{ display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div
            className="tooltip"
            role="tooltip"
            style={{
              left: pos.x,
              top: pos.y,
              transform: `translateX(-50%)${pos.top ? ' translateY(-100%)' : ''}`
            }}
          >
            {label}
          </div>,
          document.body
        )}
    </span>
  )
}
