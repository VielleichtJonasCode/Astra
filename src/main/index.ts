import { app, BrowserWindow, nativeTheme, shell } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { buildAppMenu } from './menu'
import { registerIpc } from './ipc'
import { registerOcr, registerOcrProtocolScheme } from './ocr'
import { restoreWindowState, trackWindowState } from './windowState'

registerOcrProtocolScheme()

/** Nur für die visuelle Verifikation: PDFSTUDIO_SHOT=<pfad> npm run dev */
function maybeCaptureAndQuit(): void {
  const target = process.env['PDFSTUDIO_SHOT']
  if (!target || !mainWindow) return
  const delay = Number(process.env['PDFSTUDIO_SHOT_DELAY'] ?? 3000)
  setTimeout(async () => {
    try {
      const image = await mainWindow!.webContents.capturePage()
      await writeFile(target, image.toPNG())
    } catch (err) {
      console.error('capture failed', err)
    } finally {
      app.quit()
    }
  }, delay)
}

const isDev = !app.isPackaged

let mainWindow: BrowserWindow | null = null
/** Dateien, die über "Öffnen mit" kamen, bevor das Fenster bereit war. */
const pendingOpenFiles: string[] = []

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function flushPendingOpenFiles(): void {
  if (!mainWindow || pendingOpenFiles.length === 0) return
  mainWindow.webContents.send('open-files', pendingOpenFiles.splice(0))
}

function createWindow(): void {
  const bounds = restoreWindowState()

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 940,
    minHeight: 620,
    show: false,
    title: 'PDF Studio',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 18 },
    vibrancy: 'sidebar',
    visualEffectState: 'active',
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      webSecurity: true
    }
  })

  trackWindowState(mainWindow)

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    flushPendingOpenFiles()
    maybeCaptureAndQuit()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// "Öffnen mit" / auf das Dock-Icon gezogene Dateien (muss vor whenReady registriert sein).
app.on('open-file', (event, path) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.webContents.send('open-files', [path])
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  } else {
    pendingOpenFiles.push(path)
  }
})

// Nur eine Instanz zulassen.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const files = argv.filter((a) => a.toLowerCase().endsWith('.pdf'))
    if (mainWindow) {
      if (files.length) mainWindow.webContents.send('open-files', files)
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    } else {
      pendingOpenFiles.push(...files)
    }
  })

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'system'
    app.setName('PDF Studio')
    registerIpc(getMainWindow)
    registerOcr()
    buildAppMenu(getMainWindow)
    createWindow()

    // Beim Start übergebene Dateien (nicht-macOS bzw. CLI, plus Dev-Env).
    const argFiles = process.argv.slice(1).filter((a) => a.toLowerCase().endsWith('.pdf'))
    if (argFiles.length) pendingOpenFiles.push(...argFiles)
    if (process.env['PDFSTUDIO_OPEN']) pendingOpenFiles.push(process.env['PDFSTUDIO_OPEN'])

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Verhindert Navigation weg von der App.
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-navigate', (event, url) => {
    const allowed = process.env['ELECTRON_RENDERER_URL']
    if (!allowed || !url.startsWith(allowed)) event.preventDefault()
  })
})
