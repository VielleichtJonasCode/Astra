import { useDocStore } from '../store/docStore'
import { useUiStore } from '../store/uiStore'
import { pageDisplaySize } from '../pdf/model'
import { IconButton } from './common/Button'

export function StatusBar(): JSX.Element {
  const doc = useDocStore((s) => (s.activeKey ? s.docs[s.activeKey] : null))
  const { zoom, currentPage, setZoom, zoomIn, zoomOut, nightMode, toggleNight } = useUiStore()

  const pageCount = doc?.pages.length ?? 0
  const page = doc?.pages[currentPage - 1]
  const size = page ? pageDisplaySize(page) : null

  return (
    <footer className="statusbar">
      <span>
        {pageCount > 0
          ? `Seite ${Math.min(currentPage, pageCount)} von ${pageCount}`
          : 'Kein Dokument'}
      </span>
      {size && (
        <span>
          {mm(size.width)} × {mm(size.height)} mm
        </span>
      )}
      {doc?.dirty && <span style={{ color: 'var(--warning)' }}>• Ungesichert</span>}

      <span className="statusbar__spacer" />

      <IconButton
        name={nightMode ? 'sun' : 'moon'}
        label="Nachtmodus"
        onClick={toggleNight}
        size={14}
      />
      <IconButton name="zoom-out" label="Verkleinern" onClick={zoomOut} size={14} />
      <button
        style={{ minWidth: 46, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}
        onClick={() => setZoom(1)}
        title="Auf 100 % zurücksetzen"
      >
        {Math.round(zoom * 100)} %
      </button>
      <IconButton name="zoom-in" label="Vergrößern" onClick={zoomIn} size={14} />
    </footer>
  )
}

function mm(pt: number): string {
  return ((pt / 72) * 25.4).toFixed(0)
}
