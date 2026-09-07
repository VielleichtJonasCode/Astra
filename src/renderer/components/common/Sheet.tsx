import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../../lib/cx'
import { IconButton } from './Button'

export interface SheetProps {
  title: string
  subtitle?: ReactNode
  wide?: boolean
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}

export function Sheet({ title, subtitle, wide, onClose, children, footer }: SheetProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="sheet-backdrop" onMouseDown={onClose}>
      <div
        className={cx('sheet', wide && 'sheet--wide')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="sheet__header">
          <div style={{ flex: 1 }}>
            <div className="sheet__title">{title}</div>
            {subtitle && <div className="sheet__subtitle">{subtitle}</div>}
          </div>
          <IconButton name="x" label="Schließen" onClick={onClose} />
        </header>
        <div className="sheet__body">{children}</div>
        {footer && <footer className="sheet__footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  )
}
