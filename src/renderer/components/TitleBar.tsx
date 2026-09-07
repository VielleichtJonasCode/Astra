import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'
import { IconButton } from './common/Button'
import { Divider } from './common/Field'

export function TitleBar(): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))
  const undo = useDocStore((s) => s.undo)
  const redo = useDocStore((s) => s.redo)
  const canUndo = useDocStore((s) => (s.activeKey ? (s.history[s.activeKey]?.undo.length ?? 0) > 0 : false))
  const canRedo = useDocStore((s) => (s.activeKey ? (s.history[s.activeKey]?.redo.length ?? 0) > 0 : false))

  const { sidebarOpen, inspectorOpen, toggleSidebar, toggleInspector } = useUiStore()

  return (
    <header className="titlebar drag-region">
      <div className="titlebar__group">
        <IconButton
          name="sidebar"
          label="Seitenleiste"
          active={sidebarOpen}
          onClick={toggleSidebar}
        />
      </div>

      <Divider />

      <div className="titlebar__group">
        <IconButton name="undo" label="Widerrufen" disabled={!canUndo} onClick={undo} />
        <IconButton name="redo" label="Wiederholen" disabled={!canRedo} onClick={redo} />
      </div>

      <div className="titlebar__doc">
        <span className="titlebar__name">{doc ? doc.name : 'PDF Studio'}</span>
        {doc && (
          <span className="titlebar__sub">
            {doc.pages.length} {doc.pages.length === 1 ? 'Seite' : 'Seiten'}
            {doc.dirty ? ' · bearbeitet' : ''}
          </span>
        )}
      </div>

      <div className="titlebar__group">
        <IconButton
          name="inspector"
          label="Informationen"
          active={inspectorOpen}
          onClick={toggleInspector}
        />
      </div>
    </header>
  )
}
