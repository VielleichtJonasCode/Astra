import { app, BrowserWindow } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const stateFile = join(app.getPath('userData'), 'window-state.json')

interface Bounds {
  x?: number
  y?: number
  width: number
  height: number
}

const DEFAULT: Bounds = { width: 1320, height: 880 }

export function restoreWindowState(): Bounds {
  try {
    const raw = JSON.parse(readFileSync(stateFile, 'utf-8')) as Bounds
    if (typeof raw.width === 'number' && typeof raw.height === 'number' && raw.width > 400) {
      return raw
    }
  } catch {
    /* keine gespeicherte Größe – Standard verwenden */
  }
  return { ...DEFAULT }
}

export function trackWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | undefined

  const persist = (): void => {
    if (win.isDestroyed() || win.isMinimized()) return
    try {
      writeFileSync(stateFile, JSON.stringify(win.getBounds()))
    } catch {
      /* nicht kritisch */
    }
  }

  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(persist, 400)
  }

  win.on('resize', schedule)
  win.on('move', schedule)
  win.on('close', persist)
}
