import { BrowserWindow, ipcMain } from 'electron'

export interface HtmlToPdfOptions {
  landscape?: boolean
  /** Seitenränder in Zoll. */
  margin?: number
  pageSize?: 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5'
}

/** Rendert HTML zu PDF-Bytes über ein unsichtbares Fenster (Chromium-Druck). */
async function renderHtmlToPdf(html: string, opts: HtmlToPdfOptions): Promise<Uint8Array> {
  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: { javascript: false, sandbox: true, offscreen: false }
  })
  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    // kurze Wartezeit, damit Schriften/Bilder sicher da sind
    await new Promise((r) => setTimeout(r, 120))
    const m = opts.margin ?? 0.6
    const data = await win.webContents.printToPDF({
      landscape: opts.landscape ?? false,
      printBackground: true,
      pageSize: opts.pageSize ?? 'A4',
      margins: { top: m, bottom: m, left: m, right: m }
    })
    return new Uint8Array(data)
  } finally {
    win.destroy()
  }
}

export function registerHtmlToPdf(): void {
  ipcMain.handle(
    'convert:htmlToPdf',
    async (_e, html: string, opts: HtmlToPdfOptions = {}): Promise<Uint8Array> => {
      return renderHtmlToPdf(html, opts)
    }
  )
}
