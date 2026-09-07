import { useDocStore } from '../../store/docStore'
import { usePdfProxy } from '../../pdf/pdfProxy'
import { requestDialog } from '../../store/dialogStore'
import { IconButton } from '../common/Button'
import { ThumbnailList } from './ThumbnailList'
import './sidebar.css'

export function Sidebar(): JSX.Element {
  const activeKey = useDocStore((s) => s.activeKey)
  const pageCount = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey]?.pages.length : 0) ?? 0)
  const { proxy } = usePdfProxy(activeKey)

  return (
    <aside className="sidebar">
      <div className="sidebar__head">Seiten{pageCount ? ` · ${pageCount}` : ''}</div>
      {activeKey && (
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
          <IconButton name="merge" label="Zusammenführen …" onClick={() => requestDialog('merge')} />
        </div>
      )}
      <div className="sidebar__scroll">
        {!activeKey ? (
          <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
            Kein Dokument geöffnet.
          </div>
        ) : (
          <ThumbnailList docKey={activeKey} proxy={proxy} />
        )}
      </div>
    </aside>
  )
}
