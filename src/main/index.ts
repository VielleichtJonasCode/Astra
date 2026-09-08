import { app, BrowserWindow, ipcMain, nativeTheme, shell } from 'electron'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { buildAppMenu } from './menu'
import { registerIpc } from './ipc'
import { registerOcr, registerOcrProtocolScheme } from './ocr'
import { registerHtmlToPdf } from './htmlToPdf'
import { registerAssets, registerAssetScheme } from './assets'
import { registerStudienplaner } from './studienplaner'
import { registerOcrHelper } from './ocr-helper'
import { registerCalendar } from './calendar'
import { registerLlm } from './llm'
import { registerTray } from './tray'
import { restoreWindowState, trackWindowState } from './windowState'

registerOcrProtocolScheme()
registerAssetScheme()

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
    title: 'Astra',
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

  // nur für Screenshots / Selbsttests
  const devParams = new URLSearchParams()
  if (process.env['PDFSTUDIO_VIEW']) devParams.set('view', process.env['PDFSTUDIO_VIEW'])
  if (process.env['PDFSTUDIO_CONVERT_TEST']) {
    devParams.set('view', 'convert')
    devParams.set('convtest', process.env['PDFSTUDIO_CONVERT_TEST'])
  }
  if (process.env['PDFSTUDIO_CONVERT_DEMO']) {
    devParams.set('view', 'convert')
    devParams.set('convdemo', '1')
  }
  if (process.env['PDFSTUDIO_QR_MODE']) {
    devParams.set('view', 'qr')
    devParams.set('qrmode', process.env['PDFSTUDIO_QR_MODE'])
  }
  if (process.env['PDFSTUDIO_QR_TEST']) {
    devParams.set('view', 'qr')
    devParams.set('qrtest', '1')
  }
  if (process.env['PDFSTUDIO_DIALOG']) devParams.set('dialog', process.env['PDFSTUDIO_DIALOG'])
  if (process.env['PDFSTUDIO_IMAGE']) {
    devParams.set('view', 'image')
    devParams.set('img', process.env['PDFSTUDIO_IMAGE'])
  }
  if (process.env['PDFSTUDIO_IMAGE_TEST']) devParams.set('imgtest', '1')
  if (process.env['PDFSTUDIO_IMAGE_DEMO']) devParams.set('imgdemo', '1')
  if (process.env['PDFSTUDIO_TEXT']) devParams.set('view', 'text')
  if (process.env['PDFSTUDIO_TEXT_TEST']) {
    devParams.set('view', 'text')
    devParams.set('texttest', '1')
  }
  if (process.env['PDFSTUDIO_UNITS']) devParams.set('view', 'units')
  if (process.env['PDFSTUDIO_TABLE']) devParams.set('view', 'table')
  if (process.env['PDFSTUDIO_TABLE_TEST']) {
    devParams.set('view', 'table')
    devParams.set('tabletest', '1')
  }
  if (process.env['PDFSTUDIO_AUDIO']) {
    devParams.set('view', 'audio')
    devParams.set('aud', process.env['PDFSTUDIO_AUDIO'])
  }
  if (process.env['PDFSTUDIO_AUDIO_TEST']) {
    devParams.set('view', 'audio')
    devParams.set('audiotest', '1')
  }
  if (process.env['PDFSTUDIO_MERGE_TEST']) devParams.set('mergetest', '1')
  if (process.env['PDFSTUDIO_AUD_DBG']) devParams.set('auddbg', '1')
  if (process.env['PDFSTUDIO_SCAN']) {
    devParams.set('view', 'scan')
    devParams.set('scan', process.env['PDFSTUDIO_SCAN'])
  }
  if (process.env['PDFSTUDIO_SCAN_TEST']) {
    devParams.set('view', 'scan')
    devParams.set('scan', process.env['PDFSTUDIO_SCAN'] ?? '')
    devParams.set('scantest', '1')
  }
  if (process.env['PDFSTUDIO_SIGN']) devParams.set('view', 'sign')
  if (process.env['PDFSTUDIO_SIGN_TEST']) {
    devParams.set('view', 'sign')
    devParams.set('signtest', '1')
  }
  if (process.env['PDFSTUDIO_UNITS_TEST']) {
    devParams.set('view', 'units')
    devParams.set('unittest', '1')
  }
  if (process.env['PDFSTUDIO_STUDIENPLANER']) devParams.set('view', 'studienplaner')
  if (process.env['PDFSTUDIO_SP_DIR']) {
    devParams.set('view', 'studienplaner')
    devParams.set('spdir', process.env['PDFSTUDIO_SP_DIR'])
  }
  if (process.env['PDFSTUDIO_SP_COURSE'])
    devParams.set('spcourse', process.env['PDFSTUDIO_SP_COURSE'])
  if (process.env['PDFSTUDIO_SP_DEMO']) {
    devParams.set('view', 'studienplaner')
    devParams.set('spdemo', '1')
  }
  if (process.env['PDFSTUDIO_SP_SHEET']) devParams.set('spsheet', process.env['PDFSTUDIO_SP_SHEET'])
  if (process.env['PDFSTUDIO_SP_TEST']) {
    devParams.set('view', 'studienplaner')
    devParams.set('sptest', '1')
  }
  const hash = devParams.toString() ? `#${devParams.toString()}` : ''
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: hash.slice(1) })
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

  // Renderer holt sich beim Start ausstehende "Öffnen mit"-Dateien ab (Race-sicher).
  ipcMain.handle('app:consumePendingFiles', () => pendingOpenFiles.splice(0))

  app.whenReady().then(() => {
    nativeTheme.themeSource = 'system'
    app.setName('Astra')
    registerIpc(getMainWindow)
    registerOcr()
    registerOcrHelper()
    registerCalendar()
    registerLlm()
    registerAssets()
    registerHtmlToPdf()
    registerStudienplaner(getMainWindow)
    buildAppMenu(getMainWindow)
    createWindow()
    registerTray(getMainWindow, () => {
      if (!mainWindow) createWindow()
    })

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
