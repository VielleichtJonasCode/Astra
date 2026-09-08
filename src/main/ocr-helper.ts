import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import type { OcrResult } from '../shared/types'

/**
 * Handschrift-/Text-OCR über einen kleinen, mitgelieferten Swift-Helfer, der
 * das Apple-Vision-Framework nutzt (deutlich besser bei Handschrift als
 * tesseract.js). Fehlt der Helfer oder schlägt er fehl, liefert dieser Handler
 * `null` – der Renderer fällt dann auf tesseract.js zurück.
 */

function helperPath(): string {
  const packaged = join(process.resourcesPath, 'bin', 'astra-ocr')
  if (app.isPackaged) return packaged
  return join(app.getAppPath(), 'resources', 'bin', 'astra-ocr')
}

let helperAvailable: boolean | null = null

function isAvailable(): boolean {
  if (helperAvailable === null)
    helperAvailable = process.platform === 'darwin' && existsSync(helperPath())
  return helperAvailable
}

function runHelper(file: string): Promise<OcrResult | null> {
  return new Promise((resolve) => {
    execFile(
      helperPath(),
      [file],
      { timeout: 90_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.warn('astra-ocr fehlgeschlagen:', err.message)
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(stdout) as {
            pages: {
              text: string
              boxes: OcrResult['pages'][number]['boxes']
              width: number
              height: number
            }[]
          }
          const pages = parsed.pages ?? []
          resolve({
            pages,
            text: pages
              .map((p) => p.text)
              .join('\n\n')
              .trim(),
            engine: 'vision'
          })
        } catch (e) {
          console.warn('astra-ocr: Antwort nicht lesbar:', (e as Error).message)
          resolve(null)
        }
      }
    )
  })
}

export function registerOcrHelper(): void {
  ipcMain.handle(
    'ocr:recognize',
    async (
      _e,
      input: { path?: string; bytes?: Uint8Array; ext?: string }
    ): Promise<OcrResult | null> => {
      if (!isAvailable()) return null

      if (input.path) return runHelper(input.path)
      if (!input.bytes) return null

      const dir = await mkdtemp(join(tmpdir(), 'astra-ocr-'))
      const ext = (input.ext ?? 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
      const tmp = join(dir, `in.${ext}`)
      try {
        await writeFile(tmp, Buffer.from(input.bytes))
        return await runHelper(tmp)
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  )
}
