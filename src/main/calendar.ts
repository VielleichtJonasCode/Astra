import { app, ipcMain } from 'electron'
import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import type { CalAuthStatus, CalCalendar, CalEvent } from '../shared/types'

/**
 * Liest den macOS-/iCloud-Kalender über den kleinen EventKit-Helfer
 * (resources/bin/astra-cal). Fehlt der Helfer oder ist kein macOS, melden alle
 * Handler „unavailable“ bzw. leere Listen.
 */

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'bin', 'astra-cal')
    : join(app.getAppPath(), 'resources', 'bin', 'astra-cal')
}

let available: boolean | null = null
function isAvailable(): boolean {
  if (available === null) available = process.platform === 'darwin' && existsSync(helperPath())
  return available
}

function run<T>(args: string[], timeout: number, fallback: T, stdin?: string): Promise<T> {
  return new Promise((resolve) => {
    const child = execFile(
      helperPath(),
      args,
      { timeout, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => {
        if (err) {
          console.warn('astra-cal', args[0], 'fehlgeschlagen:', err.message)
          resolve(fallback)
          return
        }
        try {
          resolve(JSON.parse(stdout) as T)
        } catch {
          resolve(fallback)
        }
      }
    )
    if (stdin !== undefined) {
      child.stdin?.end(stdin)
    }
  })
}

const VALID: CalAuthStatus[] = ['notDetermined', 'denied', 'restricted', 'authorized']
function normStatus(s: string | undefined): CalAuthStatus {
  return VALID.includes(s as CalAuthStatus) ? (s as CalAuthStatus) : 'denied'
}

export function registerCalendar(): void {
  ipcMain.handle('cal:status', async (): Promise<CalAuthStatus> => {
    if (!isAvailable()) return 'unavailable'
    const r = await run<{ status?: string }>(['status'], 10_000, {})
    return normStatus(r.status)
  })

  ipcMain.handle('cal:request', async (): Promise<CalAuthStatus> => {
    if (!isAvailable()) return 'unavailable'
    const r = await run<{ status?: string }>(['request'], 130_000, {})
    return normStatus(r.status)
  })

  ipcMain.handle('cal:list', async (): Promise<CalCalendar[]> => {
    if (!isAvailable()) return []
    return run<CalCalendar[]>(['calendars'], 15_000, [])
  })

  ipcMain.handle(
    'cal:events',
    async (_e, fromIso: string, toIso: string, calendarIds?: string[]): Promise<CalEvent[]> => {
      if (!isAvailable()) return []
      const args = ['events', fromIso, toIso]
      if (calendarIds && calendarIds.length) args.push(calendarIds.join(','))
      return run<CalEvent[]>(args, 20_000, [])
    }
  )

  ipcMain.handle('cal:create', async (_e, title: string): Promise<CalCalendar | null> => {
    if (!isAvailable() || !title.trim()) return null
    const r = await run<CalCalendar | { error?: string } | null>(['create', title], 20_000, null)
    return r && 'id' in r ? (r as CalCalendar) : null
  })

  ipcMain.handle(
    'cal:add',
    async (
      _e,
      calendarId: string,
      events: { title: string; start: string; end: string; notes?: string }[]
    ): Promise<{ count: number; ids: string[] } | { error: string }> => {
      if (!isAvailable()) return { error: 'Kalender-Helfer nicht verfügbar.' }
      if (!calendarId || !events?.length) return { count: 0, ids: [] }
      const r = await run<{ count?: number; ids?: string[] } | null>(
        ['add', calendarId],
        25_000,
        null,
        JSON.stringify(events)
      )
      return r && typeof r.count === 'number'
        ? { count: r.count, ids: Array.isArray(r.ids) ? r.ids : [] }
        : { error: 'Eintragen fehlgeschlagen.' }
    }
  )

  ipcMain.handle(
    'cal:update',
    async (
      _e,
      calendarId: string,
      events: { id: string; title: string; start: string; end: string; notes?: string }[]
    ): Promise<{ count: number } | { error: string }> => {
      if (!isAvailable()) return { error: 'Kalender-Helfer nicht verfügbar.' }
      if (!calendarId || !events?.length) return { count: 0 }
      const r = await run<{ count?: number } | null>(
        ['update', calendarId],
        25_000,
        null,
        JSON.stringify(events)
      )
      return r && typeof r.count === 'number'
        ? { count: r.count }
        : { error: 'Aktualisieren fehlgeschlagen.' }
    }
  )

  ipcMain.handle(
    'cal:delete',
    async (
      _e,
      calendarId: string,
      eventIds: string[]
    ): Promise<{ count: number } | { error: string }> => {
      if (!isAvailable()) return { error: 'Kalender-Helfer nicht verfügbar.' }
      if (!calendarId || !eventIds?.length) return { count: 0 }
      const r = await run<{ count?: number } | null>(
        ['delete', calendarId],
        20_000,
        null,
        JSON.stringify(eventIds)
      )
      return r && typeof r.count === 'number'
        ? { count: r.count }
        : { error: 'Löschen fehlgeschlagen.' }
    }
  )
}
