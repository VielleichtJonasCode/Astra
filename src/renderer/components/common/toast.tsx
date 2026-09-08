import { useEffect } from 'react'
import { create } from 'zustand'
import { nanoid } from 'nanoid'
import { Icon } from './Icon'
import { cx } from '../../lib/cx'

export type ToastKind = 'info' | 'success' | 'error'

interface ToastItem {
  id: string
  kind: ToastKind
  message: string
  action?: { label: string; run: () => void }
  duration: number
}

interface ToastStore {
  items: ToastItem[]
  push: (t: Omit<ToastItem, 'id' | 'duration'> & { duration?: number }) => string
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastStore>((set) => ({
  items: [],
  push: (t) => {
    const id = nanoid(8)
    set((s) => ({
      items: [...s.items, { id, duration: t.duration ?? 4200, ...t }]
    }))
    return id
  },
  dismiss: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) }))
}))

/** Bequeme Helfer, überall importierbar (auch außerhalb von React). */
export const toast = {
  info: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'info', message, action }),
  success: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'success', message, action }),
  error: (message: string, action?: ToastItem['action']) =>
    useToastStore.getState().push({ kind: 'error', message, action, duration: 6500 }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id)
}

function ToastRow({ item }: { item: ToastItem }): JSX.Element {
  const dismiss = useToastStore((s) => s.dismiss)
  useEffect(() => {
    if (item.duration <= 0) return
    const t = setTimeout(() => dismiss(item.id), item.duration)
    return () => clearTimeout(t)
  }, [item, dismiss])

  const iconName = item.kind === 'error' ? 'info' : item.kind === 'success' ? 'check' : 'info'

  return (
    <div className={cx('toast', `toast--${item.kind}`)} onClick={() => dismiss(item.id)}>
      <span className="toast__icon">
        <Icon name={iconName} size={16} />
      </span>
      <span className="toast__msg">{item.message}</span>
      {item.action && (
        <button
          type="button"
          className="toast__action"
          onClick={(e) => {
            e.stopPropagation()
            item.action?.run()
            dismiss(item.id)
          }}
        >
          {item.action.label}
        </button>
      )}
    </div>
  )
}

export function ToastStack(): JSX.Element {
  const items = useToastStore((s) => s.items)
  return (
    <div className="toast-stack">
      {items.map((item) => (
        <ToastRow key={item.id} item={item} />
      ))}
    </div>
  )
}
