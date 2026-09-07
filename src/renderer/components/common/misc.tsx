import type { ReactNode } from 'react'
import { cx } from '../../lib/cx'
import { Icon, type IconName } from './Icon'

export function Spinner({ size = 18 }: { size?: number }): JSX.Element {
  return <span className="spinner" style={{ width: size, height: size }} />
}

export function Kbd({ children }: { children: ReactNode }): JSX.Element {
  return <kbd>{children}</kbd>
}

export function EmptyState({
  icon,
  title,
  hint,
  action
}: {
  icon: IconName
  title: string
  hint?: ReactNode
  action?: ReactNode
}): JSX.Element {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 12,
        maxWidth: 340,
        margin: 'auto',
        padding: 24
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-tertiary)',
          background: 'var(--bg-hover)'
        }}
      >
        <Icon name={icon} size={38} />
      </div>
      <div style={{ fontSize: 'var(--fs-16)', fontWeight: 600 }}>{title}</div>
      {hint && (
        <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          {hint}
        </div>
      )}
      {action && <div style={{ marginTop: 4 }}>{action}</div>}
    </div>
  )
}

export function Progress({ value }: { value: number }): JSX.Element {
  return (
    <div
      style={{
        height: 6,
        borderRadius: 3,
        background: 'var(--border-strong)',
        overflow: 'hidden'
      }}
    >
      <div
        className={cx(value < 0 && 'progress-indeterminate')}
        style={{
          height: '100%',
          width: value < 0 ? '40%' : `${Math.round(value * 100)}%`,
          background: 'var(--accent)',
          borderRadius: 3,
          transition: 'width 160ms var(--ease)'
        }}
      />
    </div>
  )
}
