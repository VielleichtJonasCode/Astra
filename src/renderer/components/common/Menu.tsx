import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/cx'
import { Icon, type IconName } from './Icon'

export interface MenuAction {
  id: string
  label: string
  icon?: IconName
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  separatorBefore?: boolean
  onSelect: () => void
}

export function MenuList({
  actions,
  onClose
}: {
  actions: MenuAction[]
  onClose: () => void
}): JSX.Element {
  return (
    <div className="menu" role="menu">
      {actions.map((a) => (
        <div key={a.id} style={{ display: 'contents' }}>
          {a.separatorBefore && <div className="menu__sep" />}
          <button
            type="button"
            role="menuitem"
            disabled={a.disabled}
            className={cx('menu__item', a.danger && 'menu__item--danger')}
            onClick={() => {
              a.onSelect()
              onClose()
            }}
          >
            {a.icon && <Icon name={a.icon} size={15} />}
            <span>{a.label}</span>
            {a.shortcut && <span className="menu__shortcut">{a.shortcut}</span>}
          </button>
        </div>
      ))}
    </div>
  )
}

/** Kontextmenü an einer Bildschirmposition. */
export function ContextMenu({
  x,
  y,
  actions,
  onClose
}: {
  x: number
  y: number
  actions: MenuAction[]
  onClose: () => void
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(x, window.innerWidth - r.width - 8),
      y: Math.min(y, window.innerHeight - r.height - 8)
    })
  }, [x, y])

  useEffect(() => {
    const close = (): void => onClose()
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', close, true)
    window.addEventListener('resize', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('mousedown', close, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      className="popover"
      style={{ top: pos.y, left: pos.x }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <MenuList actions={actions} onClose={onClose} />
    </div>,
    document.body
  )
}

/** Hook: `const menu = useContextMenu(); <div onContextMenu={menu.open(actions)} />; {menu.node}` */
export function useContextMenu(): {
  open: (actions: MenuAction[]) => (e: React.MouseEvent) => void
  node: ReactNode
} {
  const [state, setState] = useState<{ x: number; y: number; actions: MenuAction[] } | null>(null)
  return {
    open: (actions: MenuAction[]) => (e: React.MouseEvent) => {
      e.preventDefault()
      setState({ x: e.clientX, y: e.clientY, actions })
    },
    node: state ? (
      <ContextMenu x={state.x} y={state.y} actions={state.actions} onClose={() => setState(null)} />
    ) : null
  }
}
