import { app, BrowserWindow, dialog, ipcMain, nativeTheme, shell } from 'electron'
import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from 'fs/promises'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { basename, extname, join } from 'path'
import type { LoadedFile, SaveDialogOptions } from '../shared/types'

const execFileP = promisify(execFile)

const MAX_RECENT = 15
let recent: string[] = []

function rememberRecent(path: string): void {
  if (!path) return
  recent = [path, ...recent.filter((p) => p !== path)].slice(0, MAX_RECENT)
  app.addRecentDocument(path)
}

export function getRecentFiles(): string[] {
  return recent
}

async function loadFile(path: string): Promise<LoadedFile> {
  const buffer = await readFile(path)
  rememberRecent(path)
  return { path, name: basename(path), bytes: new Uint8Array(buffer) }
}

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('dialog:open', async (): Promise<LoadedFile[] | null> => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF-Dokument', extensions: ['pdf'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return Promise.all(result.filePaths.map(loadFile))
  })

  ipcMain.handle('file:read', (_e, path: string) => loadFile(path))

  ipcMain.handle('dialog:openAny', async (): Promise<{ path: string; name: string }[] | null> => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths.map((p) => ({ path: p, name: basename(p) }))
  })

  ipcMain.handle('dialog:save', async (_e, options: SaveDialogOptions): Promise<string | null> => {
    const win = getWindow()
    const result = await dialog.showSaveDialog(win ?? undefined!, {
      defaultPath: options.defaultName,
      filters: options.filters ?? [{ name: 'PDF-Dokument', extensions: ['pdf'] }]
    })
    return result.canceled ? null : (result.filePath ?? null)
  })

  ipcMain.handle('dialog:pickDirectory', async (): Promise<string | null> => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win ?? undefined!, {
      properties: ['openDirectory', 'createDirectory']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle('fs:listPdfs', async (_e, dir: string): Promise<string[]> => {
    const entries = await readdir(dir, { withFileTypes: true })
    return entries
      .filter((e) => e.isFile() && extname(e.name).toLowerCase() === '.pdf')
      .map((e) => join(dir, e.name))
      .sort()
  })

  ipcMain.handle('file:write', async (_e, path: string, bytes: Uint8Array) => {
    await writeFile(path, Buffer.from(bytes))
    rememberRecent(path)
  })

  ipcMain.handle('shell:showItem', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.handle('app:recent', () => recent)

  ipcMain.handle(
    'dialog:confirmDiscard',
    async (_e, name: string): Promise<'save' | 'discard' | 'cancel'> => {
      const win = getWindow()
      const { response } = await dialog.showMessageBox(win ?? undefined!, {
        type: 'warning',
        buttons: ['Sichern', 'Verwerfen', 'Abbrechen'],
        defaultId: 0,
        cancelId: 2,
        message: `„${name}" hat ungesicherte Änderungen.`,
        detail: 'Möchtest du die Änderungen vor dem Schließen sichern?'
      })
      return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
    }
  )

  ipcMain.on('win:setRepresentedFilename', (_e, path: string | null) => {
    const win = getWindow()
    if (win && process.platform === 'darwin') win.setRepresentedFilename(path ?? '')
  })

  ipcMain.on('win:setDocumentEdited', (_e, edited: boolean) => {
    const win = getWindow()
    if (win && process.platform === 'darwin') win.setDocumentEdited(edited)
  })

  ipcMain.on('app:setNativeTheme', (_e, source: 'system' | 'light' | 'dark') => {
    nativeTheme.themeSource = source
  })

  // Kleiner lokaler Schlüssel-/Geheimnis-Speicher (Signaturschlüssel dieses Macs).
  const secretsDir = join(app.getPath('userData'), 'secrets')
  const secretPath = (k: string): string =>
    join(secretsDir, `${k.replace(/[^a-z0-9_-]/gi, '')}.json`)
  ipcMain.handle('secret:get', async (_e, key: string): Promise<string | null> => {
    try {
      return await readFile(secretPath(key), 'utf8')
    } catch {
      return null
    }
  })
  ipcMain.handle('secret:set', async (_e, key: string, value: string): Promise<void> => {
    await mkdir(secretsDir, { recursive: true })
    await writeFile(secretPath(key), value, { mode: 0o600 })
  })

  // Bild-Konvertierung über macOS `sips` (HEIC, TIFF … → PNG/JPEG)
  ipcMain.handle(
    'convert:sips',
    async (
      _e,
      input: { path?: string; bytes?: Uint8Array },
      format: 'png' | 'jpeg'
    ): Promise<Uint8Array> => {
      const dir = await mkdtemp(join(tmpdir(), 'astra-sips-'))
      const inPath = input.path ?? join(dir, 'in')
      const outPath = join(dir, `out.${format === 'jpeg' ? 'jpg' : 'png'}`)
      try {
        if (!input.path && input.bytes) await writeFile(inPath, Buffer.from(input.bytes))
        await execFileP('sips', ['-s', 'format', format, inPath, '--out', outPath])
        return new Uint8Array(await readFile(outPath))
      } finally {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined)
      }
    }
  )
}
