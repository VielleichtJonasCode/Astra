import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'

export function Field({
  label,
  hint,
  stack,
  children
}: {
  label: string
  hint?: ReactNode
  stack?: boolean
  children: ReactNode
}): JSX.Element {
  return (
    <div className={cx('field', stack && 'field--stack')}>
      <span className="field__label">{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
      {hint && <span className="field__hint">{hint}</span>}
    </div>
  )
}

export function FieldGroup({
  title,
  children
}: {
  title?: string
  children: ReactNode
}): JSX.Element {
  return (
    <div className="fieldgroup">
      {title && <div className="fieldgroup__title">{title}</div>}
      {children}
    </div>
  )
}

export function Divider({ horizontal }: { horizontal?: boolean }): JSX.Element {
  return <div className={cx('divider', horizontal && 'divider--h')} />
}
