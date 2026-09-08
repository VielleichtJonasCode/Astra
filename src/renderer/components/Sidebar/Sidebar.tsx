import { useEffect, useState } from 'react'
import { useDocStore } from '../../store/docStore'
import { useUiStore } from '../../store/uiStore'
import { usePdfProxy } from '../../pdf/pdfProxy'
import { requestDialog } from '../../store/dialogStore'
import { IconButton } from '../common/Button'
import { PanelResizer } from '../common/PanelResizer'
import { cx } from '../../lib/cx'
import { ThumbnailList } from './ThumbnailList'
import { Outline } from './Outline'
import './sidebar.css'

type Tab = 'pages' | 'marks'

export function Sidebar(): JSX.Element {
  const activeKey = useDocStore((s) => s.activeKey)
  const pageCount = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey]?.pages.length : 0) ?? 0)
  const { proxy } = usePdfProxy(activeKey)
  const width = useUiStore((s) => s.sidebarWidth)
  const setWidth = useUiStore((s) => s.setSidebarWidth)

  const [tab, setTab] = useState<Tab>('pages')
  const [hasOutline, setHasOutline] = useState(false)

  useEffect(() => {
    let cancelled = false
    setHasOutline(false)
    if (!proxy) return
    void proxy
      .getOutline()
      .then((o) => {
        if (!cancelled) setHasOutline(Boolean(o && o.length))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [proxy])

  // Fällt der Lesezeichen-Tab weg (anderes Dokument), zurück auf „Seiten".
  useEffect(() => {
    if (tab === 'marks' && !hasOutline) setTab('pages')
  }, [tab, hasOutline])

  return (
    <aside className="sidebar" style={{ width }}>
      {activeKey && hasOutline ? (
        <div className="sidebar__tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === 'pages'}
            className={cx('sidebar__tab', tab === 'pages' && 'is-active')}
            onClick={() => setTab('pages')}
          >
            Seiten{pageCount ? ` · ${pageCount}` : ''}
          </button>
          <button
            role="tab"
            aria-selected={tab === 'marks'}
            className={cx('sidebar__tab', tab === 'marks' && 'is-active')}
            onClick={() => setTab('marks')}
          >
            Lesezeichen
          </button>
        </div>
      ) : (
        <div className="sidebar__head">Seiten{pageCount ? ` · ${pageCount}` : ''}</div>
      )}

      {activeKey && tab === 'pages' && (
        <div className="sidebar__toolbar">
          <IconButton
            name="file-plus"
            label="Leere Seite anhängen"
            onClick={() => useDocStore.getState().insertBlankPage(activeKey, pageCount)}
          />
          <IconButton
            name="image"
            label="Seiten aus Bild …"
            onClick={() => requestDialog('insertImage')}
          />
          <IconButton
            name="page"
            label="Seiten aus PDF …"
            onClick={() => requestDialog('insertPdf')}
          />
          <span className="spacer" />
          <IconButton name="split" label="PDF teilen …" onClick={() => requestDialog('split')} />
          <IconButton
            name="merge"
            label="Zusammenführen …"
            onClick={() => requestDialog('merge')}
          />
        </div>
      )}

      <div className="sidebar__scroll">
        {!activeKey ? (
          <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            Kein Dokument geöffnet.
          </div>
        ) : tab === 'marks' ? (
          <Outline proxy={proxy} />
        ) : (
          <ThumbnailList docKey={activeKey} proxy={proxy} />
        )}
      </div>
      <PanelResizer edge="right" width={width} onChange={setWidth} />
    </aside>
  )
}
