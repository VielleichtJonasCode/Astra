import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'fs/promises'
import { watch, type FSWatcher } from 'fs'
import { execFile } from 'child_process'
import { basename, dirname, extname, join } from 'path'
import type { SpCourse, SpFile, SpSemester, SpTree } from '../shared/types'
import { seedDemoStudienplaner, type DemoSeedResult } from './studienplanerDemo'

/** Endungen, die als „Notiz“ im Studienplaner gelten. */
const NOTE_EXT = new Set(['pdf', 'png', 'jpg', 'jpeg', 'heic', 'heif', 'webp', 'txt', 'md'])
/** Unterordner, in dem frisch gescannte, noch nicht einsortierte Dateien landen. */
export const INBOX_DIR = '_Eingang'

let watcher: FSWatcher | null = null
let debounce: NodeJS.Timeout | null = null

async function safeStat(p: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    return await stat(p)
  } catch {
    return null
  }
}

async function listFiles(dir: string): Promise<SpFile[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const out: SpFile[] = []
  for (const e of entries) {
    if (!e.isFile() || e.name.startsWith('.')) continue
    const ext = extname(e.name).slice(1).toLowerCase()
    if (!NOTE_EXT.has(ext)) continue
    const full = join(dir, e.name)
    const st = await safeStat(full)
    out.push({ name: e.name, path: full, ext, size: st?.size ?? 0, modified: st?.mtimeMs ?? 0 })
  }
  out.sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
  return out
}

/** Sichtbare Unterordner (ohne „.“- und „_“-Ordner wie _Eingang). */
async function subDirs(dir: string): Promise<{ name: string; path: string }[]> {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => ({ name: e.name, path: join(dir, e.name) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de', { numeric: true }))
}

/** Unterordner eines Fachs, der die Prüfungsvorbereitung enthält (kein Notiz-Ordner). */
const PREP_DIR = 'Prüfungsvorbereitung'

async function readTree(root: string): Promise<SpTree> {
  const semesters: SpSemester[] = []
  for (const sem of await subDirs(root)) {
    const courses: SpCourse[] = []
    for (const c of await subDirs(sem.path)) {
      const groups = []
      for (const g of await subDirs(c.path)) {
        if (g.name === PREP_DIR) continue
        groups.push({ name: g.name, path: g.path, files: await listFiles(g.path) })
      }
      courses.push({ name: c.name, path: c.path, files: await listFiles(c.path), groups })
    }
    semesters.push({
      name: sem.name,
      path: sem.path,
      courses,
      looseFiles: await listFiles(sem.path)
    })
  }
  return {
    root,
    semesters,
    inbox: await listFiles(join(root, INBOX_DIR)),
    looseFiles: await listFiles(root)
  }
}

export function registerStudienplaner(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('sp:tree', (_e, root: string): Promise<SpTree> => readTree(root))

  ipcMain.handle(
    'sp:listdir',
    async (_e, path: string): Promise<{ name: string; isDir: boolean }[]> => {
      try {
        const entries = await readdir(path, { withFileTypes: true })
        return entries
          .filter((e) => !e.name.startsWith('.'))
          .map((e) => ({ name: e.name, isDir: e.isDirectory() }))
      } catch {
        return []
      }
    }
  )

  ipcMain.handle('sp:read', async (_e, path: string): Promise<Uint8Array> => {
    return new Uint8Array(await readFile(path))
  })

  ipcMain.handle('sp:exists', async (_e, path: string): Promise<boolean> => {
    return (await safeStat(path)) !== null
  })

  // Ein einziges ZIP-Backup des Studienordners (altes wird ersetzt).
  ipcMain.handle(
    'sp:backup',
    async (
      _e,
      root: string
    ): Promise<{ path: string; bytes: number; when: number } | { error: string }> => {
      try {
        const dest = join(app.getPath('userData'), 'Studienplaner-Backup.zip')
        await rm(dest, { force: true })
        await new Promise<void>((res, rej) => {
          execFile(
            '/usr/bin/zip',
            ['-r', '-q', '-X', dest, basename(root), '-x', '.DS_Store', '-x', '*/.DS_Store'],
            { cwd: dirname(root), maxBuffer: 1 << 26 },
            (err) => (err ? rej(err) : res())
          )
        })
        const st = await stat(dest)
        return { path: dest, bytes: st.size, when: Date.now() }
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) }
      }
    }
  )

  ipcMain.handle('sp:seedDemo', (_e, opts?: { reset?: boolean }): Promise<DemoSeedResult> =>
    seedDemoStudienplaner(Boolean(opts?.reset))
  )

  ipcMain.handle('sp:write', async (_e, path: string, bytes: Uint8Array): Promise<void> => {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, Buffer.from(bytes))
  })

  ipcMain.handle('sp:mkdirp', async (_e, path: string): Promise<void> => {
    await mkdir(path, { recursive: true })
  })

  ipcMain.handle('sp:move', async (_e, from: string, to: string): Promise<void> => {
    if (from === to) return
    await mkdir(dirname(to), { recursive: true })
    await rename(from, to)
  })

  ipcMain.handle('sp:trash', (_e, path: string): Promise<void> => shell.trashItem(path))

  ipcMain.on('sp:reveal', (_e, path: string) => shell.showItemInFolder(path))

  ipcMain.handle('sp:watch', async (_e, root: string): Promise<void> => {
    watcher?.close()
    watcher = null
    try {
      await mkdir(root, { recursive: true })
      watcher = watch(root, { recursive: true }, () => {
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => getWindow()?.webContents.send('sp:changed'), 400)
      })
    } catch {
      watcher = null
    }
  })

  ipcMain.handle('sp:unwatch', async (): Promise<void> => {
    watcher?.close()
    watcher = null
    if (debounce) clearTimeout(debounce)
  })
}
