import { useDocStore } from '../store/docStore'
import { Icon } from './common/Icon'
import { IconButton } from './common/Button'
import { openViaDialog } from '../lib/fileActions'
import { cx } from '../lib/cx'

export function TabBar(): JSX.Element | null {
  const order = useDocStore((s) => s.order)
  const activeKey = useDocStore((s) => s.activeKey)
  const docs = useDocStore((s) => s.docs)
  const setActive = useDocStore((s) => s.setActive)
  const closeDoc = useDocStore((s) => s.closeDoc)

  if (order.length <= 1) return null

  return (
    <div className="tabbar">
      {order.map((key) => {
        const doc = docs[key]
        if (!doc) return null
        return (
          <div
            key={key}
            className={cx('tab', key === activeKey && 'is-active')}
            onMouseDown={() => setActive(key)}
          >
            <span className="tab__name" title={doc.path ?? doc.name}>
              {doc.name}
            </span>
            {doc.dirty && <span className="tab__dot" title="Ungesichert" />}
            <button
              className="tab__close"
              aria-label="Tab schließen"
              onClick={(e) => {
                e.stopPropagation()
                void closeDoc(key)
              }}
            >
              <Icon name="x" size={12} />
            </button>
          </div>
        )
      })}
      <IconButton name="plus" label="PDF öffnen" onClick={() => void openViaDialog()} />
    </div>
  )
}
