import { app, ipcMain, net, protocol } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'fs/promises'
import { join } from 'path'

const TESSDATA_BASE = 'https://cdn.jsdelivr.net/gh/tesseract-ocr/tessdata_fast@main'
const SUPPORTED = ['deu', 'eng', 'fra', 'spa', 'ita']

function tessdataDir(): string {
  return join(app.getPath('userData'), 'tessdata')
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

/** Muss vor app.ready aufgerufen werden. */
export function registerOcrProtocolScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'pdfstudio-tessdata',
      privileges: { standard: true, secure: true, supportFetchAPI: true }
    }
  ])
}

export function registerOcr(): void {
  protocol.handle('pdfstudio-tessdata', async (request) => {
    const name = new URL(request.url).pathname.replace(/^\//, '')
    const file = join(tessdataDir(), name)
    try {
      const data = await readFile(file)
      return new Response(new Uint8Array(data), {
        headers: { 'content-type': 'application/octet-stream' }
      })
    } catch {
      return new Response('not found', { status: 404 })
    }
  })

  ipcMain.handle('ocr:prepare', async (_e, langs: string[]): Promise<string> => {
    const dir = tessdataDir()
    await mkdir(dir, { recursive: true })
    for (const lang of langs) {
      if (!SUPPORTED.includes(lang)) continue
      const target = join(dir, `${lang}.traineddata`)
      if (await exists(target)) continue
      const res = await net.fetch(`${TESSDATA_BASE}/${lang}.traineddata`)
      if (!res.ok) throw new Error(`Sprachdaten „${lang}" konnten nicht geladen werden.`)
      const buf = Buffer.from(await res.arrayBuffer())
      await writeFile(target, buf)
    }
    return 'pdfstudio-tessdata://data/'
  })
}
