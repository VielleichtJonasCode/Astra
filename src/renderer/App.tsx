import { Suspense, lazy, useEffect, useRef, useState, type LazyExoticComponent } from 'react'
import { AstraHome } from './components/AstraHome'
import { ErrorBoundary } from './components/common/ErrorBoundary'
import { Spinner } from './components/common/misc'
import { ToastStack } from './components/common/toast'
import { useAppWiring } from './lib/useAppWiring'
import { openDroppedFiles } from './lib/fileActions'
import { useShellStore, type AstraView } from './store/shellStore'
import { applyTheme, useSettingsStore } from './store/settingsStore'
import './components/common/common.css'
import './components/shell.css'

/* Werkzeuge werden erst geladen, wenn man sie öffnet – hält den Start schlank. */
const AppShell = lazy(() => import('./components/AppShell').then((m) => ({ default: m.AppShell })))
const ConverterApp = lazy(() =>
  import('./components/ConverterApp').then((m) => ({ default: m.ConverterApp }))
)
const QrApp = lazy(() => import('./components/QrApp').then((m) => ({ default: m.QrApp })))
const ImageApp = lazy(() => import('./components/ImageApp').then((m) => ({ default: m.ImageApp })))
const TextApp = lazy(() => import('./components/TextApp').then((m) => ({ default: m.TextApp })))
const UnitsApp = lazy(() => import('./components/UnitsApp').then((m) => ({ default: m.UnitsApp })))
const TableApp = lazy(() => import('./components/TableApp').then((m) => ({ default: m.TableApp })))
const AudioApp = lazy(() => import('./components/AudioApp').then((m) => ({ default: m.AudioApp })))
const ScanApp = lazy(() => import('./components/ScanApp').then((m) => ({ default: m.ScanApp })))
const SignApp = lazy(() => import('./components/SignApp').then((m) => ({ default: m.SignApp })))
const StudienplanerApp = lazy(() =>
  import('./components/StudienplanerApp').then((m) => ({ default: m.StudienplanerApp }))
)
const DialogHost = lazy(() =>
  import('./components/dialogs/DialogHost').then((m) => ({ default: m.DialogHost }))
)
const PasswordPromptHost = lazy(() =>
  import('./components/dialogs/PasswordPromptHost').then((m) => ({ default: m.PasswordPromptHost }))
)

const VIEWS: Partial<Record<AstraView, LazyExoticComponent<() => JSX.Element>>> = {
  pdf: AppShell,
  convert: ConverterApp,
  qr: QrApp,
  image: ImageApp,
  text: TextApp,
  units: UnitsApp,
  table: TableApp,
  audio: AudioApp,
  scan: ScanApp,
  sign: SignApp,
  studienplaner: StudienplanerApp
}

function LoadingView(): JSX.Element {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-content)'
      }}
    >
      <Spinner size={26} />
    </div>
  )
}

async function runMergeSelfTest(): Promise<void> {
  try {
    const { toPdfBytes, mergeKind } = await import('./pdf/ops/normalizeToPdf')
    const { mergePdfs } = await import('./pdf/ops/merge')
    const { PDFDocument } = await import('pdf-lib')
    const png = Uint8Array.from(
      atob(
        'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGP8z8BQz8DAwMDAwMDAAAAkBgMBvJ8bkwAAAABJRU5ErkJggg=='
      ),
      (c) => c.charCodeAt(0)
    )
    const txt = new TextEncoder().encode('# Titel\n\nHallo aus dem Merge-Test.')
    const kinds = [
      mergeKind('a.png'),
      mergeKind('b.md'),
      mergeKind('c.pdf'),
      mergeKind('d.xyz')
    ].join(',')
    const p1 = await toPdfBytes('bild.png', png)
    const p2 = await toPdfBytes('notiz.md', txt)
    const merged = await mergePdfs([
      { name: 'bild.png', bytes: p1 },
      { name: 'notiz.md', bytes: p2 }
    ])
    const doc = await PDFDocument.load(merged)
    const ok =
      kinds === 'image,document,pdf,unknown' && doc.getPageCount() >= 2 && merged.length > 400
    console.log(ok ? 'MERGETEST OK' : `MERGETEST FAIL kinds=${kinds} pages=${doc.getPageCount()}`)
  } catch (e) {
    console.log(`MERGETEST FAIL ${e instanceof Error ? e.message : e}`)
  }
}

export function App(): JSX.Element {
  useAppWiring()
  const view = useShellStore((s) => s.view)
  const theme = useSettingsStore((s) => s.theme)
  const [dragging, setDragging] = useState(false)
  const [dialogsUsed, setDialogsUsed] = useState(false)
  const dragDepth = useRef(0)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    if (/[#&]mergetest=1/.test(location.hash)) void runMergeSelfTest()
    // Dialoge (inkl. Passwortabfrage) erst laden, sobald eines gebraucht wird.
    const offs: Array<() => void> = []
    void import('./store/dialogStore').then(({ useDialogStore }) => {
      if (useDialogStore.getState().active) setDialogsUsed(true)
      offs.push(
        useDialogStore.subscribe((s) => {
          if (s.active) setDialogsUsed(true)
        })
      )
    })
    void import('./store/passwordStore').then(({ usePasswordStore }) => {
      if (usePasswordStore.getState().request) setDialogsUsed(true)
      offs.push(
        usePasswordStore.subscribe((s) => {
          if (s.request) setDialogsUsed(true)
        })
      )
    })
    // Menüleisten-„Heute"-Menü verzögert starten, damit der Start schlank bleibt.
    const trayT = setTimeout(() => {
      void import('./lib/traySync').then((m) => m.startTraySync())
    }, 2000)
    offs.push(() => clearTimeout(trayT))

    return () => offs.forEach((off) => off())
  }, [])

  useEffect(() => {
    // Nur Startseite und PDF-Editor nutzen die globale Ablage; alle anderen
    // Werkzeuge kümmern sich selbst um Drop-Dateien.
    const globalDrop = (): boolean => ['home', 'pdf'].includes(useShellStore.getState().view)
    const onDragEnter = (e: DragEvent): void => {
      if (!e.dataTransfer?.types.includes('Files')) return
      if (!globalDrop()) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent): void => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    const onDragLeave = (): void => {
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      if (!globalDrop()) return
      if (e.dataTransfer?.files.length) void openDroppedFiles(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  const ViewComp = VIEWS[view]

  return (
    <>
      {view === 'home' || !ViewComp ? (
        <AstraHome />
      ) : (
        <ErrorBoundary
          key={view}
          label="Dieses Werkzeug"
          fallback={(reset, error) => (
            <div className="errbound">
              <div className="errbound__box">
                <strong>Dieses Werkzeug ist abgestürzt.</strong>
                <pre>{error.message}</pre>
                <div className="errbound__row">
                  <button onClick={reset}>Nochmal versuchen</button>
                  <button onClick={() => useShellStore.getState().setView('home')}>
                    Zur Startseite
                  </button>
                </div>
              </div>
            </div>
          )}
        >
          <Suspense fallback={<LoadingView />}>
            <ViewComp />
          </Suspense>
        </ErrorBoundary>
      )}
      {dialogsUsed && (
        <Suspense fallback={null}>
          <DialogHost />
          <PasswordPromptHost />
        </Suspense>
      )}
      <ToastStack />
      {dragging && (
        <div className="dropzone">
          <span className="dropzone__label">PDF hier ablegen</span>
        </div>
      )}
    </>
  )
}
