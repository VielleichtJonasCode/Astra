import { useDocStore } from '../../store/docStore'
import { useUiStore, type ToolId } from '../../store/uiStore'
import { IconButton } from '../common/Button'
import { Icon, type IconName } from '../common/Icon'
import { Divider } from '../common/Field'
import { Popover } from '../common/Popover'
import { Tooltip } from '../common/Tooltip'
import { ColorWell } from '../common/ColorWell'
import { Segmented } from '../common/controls'
import { cx } from '../../lib/cx'
import { requestDialog } from '../../store/dialogStore'
import { pickAndInsertImage } from '../../lib/quickInsert'

interface ToolDef {
  id: ToolId
  icon: IconName
  label: string
  key?: string
}

const PRIMARY: ToolDef[] = [
  { id: 'select', icon: 'cursor', label: 'Auswählen', key: 'V' },
  { id: 'hand', icon: 'hand', label: 'Hand / Verschieben', key: 'Leertaste' }
]

const TEXT_TOOLS: ToolDef[] = [
  { id: 'text', icon: 'text', label: 'Text hinzufügen', key: 'T' },
  { id: 'editText', icon: 'text-edit', label: 'Vorhandenen Text bearbeiten', key: 'E' },
  { id: 'redact', icon: 'redact', label: 'Text schwärzen / löschen', key: 'B' }
]

const MARKUP_TOOLS: ToolDef[] = [
  { id: 'highlight', icon: 'highlighter', label: 'Hervorheben', key: 'H' },
  { id: 'underline', icon: 'underline', label: 'Unterstreichen' },
  { id: 'strikeout', icon: 'strikethrough', label: 'Durchstreichen' },
  { id: 'ink', icon: 'pen', label: 'Zeichnen', key: 'D' }
]

const SHAPES: ToolDef[] = [
  { id: 'shape-rect', icon: 'square', label: 'Rechteck' },
  { id: 'shape-ellipse', icon: 'circle', label: 'Ellipse' },
  { id: 'shape-line', icon: 'line', label: 'Linie' },
  { id: 'shape-arrow', icon: 'arrow-up-right', label: 'Pfeil' }
]

const INSERT_TOOLS: ToolDef[] = [
  { id: 'note', icon: 'note', label: 'Notiz', key: 'N' },
  { id: 'stamp', icon: 'stamp', label: 'Stempel' }
]

const COLOR_TOOLS: ToolId[] = [
  'text',
  'redact',
  'highlight',
  'underline',
  'strikeout',
  'ink',
  'shape-rect',
  'shape-ellipse',
  'shape-line',
  'shape-arrow',
  'note',
  'signature'
]

const STROKE_TOOLS: ToolId[] = [
  'ink',
  'shape-rect',
  'shape-ellipse',
  'shape-line',
  'shape-arrow',
  'signature'
]

export function Toolbar(): JSX.Element {
  const { tool, setTool, toolColor, setToolColor, toolStrokeWidth, setToolStrokeWidth } =
    useUiStore()
  const viewMode = useUiStore((s) => s.viewMode)
  const setViewMode = useUiStore((s) => s.setViewMode)
  const zoomMode = useUiStore((s) => s.zoomMode)
  const setZoom = useUiStore((s) => s.setZoom)

  const activeKey = useDocStore((s) => s.activeKey)
  const rotatePages = useDocStore((s) => s.rotatePages)
  const deletePages = useDocStore((s) => s.deletePages)
  const duplicatePages = useDocStore((s) => s.duplicatePages)
  const selectedPages = useUiStore((s) => s.selectedPages)
  const currentPage = useUiStore((s) => s.currentPage)
  const hasDoc = Boolean(activeKey)

  const targetPages = selectedPages.length ? selectedPages : [currentPage - 1]

  const shapeActive = SHAPES.some((s) => s.id === tool)

  const renderGroup = (defs: ToolDef[]): JSX.Element => (
    <div className="toolgroup">
      {defs.map((d) => (
        <IconButton
          key={d.id}
          name={d.icon}
          label={d.key ? `${d.label} (${d.key})` : d.label}
          active={tool === d.id}
          disabled={!hasDoc}
          onClick={() => setTool(d.id)}
        />
      ))}
    </div>
  )

  return (
    <div className="toolbar">
      {renderGroup(PRIMARY)}
      {renderGroup(TEXT_TOOLS)}
      {renderGroup(MARKUP_TOOLS)}

      <div className="toolgroup">
        <Tooltip label="Formen – Rechteck, Ellipse, Linie, Pfeil">
          <Popover
            placement="bottom"
            trigger={
              <button
                type="button"
                className={cx('iconbtn', shapeActive && 'is-active')}
                aria-label="Formen"
                disabled={!hasDoc}
              >
                <Icon name="shapes" size={17} />
              </button>
            }
          >
            <div style={{ display: 'flex', gap: 2 }}>
              {SHAPES.map((s) => (
                <IconButton
                  key={s.id}
                  name={s.icon}
                  label={s.label}
                  active={tool === s.id}
                  onClick={() => setTool(s.id)}
                />
              ))}
            </div>
          </Popover>
        </Tooltip>
        {INSERT_TOOLS.map((d) => (
          <IconButton
            key={d.id}
            name={d.icon}
            label={d.key ? `${d.label} (${d.key})` : d.label}
            active={tool === d.id}
            disabled={!hasDoc}
            onClick={() => setTool(d.id)}
          />
        ))}
        <IconButton
          name="image"
          label="Bild einfügen (I)"
          disabled={!hasDoc}
          onClick={() => pickAndInsertImage()}
        />
        <IconButton
          name="signature-pen"
          label="Unterschrift einfügen"
          disabled={!hasDoc}
          onClick={() => requestDialog('signature')}
        />
      </div>

      <Divider />

      <div className="toolgroup">
        <IconButton
          name="rotate-ccw"
          label="Seite nach links drehen"
          disabled={!hasDoc}
          onClick={() => activeKey && rotatePages(activeKey, targetPages, -90)}
        />
        <IconButton
          name="rotate-cw"
          label="Seite nach rechts drehen"
          disabled={!hasDoc}
          onClick={() => activeKey && rotatePages(activeKey, targetPages, 90)}
        />
        <IconButton
          name="copy"
          label="Seite duplizieren"
          disabled={!hasDoc}
          onClick={() => activeKey && duplicatePages(activeKey, targetPages)}
        />
        <IconButton
          name="trash"
          label="Seite löschen"
          disabled={!hasDoc}
          onClick={() => activeKey && deletePages(activeKey, targetPages)}
        />
      </div>

      {COLOR_TOOLS.includes(tool) && (
        <>
          <Divider />
          <div className="toolgroup" style={{ gap: 8, paddingLeft: 8, paddingRight: 8 }}>
            <ColorWell value={toolColor} onChange={setToolColor} />
            {STROKE_TOOLS.includes(tool) && (
              <input
                type="range"
                className="slider"
                style={{ width: 88 }}
                min={0.5}
                max={12}
                step={0.5}
                value={toolStrokeWidth}
                onChange={(e) => setToolStrokeWidth(Number(e.target.value))}
                title={`Strichstärke ${toolStrokeWidth} pt`}
              />
            )}
          </div>
        </>
      )}

      <div className="toolbar__spacer" />

      <Segmented
        value={viewMode}
        onChange={setViewMode}
        options={[
          { value: 'single', icon: 'page', title: 'Einzelseite' },
          { value: 'continuous', icon: 'pages', title: 'Fortlaufend' },
          { value: 'spread', icon: 'columns', title: 'Doppelseite' }
        ]}
      />
      <Segmented
        value={zoomMode === 'custom' ? 'fit-width' : zoomMode}
        onChange={(m) => setZoom(1, m)}
        options={[
          { value: 'fit-width', icon: 'fit-width', title: 'An Breite anpassen' },
          { value: 'fit-page', icon: 'fit-page', title: 'An Seite anpassen' }
        ]}
      />
    </div>
  )
}
