import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'
import { useShellStore } from '../store/shellStore'
import { Button, IconButton } from './common/Button'
import { Icon } from './common/Icon'
import { Tooltip } from './common/Tooltip'
import { AstraMark } from './AstraMark'
import { Divider } from './common/Field'
import { saveActive, exportActive } from '../lib/saveActions'

export function TitleBar(): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))
  const undo = useDocStore((s) => s.undo)
  const redo = useDocStore((s) => s.redo)
  const canUndo = useDocStore((s) =>
    s.activeKey ? (s.history[s.activeKey]?.undo.length ?? 0) > 0 : false
  )
  const canRedo = useDocStore((s) =>
    s.activeKey ? (s.history[s.activeKey]?.redo.length ?? 0) > 0 : false
  )
  const setView = useShellStore((s) => s.setView)

  const { sidebarOpen, inspectorOpen, toggleSidebar, toggleInspector } = useUiStore()

  return (
    <header className="titlebar drag-region">
      <div className="titlebar__group">
        <Tooltip label="Zurück zur Astra-Startseite (⇧⌘H)">
          <button className="titlebar__back no-drag" onClick={() => setView('home')}>
            <Icon name="chevron-left" size={15} />
            <AstraMark size={18} />
            <span>Astra</span>
          </button>
        </Tooltip>
        <Divider />
        <IconButton
          name="sidebar"
          label="Seitenleiste ein-/ausblenden"
          active={sidebarOpen}
          onClick={toggleSidebar}
        />
      </div>

      <Divider />

      <div className="titlebar__group">
        <IconButton name="undo" label="Widerrufen (⌘Z)" disabled={!canUndo} onClick={undo} />
        <IconButton name="redo" label="Wiederholen (⇧⌘Z)" disabled={!canRedo} onClick={redo} />
      </div>

      <div className="titlebar__doc">
        <span className="titlebar__name">{doc ? doc.name : 'PDF-Editor'}</span>
        {doc && (
          <span className="titlebar__sub">
            {doc.pages.length} {doc.pages.length === 1 ? 'Seite' : 'Seiten'}
            {doc.dirty ? ' · ungesichert' : ''}
          </span>
        )}
      </div>

      <div className="titlebar__group">
        <IconButton
          name="export"
          label="Exportieren … (⇧⌘E)"
          disabled={!doc}
          onClick={() => void exportActive()}
        />
        <Button
          className="no-drag"
          variant={doc?.dirty ? 'primary' : 'secondary'}
          size="sm"
          icon="save"
          disabled={!doc}
          onClick={() => void saveActive()}
        >
          Sichern
        </Button>
        <Divider />
        <IconButton
          name="inspector"
          label="Informationen ein-/ausblenden"
          active={inspectorOpen}
          onClick={toggleInspector}
        />
      </div>
    </header>
  )
}
