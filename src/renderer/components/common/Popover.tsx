import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/cx'

type Placement = 'bottom' | 'bottom-end' | 'top' | 'right'

export interface PopoverProps {
  trigger: ReactElement
  children: ReactNode
  placement?: Placement
  className?: string
  /** Steuert das Öffnen von außen (optional). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Popover({
  trigger,
  children,
  placement = 'bottom',
  className,
  open: controlledOpen,
  onOpenChange
}: PopoverProps): JSX.Element {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = controlledOpen ?? uncontrolled
  const setOpen = useCallback(
    (next: boolean) => {
      setUncontrolled(next)
      onOpenChange?.(next)
    },
    [onOpenChange]
  )

  const anchorRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  const reposition = useCallback(() => {
    const anchor = anchorRef.current
    const panel = panelRef.current
    if (!anchor || !panel) return
    const a = anchor.getBoundingClientRect()
    const p = panel.getBoundingClientRect()
    const gap = 6
    let top = a.bottom + gap
    let left = a.left
    if (placement === 'bottom-end') left = a.right - p.width
    if (placement === 'top') top = a.top - p.height - gap
    if (placement === 'right') {
      top = a.top
      left = a.right + gap
    }
    left = Math.max(8, Math.min(left, window.innerWidth - p.width - 8))
    top = Math.max(8, Math.min(top, window.innerHeight - p.height - 8))
    setPos({ top, left })
  }, [placement])

  useLayoutEffect(() => {
    if (open) reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent): void => {
      if (
        !panelRef.current?.contains(e.target as Node) &&
        !anchorRef.current?.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onScroll = (): void => reposition()
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onScroll)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onScroll)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [open, reposition, setOpen])

  const triggerNode = isValidElement(trigger)
    ? cloneElement(trigger as ReactElement<Record<string, unknown>>, {
        ref: (node: HTMLElement | null) => {
          anchorRef.current = node
        },
        onClick: (e: MouseEvent) => {
          ;(trigger.props as { onClick?: (e: MouseEvent) => void }).onClick?.(e)
          setOpen(!open)
        }
      })
    : trigger

  return (
    <>
      {triggerNode}
      {open &&
        createPortal(
          <div
            ref={panelRef}
            className={cx('popover', className)}
            style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
            role="dialog"
          >
            {children}
          </div>,
          document.body
        )}
    </>
  )
}
